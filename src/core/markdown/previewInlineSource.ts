// 预览原地源码编辑：Markdown 语法符号高亮（Typora 源码模式风格）

export function escapeInlineSource(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const INLINE_SYNTAX_RE = /(\*\*\*|___|\*\*|__|\*|_|~~|==|`+|\$|\^|~|&lt;\/?(?:u|ins|kbd|sub|sup)&gt;|!\[|\[|\]|\(|\)|!)/g

const LINE_PREFIX_RE = /^(\s*(?:#{1,6}\s+|>\s?|-\s+\[(?:\s|[xX])\]\s+|-\s+|[*+]\s+|\d+[.)]\s+))/

function highlightInlineBody(line: string): string {
  const escaped = escapeInlineSource(line)
  return escaped.replace(INLINE_SYNTAX_RE, '<span class="md-syntax-token">$1</span>')
}

function highlightMarkdownLine(line: string): string {
  const prefixMatch = line.match(LINE_PREFIX_RE)
  if (!prefixMatch) return highlightInlineBody(line)
  const prefix = prefixMatch[1]
  const body = line.slice(prefix.length)
  return `<span class="md-syntax-token">${escapeInlineSource(prefix)}</span>${highlightInlineBody(body)}`
}

/** 将 Markdown 源码转为带 .md-syntax-token 高亮的 HTML（保留换行） */
export function highlightMarkdownSource(s: string): string {
  if (!s) return '\u200b'
  return s.split('\n').map(highlightMarkdownLine).join('\n')
}

/** @deprecated 用 highlightMarkdownSource */
export const highlightInlineSource = highlightMarkdownSource

const INLINE_LEAD_RE = /^(`+|\*\*\*|___|\*\*|__|\*|~~|==|\$)/
const LINK_RE = /^(!?\[)([^\]]*)](\([^)]*\)(?:\s+"[^"]*")?)$/

/** 行内元素渲染态可见偏移 → 源码偏移（如 **粗体** 内点击） */
export function mapInlineVisibleToSource(visibleOffset: number, source: string): number {
  const link = source.match(LINK_RE)
  if (link) {
    const lead = link[1].length
    return lead + Math.min(visibleOffset, link[2].length)
  }
  const lead = source.match(INLINE_LEAD_RE)?.[1] ?? ''
  if (lead) {
    const trail = lead
    const bodyLen = Math.max(0, source.length - lead.length - trail.length)
    return lead.length + Math.min(visibleOffset, bodyLen)
  }
  return Math.min(visibleOffset, source.length)
}
