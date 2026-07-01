import { describe, it, expect } from 'vitest'
import { derivePalette, withAlpha } from '../palette'

const HEX6 = /^#[0-9a-f]{6}$/i
const HEX8 = /^#[0-9a-f]{8}$/i

describe('derivePalette（图表 8 色色板生成）', () => {
  it('返回恰好 8 个合法 6 位 hex', () => {
    const p = derivePalette('#0ea5e9', false)
    expect(p).toHaveLength(8)
    p.forEach((c) => expect(c).toMatch(HEX6))
  })

  it('暗色与浅色色板不同（抬亮/降饱和分支）', () => {
    const light = derivePalette('#6c5ce7', false)
    const dark = derivePalette('#6c5ce7', true)
    expect(light).not.toEqual(dark)
  })

  it('确定性：同输入同输出', () => {
    expect(derivePalette('#0ea5e9', false)).toEqual(derivePalette('#0ea5e9', false))
  })

  it('不同主色产生不同色板', () => {
    expect(derivePalette('#0ea5e9', false)).not.toEqual(derivePalette('#e5484d', false))
  })
})

describe('withAlpha（hex + alpha 通道）', () => {
  it('alpha=1 → ff', () => {
    expect(withAlpha('#0ea5e9', 1)).toBe('#0ea5e9ff')
  })
  it('alpha=0 → 00', () => {
    expect(withAlpha('#0ea5e9', 0)).toBe('#0ea5e900')
  })
  it('alpha=0.5 → 80（128 → 0x80）', () => {
    expect(withAlpha('#0ea5e9', 0.5)).toBe('#0ea5e980')
  })
  it('输出为合法 8 位 hex', () => {
    expect(withAlpha('#abcdef', 0.3)).toMatch(HEX8)
  })
  it('越界 alpha 被钳到 [0,1]', () => {
    expect(withAlpha('#000000', 2)).toBe('#000000ff')
    expect(withAlpha('#000000', -1)).toBe('#00000000')
  })
})
