// 预览点击：行内元素识别、链接编辑定位、空白处守卫（DocumentPreview / SlidePreview 共用）

import {
  blockEditRange,
  findInlineEditRange,
  type InlineEditKind,
} from './editUnits'
import { buildMarkdownLink, parseMarkdownLink, type MarkdownLinkFields } from './linkEdit'

export const INLINE_SELECTOR = 'code, .math-inline, strong, em, s, del, mark, u, ins, kbd, sub, sup, a, img'

function boldItalicEl(el: HTMLElement): HTMLElement | null {
  const same = (a: Element | null, b: Element | null) =>
    !!a && !!b && (a.textContent ?? '').trim() === (b.textContent ?? '').trim()
  if (el.matches('strong') && el.parentElement?.matches('em') && same(el, el.parentElement)) return el
  if (el.matches('em') && el.parentElement?.matches('strong') && same(el, el.parentElement)) return el
  if (el.matches('em') && el.firstElementChild?.matches('strong') && same(el, el.firstElementChild)) return el
  if (el.matches('strong') && el.firstElementChild?.matches('em') && same(el, el.firstElementChild)) return el
  return null
}

export function inlineTarget(target: HTMLElement | null): {
  el: HTMLElement
  kind: InlineEditKind
  text: string
  selector: string
} | null {
  const el = target?.closest<HTMLElement>(INLINE_SELECTOR)
  if (!el || el.closest('pre')) return null
  const bi = boldItalicEl(el)
  if (bi) return { el: bi, kind: 'strongEmphasis', text: bi.textContent ?? '', selector: bi.matches('strong') ? 'strong' : 'em' }
  if (el.matches('code')) return { el, kind: 'code', text: el.textContent ?? '', selector: 'code' }
  if (el.matches('.math-inline')) {
    return { el, kind: 'math', text: el.dataset.mathSource ?? '', selector: '.math-inline' }
  }
  if (el.matches('strong')) return { el, kind: 'strong', text: el.textContent ?? '', selector: 'strong' }
  if (el.matches('em')) return { el, kind: 'emphasis', text: el.textContent ?? '', selector: 'em' }
  if (el.matches('s, del')) return { el, kind: 'strike', text: el.textContent ?? '', selector: 's, del' }
  if (el.matches('mark')) return { el, kind: 'mark', text: el.textContent ?? '', selector: 'mark' }
  if (el.matches('u, ins')) return { el, kind: 'underline', text: el.textContent ?? '', selector: 'u, ins' }
  if (el.matches('kbd')) return { el, kind: 'kbd', text: el.textContent ?? '', selector: 'kbd' }
  if (el.matches('sub')) return { el, kind: 'sub', text: el.textContent ?? '', selector: 'sub' }
  if (el.matches('sup')) return { el, kind: 'sup', text: el.textContent ?? '', selector: 'sup' }
  if (el.matches('img')) {
    return { el, kind: 'image', text: el.getAttribute('alt') ?? '', selector: 'img' }
  }
  return { el, kind: 'link', text: el.textContent ?? '', selector: 'a' }
}

export function inlineOccurrence(root: HTMLElement, inline: ReturnType<typeof inlineTarget>): number {
  if (!inline) return 0
  const want = (inline.el.textContent ?? '').trim()
  const matches = Array.from(root.querySelectorAll<HTMLElement>(inline.selector))
    .filter((m) => (m.textContent ?? '').trim() === want)
  return Math.max(0, matches.indexOf(inline.el))
}

/** O8a：点击落在空白处（非文字节点）→ 不打开块级编辑器 */
export function textNodeAtPoint(x: number, y: number, scope: HTMLElement): boolean {
  if (typeof document === 'undefined') return false
  type CaretFromPoint = (x: number, y: number) => { offsetNode: Node; offset: number } | null
  const caretPositionFromPoint = (document as Document & { caretPositionFromPoint?: CaretFromPoint }).caretPositionFromPoint
  if (typeof caretPositionFromPoint === 'function') {
    const pos = caretPositionFromPoint.call(document, x, y)
    if (!pos) return false
    if (pos.offsetNode.nodeType === Node.TEXT_NODE
        && scope.contains(pos.offsetNode)
        && (pos.offsetNode.textContent ?? '').trim().length > 0) return true
    return false
  }
  type CaretRangeFromPoint = (x: number, y: number) => Range | null
  const caretRangeFromPoint = (document as Document & { caretRangeFromPoint?: CaretRangeFromPoint }).caretRangeFromPoint
  if (typeof caretRangeFromPoint === 'function') {
    const range = caretRangeFromPoint.call(document, x, y)
    if (!range) return false
    if (range.startContainer.nodeType === Node.TEXT_NODE
        && scope.contains(range.startContainer)
        && (range.startContainer.textContent ?? '').trim().length > 0) return true
    return false
  }
  return true
}

export interface LinkEditorState {
  line: number
  from: number
  to: number
  anchor: { left: number; top: number; bottom: number }
  fields: MarkdownLinkFields
}

export function resolveLinkEditor(
  markdown: string,
  line: number,
  block: HTMLElement,
  anchor: HTMLElement,
): LinkEditorState | null {
  const lines = markdown.split('\n')
  const range = blockEditRange(lines, line)
  const inline = inlineTarget(anchor)
  if (!inline || inline.kind !== 'link') return null
  const located = findInlineEditRange(lines, range, 'link', inline.text, inlineOccurrence(block, inline))
  if (!located) return null
  const fields = parseMarkdownLink(located.source)
  if (!fields) return null
  const rect = anchor.getBoundingClientRect()
  return {
    line: located.line,
    from: located.from,
    to: located.to,
    anchor: { left: rect.left, top: rect.top, bottom: rect.bottom },
    fields,
  }
}

export function applyLinkEdit(markdown: string, state: LinkEditorState, fields: MarkdownLinkFields): string {
  const lines = markdown.split('\n')
  const line = lines[state.line]
  if (line === undefined) return markdown
  lines[state.line] = line.slice(0, state.from) + buildMarkdownLink(fields) + line.slice(state.to)
  return lines.join('\n')
}

/** 预览点击守卫：空白段落 / 嵌套列表 → 不炸开块级编辑 */
export function shouldSkipBlockEditor(event: MouseEvent, target: HTMLElement | null): boolean {
  const richTextBlock = target?.closest<HTMLElement>('p[data-source-line], li[data-source-line], blockquote[data-source-line], td, th')
  const hasInlineHit = !!target?.closest('code, a, strong, em, s, del, mark, u, ins, kbd, sub, sup, .math-inline, img, .task-checkbox, .code-lang, .wikilink, .footnote-ref')
  if (richTextBlock && !hasInlineHit && !textNodeAtPoint(event.clientX, event.clientY, richTextBlock)) {
    return true
  }
  const liEl = target?.closest<HTMLElement>('li[data-source-line]')
  if (liEl && !hasInlineHit && liEl.querySelector(':scope > ul, :scope > ol')) {
    return true
  }
  return false
}
