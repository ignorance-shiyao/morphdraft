import { describe, expect, it } from 'vitest'
import { highlightMarkdownSource, mapInlineVisibleToSource } from '../previewInlineSource'

describe('highlightMarkdownSource', () => {
  it('highlights inline emphasis markers', () => {
    const html = highlightMarkdownSource('**bold** and `code`')
    expect(html).toContain('<span class="md-syntax-token">**</span>bold<span class="md-syntax-token">**</span>')
    expect(html).toContain('<span class="md-syntax-token">`</span>code<span class="md-syntax-token">`</span>')
  })

  it('highlights block prefixes per line', () => {
    const html = highlightMarkdownSource('> quote\n- item')
    expect(html).toContain('<span class="md-syntax-token">&gt; </span>quote')
    expect(html).toContain('<span class="md-syntax-token">- </span>item')
  })

  it('highlights heading prefix', () => {
    const html = highlightMarkdownSource('## Title')
    expect(html).toContain('<span class="md-syntax-token">## </span>Title')
  })

  it('preserves newlines', () => {
    expect(highlightMarkdownSource('a\nb')).toBe('a\nb')
  })

  it('maps inline visible offset through markup', () => {
    expect(mapInlineVisibleToSource(2, '**bold**')).toBe(4)
    expect(mapInlineVisibleToSource(1, '[链](https://x)')).toBe(2)
  })
})
