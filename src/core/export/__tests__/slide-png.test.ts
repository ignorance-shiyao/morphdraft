import { describe, expect, it } from 'vitest'
import { normalizeSlideIndices } from '../slide-capture'
import { slidePngFilename } from '../slide-png'

describe('单页 / 选页 PNG 导出', () => {
  it('页索引去重、排序并过滤越界值', () => {
    expect(normalizeSlideIndices([3, 1, 3, -1, 9, 2.5], 5)).toEqual([1, 3])
  })

  it('中文标题与页码生成安全文件名', () => {
    expect(slidePngFilename('季度/汇报', 2, 12)).toBe('季度 汇报-第03页.png')
  })

  it('页数超过两位时按总页数补零', () => {
    expect(slidePngFilename('发布会', 6, 120)).toBe('发布会-第007页.png')
  })
})
