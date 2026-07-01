import { parseSlideLayout, type SlideLayout } from './layout'

export interface SlidePage {
  index: number
  title: string
  layout: SlideLayout
  startLine: number
  startPos: number
  endPos: number
  body: string
}

interface LineInfo {
  text: string
  from: number
  to: number
}

export function getSlidePages(markdown: string): SlidePage[] {
  const lines = toLines(markdown)
  const bodyStart = bodyStartLine(lines)
  const pages: SlidePage[] = []
  let segmentStart = bodyStart

  for (let i = bodyStart; i < lines.length; i++) {
    if (lines[i].text.trim() === '---') {
      pushPage(markdown, lines, pages, segmentStart, i)
      segmentStart = i + 1
    }
  }
  pushPage(markdown, lines, pages, segmentStart, lines.length)
  return pages.length ? pages : [emptyPage(markdown)]
}

export function insertSlideAfter(markdown: string, page: SlidePage): string {
  const before = markdown.slice(0, page.endPos)
  const after = markdown.slice(page.endPos)
  const prefix = before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'
  const suffix = after.startsWith('\n') ? '' : '\n'
  return `${before}${prefix}---\n\n## 新小节\n\n${suffix}${after}`
}

// 把第 from 张幻灯片移动到第 to 位（拖拽重排），保留 frontmatter，回写整篇 markdown。
export function moveSlide(markdown: string, from: number, to: number): string {
  const pages = getSlidePages(markdown)
  if (from < 0 || to < 0 || from >= pages.length || to >= pages.length || from === to) return markdown
  if (from === 0 || to === 0) return markdown // 封面固定为第 1 页
  const lines = toLines(markdown)
  const bs = bodyStartLine(lines)
  const head = bs > 0 && lines[bs] ? markdown.slice(0, lines[bs].from) : ''
  const bodies = pages.map((p) => p.body)
  const [moved] = bodies.splice(from, 1)
  bodies.splice(to, 0, moved)
  const headPart = head ? head.replace(/\n*$/, '\n\n') : ''
  return `${headPart}${bodies.join('\n\n---\n\n')}\n`
}

// 给第 index 张幻灯片设置版式（写入/替换 `<!-- layout: xxx -->`；'auto' 删除指令转为自动推断）。
export function setSlideLayout(markdown: string, index: number, layout: SlideLayout | 'auto'): string {
  const pages = getSlidePages(markdown)
  if (index < 0 || index >= pages.length) return markdown
  const lines = toLines(markdown)
  const bs = bodyStartLine(lines)
  const head = bs > 0 && lines[bs] ? markdown.slice(0, lines[bs].from) : ''
  const bodies = pages.map((p) => p.body)
  bodies[index] = applyLayoutDirective(bodies[index], layout)
  const headPart = head ? head.replace(/\n*$/, '\n\n') : ''
  return `${headPart}${bodies.join('\n\n---\n\n')}\n`
}

function applyLayoutDirective(body: string, layout: SlideLayout | 'auto'): string {
  const stripped = body.replace(/^\s*<!--\s*layout:\s*[a-z-]+\s*-->\s*\n?/i, '')
  if (layout === 'auto') return stripped
  return `<!-- layout: ${layout} -->\n\n${stripped}`
}

// 复制某页：在其后插入一份相同内容（借鉴 Gamma 卡片菜单「复制」）。
export function duplicateSlide(markdown: string, page: SlidePage): string {
  const before = markdown.slice(0, page.endPos)
  const after = markdown.slice(page.endPos)
  const prefix = before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'
  const suffix = after.startsWith('\n') ? '' : '\n'
  return `${before}${prefix}---\n\n${page.body}\n${suffix}${after}`
}

export function deleteSlide(markdown: string, page: SlidePage): string {
  const lines = toLines(markdown)
  const delimiterLine = findPreviousDelimiter(lines, page.startLine)
  if (delimiterLine < 0) return markdown
  const from = lines[delimiterLine].from
  const to = page.endPos
  return `${markdown.slice(0, from).replace(/\n*$/, '\n')}${markdown.slice(to).replace(/^\n+/, '')}`
}

function pushPage(
  markdown: string,
  lines: LineInfo[],
  pages: SlidePage[],
  fromLine: number,
  toLineExclusive: number,
) {
  const bodyLines = lines.slice(fromLine, toLineExclusive)
  const firstContent = bodyLines.findIndex((line) => line.text.trim())
  const startLine = firstContent >= 0 ? fromLine + firstContent : fromLine
  const startPos = lines[startLine]?.from ?? markdown.length
  const endPos = lines[toLineExclusive]?.from ?? markdown.length
  const body = markdown.slice(lines[fromLine]?.from ?? markdown.length, endPos).trim()
  if (!body && pages.length > 0) return
  const parsed = parseSlideLayout(body)
  pages.push({
    index: pages.length,
    title: titleFrom(parsed.body, pages.length),
    layout: parsed.layout,
    startLine,
    startPos,
    endPos,
    body,
  })
}

function emptyPage(markdown: string): SlidePage {
  return {
    index: 0,
    title: '第 1 节',
    layout: 'default',
    startLine: 0,
    startPos: 0,
    endPos: markdown.length,
    body: markdown,
  }
}

function bodyStartLine(lines: LineInfo[]): number {
  if (lines[0]?.text.trim() !== '---') return 0
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].text.trim() === '---') return i + 1
  }
  return 0
}

function findPreviousDelimiter(lines: LineInfo[], startLine: number): number {
  for (let i = startLine - 1; i >= 0; i--) {
    if (lines[i].text.trim() === '---') return i
  }
  return -1
}

function titleFrom(body: string, index: number): string {
  const heading = body
    .split('\n')
    .map((line) => line.trim())
    .find((line) => /^#{1,6}\s+\S/.test(line))
  if (heading) return heading.replace(/^#{1,6}\s+/, '').trim()
  const plain = body
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .map((line) => line.replace(/^[-*>#\d.\s]+/, '').trim())
    .find(Boolean)
  return plain ? plain.slice(0, 24) : `第 ${index + 1} 节`
}

function toLines(text: string): LineInfo[] {
  const raw = text.split('\n')
  const out: LineInfo[] = []
  let pos = 0
  for (const line of raw) {
    out.push({ text: line, from: pos, to: pos + line.length })
    pos += line.length + 1
  }
  return out
}
