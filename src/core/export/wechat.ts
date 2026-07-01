// M7-1: 公众号一键复制（inline style 内联 → 复制到剪贴板）
import { renderStatic } from './render-static'
import { mountCharts } from '../charts/mount'
import { setMermaidTheme } from '../charts/mermaid'
import { CODE_CSS } from '../markdown/codeTheme'
import { ALERT_CSS } from '../markdown/alerts'
import { BLOCKS_CSS } from '../markdown/blocksCss'
import { KATEX_CSS, hasKatex } from '../markdown/katexCss'
import { inlineStyles, replaceSvgsWithPng } from './render-utils'
import type { ThemeTokens } from '../themes/presets'

// 公众号不支持的标签 → 替换
const TAG_REPLACEMENTS: Record<string, string> = {
  'section': 'div',
  'aside': 'div',
  'article': 'div',
  'nav': 'div',
  'header': 'div',
  'footer': 'div',
}

function replaceUnsupportedTags(root: HTMLElement) {
  for (const [oldTag, newTag] of Object.entries(TAG_REPLACEMENTS)) {
    root.querySelectorAll(oldTag).forEach(el => {
      const div = document.createElement(newTag)
      div.innerHTML = el.innerHTML
      // 复制属性
      for (const attr of Array.from(el.attributes)) {
        div.setAttribute(attr.name, attr.value)
      }
      el.replaceWith(div)
    })
  }
}

function moveExternalLinks(root: HTMLElement): string[] {
  const links: string[] = []
  const anchors = root.querySelectorAll('a[href]')
  anchors.forEach((a, i) => {
    const href = a.getAttribute('href') || ''
    if (href.startsWith('http')) {
      links.push(href)
      // 替换为上标编号
      const sup = document.createElement('sup')
      sup.textContent = `[${i + 1}]`
      sup.style.color = '#888'
      sup.style.fontSize = '0.8em'
      a.replaceWith(sup)
    }
  })
  return links
}

function buildReferenceSection(links: string[]): string {
  if (!links.length) return ''
  const items = links.map((url, i) => `<li style="font-size:13px;color:#666;line-height:1.8;word-break:break-all;">[${i + 1}] ${url}</li>`).join('')
  return `<section style="margin-top:32px;padding-top:16px;border-top:1px solid #eee;">
    <p style="font-size:14px;font-weight:bold;color:#333;margin-bottom:8px;">参考资料</p>
    <ol style="padding-left:20px;margin:0;">${items}</ol>
  </section>`
}

function buildWechatCss(theme: ThemeTokens): string {
  return `
    body{margin:0;padding:0;font-family:${theme.fontFamily};color:${theme.fg};font-size:16px;line-height:1.8;}
    h1{font-size:22px;font-weight:bold;color:${theme.fg};margin:24px 0 12px;}
    h2{font-size:19px;font-weight:bold;color:${theme.fg};margin:20px 0 10px;}
    h3{font-size:17px;font-weight:bold;color:${theme.fg};margin:16px 0 8px;}
    p{margin:8px 0;}
    a{color:${theme.primaryColor};text-decoration:none;}
    code{background:#f5f5f5;padding:2px 6px;border-radius:3px;font-size:14px;font-family:Consolas,monospace;color:#c7254e;}
    pre{background:#f5f5f5;padding:12px;border-radius:6px;overflow-x:auto;margin:12px 0;}
    pre code{background:none;padding:0;color:${theme.fg};font-size:14px;}
    blockquote{margin:12px 0;padding:8px 16px;border-left:4px solid ${theme.primaryColor};background:#f9f9f9;color:#666;}
    table{border-collapse:collapse;width:100%;margin:12px 0;}
    th,td{border:1px solid #ddd;padding:8px 12px;text-align:left;}
    th{background:#f5f5f5;font-weight:bold;}
    img{max-width:100%;border-radius:4px;}
    figure{margin:12px 0;text-align:center;}
    figcaption{font-size:13px;color:#888;margin-top:4px;}
    ul,ol{padding-left:24px;margin:8px 0;}
    li{margin:4px 0;}
    hr{border:none;border-top:1px solid #eee;margin:16px 0;}
    ${hasKatex(JSON.stringify(theme)) ? KATEX_CSS : ''}
  `
}

export async function copyForWechat(
  markdown: string,
  theme: ThemeTokens,
): Promise<boolean> {
  // 0. M7-4: 上传本地图片到图床
  const { uploadLocalImages, getImageHostConfig } = await import('./image-host')
  const hostConfig = getImageHostConfig()
  if (hostConfig.provider && hostConfig.token) {
    markdown = await uploadLocalImages(markdown, hostConfig)
  }

  // 1. 渲染 HTML
  await setMermaidTheme(theme)
  const r = await renderStatic(markdown, { dark: false, tokens: theme, width: 600 })
  const cleanup = await mountCharts(r.el, { tokens: theme, renderer: 'svg' })

  // 2. 替换不支持的标签
  replaceUnsupportedTags(r.el)

  // 3. 外链转参考资料
  const links = moveExternalLinks(r.el)

  // 4. 构建完整 HTML
  const css = buildWechatCss(theme)
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}</style></head><body style="max-width:600px;margin:0 auto;padding:16px;">${r.el.innerHTML}${buildReferenceSection(links)}</body></html>`

  // 5. 离屏挂载 + 内联样式
  const container = document.createElement('div')
  container.innerHTML = html
  container.style.cssText = 'position:fixed;left:-99999px;top:0;width:600px;'
  document.body.appendChild(container)
  inlineStyles(container)

  // 6. 图表转 PNG（公众号不支持 SVG）
  await replaceSvgsWithPng(container)

  // 7. 复制到剪贴板
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
    // fallback: 用 execCommand
    const sel = window.getSelection()
    const range = document.createRange()
    container.innerHTML = finalHtml
    container.style.cssText = 'position:fixed;left:0;top:0;'
    document.body.appendChild(container)
    range.selectNodeContents(container)
    sel?.removeAllRanges()
    sel?.addRange(range)
    document.execCommand('copy')
    container.remove()
    return true
  } finally {
    r.dispose()
    cleanup()
  }
}
