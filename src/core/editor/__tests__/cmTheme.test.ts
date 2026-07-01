import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { highlightingFor } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { PRESETS } from '../../themes/presets'
import { makeEditorTheme } from '../cmTheme'

describe('makeEditorTheme（源码语法 token）', () => {
  it('普通变量名有主题高亮，供 Mermaid 节点标识使用', () => {
    const state = EditorState.create({
      extensions: [makeEditorTheme(PRESETS.azure)],
    })

    expect(highlightingFor(state, [tags.variableName])).toBeTruthy()
  })
})
