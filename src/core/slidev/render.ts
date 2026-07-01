// Slidev 引擎渲染核心：deck → reveal 可挂载的 section 列表（与经典引擎相同的 DOM 契约：
// section.slide-surface > .slide-inner），便于复用 reveal 宿主与现有导出管线。
import { renderMarkdown } from '../markdown'
import { buildSlideInner, resolvedLayout } from './layouts'
import type { SlidevDeck, SlidevSlide } from './types'

export interface RenderedSlidevSlide {
  index: number
  layout: string
  title: string
  html: string // 完整 <section ...>…</section>
}

function slideTitle(slide: SlidevSlide, index: number): string {
  const t = slide.title?.trim()
  if (t) return t.slice(0, 32)
  return `第 ${index + 1} 页`
}

// 单页 → <section> HTML（含 layout class + classes）。md 可注入以便测试，默认走 renderMarkdown。
export function renderSlidevSlide(
  slide: SlidevSlide,
  md: (s: string) => string = renderMarkdown,
): RenderedSlidevSlide {
  const hasTitle = /^#\s+/m.test(slide.slots.default)
  const layout = slide.index === 0
    && hasTitle
    && !Object.prototype.hasOwnProperty.call(slide.frontmatter, 'layout')
    ? 'cover'
    : resolvedLayout(slide)
  const classes = [
    'slide-surface',
    `slidev-layout-${layout}`,
    ...(hasTitle ? ['slidev-has-title'] : []),
    ...slide.classes,
  ]
  const inner = buildSlideInner(slide, md)
  const html = `<section class="${classes.join(' ')}" data-slidev-layout="${layout}">`
    + `<div class="slide-inner">${inner}</div>`
    + `</section>`
  return { index: slide.index, layout, title: slideTitle(slide, slide.index), html }
}

export function renderSlidevDeck(
  deck: SlidevDeck,
  md: (s: string) => string = renderMarkdown,
): RenderedSlidevSlide[] {
  return deck.slides.map((s) => renderSlidevSlide(s, md))
}
