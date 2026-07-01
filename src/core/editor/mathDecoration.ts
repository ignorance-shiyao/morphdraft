// 数学公式高亮：Lezer markdown 文法不解析 $…$ / $$…$$，这里用 ViewPlugin 扫描可视文档，
// 给行内/块级公式的美元定界符与公式体打上 class，配合 EditorPane 的 :deep CSS 上色。
// 与 frontmatterDecoration 同一套路（纯装饰，不改文档）。

import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import type { Extension, Range } from '@codemirror/state'

const delimMark = Decoration.mark({ class: 'cm-math-delim' })
const bodyMark = Decoration.mark({ class: 'cm-math' })

// 在单行内扫描 $$…$$（同行）与 $…$，按定界符/公式体分别打标。
function scanLine(from: number, text: string, out: Range<Decoration>[]): void {
  // 先块级（$$…$$ 同行），再行内（$…$，不跨 $）。交替正则按位置从左到右匹配，天然区分二者。
  const re = /\$\$([^\n]*?)\$\$|(?<!\\)\$([^\n$]+?)\$/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const full = m[0]
    const block = full.startsWith('$$')
    const d = block ? 2 : 1
    const start = from + m.index
    const end = start + full.length
    if (full.length <= d * 2) { out.push(delimMark.range(start, end)); continue } // 空公式：整体当定界符
    out.push(delimMark.range(start, start + d))
    out.push(bodyMark.range(start + d, end - d))
    out.push(delimMark.range(end - d, end))
  }
}

function build(view: EditorView): DecorationSet {
  const out: Range<Decoration>[] = []
  const doc = view.state.doc
  let inBlock = false
  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n)
    const trimmed = line.text.trim()
    if (inBlock) {
      // 多行 $$ 块：整行当公式体，遇到收尾 $$ 行则当定界符并结束
      if (trimmed === '$$') { out.push(delimMark.range(line.from, line.to)); inBlock = false }
      else if (line.text.length) out.push(bodyMark.range(line.from, line.to))
      continue
    }
    // 独占一行的 $$ 开启多行块（同行 $$…$$ 不在此列，交给 scanLine）
    if (trimmed === '$$') { out.push(delimMark.range(line.from, line.to)); inBlock = true; continue }
    if (line.text.includes('$')) scanLine(line.from, line.text, out)
  }
  return Decoration.set(out, true)
}

export function mathDecoration(): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      constructor(view: EditorView) {
        this.decorations = build(view)
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged) this.decorations = build(u.view)
      }
    },
    { decorations: (v) => v.decorations },
  )
}
