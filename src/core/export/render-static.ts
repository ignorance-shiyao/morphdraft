import { renderMarkdown, resolveAssetUrls } from '../markdown'
import { mountCharts } from '../charts/mount'
import { setMermaidTheme } from '../charts/mermaid'
import type { ThemeTokens } from '../themes/presets'

// 离屏渲染一段 Markdown 为「固化」HTML：echarts 用 SVG 渲染器（矢量、可在导出文件里直接改），
// mermaid 本身即 SVG。供 HTML / PDF 文档导出复用。
export interface StaticRender {
  el: HTMLElement // 离屏容器（含固化后的 DOM）
  html: string // 固化后的 innerHTML（echarts/mermaid 均为内联 SVG）
  dispose: () => void
}

export async function renderStatic(
  markdown: string,
  opts: { dark?: boolean; width?: number; tokens?: ThemeTokens } = {},
): Promise<StaticRender> {
  const width = opts.width ?? 820
  const el = document.createElement('div')
  el.className = 'doc-preview'
  el.style.cssText = `position:fixed;left:-99999px;top:0;width:${width}px;background:#fff;`
  document.body.appendChild(el)

  if (opts.tokens) await setMermaidTheme(opts.tokens)
  // 先解析 asset:// 引用为 data: URL
  const resolved = await resolveAssetUrls(markdown)
  el.innerHTML = renderMarkdown(resolved)
  // 关键：导出用 svg 渲染器，echarts 直接产出可编辑的内联 <svg>
  const cleanup = await mountCharts(el, { tokens: opts.tokens, renderer: 'svg' })
  normalizeChartSvg(el)

  const html = el.innerHTML
  return {
    el,
    html,
    dispose: () => {
      cleanup()
      el.remove()
    },
  }
}

// 让导出的 echarts SVG 自适应：去掉固定 width/height，补 viewBox，加 max-width 样式。
function normalizeChartSvg(root: HTMLElement) {
  const svgs = root.querySelectorAll<SVGSVGElement>(
    '.chart-block[data-chart-type="echarts"] svg',
  )
  svgs.forEach((svg) => {
    const w = parseFloat(svg.getAttribute('width') || '') || svg.clientWidth || 600
    const h = parseFloat(svg.getAttribute('height') || '') || svg.clientHeight || 400
    if (!svg.getAttribute('viewBox')) svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
    svg.removeAttribute('width')
    svg.removeAttribute('height')
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
    svg.style.width = '100%'
    svg.style.height = 'auto'
  })
}
