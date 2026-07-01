// 预览编辑区 contenteditable 选区包裹 Markdown 标记

export function wrapContentEditable(
  el: HTMLElement,
  before: string,
  after: string = before,
): boolean {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return false
  const range = sel.getRangeAt(0)
  if (!el.contains(range.commonAncestorContainer)) return false
  const text = range.toString()
  range.deleteContents()
  const node = document.createTextNode(before + text + after)
  range.insertNode(node)
  range.setStart(node, before.length)
  range.setEnd(node, before.length + text.length)
  sel.removeAllRanges()
  sel.addRange(range)
  return true
}

export function insertContentEditable(el: HTMLElement, text: string): boolean {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return false
  const range = sel.getRangeAt(0)
  if (!el.contains(range.commonAncestorContainer)) return false
  range.deleteContents()
  const node = document.createTextNode(text)
  range.insertNode(node)
  range.setStartAfter(node)
  range.collapse(true)
  sel.removeAllRanges()
  sel.addRange(range)
  return true
}
