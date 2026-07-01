import { EditorView } from '@codemirror/view'
import type { Extension } from '@codemirror/state'

// T5: 智能标点。由 EditorPane 按设置项（ui.smartPunctuation）挂载，默认关。
// 输入流改写：`--`→`—`、`...`→`…`，中文输入法不受干扰。
export function smartPunctuationExtension(): Extension {
  return EditorView.inputHandler.of((view, from, to, text) => {
    if (text === '-') { const l = view.state.doc.lineAt(from); if (l.text.slice(0, from - l.from).endsWith('-')) { view.dispatch({ changes: { from: from - 1, to, insert: '—' } }); return true } }
    if (text === '.') { const l = view.state.doc.lineAt(from); if (l.text.slice(0, from - l.from).endsWith('..')) { view.dispatch({ changes: { from: from - 2, to, insert: '…' } }); return true } }
    return false
  })
}
