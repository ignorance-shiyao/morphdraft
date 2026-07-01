import { describe, expect, it } from 'vitest'
import { buildIndex } from '../../workspace'
import { linkCompletionAt } from '../linkComplete'

const index = buildIndex([
  { id: 'a', title: '产品路线图', contentMarkdown: '# 总览\n## 里程碑\nasset://asset-a.png' },
  { id: 'b', title: '路线图归档', contentMarkdown: '# 归档' },
])

describe('链接补全上下文', () => {
  it('[[ 后补全文档标题，前缀优先', () => {
    const result = linkCompletionAt('参见 [[路线', '参见 [[路线'.length, index, 'a')
    expect(result?.from).toBe(5)
    expect(result?.options.map((item) => item.label)).toEqual(['路线图归档', '产品路线图'])
  })

  it('[[文档# 后补全目标文档锚点', () => {
    const text = '[[产品路线图#里'
    const result = linkCompletionAt(text, text.length, index, 'b')
    expect(result?.options.map((item) => item.label)).toEqual(['里程碑'])
    expect(result?.options[0].apply).toBe('里程碑]]')
  })

  it('](# 后补全当前文档锚点', () => {
    const text = '[跳转](#里'
    const result = linkCompletionAt(text, text.length, index, 'a')
    expect(result?.options.map((item) => item.label)).toEqual(['里程碑'])
  })

  it(']( 后提供本地文档与附件候选', () => {
    const text = '[资源]('
    const result = linkCompletionAt(text, text.length, index, 'a')
    expect(result?.options.map((item) => item.apply)).toContain('路线图归档.md)')
    expect(result?.options.map((item) => item.apply)).toContain('asset://asset-a.png)')
  })
})
