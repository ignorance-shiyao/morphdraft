export interface WheelZoomOptions {
  getValue: () => number
  setValue: (value: number) => void
  min?: number
  max?: number
  speed?: number
  requireModifier?: boolean
}

export function createWheelZoom(options: WheelZoomOptions) {
  const min = options.min ?? 0.25
  const max = options.max ?? 3
  const speed = options.speed ?? 0.0018
  const requireModifier = options.requireModifier ?? true
  let pendingDelta = 0
  let raf = 0

  function flush() {
    raf = 0
    const delta = pendingDelta
    pendingDelta = 0
    const next = options.getValue() * Math.exp(-delta * speed)
    options.setValue(Math.min(max, Math.max(min, next)))
  }

  return function onWheelZoom(e: WheelEvent) {
    if (requireModifier && !e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    const mode = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : e.deltaMode === WheelEvent.DOM_DELTA_PAGE ? 240 : 1
    pendingDelta += e.deltaY * mode
    if (!raf) raf = requestAnimationFrame(flush)
  }
}
