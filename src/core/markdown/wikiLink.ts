// M3-2: WikiLink 双链 — markdown-it 插件解析 [[页面]]
// 点击跳转 / 不存在则创建；反链面板列出所有引用方。

import type MarkdownIt from 'markdown-it'

// WikiLink 正则：[[页面名]] 或 [[页面名|显示文本]]
const WIKILINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g

export interface WikiLink {
  page: string
  display: string
}

// 从 markdown 中提取所有 WikiLink
export function extractWikiLinks(md: string): WikiLink[] {
  const links: WikiLink[] = []
  for (const m of md.matchAll(WIKILINK_RE)) {
    links.push({ page: m[1].trim(), display: m[2]?.trim() || m[1].trim() })
  }
  return links
}

// markdown-it 插件：把 [[页面]] 渲染为可点击链接
export function wikiLinkPlugin(md: MarkdownIt) {
  // 在 inline 规则之后添加
  md.core.ruler.push('wikilink', (state) => {
    for (const tok of state.tokens) {
      if (tok.type !== 'inline' || !tok.children) continue
      for (let i = 0; i < tok.children.length; i++) {
        const child = tok.children[i]
        if (child.type !== 'text') continue
        const text = child.content
        if (!text.includes('[[')) continue

        // 替换所有 [[...]] 为 HTML
        const html = text.replace(WIKILINK_RE, (_, page: string, display?: string) => {
          const label = display?.trim() || page.trim()
          return `<a class="wikilink" data-page="${md.utils.escapeHtml(page.trim())}" href="javascript:void(0)">${md.utils.escapeHtml(label)}</a>`
        })
        if (html === text) continue

        // 分割为 text 和 html tokens
        const newTokens: any[] = []
        const parts = html.split(/(<a class="wikilink"[\s\S]*?<\/a>)/)
        for (const part of parts) {
          if (part.startsWith('<a class="wikilink"')) {
            newTokens.push({
              type: 'html_inline',
              content: part,
            })
          } else if (part) {
            newTokens.push({
              type: 'text',
              content: part,
            })
          }
        }
        tok.children.splice(i, 1, ...newTokens)
        i += newTokens.length - 1
      }
    }
  })
}

// 查找文档中引用某个页面的所有文档（反链）。
// 反链以「链接目标」为准：[[B]] 与别名 [[B|显示]] 的目标都是 B，故都计入 B；
// 而 [[X|B]] 的目标是 X（B 只是显示文本），不计入 B。重名/多引用则返回多源。
export function findBacklinks(
  docs: { id: string; title: string; contentMarkdown: string }[],
  pageName: string,
): { id: string; title: string }[] {
  const target = pageName.trim()
  if (!target) return []
  const results: { id: string; title: string }[] = []
  for (const doc of docs) {
    const links = extractWikiLinks(doc.contentMarkdown)
    if (links.some((l) => l.page === target)) {
      results.push({ id: doc.id, title: doc.title })
    }
  }
  return results
}
