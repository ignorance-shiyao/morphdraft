import { translate } from '../../i18n'

export interface MermaidTransform {
  scale: number
  x: number
  y: number
}

export type MermaidTransformAction =
  | { type: 'zoom'; delta: number }
  | { type: 'pan'; dx: number; dy: number }
  | { type: 'reset' }

export function clampMermaidScale(scale: number): number {
  return Math.min(3, Math.max(0.5, Math.round(scale * 100) / 100))
}

export function nextMermaidTransform(
  state: MermaidTransform,
  action: MermaidTransformAction,
): MermaidTransform {
  if (action.type === 'reset') return { scale: 1, x: 0, y: 0 }
  if (action.type === 'pan') {
    return { ...state, x: state.x + action.dx, y: state.y + action.dy }
  }
  return { ...state, scale: clampMermaidScale(state.scale + action.delta) }
}

export interface MermaidToolsOptions {
  code: string
  onGotoSource?: () => void
}

export function mountMermaidToolsInRoot(
  root: HTMLElement,
  onGotoSource?: (el: HTMLElement) => void,
): () => void {
  const cleanups = Array.from(root.querySelectorAll<HTMLElement>('.chart-block[data-chart-type="mermaid"]'))
    .map((chart) => {
      // 分页可能克隆已渲染 DOM；旧工具外观会保留但监听器已丢失，先还原再重新挂载。
      chart.querySelector('.mermaid-tools')?.remove()
      const viewport = chart.querySelector<HTMLElement>('.mermaid-viewport')
      const svg = viewport?.querySelector<SVGSVGElement>('svg')
      if (viewport && svg) {
        viewport.replaceWith(svg)
        chart.classList.remove('mermaid-inspectable', 'is-mermaid-transformed')
      }
      const code = decodeURIComponent(chart.dataset.chartCode ?? '')
      return mountMermaidTools(chart, { code, onGotoSource: () => onGotoSource?.(chart) })
    })
  const states = new WeakMap<HTMLElement, MermaidTransform>()
  let drag: { chart: HTMLElement; viewport: HTMLElement; x: number; y: number } | null = null

  function stateOf(chart: HTMLElement) {
    const state = states.get(chart) ?? { scale: 1, x: 0, y: 0 }
    states.set(chart, state)
    return state
  }

  function applyState(chart: HTMLElement, state: MermaidTransform) {
    states.set(chart, state)
    const svg = chart.querySelector<SVGSVGElement>('.mermaid-viewport > svg')
    const reset = chart.querySelector<HTMLButtonElement>('[data-action="reset"]')
    if (svg) svg.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`
    if (reset) reset.textContent = `${Math.round(state.scale * 100)}%`
    chart.classList.toggle('is-mermaid-transformed', state.scale !== 1 || state.x !== 0 || state.y !== 0)
  }

  function onClick(event: MouseEvent) {
    const target = event.target as HTMLElement
    const targetChart = target.closest<HTMLElement>('.mermaid-inspectable')
    let actionButton = target.closest<HTMLButtonElement>('.mermaid-tool-btn')
    if (!actionButton && targetChart) {
      actionButton = Array.from(targetChart.querySelectorAll<HTMLButtonElement>('.mermaid-tool-btn'))
        .find((candidate) => {
          const rect = candidate.getBoundingClientRect()
          return event.clientX >= rect.left && event.clientX <= rect.right
            && event.clientY >= rect.top && event.clientY <= rect.bottom
        }) ?? null
    }
    const chart = actionButton?.closest<HTMLElement>('.mermaid-inspectable')
    const action = actionButton?.dataset.action
    if (!actionButton || !chart || !action) return
    event.preventDefault()
    event.stopImmediatePropagation()
    let state = stateOf(chart)
    if (action === 'zoom-in') state = nextMermaidTransform(state, { type: 'zoom', delta: 0.25 })
    else if (action === 'zoom-out') state = nextMermaidTransform(state, { type: 'zoom', delta: -0.25 })
    else if (action === 'reset') state = nextMermaidTransform(state, { type: 'reset' })
    else if (action === 'source') onGotoSource?.(chart)
    else if (action === 'copy') {
      const code = decodeURIComponent(chart.dataset.chartCode ?? '')
      void navigator.clipboard.writeText(code).then(() => {
        actionButton.textContent = translate('mermaid.copied')
        window.setTimeout(() => { actionButton.textContent = translate('mermaid.copy') }, 1200)
      }).catch(() => {
        actionButton.textContent = translate('mermaid.copyFailed')
        window.setTimeout(() => { actionButton.textContent = translate('mermaid.copy') }, 1200)
      })
    }
    applyState(chart, state)
  }

  function onWheel(event: WheelEvent) {
    if (!event.ctrlKey && !event.metaKey) return
    const chart = (event.target as HTMLElement).closest<HTMLElement>('.mermaid-inspectable')
    if (!chart) return
    event.preventDefault()
    event.stopImmediatePropagation()
    applyState(chart, nextMermaidTransform(stateOf(chart), {
      type: 'zoom',
      delta: event.deltaY < 0 ? 0.1 : -0.1,
    }))
  }

  function onPointerDown(event: PointerEvent) {
    const viewport = (event.target as HTMLElement).closest<HTMLElement>('.mermaid-viewport')
    const chart = viewport?.closest<HTMLElement>('.mermaid-inspectable')
    if (!viewport || !chart || event.button !== 0 || stateOf(chart).scale === 1) return
    event.preventDefault()
    event.stopImmediatePropagation()
    drag = { chart, viewport, x: event.clientX, y: event.clientY }
    viewport.setPointerCapture(event.pointerId)
    viewport.classList.add('is-panning')
  }

  function onPointerMove(event: PointerEvent) {
    if (!drag) return
    event.preventDefault()
    event.stopImmediatePropagation()
    applyState(drag.chart, nextMermaidTransform(stateOf(drag.chart), {
      type: 'pan',
      dx: event.clientX - drag.x,
      dy: event.clientY - drag.y,
    }))
    drag.x = event.clientX
    drag.y = event.clientY
  }

  function onPointerEnd(event: PointerEvent) {
    if (!drag) return
    event.preventDefault()
    event.stopImmediatePropagation()
    drag.viewport.classList.remove('is-panning')
    drag = null
  }

  root.addEventListener('click', onClick, true)
  root.addEventListener('wheel', onWheel, { capture: true, passive: false })
  root.addEventListener('pointerdown', onPointerDown, true)
  root.addEventListener('pointermove', onPointerMove, true)
  root.addEventListener('pointerup', onPointerEnd, true)
  root.addEventListener('pointercancel', onPointerEnd, true)

  return () => {
    root.removeEventListener('click', onClick, true)
    root.removeEventListener('wheel', onWheel, true)
    root.removeEventListener('pointerdown', onPointerDown, true)
    root.removeEventListener('pointermove', onPointerMove, true)
    root.removeEventListener('pointerup', onPointerEnd, true)
    root.removeEventListener('pointercancel', onPointerEnd, true)
    cleanups.forEach((cleanup) => cleanup())
  }
}

function button(label: string, title: string, action: string): HTMLButtonElement {
  const el = document.createElement('button')
  el.type = 'button'
  el.className = 'mermaid-tool-btn'
  el.dataset.action = action
  el.title = title
  el.setAttribute('aria-label', title)
  el.textContent = label
  return el
}

export function mountMermaidTools(
  chart: HTMLElement,
  options: MermaidToolsOptions,
): () => void {
  const svg = chart.querySelector<SVGSVGElement>('svg')
  if (!svg || chart.querySelector('.mermaid-tools')) return () => {}
  const renderedSvg = svg

  const viewport = document.createElement('div')
  viewport.className = 'mermaid-viewport'
  renderedSvg.parentNode?.insertBefore(viewport, renderedSvg)
  viewport.appendChild(renderedSvg)

  const tools = document.createElement('div')
  tools.className = 'mermaid-tools'
  tools.setAttribute('aria-label', translate('mermaid.toolsLabel'))
  tools.append(
    button('−', translate('mermaid.zoomOut'), 'zoom-out'),
    button('100%', translate('mermaid.reset'), 'reset'),
    button('+', translate('mermaid.zoomIn'), 'zoom-in'),
    button(translate('mermaid.copy'), translate('mermaid.copyTip'), 'copy'),
    button(translate('mermaid.source'), translate('mermaid.sourceTip'), 'source'),
  )
  chart.appendChild(tools)
  chart.classList.add('mermaid-inspectable')

  let state: MermaidTransform = { scale: 1, x: 0, y: 0 }
  let dragging = false
  let lastX = 0
  let lastY = 0

  const resetButton = tools.querySelector<HTMLButtonElement>('[data-action="reset"]')!
  function apply() {
    renderedSvg.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`
    resetButton.textContent = `${Math.round(state.scale * 100)}%`
    chart.classList.toggle('is-mermaid-transformed', state.scale !== 1 || state.x !== 0 || state.y !== 0)
  }

  async function copySource() {
    try {
      await navigator.clipboard.writeText(options.code)
      const old = tools.querySelector<HTMLButtonElement>('[data-action="copy"]')!
      old.textContent = translate('mermaid.copied')
      window.setTimeout(() => { old.textContent = translate('mermaid.copy') }, 1200)
    } catch {
      const old = tools.querySelector<HTMLButtonElement>('[data-action="copy"]')!
      old.textContent = translate('mermaid.copyFailed')
      window.setTimeout(() => { old.textContent = translate('mermaid.copy') }, 1200)
    }
  }

  function onToolsClick(event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    const action = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]')?.dataset.action
    if (!action) return
    if (action === 'zoom-in') state = nextMermaidTransform(state, { type: 'zoom', delta: 0.25 })
    else if (action === 'zoom-out') state = nextMermaidTransform(state, { type: 'zoom', delta: -0.25 })
    else if (action === 'reset') state = nextMermaidTransform(state, { type: 'reset' })
    else if (action === 'copy') void copySource()
    else if (action === 'source') options.onGotoSource?.()
    apply()
  }

  function onWheel(event: WheelEvent) {
    if (!event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    event.stopPropagation()
    state = nextMermaidTransform(state, { type: 'zoom', delta: event.deltaY < 0 ? 0.1 : -0.1 })
    apply()
  }

  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0 || state.scale === 1) return
    event.preventDefault()
    event.stopPropagation()
    dragging = true
    lastX = event.clientX
    lastY = event.clientY
    viewport.setPointerCapture(event.pointerId)
    viewport.classList.add('is-panning')
  }

  function onPointerMove(event: PointerEvent) {
    if (!dragging) return
    event.preventDefault()
    event.stopPropagation()
    state = nextMermaidTransform(state, {
      type: 'pan',
      dx: event.clientX - lastX,
      dy: event.clientY - lastY,
    })
    lastX = event.clientX
    lastY = event.clientY
    apply()
  }

  function endPan(event: PointerEvent) {
    if (!dragging) return
    event.preventDefault()
    event.stopPropagation()
    dragging = false
    viewport.classList.remove('is-panning')
  }

  tools.addEventListener('click', onToolsClick)
  viewport.addEventListener('wheel', onWheel, { passive: false })
  viewport.addEventListener('pointerdown', onPointerDown)
  viewport.addEventListener('pointermove', onPointerMove)
  viewport.addEventListener('pointerup', endPan)
  viewport.addEventListener('pointercancel', endPan)
  apply()

  return () => {
    tools.removeEventListener('click', onToolsClick)
    viewport.removeEventListener('wheel', onWheel)
    viewport.removeEventListener('pointerdown', onPointerDown)
    viewport.removeEventListener('pointermove', onPointerMove)
    viewport.removeEventListener('pointerup', endPan)
    viewport.removeEventListener('pointercancel', endPan)
  }
}
