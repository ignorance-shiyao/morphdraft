// T2: 选区包裹 —— 选中文字时按 markdown 标记键，直接用标记包裹选区（Typora 手势）。
// 仅在「存在非空选区」时介入；空选区放行默认输入，避免干扰列表 `* `、普通打字。
// 包裹后整段（含标记）保持选中，便于再按一次升级（如 *斜体* → **加粗**）。
import { EditorView } from '@codemirror/view'
import { EditorSelection, type Extension } from '@codemirror/state'

// 键入字符 → 包裹标记。反引号 closeBrackets 默认不含，这里补上。
const WRAPPERS: Record<string, string> = {
  '*': '*', // 斜体（再按一次 → 加粗 **）
  '`': '`', // 行内代码
  '~': '~~', // 删除线
  '=': '==', // 高亮
}

export function wrapSelectionExtension(): Extension {
  return EditorView.inputHandler.of((view, _from, _to, text) => {
    const wrap = WRAPPERS[text]
    if (!wrap) return false
    // 全部选区都为空 → 不介入，走默认输入
    if (view.state.selection.ranges.every((r) => r.empty)) return false

    const tr = view.state.changeByRange((range) => {
      if (range.empty) {
        // 多光标里的空范围：原样插入字符
        return {
          changes: { from: range.from, insert: text },
          range: EditorSelection.cursor(range.from + text.length),
        }
      }
      const inner = view.state.sliceDoc(range.from, range.to)
      const insert = wrap + inner + wrap
      return {
        changes: { from: range.from, to: range.to, insert },
        // 整段（含标记）保持选中：再按一次同键即可叠加（*x* → **x**）
        range: EditorSelection.range(range.from, range.from + insert.length),
      }
    })
    view.dispatch(tr, { userEvent: 'input.wrap' })
    return true
  })
}
