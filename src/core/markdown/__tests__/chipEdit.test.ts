import { describe, it, expect } from 'vitest'
import { parseChip, serializeChip, type ChipFields } from '../chipEdit'

describe('parseChip', () => {
  it('中性药丸', () => {
    expect(parseChip('((进行中))')).toEqual({ kind: 'pill', text: '进行中' })
  })
  it('彩色药丸', () => {
    expect(parseChip('((green:完成))')).toEqual({ kind: 'pill', color: 'green', text: '完成' })
  })
  it('未知颜色 → 中性药丸（含冒号文本保留）', () => {
    expect(parseChip('((备注:细节))')).toEqual({ kind: 'pill', text: '备注:细节' })
  })
  it('进度条 / 带标签 / 越界裁剪', () => {
    expect(parseChip('((bar:75))')).toEqual({ kind: 'bar', value: 75 })
    expect(parseChip('((bar:92:品牌焕新))')).toEqual({ kind: 'bar', value: 92, label: '品牌焕新' })
    expect(parseChip('((bar:140))')).toEqual({ kind: 'bar', value: 100 })
  })
  it('迷你折线', () => {
    expect(parseChip('((spark:3,5,2,8))')).toEqual({ kind: 'spark', values: [3, 5, 2, 8] })
  })
  it('图标', () => {
    expect(parseChip(':rocket:')).toEqual({ kind: 'icon', name: 'rocket' })
  })
  it('非 chip → null', () => {
    expect(parseChip('普通文本')).toBeNull()
    expect(parseChip('(单括号)')).toBeNull()
    expect(parseChip('((spark:5))')).toEqual({ kind: 'pill', text: 'spark:5' }) // 折线<2 个数回退药丸
  })
})

describe('serializeChip 与往返', () => {
  const cases: ChipFields[] = [
    { kind: 'pill', text: '完成' },
    { kind: 'pill', color: 'red', text: '风险' },
    { kind: 'bar', value: 64 },
    { kind: 'bar', value: 92, label: '品牌焕新' },
    { kind: 'spark', values: [1, 2, 3] },
    { kind: 'icon', name: 'check' },
  ]
  it.each(cases)('round-trip %o', (fields) => {
    expect(parseChip(serializeChip(fields))).toEqual(fields)
  })
  it('bar 值规整（四舍五入 + 边界）', () => {
    expect(serializeChip({ kind: 'bar', value: 75.6 })).toBe('((bar:76))')
    expect(serializeChip({ kind: 'bar', value: -5 })).toBe('((bar:0))')
    expect(serializeChip({ kind: 'bar', value: 999 })).toBe('((bar:100))')
  })
})
