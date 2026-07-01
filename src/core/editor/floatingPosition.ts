export interface RectLike {
  left: number
  right: number
  top: number
  bottom: number
}

export interface Size {
  width: number
  height: number
}

export interface FloatingPosition {
  left: number
  top: number
  placement: 'top' | 'bottom'
}

export function clampFloatingPoint(
  point: { x: number; y: number },
  panel: Size,
  viewport: Size,
  margin = 8,
): { left: number; top: number } {
  return {
    left: Math.round(Math.min(Math.max(margin, point.x), Math.max(margin, viewport.width - margin - panel.width))),
    top: Math.round(Math.min(Math.max(margin, point.y), Math.max(margin, viewport.height - margin - panel.height))),
  }
}

export function placeFloatingPanel(
  anchor: RectLike,
  panel: Size,
  viewport: Size,
  gap = 8,
  margin = 8,
): FloatingPosition {
  const center = (anchor.left + anchor.right) / 2
  const maxLeft = Math.max(margin, viewport.width - margin - panel.width)
  const left = Math.min(Math.max(margin, center - panel.width / 2), maxLeft)
  const fitsAbove = anchor.top - gap - panel.height >= margin
  const placement = fitsAbove ? 'top' : 'bottom'
  const preferredTop = fitsAbove
    ? anchor.top - gap - panel.height
    : anchor.bottom + gap
  const maxTop = Math.max(margin, viewport.height - margin - panel.height)
  const top = Math.min(Math.max(margin, preferredTop), maxTop)

  return { left: Math.round(left), top: Math.round(top), placement }
}
