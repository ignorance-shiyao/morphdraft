// 预览块级源码编辑：标题/引用/列表行前缀与 Enter 行为

export type BlockPrefixKind = 'heading' | 'blockquote' | 'task' | 'ordered' | 'bullet'

const BLOCK_PREFIX_RULES: { kind: BlockPrefixKind; re: RegExp }[] = [
  { kind: 'heading', re: /^(\s*#{1,6}\s+)/ },
  { kind: 'blockquote', re: /^(\s*>\s?)/ },
  { kind: 'task', re: /^(\s*-\s+\[(?:\s|[xX])\](?:\s+|$))/ },
  { kind: 'ordered', re: /^(\s*\d+[.)]\s+)/ },
  { kind: 'bullet', re: /^(\s*[-*+]\s+)/ },
]

/** @deprecated 用 blockLinePrefix；保留供旧测试引用 */
export const BLOCK_LINE_PREFIX_RE = /^(\s*(?:#{1,6}\s+|>\s?|-\s+\[(?:\s|[xX])\](?:\s+|$)|-\s+|[*+]\s+|\d+[.)]\s+))/

export function blockLinePrefixKind(line: string): BlockPrefixKind | null {
  for (const { kind, re } of BLOCK_PREFIX_RULES) {
    if (re.test(line)) return kind
  }
  return null
}

export function blockLinePrefix(line: string): string {
  for (const { re } of BLOCK_PREFIX_RULES) {
    const m = line.match(re)
    if (m) return m[1]
  }
  return ''
}

function continuationPrefix(line: string, prefix: string, kind: BlockPrefixKind): string {
  if (kind === 'ordered') {
    const m = line.match(/^(\s*)(\d+)([.)])\s+/)
    if (m) {
      const n = parseInt(m[2], 10) + 1
      return `${m[1]}${n}${m[3]} `
    }
  }
  if (kind === 'blockquote') {
    const m = prefix.match(/^(\s*)>\s?/)
    if (m) return `${m[1]}> `
  }
  // 任务项延续为「未勾选」新项，而非沿用当前勾选态
  if (kind === 'task') {
    const next = prefix.replace(/\[(?:\s|[xX])\]/, '[ ]')
    return /\s$/.test(next) ? next : `${next} `
  }
  // 标题：延续同级新标题（前缀即 `#… `）
  return prefix
}

/**
 * 预览编辑态「回车」的按行逻辑（贴合直觉）：
 * - 有格式且本行非空（标题/引用/列表）→ 在下一行延续同款格式；光标后的内容移到新行。
 * - 本行是「空的格式行」（如空 `# `、`> `、`- `）→ 退出格式，变成无格式空行（停留本行）。
 * - 无格式 → 普通拆行。
 * 返回替换「本行」的新行数组，及光标应落在第几个新行（相对索引）。
 */
export function lineContinueEnter(line: string, col: number): { lines: string[]; caretLine: number } {
  const kind = blockLinePrefixKind(line)
  const prefix = kind ? blockLinePrefix(line) : ''
  if (kind && line.slice(prefix.length).trim() === '') {
    return { lines: [''], caretLine: 0 } // 空格式行 → 退出格式为无格式空行
  }
  const c = Math.min(Math.max(col, prefix.length), line.length)
  const before = line.slice(0, c)
  const after = line.slice(c)
  if (kind) {
    return { lines: [before, continuationPrefix(line, prefix, kind) + after], caretLine: 1 }
  }
  return { lines: [line.slice(0, Math.max(col, 0)), line.slice(Math.max(col, 0))], caretLine: 1 }
}

/** 预览 WYSIWYG 引用块序列化时可能误写成 `> > ...`；普通引用回车前先压回单层。 */
export function collapseDuplicateQuotePrefix(line: string): string {
  return line.replace(/^(\s*)(?:>\s?)+/, '$1> ')
}

export type BlockEnterResult = { next: string; caret: number }

/** 渲染态可见文字偏移 → 块级源码偏移（引用/列表/标题前缀在预览里不显示） */
export function mapVisibleOffsetToSource(visibleOffset: number, sourceText: string): number {
  const lines = sourceText.split('\n')
  let vis = 0
  let src = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const prefix = blockLinePrefix(line)
    const body = line.slice(prefix.length)
    if (visibleOffset <= vis + body.length) {
      return src + prefix.length + Math.max(0, visibleOffset - vis)
    }
    vis += body.length
    src += line.length
    if (i < lines.length - 1) {
      vis += 1
      src += 1
    }
  }
  return sourceText.length
}

function plainLineEnter(text: string, offset: number): BlockEnterResult {
  const insert = '\n'
  const next = text.slice(0, offset) + insert + text.slice(offset)
  return { next, caret: offset + insert.length }
}

/** Enter 在块级源码编辑中的特殊处理；块级编辑下一律由我们处理（避免浏览器插入无样式换行） */
export function blockEnterEdit(
  text: string,
  offset: number,
): BlockEnterResult | null {
  const lineStart = text.lastIndexOf('\n', Math.max(0, offset - 1)) + 1
  const lineEndIdx = text.indexOf('\n', offset)
  const lineEnd = lineEndIdx === -1 ? text.length : lineEndIdx
  const currentLine = text.slice(lineStart, lineEnd)
  const kind = blockLinePrefixKind(currentLine)
  const prefix = kind ? blockLinePrefix(currentLine) : ''

  const before = text.slice(lineStart, offset)
  const after = text.slice(offset, lineEnd)

  if (!kind || !prefix) {
    return plainLineEnter(text, offset)
  }

  const beforeBody = before.slice(prefix.length)
  const afterBody = after

  // 空的前缀行（如 `> `、`- `）再回车 → 去掉该行前缀，插入无格式空行（继续编辑，不关闭）
  if (beforeBody.trim() === '' && afterBody.trim() === '') {
    const next = text.slice(0, lineStart) + '\n' + text.slice(lineEnd)
    return { next, caret: lineStart + 1 }
  }

  // 标题：新行不带 # 前缀
  if (kind === 'heading') {
    return plainLineEnter(text, offset)
  }

  const cont = continuationPrefix(currentLine, prefix, kind)
  const insert = '\n' + cont
  const next = text.slice(0, offset) + insert + text.slice(offset)
  return { next, caret: offset + insert.length }
}

export const INLINE_CHILD_SELECTOR = 'strong, em, s, del, mark, u, ins, kbd, sub, sup, code, a, img, .math-inline'

export function hasRenderedInlineChildren(el: HTMLElement): boolean {
  return !!el.querySelector(INLINE_CHILD_SELECTOR)
}
