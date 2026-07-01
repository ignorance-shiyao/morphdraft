// ECharts 懒加载封装：挂载到容器、自适应宽度、可销毁。
import type { ThemeTokens } from '../themes/presets'
import { buildEChartsTheme, themeName } from './echartsTheme'

let coreLoaded: Promise<typeof import('echarts')> | null = null
const registered = new Set<string>()

async function getECharts() {
  if (!coreLoaded) coreLoaded = import('echarts')
  return coreLoaded
}

// 注册当前主题（幂等，按 tokens.id 缓存）。注册失败时返回 undefined，
// echarts.init 会退回内置默认主题，不阻塞后续渲染链路。
export async function registerEChartsTheme(tokens: ThemeTokens): Promise<string | undefined> {
  const echarts = await getECharts()
  const name = themeName(tokens.id)
  if (!registered.has(name)) {
    try {
      echarts.registerTheme(name, buildEChartsTheme(tokens) as unknown as Record<string, unknown>)
      registered.add(name)
    } catch (e) {
      console.error('[echarts] registerTheme failed', e)
      return undefined
    }
  }
  return name
}

// 宽松解析 option：先 JSON.parse，失败再用 Function 解析（容忍单引号/无引号 key/尾逗号）。
export function parseOption(raw: string): Record<string, unknown> {
  const text = raw.trim()
  try {
    return JSON.parse(text)
  } catch {
    // 受控宽松解析：内容来自用户自己的文档，非第三方注入。
    // eslint-disable-next-line no-new-func
    return Function(`"use strict";return (${text});`)() as Record<string, unknown>
  }
}

export function normalizeOptionForRenderer(
  option: Record<string, unknown>,
  renderer: 'canvas' | 'svg',
): Record<string, unknown> {
  if (renderer !== 'svg') return option
  const series = option.series
  if (!Array.isArray(series)) return option
  for (const item of series) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    // ECharts SVG renderer does not support animated trail effects on lines.
    // Slide/export SVG output should stay quiet and deterministic, so drop only that unsupported effect.
    if (record.type === 'lines' && record.effect && typeof record.effect === 'object') {
      record.effect = { ...(record.effect as Record<string, unknown>), show: false }
    }
  }
  return option
}

export interface MountedChart {
  dispose: () => void
}

export interface MountEChartsOpts {
  renderer?: 'canvas' | 'svg'
  tokens?: ThemeTokens
}

interface ManagedChartEl extends HTMLElement {
  __chartDispose?: () => void
}

// 等待容器具备非零尺寸再 resolve。CM6 块级 widget 在 toDOM 时尚未布局，
// 此时 clientWidth/Height 为 0，直接 echarts.init 会触发「Can't get DOM width/height」告警。
// 用 ResizeObserver 等首帧布局；已用 rAF 兜底，最坏 ~1s 超时后仍按当前尺寸初始化。
function waitForSize(el: HTMLElement, timeout = 1000): Promise<void> {
  if (el.clientWidth > 0 && el.clientHeight > 0) return Promise.resolve()
  return new Promise((resolve) => {
    let done = false
    const finish = () => { if (done) return; done = true; ro.disconnect(); clearTimeout(timer); resolve() }
    const ro = new ResizeObserver(() => { if (el.clientWidth > 0 && el.clientHeight > 0) finish() })
    ro.observe(el)
    const timer = setTimeout(finish, timeout)
  })
}

export async function mountECharts(
  el: HTMLElement,
  raw: string,
  opts: MountEChartsOpts = {},
): Promise<MountedChart> {
  const echarts = await getECharts()
  const renderer = opts.renderer ?? 'canvas'
  const option = normalizeOptionForRenderer(parseOption(raw), renderer)
  // 注册并使用我们的应用主题（按 tokens.id 缓存）。
  // 无 tokens 时回退 undefined，echarts 用内置默认。
  const themeRef = opts.tokens ? await registerEChartsTheme(opts.tokens) : undefined
  // 容器可能尚未布局（如 CM6 块级 widget），先等到有尺寸再 init，避免零尺寸告警。
  await waitForSize(el)
  const managed = el as ManagedChartEl
  let disposedManaged = false
  if (typeof managed.__chartDispose === 'function') {
    try { managed.__chartDispose() } catch { /* ignore stale managed cleanup */ }
    managed.__chartDispose = undefined
    disposedManaged = true
  }
  // 跨渲染复用 DOM、热更新或快速重挂载时，同一个容器上可能已经有 ECharts 实例。
  // 先销毁旧实例，避免 ECharts 自身输出 “already initialized on the dom” warning。
  const existing = echarts.getInstanceByDom(el)
  if (existing && !disposedManaged) existing.dispose()
  // 实时预览用 canvas（交互/性能）；导出用 svg（矢量、可编辑）。
  const instance = echarts.init(el, themeRef, {
    renderer,
  })
  instance.setOption(option)

  let disposed = false
  const ro = new ResizeObserver(() => {
    if (disposed) return
    if (!el.isConnected || el.clientWidth <= 0 || el.clientHeight <= 0) return
    try {
      instance.resize()
    } catch {
      // ECharts can throw during graph/roam resize while the slide strip is relaying layout.
      // The next stable resize/render pass will recover, so keep the preview console clean.
    }
  })
  ro.observe(el)

  return {
    dispose: () => {
      disposed = true
      ro.disconnect()
      instance.dispose()
    },
  }
}
