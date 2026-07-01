export interface MarkdownHeading {
  level: number
  line: number
  text: string
}

export interface HeadingSection {
  heading: MarkdownHeading
  start: number
  end: number
}

const FENCE_RE = /^\s*(```|~~~)/
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/

export function parseMarkdownHeadings(markdown: string): MarkdownHeading[] {
  const out: MarkdownHeading[] = []
  const lines = markdown.split('\n')
  let fence: string | null = null
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const fenceHit = line.match(FENCE_RE)
    if (fenceHit) {
      if (!fence) fence = fenceHit[1]
      else if (line.trimStart().startsWith(fence)) fence = null
      continue
    }
    if (fence) continue
    const h = line.match(HEADING_RE)
    if (!h) continue
    out.push({
      level: h[1].length,
      line: i,
      text: h[2].replace(/\s+#+\s*$/, '').trim(),
    })
  }
  return out
}

export function headingSections(markdown: string, headings = parseMarkdownHeadings(markdown)): HeadingSection[] {
  const lineCount = markdown.split('\n').length
  return headings.map((heading, i) => {
    let end = lineCount
    for (let j = i + 1; j < headings.length; j++) {
      if (headings[j].level <= heading.level) {
        end = headings[j].line
        break
      }
    }
    return { heading, start: heading.line, end }
  })
}

export function collapsedHeadingHiddenLines(markdown: string, collapsedLines: Set<number>): Set<number> {
  const hidden = new Set<number>()
  for (const section of headingSections(markdown)) {
    if (!collapsedLines.has(section.heading.line)) continue
    for (let line = section.start + 1; line < section.end; line++) hidden.add(line)
  }
  return hidden
}

export function headingHasChildren(markdown: string, headingLine: number): boolean {
  const section = headingSections(markdown).find((s) => s.heading.line === headingLine)
  return !!section && section.end > section.start + 1
}
