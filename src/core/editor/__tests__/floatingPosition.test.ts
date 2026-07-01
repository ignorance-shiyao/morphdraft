import { describe, expect, it } from 'vitest'
import { clampFloatingPoint, placeFloatingPanel } from '../floatingPosition'

const viewport = { width: 1000, height: 700 }
const panel = { width: 420, height: 44 }

describe('placeFloatingPanel', () => {
  it('优先放在编辑行上方', () => {
    expect(placeFloatingPanel(
      { left: 500, right: 510, top: 320, bottom: 340 },
      panel,
      viewport,
    )).toEqual({ left: 295, top: 268, placement: 'top' })
  })

  it('上方空间不足时放到编辑行下方', () => {
    expect(placeFloatingPanel(
      { left: 30, right: 40, top: 20, bottom: 40 },
      panel,
      viewport,
    )).toEqual({ left: 8, top: 48, placement: 'bottom' })
  })

  it('在右侧和底部边缘内钳制位置', () => {
    expect(placeFloatingPanel(
      { left: 980, right: 990, top: 680, bottom: 698 },
      panel,
      viewport,
    )).toEqual({ left: 572, top: 628, placement: 'top' })
  })

  it('面板大于视口时仍保持安全边距', () => {
    expect(placeFloatingPanel(
      { left: 30, right: 40, top: 20, bottom: 40 },
      { width: 1200, height: 760 },
      viewport,
    )).toEqual({ left: 8, top: 8, placement: 'bottom' })
  })
})

describe('clampFloatingPoint', () => {
  it('右键菜单靠近右下角时完整钳制在视口内', () => {
    expect(clampFloatingPoint(
      { x: 900, y: 600 },
      { width: 220, height: 448 },
      { width: 1000, height: 700 },
    )).toEqual({ left: 772, top: 244 })
  })
})
