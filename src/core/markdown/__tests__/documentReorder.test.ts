import { describe, expect, it } from 'vitest'
import { moveDocumentUnitByLine } from '../documentReorder'

describe('moveDocumentUnitByLine', () => {
  it('拖动标题时携带所有子孙 section', () => {
    const src = ['# A', 'a', '## A1', 'a1', '# B', 'b'].join('\n')
    expect(moveDocumentUnitByLine(src, 0, 4, true)).toBe(['# B', 'b', '# A', 'a', '## A1', 'a1'].join('\n'))
  })

  it('拖动子标题只携带自己的子 section，不携带后续同级', () => {
    const src = ['# A', 'a', '## A1', 'a1', '## A2', 'a2', '# B', 'b'].join('\n')
    expect(moveDocumentUnitByLine(src, 2, 6, true)).toBe(['# A', 'a', '## A2', 'a2', '# B', 'b', '## A1', 'a1'].join('\n'))
  })

  it('目标为标题且放到后面时，插到目标 section 之后', () => {
    const src = ['# A', 'a', '# B', 'b', '## B1', 'b1', '# C', 'c'].join('\n')
    expect(moveDocumentUnitByLine(src, 0, 2, true)).toBe(['# B', 'b', '## B1', 'b1', '# A', 'a', '# C', 'c'].join('\n'))
  })

  it('目标落在被拖标题 section 内则原样返回', () => {
    const src = ['# A', 'a', '## A1', 'a1', '# B', 'b'].join('\n')
    expect(moveDocumentUnitByLine(src, 0, 2, true)).toBe(src)
    expect(moveDocumentUnitByLine(src, 0, 3, false)).toBe(src)
  })

  it('普通块沿用块级移动能力', () => {
    const src = ['# A', '', 'para A', '', 'para B', '', 'para C'].join('\n')
    expect(moveDocumentUnitByLine(src, 2, 6, true)).toBe(['# A', '', 'para B', '', 'para C', '', 'para A'].join('\n'))
  })
})
