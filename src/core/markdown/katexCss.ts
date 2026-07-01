// KaTeX 样式（供 HTML 导出内联）。
// 原始 CSS 用相对路径 fonts/KaTeX_*，独立 HTML 文件里无法解析，
// 这里把字体 url 重写到 jsdelivr CDN，导出文件联网即可正确显示公式字体。
import rawCss from 'katex/dist/katex.min.css?raw'

const CDN = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/fonts/'

export const KATEX_CSS = rawCss.replace(
  /url\((['"]?)fonts\/([^)'"]+)\1\)/g,
  (_m, _q, file) => `url(${CDN}${file})`,
)

// 仅当正文含有 KaTeX 渲染结果时才需要内联，省体积。
export function hasKatex(html: string): boolean {
  return html.includes('class="katex')
}
