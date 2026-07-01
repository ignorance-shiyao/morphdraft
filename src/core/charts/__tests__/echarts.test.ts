import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountECharts, normalizeOptionForRenderer } from '../echarts'

describe('normalizeOptionForRenderer', () => {
  it('SVG renderer 下关闭 lines trail effect，避免 ECharts 不支持的告警', () => {
    const option = {
      series: [
        { type: 'lines', effect: { show: true, period: 4 } },
        { type: 'bar', effect: { show: true } },
      ],
    }
    const out = normalizeOptionForRenderer(option, 'svg')
    expect((out.series as Array<Record<string, unknown>>)[0].effect).toEqual({ show: false, period: 4 })
    expect((out.series as Array<Record<string, unknown>>)[1].effect).toEqual({ show: true })
  })

  it('canvas renderer 不改写 option', () => {
    const option = { series: [{ type: 'lines', effect: { show: true } }] }
    expect(normalizeOptionForRenderer(option, 'canvas')).toBe(option)
    expect((option.series[0].effect as { show: boolean }).show).toBe(true)
  })
})

vi.mock('echarts', () => {
  const existing = { dispose: vi.fn() }
  const instance = { setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn() }
  return {
    getInstanceByDom: vi.fn(() => existing),
    init: vi.fn(() => instance),
    registerTheme: vi.fn(),
    __mock: { existing, instance },
  }
})

describe('mountECharts', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('初始化前销毁同 DOM 上的旧实例，避免 repeated init warning', async () => {
    class MockResizeObserver {
      observe = vi.fn()
      disconnect = vi.fn()
    }
    vi.stubGlobal('ResizeObserver', MockResizeObserver)
    const echarts = await import('echarts') as typeof import('echarts') & {
      __mock: { existing: { dispose: ReturnType<typeof vi.fn> } }
    }
    const el = { clientWidth: 320, clientHeight: 240, isConnected: true } as HTMLElement
    await mountECharts(el, '{ "series": [] }')
    expect(echarts.getInstanceByDom).toHaveBeenCalledWith(el)
    expect(echarts.__mock.existing.dispose).toHaveBeenCalledTimes(1)
    expect(echarts.init).toHaveBeenCalledWith(el, undefined, { renderer: 'canvas' })
  })

  it('销毁后忽略迟到的 ResizeObserver 回调，避免 disposed instance warning', async () => {
    let resizeCallback: (() => void) | null = null
    class MockResizeObserver {
      constructor(cb: () => void) { resizeCallback = cb }
      observe = vi.fn()
      disconnect = vi.fn()
    }
    vi.stubGlobal('ResizeObserver', MockResizeObserver)
    const echarts = await import('echarts') as typeof import('echarts') & {
      __mock: { instance: { resize: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> } }
    }
    const el = { clientWidth: 320, clientHeight: 240, isConnected: true } as HTMLElement
    const mounted = await mountECharts(el, '{ "series": [] }')
    mounted.dispose()
    resizeCallback?.()
    expect(echarts.__mock.instance.dispose).toHaveBeenCalledTimes(1)
    expect(echarts.__mock.instance.resize).not.toHaveBeenCalled()
  })

  it('重挂载时优先调用托管清理函数，不重复 dispose 同一实例', async () => {
    class MockResizeObserver {
      observe = vi.fn()
      disconnect = vi.fn()
    }
    vi.stubGlobal('ResizeObserver', MockResizeObserver)
    const echarts = await import('echarts') as typeof import('echarts') & {
      __mock: { existing: { dispose: ReturnType<typeof vi.fn> } }
    }
    const managedDispose = vi.fn()
    const el = {
      clientWidth: 320,
      clientHeight: 240,
      isConnected: true,
      __chartDispose: managedDispose,
    } as unknown as HTMLElement & { __chartDispose?: () => void }
    await mountECharts(el, '{ "series": [] }')
    expect(managedDispose).toHaveBeenCalledTimes(1)
    expect(echarts.__mock.existing.dispose).not.toHaveBeenCalled()
    expect(el.__chartDispose).toBeUndefined()
  })
})
