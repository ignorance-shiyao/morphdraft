// 斜杠命令：行内输入 `/` 触发块插入菜单（复用 core/editor/snippets.ts 模板）。
import type { CompletionContext, CompletionResult, Completion } from '@codemirror/autocomplete'
import type { EditorView } from '@codemirror/view'
import { SNIPPETS, type Snippet } from './snippets'
import { useUiStore } from '../../stores/ui'

const SECTION_LABELS: Record<Snippet['group'], string> = {
  basic: '基础',
  todo: '待办',
  callout: '标注框',
  structure: '结构',
  media: '图示与图表',
  slide: '幻灯片',
}

function applySnippet(s: Snippet) {
  return (view: EditorView, _c: Completion, from: number, to: number) => {
    const caret = from + (s.caret ?? s.insert.length)
    view.dispatch({
      changes: { from, to, insert: s.insert },
      selection: { anchor: caret },
    })
  }
}

export function slashCompletions(context: CompletionContext): CompletionResult | null {
  const token = context.matchBefore(/\/[\w一-鿿]*/)
  if (!token) return null
  if (token.from === token.to && !context.explicit) return null
  // 仅当 `/` 处于行首或紧跟空白时触发，避免 URL/路径里的斜杠误触
  const prev = token.from > 0 ? context.state.sliceDoc(token.from - 1, token.from) : ''
  if (prev && !/\s/.test(prev)) return null

  // 20.3 模式纯净度：幻灯片专属片段（分页/版式）仅在 slide 模式出现，不污染文档编辑
  const isSlide = useUiStore().mode === 'slide'
  const pool = SNIPPETS.filter((s) => !s.slideOnly || isSlide)

  const query = token.text.slice(1).toLowerCase()
  const matched = query
    ? pool.filter(
        (s) => s.label.toLowerCase().includes(query) || s.keywords.toLowerCase().includes(query),
      )
    : pool

  if (matched.length === 0) return null
  return {
    from: token.from,
    to: token.to,
    filter: false, // 自行用关键词（含拼音）过滤
    options: matched.map<Completion>((s) => ({
      label: '/' + s.label,
      detail: s.detail,
      type: 'keyword',
      section: SECTION_LABELS[s.group],
      apply: applySnippet(s),
    })),
  }
}
