import { domToPng } from 'modern-screenshot'
import { renderMarkdown, stripFrontmatter, resolveAssetUrls, parseFrontmatter } from '../markdown'
import { splitSlides } from '../slides/split'
import { parseSlideLayout } from '../slides/layout'
import {
  computePageGroups,
  isOverflowing,
  chapterH1,
  splitTallBlocks,
  paginateSlideSections,
} from '../slides/paginate'
import { structureSlide } from '../slides/structure'
import { mountCharts } from '../charts/mount'
import { setMermaidTheme } from '../charts/mermaid'
import { applyThemeTo } from '../themes/apply'
import type { ThemeTokens } from '../themes/presets'
import { parseSlidevDeck } from '../slidev/parse'
import { renderSlidevDeck } from '../slidev/render'
import { composeChartCards } from '../markdown/chartCards'
import { findSlidevTheme, slidevThemeChartTokens, slidevThemeVars } from '../slidev/themes'

// 文档是否声明 Slidev 引擎（导出按 frontmatter `engine: slidev` 与预览口径一致）。
function isSlidevDoc(markdown: string): boolean {
  return parseFrontmatter(markdown).engine === 'slidev'
}

// 画布逻辑像素，128 px/英寸恒定（英寸 = px/128），支持任意比例。
export interface SlideDims { w: number; h: number }
const DEFAULT_DIMS: SlideDims = { w: 1280, h: 720 }
const PPI = 128

export interface CapturedChart {
  svg: string // SVG data URI（PPTX 可叠加为可编辑矢量）
  xIn: number
  yIn: number
  wIn: number
  hIn: number
}
export interface CapturedSlide {
  png: string // 整页高清 PNG（图表已烘焙在内，PDF 直接用）
  charts: CapturedChart[]
}

export function normalizeSlideIndices(indices: number[], total: number): number[] {
  return [...new Set(indices)]
    .filter((index) => Number.isInteger(index) && index >= 0 && index < total)
    .sort((a, b) => a - b)
}

export async function captureSlides(
  markdown: string,
  theme: ThemeTokens,
  dims: SlideDims = DEFAULT_DIMS,
): Promise<CapturedSlide[]> {
  await setMermaidTheme(theme)
  if (isSlidevDoc(markdown)) {
    const sections = await renderSlidevSections(markdown, dims)
    const out: CapturedSlide[] = []
    for (const s of sections) out.push(await captureSlidevSection(s, dims))
    return out
  }
  const tree = splitSlides(stripFrontmatter(markdown))
  const out: CapturedSlide[] = []
  for (const column of tree.columns) {
    for (const leaf of column) {
      // 与预览一致：内容溢出时自动拆成多页（导出同步分页）
      const pages = await captureLeaf(leaf, theme, dims)
      out.push(...pages)
    }
  }
  return out
}

export async function captureSlidePages(
  markdown: string,
  theme: ThemeTokens,
  indices: number[],
  dims: SlideDims = DEFAULT_DIMS,
): Promise<{ pages: Array<CapturedSlide & { index: number }>; total: number }> {
  await setMermaidTheme(theme)
  const wanted = new Set(indices.filter((index) => Number.isInteger(index) && index >= 0))
  if (isSlidevDoc(markdown)) {
    const sections = await renderSlidevSections(markdown, dims)
    const pages: Array<CapturedSlide & { index: number }> = []
    for (let i = 0; i < sections.length; i++) {
      if (!wanted.has(i)) continue
      pages.push({ ...(await captureSlidevSection(sections[i], dims)), index: i })
    }
    return { pages, total: sections.length }
  }
  const tree = splitSlides(stripFrontmatter(markdown))
  const pages: Array<CapturedSlide & { index: number }> = []
  let offset = 0
  for (const column of tree.columns) {
    for (const leaf of column) {
      const result = await captureLeafPages(leaf, theme, dims, (localIndex) => wanted.has(offset + localIndex))
      for (const item of result.slides) pages.push({ ...item.slide, index: offset + item.index })
      offset += result.total
    }
  }
  return { pages, total: offset }
}

// —— Slidev 引擎导出（与预览 mountSlidevDeck 共用真实高度自动分页） ——
interface SlidevCaptureSection { html: string; themeId: string }

