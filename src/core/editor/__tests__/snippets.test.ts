import { describe, expect, it } from 'vitest'
import { CompletionContext } from '@codemirror/autocomplete'
import { EditorState } from '@codemirror/state'
import { createPinia, setActivePinia } from 'pinia'
import { SNIPPETS } from '../snippets'
import { slashCompletions } from '../slashMenu'

describe('斜杠补全分组', () => {
  it('为列表、待办、标注框和分隔线提供可检索分组', () => {
    const byLabel = (label: string) => SNIPPETS.find((item) => item.label === label)

    expect(byLabel('无序列表')?.group).toBe('basic')
    expect(byLabel('有序列表')?.group).toBe('basic')
    expect(byLabel('引用')?.group).toBe('basic')
    expect(byLabel('待办清单')?.group).toBe('todo')
    expect(byLabel('提示框')?.group).toBe('callout')
    expect(byLabel('分隔线')?.group).toBe('basic')
  })

  it('斜杠补全把匹配项按菜单类别分区', () => {
    setActivePinia(createPinia())
    const state = EditorState.create({ doc: '/待' })
    const result = slashCompletions(new CompletionContext(state, 2, false))

    expect(result?.options).toHaveLength(1)
    expect(result?.options[0].label).toBe('/待办清单')
    expect(result?.options[0].section).toBe('待办')
  })
})
