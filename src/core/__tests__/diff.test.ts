import { describe, it, expect } from 'vitest'
import { diffLines } from '../diff'

describe('diffLines（版本对比 LCS）', () => {
  it('完全相同 → 全 same', () => {
    const r = diffLines('a\nb\nc', 'a\nb\nc')
    expect(r.every((l) => l.type === 'same')).toBe(true)
    expect(r.map((l) => l.text)).toEqual(['a', 'b', 'c'])
  })

  it('一行被替换 → same/del/add', () => {
    const r = diffLines('a\nb', 'a\nc')
    expect(r).toEqual([
      { type: 'same', text: 'a' },
      { type: 'del', text: 'b' },
      { type: 'add', text: 'c' },
    ])
  })

  it('纯新增行', () => {
    const r = diffLines('a', 'a\nb')
    expect(r.filter((l) => l.type === 'add').map((l) => l.text)).toEqual(['b'])
    expect(r.filter((l) => l.type === 'del')).toHaveLength(0)
  })

  it('纯删除行', () => {
    const r = diffLines('a\nb', 'a')
    expect(r.filter((l) => l.type === 'del').map((l) => l.text)).toEqual(['b'])
    expect(r.filter((l) => l.type === 'add')).toHaveLength(0)
  })

  it('空 → 有内容：全 add', () => {
    const r = diffLines('', 'x\ny')
    // '' split → [''], 所以会有一个 same '' + add
    expect(r.some((l) => l.type === 'add' && l.text === 'x')).toBe(true)
    expect(r.some((l) => l.type === 'add' && l.text === 'y')).toBe(true)
  })
})
