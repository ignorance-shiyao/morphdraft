import { describe, it, expect } from 'vitest'
import { moveSection, type OutlineItem } from '../sectionMove'

// 文档（0 基行号）：
// 0:# A  1:aaa  2:# B  3:bbb  4:# C  5:ccc
const SRC = '# A\naaa\n# B\nbbb\n# C\nccc'
const ITEMS: OutlineItem[] = [
  { level: 1, text: 'A', line: 0 },
  { level: 1, text: 'B', line: 2 },
  { level: 1, text: 'C', line: 4 },
]

describe('moveSection（大纲拖拽重排）', () => {
  it('把 C 移到最前（向前移）', () => {
    expect(moveSection(SRC, ITEMS, 2, 0)).toBe('# C\nccc\n# A\naaa\n# B\nbbb')
  })

  it('把 B 移到最后（向后移）', () => {
    expect(moveSection(SRC, ITEMS, 1, 2)).toBe('# A\naaa\n# C\nccc\n# B\nbbb')
  })

  it('section 整段移动：内容跟随标题，不丢行', () => {
    const out = moveSection(SRC, ITEMS, 2, 0)
    // 行数守恒
    expect(out.split('\n')).toHaveLength(SRC.split('\n').length)
    // 每个标题的正文仍紧跟其后
    expect(out).toContain('# C\nccc')
    expect(out).toContain('# A\naaa')
  })

  it('fromIndex === toIndex → 原样返回', () => {
    expect(moveSection(SRC, ITEMS, 1, 1)).toBe(SRC)
  })

  it('越界索引 → 原样返回', () => {
    expect(moveSection(SRC, ITEMS, 5, 0)).toBe(SRC)
    expect(moveSection(SRC, ITEMS, 0, -1)).toBe(SRC)
  })

  it('h2 子内容随父 section 一起移动', () => {
    // 0:# A 1:## A1 2:aaa 3:# B 4:bbb
    const src = '# A\n## A1\naaa\n# B\nbbb'
    const items: OutlineItem[] = [
      { level: 1, text: 'A', line: 0 },
      { level: 2, text: 'A1', line: 1 },
      { level: 1, text: 'B', line: 3 },
    ]
    // 把 A（index0，含子 A1）移到 B（index2）之后
    const out = moveSection(src, items, 0, 2)
    expect(out).toBe('# B\nbbb\n# A\n## A1\naaa')
  })
})
