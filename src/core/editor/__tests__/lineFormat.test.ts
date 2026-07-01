import { describe, expect, it } from 'vitest'
import { toggleInlineMarkers, toggleLinePrefix, splitLineBlockPrefix } from '../lineFormat'

describe('lineFormat', () => {
  it('toggleLinePrefix adds and removes ul', () => {
    expect(toggleLinePrefix('hello', 'ul')).toBe('- hello')
    expect(toggleLinePrefix('- hello', 'ul')).toBe('hello')
  })

  it('toggleLinePrefix preserves heading when adding list', () => {
    expect(toggleLinePrefix('## Title', 'ul')).toBe('## - Title')
  })

  it('toggleInlineMarkers wraps and unwraps', () => {
    expect(toggleInlineMarkers('word', '**', '**')).toEqual({ text: '**word**', cursorOffset: 2 })
    expect(toggleInlineMarkers('**word**', '**', '**')).toEqual({ text: 'word', cursorOffset: -2 })
  })

  it('toggleInlineMarkers on empty inserts markers only', () => {
    expect(toggleInlineMarkers('', '**', '**')).toEqual({ text: '****', cursorOffset: 2 })
  })

  it('splitLineBlockPrefix extracts heading and body', () => {
    expect(splitLineBlockPrefix('## Hello')).toEqual({ prefix: '## ', body: 'Hello' })
    expect(splitLineBlockPrefix('- item')).toEqual({ prefix: '- ', body: 'item' })
  })
})
