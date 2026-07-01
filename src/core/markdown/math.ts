import type MarkdownIt from 'markdown-it'
import katex from 'katex'

// 从 ruler API 推导 state 类型，避免 `export =` 命名空间访问的兼容问题。
type RuleInline = Parameters<MarkdownIt['inline']['ruler']['after']>[2]
type RuleBlock = Parameters<MarkdownIt['block']['ruler']['after']>[2]
type StateInline = Parameters<RuleInline>[0]
type StateBlock = Parameters<RuleBlock>[0]

// 极简数学公式插件：行内 $...$、块级 $$...$$，用 KaTeX 渲染。
// 语法错误不抛出，渲染成红色提示文本，避免整页崩溃。

function renderKatex(expr: string, displayMode: boolean): string {
  try {
    return katex.renderToString(expr, {
      displayMode,
      throwOnError: false,
      output: 'html',
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const esc = msg.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return `<span class="katex-error" title="${esc}">${expr}</span>`
  }
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// 行内 $...$：要求 $ 紧贴非空白，且转义的 \$ 不触发。
function mathInline(state: StateInline, silent: boolean): boolean {
  const start = state.pos
  if (state.src.charCodeAt(start) !== 0x24 /* $ */) return false
  // 转义的 \$ 不算
  if (start > 0 && state.src.charCodeAt(start - 1) === 0x5c /* \ */) return false
  // 块级 $$ 交给块级规则/其它处理
  if (state.src.charCodeAt(start + 1) === 0x24) return false

  let pos = start + 1
  const max = state.posMax
  // 开头不能紧跟空白
  if (pos >= max || /\s/.test(state.src[pos])) return false

  let found = -1
  while (pos < max) {
    const ch = state.src.charCodeAt(pos)
    if (ch === 0x5c /* \ */) {
      pos += 2
      continue
    }
    if (ch === 0x24 /* $ */) {
      // 结尾 $ 前不能是空白
      if (!/\s/.test(state.src[pos - 1])) {
        found = pos
        break
      }
    }
    pos += 1
  }
  if (found < 0) return false

  const content = state.src.slice(start + 1, found)
  if (!silent) {
    const token = state.push('math_inline', 'math', 0)
    token.content = content
    token.markup = '$'
  }
  state.pos = found + 1
  return true
}

// 块级 $$...$$（可跨多行）。
function mathBlock(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  const startPos = state.bMarks[startLine] + state.tShift[startLine]
  let max = state.eMarks[startLine]
  if (startPos + 2 > max) return false
  if (state.src.slice(startPos, startPos + 2) !== '$$') return false

  let pos = startPos + 2
  let firstLine = state.src.slice(pos, max)
  if (silent) return true

  // 同一行闭合：$$ expr $$
  let found = false
  if (firstLine.trim().endsWith('$$')) {
    firstLine = firstLine.trim().slice(0, -2)
    found = true
  }

  let nextLine = startLine
  const lines: string[] = []
  if (found) {
    lines.push(firstLine)
  } else {
    if (firstLine) lines.push(firstLine)
    while (!found) {
      nextLine += 1
      if (nextLine >= endLine) break
      pos = state.bMarks[nextLine] + state.tShift[nextLine]
      max = state.eMarks[nextLine]
      const lineText = state.src.slice(state.bMarks[nextLine], max)
      if (lineText.trim().endsWith('$$')) {
        const idx = lineText.lastIndexOf('$$')
        lines.push(lineText.slice(0, idx))
        found = true
        break
      }
      lines.push(lineText)
    }
  }
  if (!found) return false

  state.line = nextLine + 1
  const token = state.push('math_block', 'math', 0)
  token.block = true
  token.content = lines.join('\n').trim()
  token.markup = '$$'
  token.map = [startLine, state.line]
  return true
}

export function mathPlugin(md: MarkdownIt): void {
  md.inline.ruler.after('escape', 'math_inline', mathInline)
  md.block.ruler.after('blockquote', 'math_block', mathBlock, {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  })
  md.renderer.rules.math_inline = (tokens, idx) => {
    const source = escapeAttr(tokens[idx].content)
    return `<span class="math-inline" data-math-source="${source}">${renderKatex(tokens[idx].content, false)}</span>`
  }
  md.renderer.rules.math_block = (tokens, idx) => {
    const token = tokens[idx]
    const line = token.map ? ` data-source-line="${token.map[0]}"` : ''
    return `<p class="math-block"${line} data-math-source="${escapeAttr(token.content)}">${renderKatex(token.content, true)}</p>\n`
  }
}
