// U3：把源码顶部的 frontmatter 块（--- … ---）渲染成圆角卡片。
// 用 CodeMirror 行装饰给 frontmatter 各行加类，配合 EditorPane 的 :deep CSS 呈现卡片。

import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import type { Extension } from '@codemirror/state'

function build(view: EditorView): DecorationSet {
  const doc = view.state.doc
  if (doc.lines < 2) return Decoration.none
  // frontmatter 必须从第 1 行的 --- 开始
  if (doc.line(1).text.trim() !== '---') return Decoration.none
  let closing = 0
  for (let n = 2; n <= doc.lines; n++) {
    if (doc.line(n).text.trim() === '---') { closing = n; break }
  }
  if (!closing) return Decoration.none

  const ranges = []
  for (let n = 1; n <= closing; n++) {
    const line = doc.line(n)
    const cls =
      'cm-frontmatter' +
      (n === 1 ? ' cm-frontmatter-top' : '') +
      (n === closing ? ' cm-frontmatter-bottom' : '')
    ranges.push(Decoration.line({ class: cls }).range(line.from))
  }
  return Decoration.set(ranges)
}

export function frontmatterDecoration(): Extension {
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
