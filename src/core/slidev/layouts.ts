// Slidev 核心布局的「应用内移植」：每个 layout id → .slide-inner 的内部 HTML 结构。
// 只产出结构与 class 钩子，视觉（对齐/字号/留白/装饰）交给 styles/slidevThemes.css 按
// `.slidev-layout-<id>` + `.slidev-theme-<id>` 控制。正文渲染走仓内 renderMarkdown（保留 data-source-line）。
import type { SlidevSlide } from './types'
import { renderClickAware } from './clicks'

export type RenderMd = (src: string) => string

// 所有 slot 走点击感知渲染：无 <v-click>/<v-clicks> 标记时等价于直接 md(src)。
function mdClicks(src: string, md: RenderMd): string {
  return renderClickAware(src, md)
}

// 支持的布局；未知 layout 回落 default。
export const SUPPORTED_LAYOUTS = new Set([
  'default', 'center', 'cover', 'intro', 'section', 'statement',
  'two-cols', 'two-cols-header', 'image-right', 'image-left', 'fact', 'quote',
  'image', 'iframe', 'iframe-left', 'iframe-right', 'full', 'end',
])

function esc(url: string): string {
  return url.replace(/["\\]/g, '\\$&')
}

function imageUrl(slide: SlidevSlide): string | null {
  const v = slide.frontmatter.image
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function frontUrl(slide: SlidevSlide): string | null {
  const v = slide.frontmatter.url
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

// 整幅背景图：图铺满，正文（若有）作为叠加文字块。
function imageFull(slide: SlidevSlide, md: RenderMd): string {
  const url = imageUrl(slide)
  const style = url ? ` style="background-image:url(&quot;${esc(url)}&quot;)"` : ''
  const text = slide.slots.default.trim()
    ? `<div class="slidev-image-caption">${mdClicks(slide.slots.default, md)}</div>`
    : ''
  return `<div class="slidev-image-full${url ? '' : ' is-empty'}"${style}>${text}</div>`
}

// iframe 嵌入：full = 铺满；left/right = 文字 + iframe 分栏。url 来自 frontmatter.url。
function iframeLayout(slide: SlidevSlide, md: RenderMd, side: 'full' | 'left' | 'right'): string {
  const url = frontUrl(slide)
  const frame = url
    ? `<iframe class="slidev-iframe" src="${esc(url)}" loading="lazy" referrerpolicy="no-referrer"></iframe>`
    : `<div class="slidev-iframe is-empty"></div>`
  if (side === 'full') return `<div class="slidev-iframe-full">${frame}</div>`
  const text = `<div class="slidev-col-text">${mdClicks(slide.slots.default, md)}</div>`
  const inner = side === 'right' ? text + frame : frame + text
  return `<div class="slidev-iframe-split iframe-${side}">${inner}</div>`
}

// 两栏：default 槽 → 左，right 槽 → 右（缺右槽时右栏空）。
function twoCols(slide: SlidevSlide, md: RenderMd, header: boolean): string {
  const top = header && slide.slots.default
    ? `<div class="slidev-cols-header">${mdClicks(firstBlock(slide.slots.default), md)}</div>`
    : ''
  const leftSrc = header ? restBlocks(slide.slots.default) : slide.slots.default
  return `${top}<div class="slidev-cols">`
    + `<div class="slidev-col slidev-col-left">${mdClicks(leftSrc, md)}</div>`
    + `<div class="slidev-col slidev-col-right">${mdClicks(slide.slots.right ?? '', md)}</div>`
    + `</div>`
}

// 图文分栏：文字 + 一侧整幅图（frontmatter.image）。side = 'right' | 'left'。
function imageSplit(slide: SlidevSlide, md: RenderMd, side: 'right' | 'left'): string {
  const url = imageUrl(slide)
  const imageEl = url
    ? `<div class="slidev-col-image" style="background-image:url(&quot;${esc(url)}&quot;)"></div>`
    : `<div class="slidev-col-image is-empty"></div>`
  const textEl = `<div class="slidev-col-text">${mdClicks(slide.slots.default, md)}</div>`
  const inner = side === 'right' ? textEl + imageEl : imageEl + textEl
  return `<div class="slidev-image-split image-${side}">${inner}</div>`
}

function firstBlock(src: string): string {
  const blocks = src.split(/\n{2,}/)
  return blocks[0] ?? ''
}
function restBlocks(src: string): string {
  const blocks = src.split(/\n{2,}/)
  return blocks.slice(1).join('\n\n')
}

// 产出 .slide-inner 的内部 HTML（不含 .slide-inner 本身）。
export function buildSlideInner(slide: SlidevSlide, md: RenderMd): string {
  const layout = SUPPORTED_LAYOUTS.has(slide.layout) ? slide.layout : 'default'
  switch (layout) {
    case 'two-cols':
      return twoCols(slide, md, false)
    case 'two-cols-header':
      return twoCols(slide, md, true)
    case 'image-right':
      return imageSplit(slide, md, 'right')
    case 'image-left':
      return imageSplit(slide, md, 'left')
    case 'image':
      return imageFull(slide, md)
    case 'iframe':
      return iframeLayout(slide, md, 'full')
    case 'iframe-left':
      return iframeLayout(slide, md, 'left')
    case 'iframe-right':
      return iframeLayout(slide, md, 'right')
    default:
      // default/center/cover/intro/section/statement/fact/quote：单块结构，差异交给 CSS
      return `<div class="slidev-block">${mdClicks(slide.slots.default, md)}</div>`
  }
}

// 该页应落在 section 上的 layout class（已回落 default）。
export function resolvedLayout(slide: SlidevSlide): string {
  return SUPPORTED_LAYOUTS.has(slide.layout) ? slide.layout : 'default'
}
