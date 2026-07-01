import { describe, expect, it } from 'vitest'
import { buildMarkdownLink, parseMarkdownLink } from '../linkEdit'

describe('parseMarkdownLink', () => {
  it('解析链接文字、URL 与可选标题', () => {
    expect(parseMarkdownLink('[示例](https://example.com "说明")')).toEqual({
      text: '示例',
      url: 'https://example.com',
      title: '说明',
    })
  })

  it('不是完整 Markdown 链接时返回 null', () => {
    expect(parseMarkdownLink('https://example.com')).toBeNull()
  })
})

describe('buildMarkdownLink', () => {
  it('重建链接并转义标题中的双引号', () => {
    expect(buildMarkdownLink({
      text: '新文字',
      url: 'https://example.com/a b',
      title: '一句 "说明"',
    })).toBe('[新文字](<https://example.com/a b> "一句 \\"说明\\"")')
  })

  it('标题为空时不输出多余空格', () => {
    expect(buildMarkdownLink({ text: '示例', url: '/docs', title: '' })).toBe('[示例](/docs)')
  })
})
