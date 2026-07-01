import { describe, it, expect } from 'vitest'
import { groupSearchHits, searchState, type SearchHit } from '../globalSearch'

function hit(docId: string, line: number, title = docId): SearchHit {
  return { docId, title, line, snippet: `行 ${line}` }
}

describe('groupSearchHits 分组', () => {
  it('按文档分组并保持首次出现顺序', () => {
    const groups = groupSearchHits([hit('b', 1), hit('a', 2), hit('b', 3)])
    expect(groups.map((g) => g.docId)).toEqual(['b', 'a'])
    expect(groups[0].hits).toHaveLength(2)
  })

  it('每文档命中数受上限约束（默认 5）', () => {
    const many = Array.from({ length: 8 }, (_, i) => hit('a', i))
    expect(groupSearchHits(many)[0].hits).toHaveLength(5)
  })

  it('保留每条命中的 docId+line（供点击 emit 定位）', () => {
    const groups = groupSearchHits([hit('a', 7)])
    expect(groups[0].hits[0]).toMatchObject({ docId: 'a', line: 7 })
  })

  it('空命中 → 空分组', () => {
    expect(groupSearchHits([])).toEqual([])
  })
})

describe('searchState 四态', () => {
  it('读取失败 → error（优先级最高）', () => {
    expect(searchState('x', [hit('a', 1)], true)).toBe('error')
  })

  it('空查询 → empty', () => {
    expect(searchState('   ', null, false)).toBe('empty')
  })

  it('有查询无结果 → no-results', () => {
    expect(searchState('zzz', [], false)).toBe('no-results')
  })

  it('有结果 → results', () => {
    expect(searchState('a', [hit('a', 1)], false)).toBe('results')
  })
})