async function renderSlidevSections(
  markdown: string,
  dims: SlideDims,
): Promise<SlidevCaptureSection[]> {
  // 先把 asset:// 解析为 data: URL（导出离屏环境无法走 asset 协议）
  const resolved = await resolveAssetUrls(markdown)
  const deck = parseSlidevDeck(resolved)
  const sdTheme = findSlidevTheme(deck.theme)
  const chartTokens = slidevThemeChartTokens(sdTheme)
  const measure = document.createElement('div')
  measure.className = `reveal slidev-engine slidev-theme-${sdTheme.id}`
  for (const [k, v] of Object.entries(slidevThemeVars(sdTheme))) measure.style.setProperty(k, v)
  if (deck.title) measure.style.setProperty('--sd-deck-title', `"${deck.title.replace(/"/g, '\\"')}"`)
  measure.style.cssText += `position:fixed;left:-99999px;top:0;width:${dims.w}px;`

  for (const rendered of renderSlidevDeck(deck)) {
    const holder = document.createElement('div')
    holder.innerHTML = rendered.html
    const section = holder.firstElementChild as HTMLElement | null
    if (!section) continue
    section.style.width = `${dims.w}px`
    section.style.height = `${dims.h}px`
    const inner = section.querySelector<HTMLElement>('.slide-inner')
    if (inner) composeChartCards(inner)
    measure.appendChild(section)
  }

  document.body.appendChild(measure)
  await setMermaidTheme(chartTokens)
  await mountCharts(measure, { tokens: chartTokens, renderer: 'svg' })
  await waitFrame()
  paginateSlideSections(measure)
  const sections = Array.from(measure.children).filter(
    (element) => element instanceof HTMLElement && element.classList.contains('slide-surface'),
  ) as HTMLElement[]
  const result = sections.map((section) => {
    section.style.removeProperty('width')
    section.style.removeProperty('height')
    return { html: section.outerHTML, themeId: sdTheme.id }
  })
  measure.remove()
  return result
}

async function captureSlidevSection(
  sec: SlidevCaptureSection,
  dims: SlideDims,
): Promise<CapturedSlide> {
  const { w: W, h: H } = dims
  const sdTheme = findSlidevTheme(sec.themeId)
  const chartTokens = slidevThemeChartTokens(sdTheme)
  // 离屏 wrap 带 .reveal.slidev-engine.slidev-theme-<id> + 主题变量，使 slidevThemes.css 选择器命中
  const wrap = document.createElement('div')
  wrap.className = `reveal slidev-engine slidev-theme-${sdTheme.id}`
  for (const [k, v] of Object.entries(slidevThemeVars(sdTheme))) wrap.style.setProperty(k, v)
  wrap.style.cssText += `position:fixed;left:-99999px;top:0;width:${W}px;height:${H}px;background:${sdTheme.bg};overflow:hidden;`

  wrap.innerHTML = sec.html
  const section = wrap.querySelector<HTMLElement>('.slide-surface')
  if (section) { section.style.width = `${W}px`; section.style.height = `${H}px` }
  const inner = wrap.querySelector<HTMLElement>('.slide-inner')
  if (inner) composeChartCards(inner)
  document.body.appendChild(wrap)

  await setMermaidTheme(chartTokens)
  const cleanup = await mountCharts(wrap, { tokens: chartTokens, renderer: 'svg' })
  await waitFrame()
  const slide = await captureWrap(wrap, W, H, sdTheme.bg)
  cleanup()
  wrap.remove()
  return slide
}

function makeWrap(theme: ThemeTokens, W: number, H: number): HTMLElement {
  const wrap = document.createElement('div')
  applyThemeTo(wrap, theme)
  wrap.style.cssText += `position:fixed;left:-99999px;top:0;width:${W}px;height:${H}px;background:${theme.bg};overflow:hidden;`
  return wrap
}

// 采集某个离屏 wrap 的图表位置 + SVG，并整页烘焙成 PNG。
async function captureWrap(wrap: HTMLElement, W: number, H: number, bg: string): Promise<CapturedSlide> {
  await waitFrame()
  const charts: CapturedChart[] = []
  const wrapRect = wrap.getBoundingClientRect()
  wrap.querySelectorAll<HTMLElement>('.chart-block').forEach((block) => {
    const svgEl = block.querySelector('svg')
    if (!svgEl) return
    const uri = svgToDataUri(svgEl)
    if (!uri) return
    const r = block.getBoundingClientRect()
    charts.push({
      svg: uri,
      xIn: (r.left - wrapRect.left) / PPI,
      yIn: (r.top - wrapRect.top) / PPI,
      wIn: r.width / PPI,
      hIn: r.height / PPI,
    })
  })
  const png = await domToPng(wrap, { width: W, height: H, scale: 2, backgroundColor: bg })
  return { png, charts }
}

