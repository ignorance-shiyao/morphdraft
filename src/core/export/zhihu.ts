// M7-2: 知乎/掘金适配（标准 HTML + 代码块保留语言标签）
import { renderStatic } from './render-static'
import { mountCharts } from '../charts/mount'
import { setMermaidTheme } from '../charts/mermaid'
import { inlineStyles } from './render-utils'
import type { ThemeTokens } from '../themes/presets'

function buildZhihuCss(theme: ThemeTokens): string {
  return `
    body{margin:0;padding:0;font-family:${theme.fontFamily};color:${theme.fg};font-size:16px;line-height:1.75;}
    h1{font-size:24px;font-weight:bold;margin:20px 0 10px;}
    h2{font-size:20px;font-weight:bold;margin:18px 0 8px;}
    h3{font-size:17px;font-weight:bold;margin:14px 0 6px;}
    p{margin:8px 0;}
    a{color:${theme.primaryColor};}
    code{background:#f5f5f5;padding:2px 6px;border-radius:3px;font-size:14px;font-family:Consolas,monospace;}
    pre{background:#f5f5f5;padding:12px;border-radius:6px;overflow-x:auto;}
    pre code{background:none;padding:0;color:${theme.fg};}
    blockquote{margin:12px 0;padding:8px 16px;border-left:4px solid ${theme.primaryColor};background:#f9f9f9;color:#666;}
    table{border-collapse:collapse;width:100%;margin:12px 0;}
    th,td{border:1px solid #ddd;padding:8px 12px;}
    th{background:#f5f5f5;font-weight:bold;}
    img{max-width:100%;}
    ul,ol{padding-left:24px;margin:8px 0;}
    li{margin:4px 0;}
  `
}

export async function copyForZhihu(
  markdown: string,
  theme: ThemeTokens,
): Promise<boolean> {
  await setMermaidTheme(theme)
  const r = await renderStatic(markdown, { dark: false, tokens: theme, width: 690 })
  const cleanup = await mountCharts(r.el, { tokens: theme, renderer: 'svg' })

  const css = buildZhihuCss(theme)
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}</style></head><body style="max-width:690px;margin:0 auto;padding:16px;">${r.el.innerHTML}</body></html>`

  const container = document.createElement('div')
  container.innerHTML = html
  container.style.cssText = 'position:fixed;left:-99999px;top:0;width:690px;'
  document.body.appendChild(container)
  inlineStyles(container)

  const finalHtml = container.innerHTML
  container.remove()

  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([finalHtml], { type: 'text/html' }),
        'text/plain': new Blob([r.el.textContent || ''], { type: 'text/plain' }),
      }),
    ])
    return true
  } catch {
    return false
  } finally {
    r.dispose()
    cleanup()
  }
}
