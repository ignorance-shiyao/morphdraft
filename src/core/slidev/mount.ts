// Slidev 引擎的挂载：复用 reveal.js 作为渲染/导航宿主（与经典引擎相同），但 section 由
// Slidev 解析 + 布局 + 主题生成。返回与经典 mountSlides 完全相同的 SlidesHandle，
// 使 SlidePreview 只需按引擎切换调用，无需改动导航/放映/分页外壳逻辑。
import Reveal from 'reveal.js'
import 'reveal.js/reveal.css'
import { mountCharts } from '../charts/mount'
import { mountMermaidToolsInRoot } from '../charts/mermaidTools'
import { setMermaidTheme } from '../charts/mermaid'
import { composeChartCards } from '../markdown/chartCards'
import type { ThemeTokens } from '../themes/presets'
import type { SlidesCallbacks, SlidesHandle, SlideDisplayPage } from '../slides/reveal'
import { paginateSlideSections } from '../slides/paginate'
import { lineToSlideIndex } from '../slides/sourcemap'
import { parseSlidevDeck } from './parse'
import { renderSlidevDeck } from './render'
import { findSlidevTheme, slidevThemeChartTokens, slidevThemeVars } from './themes'

export interface SlidevMountOpts extends SlidesCallbacks {
  themeId?: string // Slidev 主题 id（default/seriph/apple-basic）
}

export async function mountSlidevDeck(
  host: HTMLElement,
  markdown: string,
  opts: SlidevMountOpts = {},
): Promise<SlidesHandle> {
  const deck = parseSlidevDeck(markdown)
  const theme = findSlidevTheme(opts.themeId ?? deck.theme)
  const chartTokens: ThemeTokens = slidevThemeChartTokens(theme)
  await setMermaidTheme(chartTokens)
  const rendered = renderSlidevDeck(deck)

  const reveal = document.createElement('div')
  reveal.className = 'reveal slidev-engine'
  reveal.classList.add(`slidev-theme-${theme.id}`)
  if (theme.dark) reveal.classList.add('slidev-dark')
  for (const [k, v] of Object.entries(slidevThemeVars(theme))) reveal.style.setProperty(k, v)
  if (deck.title) reveal.style.setProperty('--sd-deck-title', `"${deck.title.replace(/"/g, '\\"')}"`)

  const slides = document.createElement('div')
  slides.className = 'slides'
  reveal.appendChild(slides)

  const W = opts.width ?? 1280
  const H = opts.height ?? 720

  // 与经典引擎共用离屏真实高度分页，保证长文不会被强塞进单页。
  const measure = document.createElement('div')
  measure.className = reveal.className
  for (const [k, v] of Object.entries(slidevThemeVars(theme))) measure.style.setProperty(k, v)
  measure.style.cssText += `position:fixed;left:-99999px;top:0;width:${W}px;`

  rendered.forEach((r, i) => {
    const wrap = document.createElement('div')
    wrap.innerHTML = r.html
    const section = wrap.firstElementChild as HTMLElement | null
    if (!section) return
    const slide = deck.slides[i]
    section.dataset.startLine = String(slide?.start ?? 0)
    section.style.width = `${W}px`
    section.style.height = `${H}px`
    measure.appendChild(section)
    const inner = section.querySelector<HTMLElement>('.slide-inner')
    if (inner) composeChartCards(inner)
  })

  document.body.appendChild(measure)
  // Slidev 预览会先在屏外容器量度分页，再把节点移动进 Reveal。
  // 这里使用 SVG renderer：隐藏/移动 DOM 不会触发 canvas 0 尺寸绘制，且和导出路径一致。
  const cleanupCharts = await mountCharts(measure, { tokens: chartTokens, renderer: 'svg' })
  paginateSlideSections(measure)

  const finalSections = Array.from(measure.children).filter(
    (element) => element instanceof HTMLElement && element.classList.contains('slide-surface'),
  ) as HTMLElement[]
  const starts = finalSections.map((section) => Number(section.dataset.startLine ?? 0))
  for (const section of finalSections) {
    section.style.removeProperty('width')
    section.style.removeProperty('height')
    slides.appendChild(section)
  }
  measure.remove()

  host.innerHTML = ''
  host.appendChild(reveal)

  const cleanupMermaidTools = mountMermaidToolsInRoot(reveal, (el) => {
    const section = el.closest<HTMLElement>('section[data-start-line]')
    const start = Number(section?.dataset.startLine)
    if (Number.isFinite(start)) opts.onGoto?.(start)
  })

  const onClick = (e: MouseEvent) => {
    const sec = (e.target as HTMLElement)?.closest?.('section[data-start-line]') as HTMLElement | null
    if (sec?.dataset.startLine) opts.onGoto?.(Number(sec.dataset.startLine))
  }
  reveal.addEventListener('click', onClick)

  const displayPages: SlideDisplayPage[] = finalSections.map((section, index) => ({
    index,
    startLine: starts[index] ?? 0,
    title: section.querySelector('h1, h2')?.textContent?.trim().slice(0, 32) || `第 ${index + 1} 页`,
    html: section.outerHTML,
  }))
  opts.onPagesChange?.(displayPages)

  const deckReveal = new Reveal(reveal, {
    embedded: true, hash: false, controls: true, progress: true, slideNumber: 'c/t',
    width: W, height: H, margin: 0, transition: 'none', backgroundTransition: 'none',
    scrollActivationWidth: 0,
  })
  await deckReveal.initialize()
  deckReveal.layout()

  let navLock = false
  deckReveal.on('slidechanged', () => {
    if (navLock) return
    const st = starts[deckReveal.getIndices().h]
    if (st != null) opts.onSlideLine?.(st)
    opts.onSlideChange?.(deckReveal.getIndices().h, starts.length)
  })
  opts.onSlideChange?.(deckReveal.getIndices().h, starts.length)

  return {
    destroy: () => {
      reveal.removeEventListener('click', onClick)
      cleanupMermaidTools()
      cleanupCharts()
      try { deckReveal.destroy() } catch { /* ignore */ }
      host.innerHTML = ''
    },
    gotoLine: (line: number) => {
      const idx = lineToSlideIndex(starts, line)
      if (idx < 0 || idx === deckReveal.getIndices().h) return
      navLock = true
      deckReveal.slide(idx)
      window.setTimeout(() => { navLock = false }, 400)
    },
    gotoIndex: (i: number) => {
      if (i === deckReveal.getIndices().h) return
      navLock = true
      deckReveal.slide(i)
      window.setTimeout(() => { navLock = false }, 400)
    },
    step: (dir: 1 | -1) => {
      const before = deckReveal.getIndices().h
      if (dir > 0) deckReveal.next()
      else deckReveal.prev()
      const after = deckReveal.getIndices().h
      return { changedSlide: after !== before, index: after }
    },
    replayMotion: () => { /* Slidev 引擎本期不做进场动效重播 */ },
    total: () => starts.length,
    currentIndex: () => deckReveal.getIndices().h,
    pages: () => displayPages,
  }
}
