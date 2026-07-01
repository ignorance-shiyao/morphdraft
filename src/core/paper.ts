// 纸张尺寸预设（文档模式）
export type PaperSize = 'a4' | 'a5' | 'a6' | 'letter'

export const PAPER_SIZES: Record<PaperSize, { label: string; widthMm: number; heightMm: number; widthPx: number }> = {
  a4: { label: 'A4', widthMm: 210, heightMm: 297, widthPx: 820 },
  a5: { label: 'A5', widthMm: 148, heightMm: 210, widthPx: 578 },
  a6: { label: 'A6', widthMm: 105, heightMm: 148, widthPx: 410 },
  letter: { label: 'Letter', widthMm: 216, heightMm: 279, widthPx: 843 },
}

export const PAPER_LIST = Object.entries(PAPER_SIZES).map(([id, paper]) => ({
  id: id as PaperSize,
  ...paper,
}))

// 页边距预设（mm；小纸张按比例缩小，避免内容区过窄）
export type PaperMargin = 'narrow' | 'normal' | 'wide'
export const MARGIN_PRESETS: Record<PaperMargin, { label: string; y: number; x: number }> = {
  narrow: { label: '窄', y: 10, x: 12 },
  normal: { label: '标准', y: 18, x: 20 },
  wide: { label: '宽', y: 26, x: 30 },
}
export const MARGIN_LIST = Object.entries(MARGIN_PRESETS).map(([id, m]) => ({ id: id as PaperMargin, ...m }))

export function paperPadding(size: PaperSize, margin: PaperMargin): string {
  const m = MARGIN_PRESETS[margin]
  const scale = size === 'a6' ? 0.55 : size === 'a5' ? 0.78 : 1
  return `${Math.round(m.y * scale)}mm ${Math.round(m.x * scale)}mm`
}

// 行距预设
export type LineHeightKey = 'tight' | 'normal' | 'loose'
export const LINE_HEIGHTS: Record<LineHeightKey, { label: string; value: number }> = {
  tight: { label: '紧凑', value: 1.55 },
  normal: { label: '标准', value: 1.72 },
  loose: { label: '宽松', value: 1.95 },
}
export const LINE_HEIGHT_LIST = Object.entries(LINE_HEIGHTS).map(([id, l]) => ({ id: id as LineHeightKey, ...l }))

// 幻灯片比例预设（PPI 恒为 128，英寸 = px/128，导出可一致跟随）
export type SlideRatio = '16:9' | '16:10' | '4:3' | '3:4' | '1:1'
export const SLIDE_RATIOS: Record<SlideRatio, { label: string; w: number; h: number }> = {
  '16:9': { label: '16:9 宽屏', w: 1280, h: 720 },
  '16:10': { label: '16:10', w: 1280, h: 800 },
  '4:3': { label: '4:3', w: 1280, h: 960 },
  '3:4': { label: '3:4 竖版', w: 960, h: 1280 },
  '1:1': { label: '1:1 方形', w: 1080, h: 1080 },
}
export const SLIDE_RATIO_LIST = Object.entries(SLIDE_RATIOS).map(([id, r]) => ({ id: id as SlideRatio, ...r }))