// 渲染一个叶子页；溢出则按真实高度拆成多页（移动已渲染的 SVG 块，不重渲染）。
async function captureLeaf(md: string, theme: ThemeTokens, dims: SlideDims): Promise<CapturedSlide[]> {
  const result = await captureLeafPages(md, theme, dims, () => true)
  return result.slides.map((item) => item.slide)
}

async function captureLeafPages(
  md: string,
  theme: ThemeTokens,
  dims: SlideDims,
  shouldCapture: (index: number) => boolean,
): Promise<{ slides: Array<{ index: number; slide: CapturedSlide }>; total: number }> {
  const { w: W, h: H } = dims
  const { layout, body } = parseSlideLayout(md)

  const wrap = makeWrap(theme, W, H)
  const section = document.createElement('div')
  section.className = `slide-surface slide-layout-${layout}`
  const resolved = await resolveAssetUrls(body) // 先解析 asset:// 引用为 data: URL
  section.innerHTML = `<div class="slide-inner">${renderMarkdown(resolved)}</div>`
  wrap.appendChild(section)
  document.body.appendChild(wrap)

  // 图表用 SVG 渲染器（矢量、可序列化、可随节点移动）
  const cleanup = await mountCharts(section, { tokens: theme, renderer: 'svg' })
  await waitFrame()

  const inner = section.querySelector<HTMLElement>('.slide-inner')!
  // 不溢出：直接整页截图
  if (!isOverflowing(inner)) {
    if (!shouldCapture(0)) {
      cleanup()
      wrap.remove()
      return { slides: [], total: 1 }
    }
    structureSlide(section, layout)
    const slide = await captureWrap(wrap, W, H, theme.bg)
    cleanup()
    wrap.remove()
    return { slides: [{ index: 0, slide }], total: 1 }
  }

  // 溢出：先拆「单块超页」的代码/表格/列表/图表，再测量分页 → 每页单独建 wrap 逐页截图
  const { h1, reserve } = chapterH1(inner)
  splitTallBlocks(inner, reserve)
  const pages = computePageGroups(inner, reserve)
  if (pages.length <= 1) {
    if (!shouldCapture(0)) {
      cleanup()
      wrap.remove()
      return { slides: [], total: 1 }
    }
    structureSlide(section, layout)
    const slide = await captureWrap(wrap, W, H, theme.bg)
    cleanup()
    wrap.remove()
    return { slides: [{ index: 0, slide }], total: 1 }
  }

  const out: Array<{ index: number; slide: CapturedSlide }> = []
  for (let p = 0; p < pages.length; p++) {
    if (!shouldCapture(p)) continue
    const pw = makeWrap(theme, W, H)
    const ps = document.createElement('div')
    ps.className = section.className
    if (p > 0) ps.dataset.autopage = String(p + 1)
    const pinner = document.createElement('div')
    pinner.className = 'slide-inner'
    if (p > 0 && h1) {
      const hc = h1.cloneNode(true) as HTMLElement
      hc.dataset.autoRepeat = '1'
      pinner.appendChild(hc)
    }
    for (const k of pages[p]) pinner.appendChild(k) // appendChild = 移动已渲染块（SVG 保留）
    ps.appendChild(pinner)
    structureSlide(ps, layout)
    pw.appendChild(ps)
    document.body.appendChild(pw)
    out.push({ index: p, slide: await captureWrap(pw, W, H, theme.bg) })
    pw.remove()
  }
  cleanup()
  wrap.remove()
  return { slides: out, total: pages.length }
}

function waitFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
}

function svgToDataUri(svg: SVGSVGElement): string | null {
  try {
    const vb = svg.viewBox?.baseVal
    const w = (vb && vb.width) || parseFloat(svg.getAttribute('width') || '') || svg.clientWidth || 600
    const h = (vb && vb.height) || parseFloat(svg.getAttribute('height') || '') || svg.clientHeight || 400
    const clone = svg.cloneNode(true) as SVGSVGElement
    clone.setAttribute('width', String(w))
    clone.setAttribute('height', String(h))
    if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    const xml = new XMLSerializer().serializeToString(clone)
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml)))
  } catch {
    return null
  }
}
