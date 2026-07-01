import { describe, expect, it } from 'vitest'
import { clampMermaidScale, nextMermaidTransform } from '../mermaidTools'

describe('Mermaid 检查工具状态', () => {
  it('缩放限制在 50% 到 300%', () => {
    expect(clampMermaidScale(0.1)).toBe(0.5)
    expect(clampMermaidScale(4)).toBe(3)
  })

  it('缩放保留平移，复位清零', () => {
    const zoomed = nextMermaidTransform({ scale: 1, x: 20, y: -10 }, { type: 'zoom', delta: 0.25 })
    expect(zoomed).toEqual({ scale: 1.25, x: 20, y: -10 })
    expect(nextMermaidTransform(zoomed, { type: 'reset' })).toEqual({ scale: 1, x: 0, y: 0 })
  })

  it('平移按增量累加', () => {
    expect(nextMermaidTransform(
      { scale: 1.5, x: 10, y: 5 },
      { type: 'pan', dx: -4, dy: 8 },
    )).toEqual({ scale: 1.5, x: 6, y: 13 })
  })
})
