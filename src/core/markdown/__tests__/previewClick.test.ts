import { describe, expect, it } from 'vitest'
import { applyLinkEdit, shouldSkipBlockEditor, type LinkEditorState } from '../previewClick'
import { parseMarkdownLink } from '../linkEdit'

describe('applyLinkEdit', () => {
  it('rewrites only target link', () => {
    const md = '见 [官网](https://example.com) 说明'
    const token = '[官网](https://example.com)'
    const from = md.indexOf(token)
    const state: LinkEditorState = {
      line: 0,
      from,
      to: from + token.length,
      anchor: { left: 0, top: 0, bottom: 0 },
      fields: parseMarkdownLink(token)!,
    }
    const next = applyLinkEdit(md, state, { text: '站点', url: 'https://new.test', title: '' })
    expect(next).toBe('见 [站点](https://new.test) 说明')
  })
})

describe('shouldSkipBlockEditor', () => {
  it('returns true when click misses text in a paragraph', () => {
    const p = {
      closest: (sel: string) => (sel.includes('p[') || sel.includes('li[') ? p : null),
      querySelector: () => null,
    } as unknown as HTMLElement
    const event = { clientX: 1, clientY: 1, target: p } as unknown as MouseEvent
    expect(shouldSkipBlockEditor(event, p)).toBe(true)
  })

  it('returns true for nested list item without inline hit', () => {
    const li = {
      closest: (sel: string) => (sel.includes('li[') ? li : null),
      querySelector: (sel: string) => (sel.includes('ul') ? {} : null),
    } as unknown as HTMLElement
    const event = { clientX: 1, clientY: 1, target: li } as unknown as MouseEvent
    expect(shouldSkipBlockEditor(event, li)).toBe(true)
  })
})
