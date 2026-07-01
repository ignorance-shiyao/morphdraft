import { describe, it, expect } from 'vitest'
import {
  indexDoc,
  buildIndex,
  updateDocInIndex,
  removeDocFromIndex,
  backlinksOf,
  duplicateTitles,
  titleCandidates,
  anchorsOf,
} from '../index'

describe('indexDoc 单篇索引', () => {
  it('抽取标题/锚点/wikilink(行号)/普通链接/资产', () => {
    const md = [
      '# 标题 A', // 0
      '', // 1
      '见 [[目标页]] 和 [[目标页|别名]]', // 2
      '[外链](https://example.com) [本地](./b.md) [锚](#标题-a)', // 3
      '![图](asset://asset-x.png)', // 4
      '## 小节', // 5
    ].join('\n')
    const d = indexDoc({ id: 'a', title: '标题 A', contentMarkdown: md })

    expect(d.headings.map((h) => h.text)).toEqual(['标题 A', '小节'])
    expect(d.anchors.length).toBe(2)
    expect(d.wikilinks).toEqual([
      { page: '目标页', display: '目标页', line: 2, snippet: '见 [[目标页]] 和 [[目标页|别名]]' },
      { page: '目标页', display: '别名', line: 2, snippet: '见 [[目标页]] 和 [[目标页|别名]]' },
    ])
    const hrefs = d.mdLinks.map((l) => l.href)
    expect(hrefs).toContain('https://example.com')
    expect(hrefs).toContain('./b.md')
    expect(hrefs).toContain('#标题-a')
    expect(d.mdLinks.find((l) => l.href === 'https://example.com')?.isExternal).toBe(true)
    expect(d.mdLinks.find((l) => l.href === '#标题-a')?.isAnchor).toBe(true)
    expect(d.assets).toEqual(['asset-x.png'])
  })

  it('代码围栏内的链接不抽取', () => {
    const md = ['```', '[[不该抽]] [x](y.md)', '```', '[[该抽]]'].join('\n')
    const d = indexDoc({ id: 'a', title: 'A', contentMarkdown: md })
    expect(d.wikilinks.map((w) => w.page)).toEqual(['该抽'])
    expect(d.mdLinks).toHaveLength(0)
  })

  it('重复标题锚点去重（slug-1）', () => {
    const md = ['# 重复', '## 重复'].join('\n')
    const d = indexDoc({ id: 'a', title: 'A', contentMarkdown: md })
    expect(new Set(d.anchors).size).toBe(2)
  })
})

describe('buildIndex + backlinksOf 反链', () => {
  const docs = [
    { id: 'a', title: 'A', contentMarkdown: '参见 [[B]]' },
    { id: 'b', title: 'B', contentMarkdown: '正文' },
    { id: 'c', title: 'C', contentMarkdown: '别名 [[B|乙]] 与 [[X|B]]' },
  ]

  it('[[B]] 与别名 [[B|乙]] 计入 B；[[X|B]] 不计入', () => {
    const idx = buildIndex(docs)
    const back = backlinksOf(idx, 'B')
    expect(back.map((b) => b.id).sort()).toEqual(['a', 'c'])
    expect(back.find((b) => b.id === 'a')?.line).toBe(0)
  })

  it('删引用后反链消失', () => {
    let idx = buildIndex(docs)
    idx = updateDocInIndex(idx, { id: 'a', title: 'A', contentMarkdown: '不再引用' })
    const back = backlinksOf(idx, 'B')
    expect(back.map((b) => b.id)).toEqual(['c'])
  })

  it('空标题 → 空反链', () => {
    expect(backlinksOf(buildIndex(docs), '  ')).toEqual([])
  })
})

describe('duplicateTitles 重名', () => {
  it('识别同名文档', () => {
    const idx = buildIndex([
      { id: 'a', title: '同名', contentMarkdown: '' },
      { id: 'b', title: '同名', contentMarkdown: '' },
      { id: 'c', title: '独一', contentMarkdown: '' },
    ])
    expect(duplicateTitles(idx)).toEqual(['同名'])
  })
})

describe('titleCandidates 补全候选', () => {
  const idx = buildIndex([
    { id: '1', title: '产品路线图', contentMarkdown: '' },
    { id: '2', title: '路线图归档', contentMarkdown: '' },
    { id: '3', title: '无关', contentMarkdown: '' },
  ])
  it('前缀命中优先于包含命中', () => {
    const r = titleCandidates(idx, '路线图').map((d) => d.id)
    expect(r).toEqual(['2', '1']) // '路线图归档' 前缀命中在前，'产品路线图' 包含命中在后
  })
  it('空查询返回全部', () => {
    expect(titleCandidates(idx, '').length).toBe(3)
  })
})

describe('增量更新与全量一致', () => {
  const docs = [
    { id: 'a', title: 'A', contentMarkdown: '[[B]]' },
    { id: 'b', title: 'B', contentMarkdown: '# B 标题' },
  ]
  it('updateDocInIndex 结果与 buildIndex 等价', () => {
    let idx = buildIndex([docs[0]])
    idx = updateDocInIndex(idx, docs[1])
    const full = buildIndex(docs)
    expect(idx.docs.map((d) => d.id).sort()).toEqual(full.docs.map((d) => d.id).sort())
    expect(anchorsOf(idx, 'b')).toEqual(anchorsOf(full, 'b'))
    expect(backlinksOf(idx, 'B')).toEqual(backlinksOf(full, 'B'))
  })
  it('removeDocFromIndex 移除文档与其在 byId/titleToIds 的痕迹', () => {
    const idx = removeDocFromIndex(buildIndex(docs), 'a')
    expect(idx.byId.has('a')).toBe(false)
    expect(idx.titleToIds.has('A')).toBe(false)
    expect(backlinksOf(idx, 'B')).toEqual([])
  })
})
