import { describe, expect, it } from 'vitest'
import { collapsedHeadingHiddenLines, headingHasChildren, headingSections, parseMarkdownHeadings } from '../headingSections'

const md = [
  '# A',
  'a',
  '## A1',
  'a1',
  '### A1a',
  'a1a',
  '## A2',
  'a2',
  '# B',
  'b',
].join('\n')

describe('headingSections', () => {
  it('按标题层级计算 section，父标题携带所有子孙内容', () => {
    expect(headingSections(md).map((s) => [s.heading.text, s.start, s.end])).toEqual([
      ['A', 0, 8],
      ['A1', 2, 6],
      ['A1a', 4, 6],
      ['A2', 6, 8],
      ['B', 8, 10],
    ])
  })

  it('折叠父标题隐藏所有子孙标题和内容，但不隐藏父标题本身', () => {
    expect([...collapsedHeadingHiddenLines(md, new Set([0]))]).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('折叠子标题只隐藏子 section 内容', () => {
    expect([...collapsedHeadingHiddenLines(md, new Set([2]))]).toEqual([3, 4, 5])
  })

  it('忽略围栏代码块里的 #', () => {
    const src = ['# A', '```md', '# not heading', '```', '## B'].join('\n')
    expect(parseMarkdownHeadings(src).map((h) => [h.line, h.text])).toEqual([[0, 'A'], [4, 'B']])
  })

  it('判断标题是否有可折叠内容', () => {
    expect(headingHasChildren(md, 0)).toBe(true)
    expect(headingHasChildren(md, 8)).toBe(true)
    expect(headingHasChildren('# Only', 0)).toBe(false)
  })
})
