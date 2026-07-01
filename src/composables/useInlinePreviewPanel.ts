// O7：行内编辑器「上源码、下预览」面板（文档预览 / 幻灯片预览共用）

import { ref, type Ref } from 'vue'
import katex from 'katex'
import { highlightCodeHtml } from '../core/markdown/highlightCode'
import { mountCharts } from '../core/charts/mount'
import type { ThemeTokens } from '../core/themes/presets'

export type InlinePreviewPresentation = 'code' | 'chart' | 'math'

export function useInlinePreviewPanel(tokens: () => ThemeTokens) {
  const inlinePreviewEl = ref<HTMLElement | null>(null)
  let inlinePreviewKind: 'highlight' | 'chart' | 'math' | null = null
  let inlinePreviewChartCleanup: (() => void) | null = null
  let inlinePreviewChartType: 'mermaid' | 'echarts' | null = null
  let inlinePreviewChartTimer: number | null = null

  function inlinePreviewSource(text: string, presentation: InlinePreviewPresentation): string {
    if (presentation !== 'math') return text
    return text.replace(/^\s*\$\$\s*/, '').replace(/\s*\$\$\s*$/, '').trim() || text.trim()
  }

  function disposeInlinePreviewChart() {
    if (inlinePreviewChartCleanup) {
      try { inlinePreviewChartCleanup() } catch { /* ignore */ }
      inlinePreviewChartCleanup = null
    }
    if (inlinePreviewChartTimer !== null) {
      window.clearTimeout(inlinePreviewChartTimer)
      inlinePreviewChartTimer = null
    }
  }

  function scheduleInlinePreviewChart() {
    if (inlinePreviewChartTimer !== null) window.clearTimeout(inlinePreviewChartTimer)
    inlinePreviewChartTimer = window.setTimeout(() => {
      inlinePreviewChartTimer = null
      void mountInlinePreviewChart()
    }, 220)
  }

  async function mountInlinePreviewChart() {
    const host = inlinePreviewEl.value
    if (!host || inlinePreviewKind !== 'chart' || !inlinePreviewChartType) return
    if (inlinePreviewChartCleanup) {
      try { inlinePreviewChartCleanup() } catch { /* ignore */ }
      inlinePreviewChartCleanup = null
    }
    host.innerHTML = ''
    const block = document.createElement('div')
    block.className = 'chart-block ipe-chart-block'
    block.dataset.chartType = inlinePreviewChartType
    block.dataset.chartCode = encodeURIComponent(host.dataset.previewSource ?? '')
    host.appendChild(block)
    try {
      inlinePreviewChartCleanup = await mountCharts(host, { tokens: tokens() })
    } catch (err) {
      host.innerHTML = `<div class="ipe-chart-error">${(err as Error).message}</div>`
    }
  }

  function renderInlinePreview(
    sourceText: string,
    presentation: InlinePreviewPresentation,
    lang: string,
  ) {
    const host = inlinePreviewEl.value
    if (!host) return
    host.dataset.previewSource = sourceText
    if (presentation === 'code') {
      inlinePreviewKind = 'highlight'
      host.innerHTML = `<pre class="hljs"><code>${highlightCodeHtml(sourceText, lang) || '​'}</code></pre>`
      return
    }
    if (presentation === 'math') {
      inlinePreviewKind = 'math'
      const src = inlinePreviewSource(sourceText, 'math')
      try {
        host.innerHTML = `<div class="ipe-math">${katex.renderToString(src, { throwOnError: false, displayMode: true })}</div>`
      } catch (err) {
        host.innerHTML = `<div class="ipe-math-error">${(err as Error).message}</div>`
      }
      return
    }
    if (presentation === 'chart') {
      inlinePreviewKind = 'chart'
      inlinePreviewChartType = lang === 'mermaid' ? 'mermaid' : 'echarts'
      scheduleInlinePreviewChart()
    }
  }

  function dispose() {
    disposeInlinePreviewChart()
  }

  return {
    inlinePreviewEl: inlinePreviewEl as Ref<HTMLElement | null>,
    renderInlinePreview,
    disposeInlinePreviewChart,
    dispose,
  }
}
