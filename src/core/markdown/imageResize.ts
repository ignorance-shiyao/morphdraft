export interface ImageResizeRange {
  line: number
  from: number
  to: number
  source: string
}

interface ImageCandidate extends ImageResizeRange {
  alt: string
  src: string
  title?: string
}

const MD_IMAGE_RE = /!\[([^\]]*)]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g
const HTML_IMG_RE = /<img\b[^>]*>/gi

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function attr(source: string, name: string): string | undefined {
  const re = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i')
  const m = source.match(re)
  return m ? String(m[1] ?? m[2] ?? m[3] ?? '') : undefined
}

function candidatesInLine(line: string, lineNo: number): ImageCandidate[] {
  const out: ImageCandidate[] = []
  let m: RegExpExecArray | null
  MD_IMAGE_RE.lastIndex = 0
  while ((m = MD_IMAGE_RE.exec(line))) {
    out.push({
      line: lineNo,
      from: m.index,
      to: m.index + m[0].length,
      source: m[0],
      alt: m[1] ?? '',
      src: m[2] ?? '',
      title: m[3],
    })
  }
  HTML_IMG_RE.lastIndex = 0
  while ((m = HTML_IMG_RE.exec(line))) {
    const source = m[0]
    out.push({
      line: lineNo,
      from: m.index,
      to: m.index + source.length,
      source,
      alt: attr(source, 'alt') ?? '',
      src: attr(source, 'src') ?? '',
      title: attr(source, 'title'),
    })
  }
  return out.sort((a, b) => a.from - b.from)
}

export function findImageResizeRange(
  lines: string[],
  startLine: number,
  endLine: number,
  src: string,
  alt: string,
  occurrence = 0,
): ImageResizeRange | null {
  let seen = 0
  for (let lineNo = startLine; lineNo <= endLine; lineNo++) {
    for (const c of candidatesInLine(lines[lineNo] ?? '', lineNo)) {
      if (c.src !== src || c.alt !== alt) continue
      if (seen++ < occurrence) continue
      return { line: c.line, from: c.from, to: c.to, source: c.source }
    }
  }
  return null
}

export function findImageResizeRangeByIndex(
  lines: string[],
  startLine: number,
  endLine: number,
  occurrence = 0,
): ImageResizeRange | null {
  let seen = 0
  for (let lineNo = startLine; lineNo <= endLine; lineNo++) {
    for (const c of candidatesInLine(lines[lineNo] ?? '', lineNo)) {
      if (seen++ < occurrence) continue
      return { line: c.line, from: c.from, to: c.to, source: c.source }
    }
  }
  return null
}

export function imageOccurrence(root: HTMLElement, img: HTMLImageElement): number {
  const src = img.getAttribute('src') ?? ''
  const alt = img.getAttribute('alt') ?? ''
  const matches = Array.from(root.querySelectorAll<HTMLImageElement>('img'))
    .filter((node) => (node.getAttribute('src') ?? '') === src && (node.getAttribute('alt') ?? '') === alt)
  return Math.max(0, matches.indexOf(img))
}

export type ImageAlign = 'none' | 'left' | 'center' | 'right'

export interface ImageAttrs {
  src: string
  alt: string
  title?: string
  width: number | null
  height: number | null
  align: ImageAlign
  rounded: boolean
  shadow: boolean
}

const IMG_RADIUS = '10px'
const IMG_SHADOW = '0 6px 24px rgba(15, 23, 42, 0.18)'

function styleProp(style: string, name: string): string | undefined {
  const re = new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, 'i')
  const m = style.match(re)
  return m ? m[1].trim() : undefined
}

// 解析单个图片源（Markdown `![]()` 或 `<img>`）的可编辑属性。
export function readImageAttrs(source: string): ImageAttrs {
  const md = source.match(/^!\[([^\]]*)]\(([^)\s]+)(?:\s+"([^"]*)")?\)$/)
  if (md) {
    return {
      src: md[2] ?? '',
      alt: md[1] ?? '',
      title: md[3],
      width: null,
      height: null,
      align: 'none',
      rounded: false,
      shadow: false,
    }
  }
  const style = attr(source, 'style') ?? ''
  const w = styleProp(style, 'width')
  const h = styleProp(style, 'height')
  const ml = styleProp(style, 'margin-left')
  const mr = styleProp(style, 'margin-right')
  let align: ImageAlign = 'none'
  if (ml === 'auto' && mr === 'auto') align = 'center'
  else if (ml === 'auto') align = 'right'
  else if (mr === 'auto') align = 'left'
  return {
    src: attr(source, 'src') ?? '',
    alt: attr(source, 'alt') ?? '',
    title: attr(source, 'title'),
    width: w ? Number.parseInt(w, 10) || null : null,
    height: h ? Number.parseInt(h, 10) || null : null,
    align,
    rounded: !!styleProp(style, 'border-radius'),
    shadow: !!styleProp(style, 'box-shadow'),
  }
}

// 把属性序列化回源码：无任何额外样式/标题时回退为干净的 Markdown 图片，否则输出安全的 `<img>`。
export function serializeImageTag(a: ImageAttrs): string {
  const style: string[] = []
  if (a.width != null) style.push(`width:${Math.max(24, Math.round(a.width))}px`)
  if (a.height != null) style.push(`height:${Math.max(24, Math.round(a.height))}px`)
  if (a.align === 'center') style.push('display:block', 'margin-left:auto', 'margin-right:auto')
  else if (a.align === 'left') style.push('display:block', 'margin-left:0', 'margin-right:auto')
  else if (a.align === 'right') style.push('display:block', 'margin-left:auto', 'margin-right:0')
  if (a.rounded) style.push(`border-radius:${IMG_RADIUS}`)
  if (a.shadow) style.push(`box-shadow:${IMG_SHADOW}`)
  if (!style.length && !a.title) return `![${a.alt}](${a.src})`
  const title = a.title ? ` title="${escapeAttr(a.title)}"` : ''
  const styleAttr = style.length ? ` style="${style.join(';')}"` : ''
  return `<img src="${escapeAttr(a.src)}" alt="${escapeAttr(a.alt)}"${title}${styleAttr}>`
}

export function applyImageAttrs(source: string, patch: Partial<ImageAttrs>): string {
  return serializeImageTag({ ...readImageAttrs(source), ...patch })
}

export function resizeImageSource(source: string, width: number, height?: number): string {
  const cleanWidth = Math.max(24, Math.min(2400, Math.round(width)))
  const cleanHeight = height == null ? null : Math.max(24, Math.min(2400, Math.round(height)))
  const style = `width:${cleanWidth}px${cleanHeight == null ? '' : `;height:${cleanHeight}px`}`
  const md = source.match(/^!\[([^\]]*)]\(([^)\s]+)(?:\s+"([^"]*)")?\)$/)
  if (md) {
    const title = md[3] ? ` title="${escapeAttr(md[3])}"` : ''
    return `<img src="${escapeAttr(md[2] ?? '')}" alt="${escapeAttr(md[1] ?? '')}"${title} style="${style}">`
  }
  if (/^<img\b/i.test(source)) {
    let next = source
    if (/\sstyle\s*=/.test(next)) next = next.replace(/\sstyle\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+)/i, ` style="${style}"`)
    else next = next.replace(/\s*\/?>$/, ` style="${style}">`)
    return next.replace(/\s\/>$/, '>')
  }
  return source
}
