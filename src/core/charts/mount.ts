import type { ThemeTokens } from '../themes/presets'
import { renderMermaid } from './mermaid'
import { mountECharts } from './echarts'
import { mountMermaidTools } from './mermaidTools'

// 扫描 root 下所有 .chart-block 占位，渲染 mermaid/echarts。
// 每个 chart-block 自带 `__chartDispose`：跨渲染保留时直接 replaceWith，dispose 也跟着搬走；
// 块被新 HTML 取代时由 usePreviewRender 在确定不再使用时显式 dispose。
export interface MountChartsOpts {
  renderer?: 'canvas' | 'svg'
  tokens?: ThemeTokens
  interactiveMermaid?: boolean
  onGotoMermaidSource?: (el: HTMLElement) => void
  types?: Array<'mermaid' | 'echarts'>
}

interface ChartBlockEl extends HTMLElement {
  __chartDispose?: () => void
}

export function needsChartMountHeight(height: number): boolean {
    return height < 80
}

export function disposeChart(el: HTMLElement): void {
  const target = el as ChartBlockEl
  if (typeof target.__chartDispose !== 'function') return
  try { target.__chartDispose() } catch { /* ignore */ }
  target.__chartDispose = undefined
}

// 主题指纹：决定图表配色的主题量（主色 + 暗色态）。跨渲染保留时用它判断「图块是否需按新主题重渲染」。
export function chartThemeStamp(tokens?: { primaryColor: string; dark: boolean }): string {
  return tokens ? `${tokens.primaryColor}|${tokens.dark ? 'd' : 'l'}` : ''
}

export async function mountCharts(
  root: HTMLElement,
  opts: MountChartsOpts = {},
): Promise<() => void> {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>('.chart-block'))
  const mounted: HTMLElement[] = []
  const allowed = opts.types ? new Set(opts.types) : null
  const stamp = chartThemeStamp(opts.tokens)

  await Promise.all(
    blocks.map(async (raw) => {
      const el = raw as ChartBlockEl
      if (el.dataset.rendered === '1') return
      const type = el.dataset.chartType
      if (type !== 'mermaid' && type !== 'echarts') return
      if (allowed && !allowed.has(type)) return
      const code = decodeURIComponent(el.dataset.chartCode ?? '')
      try {
        if (type === 'mermaid') {
          el.innerHTML = await renderMermaid(code)
          normalizeMermaidSvg(el)
          if (opts.interactiveMermaid) {
            const cleanupTool = mountMermaidTools(el, {
              code,
              onGotoSource: () => opts.onGotoMermaidSource?.(el),
            })
            el.__chartDispose = cleanupTool
          }
          // 渲染完成后去掉占位用的最小高度，避免图表实际尺寸小于占位高度时留出大片空白
          el.classList.add('chart-ready')
        } else if (type === 'echarts') {
          // 高度由 CSS 控制（base.css 默认值，移动端/幻灯片可覆盖），
            // 但挂载早于幻灯片结构化时，容器可能只有 padding 高度（约 16px）。
            // 这种高度同样不可用于坐标系计算，先保留正常图表高度再初始化。
            const reserveHeight = needsChartMountHeight(el.clientHeight)
            if (reserveHeight) el.style.minHeight = '320px'
            try {
                const chart = await mountECharts(el, code, {renderer: opts.renderer, tokens: opts.tokens})
                el.__chartDispose = chart.dispose
            } finally {
                if (reserveHeight) el.style.removeProperty('min-height')
            }
        }
        el.dataset.rendered = '1'
        el.dataset.themeStamp = stamp // 记录本次渲染所用主题指纹
        mounted.push(el)
      } catch (err) {
        el.innerHTML = ''
        el.appendChild(renderError(type ?? 'chart', err))
        el.dataset.rendered = '1'
        el.dataset.themeStamp = stamp
        mounted.push(el)
      }
    }),
  )

  // 兼容旧调用：返回一次性清理当前 root 内所有图表（旧路径仍可调用）。
  // 新路径（usePreviewRender 跨渲染保留）会忽略这个返回值，改用 disposeChart 按块销毁。
  return () => {
    for (const el of mounted) disposeChart(el)
  }
}

function normalizeMermaidSvg(el: HTMLElement) {
  const svg = el.querySelector<SVGSVGElement>('svg')
  if (!svg) return
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
  // 关键：按图自身自然宽高比渲染，自然宽度封顶（不把窄高图强撑满宽导致爆高）；
  // 配合 aspect-ratio，CSS 的 max-height 会按比例同时缩小宽高（不变形、不留白）。
  const vb = svg.viewBox?.baseVal
  svg.style.display = 'block'
  svg.style.margin = 'auto'
  svg.style.height = 'auto'
  if (vb && vb.width > 0 && vb.height > 0) {
    svg.style.aspectRatio = `${vb.width} / ${vb.height}`
    svg.style.width = 'auto'
    svg.style.maxWidth = `min(100%, ${Math.ceil(vb.width)}px)`
  } else {
    svg.style.maxWidth = '100%'
  }
}

function renderError(type: string, err: unknown): HTMLElement {
  const box = document.createElement('pre')
  box.className = 'chart-error'
  box.textContent = `[${type} 渲染失败] ${err instanceof Error ? err.message : String(err)}`
  return box
}
