import { describe, it, expect } from 'vitest'
import { extractWikiLinks, findBacklinks } from '../wikiLink'

const docs = (entries: [string, string, string][]) =>
  entries.map(([id, title, contentMarkdown]) => ({ id, title, contentMarkdown }))

describe('extractWikiLinks 提取', () => {
  it('[[页面]] 与别名 [[页面|显示]]', () => {
    const links = extractWikiLinks('见 [[B]] 和 [[B|乙页]]')
    expect(links).toEqual([
      { page: 'B', display: 'B' },
      { page: 'B', display: '乙页' },
    ])
  })
})

describe('findBacklinks 反链', () => {
  it('[[B]] 命中 → 来源文档计入', () => {
    const result = findBacklinks(docs([['a', 'A', '参见 [[B]]']]), 'B')
    expect(result).toEqual([{ id: 'a', title: 'A' }])
  })

  it('别名 [[B|显示]] 计入 B（以链接目标为准）', () => {
    const result = findBacklinks(docs([['a', 'A', '参见 [[B|乙页]]']]), 'B')
    expect(result).toEqual([{ id: 'a', title: 'A' }])
  })

  it('[[X|B]] 不计入 B（B 只是显示文本，目标是 X）', () => {
    const result = findBacklinks(docs([['a', 'A', '参见 [[X|B]]']]), 'B')
    expect(result).toEqual([])
  })

  it('删除引用后反链消失', () => {
    const result = findBacklinks(docs([['a', 'A', '不再引用了']]), 'B')
    expect(result).toEqual([])
  })

  it('重名/多引用 → 返回多源', () => {
    const result = findBacklinks(
      docs([
        ['a', 'A', '[[B]]'],
        ['b', '同名', '看 [[B]] 两次 [[B]]'],
        ['c', 'C', '无关'],
      ]),
      'B',
    )
    expect(result).toEqual([
      { id: 'a', title: 'A' },
      { id: 'b', title: '同名' },
    ])
  })

  it('空页面名 → 空结果', () => {
    expect(findBacklinks(docs([['a', 'A', '[[B]]']]), '  ')).toEqual([])
  })
})
