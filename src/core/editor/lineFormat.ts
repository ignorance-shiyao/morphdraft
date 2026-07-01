// 行级 / 选区级 Markdown 格式：根据当前行是否为空、是否已有标记，切换样式而非盲目插入占位文本。

export type LinePrefixKind = 'ul' | 'ol' | 'quote' | 'task'

const PREFIX_SPECS: Record<LinePrefixKind, { re: RegExp; prefix: string }> = {
  ul: { re: /^- (?!\[[ xX]\])/, prefix: '- ' },
  ol: { re: /^\d+\. /, prefix: '1. ' },
  quote: { re: /^> /, prefix: '> ' },
  task: { re: /^- \[[ xX]\] /, prefix: '- [ ] ' },
}

/** 去掉行首块级前缀（标题、列表、引用、任务等），返回前缀与正文。 */
export function splitLineBlockPrefix(lineText: string): { prefix: string; body: string } {
  let rest = lineText
  let prefix = ''
  const heading = rest.match(/^(#{1,6}\s+)/)
  if (heading) {
    prefix += heading[1]
    rest = rest.slice(heading[1].length)
  }
  for (const spec of Object.values(PREFIX_SPECS)) {
    const m = rest.match(spec.re)
    if (m) {
      prefix += m[0]
      rest = rest.slice(m[0].length)
      break
    }
  }
  return { prefix, body: rest }
}

/** 切换无序 / 有序 / 引用 / 任务列表前缀；已有同类型则移除。 */
export function toggleLinePrefix(lineText: string, kind: LinePrefixKind): string {
  const spec = PREFIX_SPECS[kind]
  const { prefix, body } = splitLineBlockPrefix(lineText)
  const blockPrefix = prefix.replace(/^#{1,6}\s+/, '')
  if (blockPrefix && spec.re.test(blockPrefix)) {
    const heading = prefix.match(/^(#{1,6}\s+)/)?.[1] ?? ''
    return heading + body
  }
  if (!prefix.startsWith('#') && spec.re.test(lineText)) {
    return lineText.replace(spec.re, '')
  }
  const heading = prefix.match(/^(#{1,6}\s+)/)?.[1] ?? ''
  return heading + spec.prefix + (heading ? body : lineText)
}

/** 切换行内标记包裹；空正文时只返回标记对。 */
export function toggleInlineMarkers(
  inner: string,
  before: string,
  after: string,
): { text: string; cursorOffset: number } {
  if (
    inner.length >= before.length + after.length
    && inner.startsWith(before)
    && inner.endsWith(after)
  ) {
    const stripped = inner.slice(before.length, inner.length - after.length)
    return { text: stripped, cursorOffset: -before.length }
  }
  if (inner === '') {
    return { text: before + after, cursorOffset: before.length }
  }
  return { text: before + inner + after, cursorOffset: before.length }
}

export function emptyLinkMarkers(): { text: string; cursorOffset: number } {
  return { text: '[](https://)', cursorOffset: 1 }
}

/** 将行设为指定标题级别（0 = 正文）。保留列表/引用等块前缀后的正文。 */
export function applyHeadingToLine(lineText: string, level: number): string {
  const { prefix, body } = splitLineBlockPrefix(lineText)
  const blockPrefix = prefix.replace(/^#{1,6}\s+/, '')
  const heading = level > 0 ? '#'.repeat(level) + ' ' : ''
  return heading + blockPrefix + body
}
