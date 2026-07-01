import type MarkdownIt from 'markdown-it'

// 内容目录：把单独一行的 [toc] / [[toc]] 替换为基于标题的嵌套目录，
// 并给标题加 id（slug + 序号去重），目录项锚点链接到对应标题。

// 导出供工作区索引（R1）锚点复用，保证与 toc 锚点规则一致、不漂移。
export function slugify(text: string): string {
  return (
    text
      .trim()
      .toLowerCase()
      .replace(/[^\w一-龥]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'h'
  )
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

interface Head {
  level: number
  text: string
  id: string
}

function buildToc(heads: Head[], line: number | null): string {
  // data-source-line 让目录与其它块一样参与双向滚动定位。TOC 在预览里很高、但源码只有一行 [toc]，
  // 缺了这个锚点会让滚动同步跳过整段目录、左右两侧位置错算。
  const lineAttr = line != null ? ` data-source-line="${line}"` : ''
  if (!heads.length) return `<nav class="toc"${lineAttr}><div class="toc-title">目录</div><p class="toc-empty">（暂无标题）</p></nav>`
  const minL = Math.min(...heads.map((h) => h.level))
  let html = `<nav class="toc"${lineAttr}><div class="toc-title">目录</div><ul>`
  let cur = minL
  for (const h of heads) {
    while (cur < h.level) { html += '<ul>'; cur++ }
    while (cur > h.level) { html += '</ul></li>'; cur-- }
    html += `<li><a href="#${h.id}">${esc(h.text)}</a>`
    html += '</li>'
  }
  while (cur > minL) { html += '</ul></li>'; cur-- }
  html += '</ul></nav>'
  return html
}

export function tocPlugin(md: MarkdownIt): void {
  md.core.ruler.push('toc', (state) => {
    const tokens = state.tokens
    const heads: Head[] = []
    const used = new Set<string>()

    // 收集标题并赋 id
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== 'heading_open') continue
      const inline = tokens[i + 1]
      const text = inline && inline.type === 'inline' ? inline.content : ''
      let id = slugify(text)
      let n = 1
      while (used.has(id)) id = `${slugify(text)}-${n++}`
      used.add(id)
      tokens[i].attrSet('id', id)
      heads.push({ level: Number(tokens[i].tag.slice(1)), text, id })
    }

    // 替换 [toc]
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== 'paragraph_open') continue
      const inline = tokens[i + 1]
      if (!inline || inline.type !== 'inline') continue
      const c = inline.content.trim().toLowerCase()
      if (c !== '[toc]' && c !== '[[toc]]') continue
      const tok = new state.Token('html_block', '', 0)
      const map = tokens[i].map
      tok.content = buildToc(heads, map ? map[0] : null) + '\n'
      if (map) tok.map = map
      tokens.splice(i, 3, tok) // paragraph_open + inline + paragraph_close
    }
  })
}
