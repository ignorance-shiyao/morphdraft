import Reveal from 'reveal.js'
import 'reveal.js/reveal.css'
import { renderMarkdown } from '../markdown'
import { stripFrontmatter } from '../markdown'
import { splitSlides } from './split'
import { parseSlideLayout } from './layout'
import { extractSteps } from './fragments'
import { horizontalSlideStarts, lineToSlideIndex, slideLeafStarts } from './sourcemap'
import { mountCharts } from '../charts/mount'
import { mountMermaidToolsInRoot } from '../charts/mermaidTools'
import { setMermaidTheme } from '../charts/mermaid'
import type { ThemeTokens } from '../themes/presets'
import { findSkin, applySkinToTokens, skinCssVars } from './skins'
import { paginateSlideSections } from './paginate'
import { structureSlide } from './structure'
import {composeChartCards} from '../markdown/chartCards'

// 启用页眉 chrome（字母角标 + 标题条 + 页脚品牌）的皮肤白名单
const CHROME_SKINS = new Set(['business-blue'])

export interface SlidesHandle {
  destroy: () => void
  gotoLine: (line: number, animate?: boolean) => void // 编辑器光标行 → 翻到对应幻灯片
  gotoIndex: (i: number, animate?: boolean) => void   // 跳到第 i 张横向幻灯片（0-based）
  step: (dir: 1 | -1) => { changedSlide: boolean; index: number } // 放映分步：先推进 fragment，无更多则翻页
  replayMotion: () => void         // 重新播放当前页进入动效
  total: () => number              // 幻灯片总数
  currentIndex: () => number       // 当前横向索引
  pages: () => SlideDisplayPage[]  // 自动分页后的真实展示页
}

export interface SlideDisplayPage {
  index: number
  startLine: number
  title: string
  autoPage?: number
  html?: string
}

export interface SlidesCallbacks {
  dark?: boolean
  tokens?: ThemeTokens // 当前主题 tokens，驱动 mermaid/echarts 配色
  skin?: string // 幻灯片视觉皮肤 id（'none' 或 glass/brutalism/swiss/neon）
  animation?: string // 进入页面动效 id
  animateIn?: boolean // 初次挂载是否播放进场动效（内容编辑触发的重建应传 false，避免画面飘）
  width?: number // 画布逻辑宽（默认 1280，随比例变化）
  height?: number // 画布逻辑高（默认 720）
  onGoto?: (line: number) => void // 点击幻灯片 → 编辑器跳到该页源码
  onSlideLine?: (line: number) => void // 手动翻页 → 编辑器滚到该页
  onSlideChange?: (index: number, total: number) => void // 幻灯片切换
  onPagesChange?: (pages: SlideDisplayPage[]) => void // 自动分页后的真实页列表
}

// 在 host 内构建 .reveal > .slides 结构并初始化 Reveal。
// 复用 markdown-it 渲染（含 mermaid/echarts/callout），不使用 reveal 自带 markdown 插件。
export async function mountSlides(
  host: HTMLElement,
  markdown: string,
  opts: SlidesCallbacks = {},
): Promise<SlidesHandle> {
  // 皮肤激活时，图表/mermaid 用皮肤配色；否则用主题 tokens
  const skin = findSkin(opts.skin)
  const chartTokens = skin && opts.tokens ? applySkinToTokens(opts.tokens, skin) : opts.tokens
  if (chartTokens) await setMermaidTheme(chartTokens)

  const body = stripFrontmatter(markdown)
  const tree = splitSlides(body)
  // 自动分页会改变横向幻灯片数量，故 starts 需在分页后从 DOM 重建
  let starts = horizontalSlideStarts(markdown)
  const leafStarts = slideLeafStarts(markdown) // M4-1b: 每个叶子页（含纵向）的起始行

  const reveal = document.createElement('div')
  reveal.className = 'reveal'
  if (opts.animation && opts.animation !== 'none') {
    // 纯 CSS 切页动画（slides.css 的 @keyframes，随 reveal 给 .present 自动触发/重播）
    reveal.classList.add(`slide-anim-${opts.animation}`)
  }
  // 皮肤：加 .skin-<id> 类（装饰选择器用）+ 注入配色 CSS 变量（子元素继承，仅此子树）
  if (skin) {
    reveal.classList.add(`skin-${skin.id}`)
    for (const [k, v] of Object.entries(skinCssVars(skin))) {
      if (v) reveal.style.setProperty(k, v)
    }
  }
  const slides = document.createElement('div')
  slides.className = 'slides'
  reveal.appendChild(slides)

  const W = opts.width ?? 1280
  const H = opts.height ?? 720

  // 关键：在「中性屏外容器」里构建 + 挂图表 + 量度分页，避免 reveal.css 在初始化前隐藏
  // 幻灯片导致高度读不到（=0 → 漏拆）。slides.css 的 .slide-surface 样式不依赖 .reveal，
  // 故在普通 div 里即可正确量度（与导出 slide-capture 同一思路）。量完再把最终页移入 reveal。
  const measure = document.createElement('div')
  measure.style.cssText = `position:fixed;left:-99999px;top:0;width:${W}px;`

  tree.columns.forEach((column, h) => {
    const colStarts = leafStarts[h] // 该列各叶子页的起始行（含纵向）
    let top: HTMLElement
    if (column.length === 1) {
      top = makeSection(column[0])
      // 单页：startLine 直接设在 section（与 directiveOffset 同一元素）
      const s = colStarts?.[0] ?? starts[h]
      if (s != null) top.dataset.startLine = String(s)
    } else {
      top = document.createElement('section')
      column.forEach((leaf, v) => {
        const sec = makeSection(leaf)
        // M4-1b: 每个纵向子页各记自己的 startLine（内层 section，与其 directiveOffset 同一元素）
        const s = colStarts?.[v]
        if (s != null) sec.dataset.startLine = String(s)
        top.appendChild(sec)
      })
      // wrapper 仍记该列首页起始行，供横向导航（onClick/slidechanged 用 starts 数组，不受影响）
      if (starts[h] != null) top.dataset.startLine = String(starts[h])
    }
    measure.appendChild(top)
  })

  // 量度用：把每个 .slide-surface 显式定尺到画布大小
  measure.querySelectorAll<HTMLElement>('.slide-surface').forEach((s) => {
    s.style.width = `${W}px`
    s.style.height = `${H}px`
  })
  document.body.appendChild(measure)

  const cleanupCharts = await mountCharts(measure, { tokens: chartTokens })
  paginateSlideSections(measure)
    // chrome 皮肤（如商务蓝）注入页眉条：内容页按出现顺序分配字母角标 A/B/C…（续页不占号）
    const chrome = !!skin && CHROME_SKINS.has(skin.id)
    let badgeIdx = 0
  measure.querySelectorAll<HTMLElement>('.slide-surface').forEach((section) => {
      const layout = layoutFromSection(section)
      let badge = ''
      const isContent = layout === 'default' || layout === 'split' || layout === 'grid'
      if (chrome && isContent && !section.dataset.autopage) {
          badge = String.fromCharCode(65 + (badgeIdx++ % 26))
      }
      structureSlide(section, layout, {chrome, badge, tag: section.dataset.slideTag || ''})
  })

  // 清掉量度用临时定尺，把最终的所有顶层页移入 reveal.slides（保留已渲染节点/图表）
  measure.querySelectorAll<HTMLElement>('.slide-surface').forEach((s) => {
    s.style.width = ''
    s.style.height = ''
  })
  while (measure.firstChild) slides.appendChild(measure.firstChild)
  measure.remove()
  starts = rebuildStarts(slides)
  const displayPages = collectDisplayPages(slides)
  opts.onPagesChange?.(displayPages)

  host.innerHTML = ''
  host.appendChild(reveal)
  const cleanupMermaidTools = mountMermaidToolsInRoot(reveal, (el) => {
    const section = el.closest<HTMLElement>('section[data-start-line]')
    const start = Number(section?.dataset.startLine)
    const local = Number(el.dataset.sourceLine)
    const offset = Number(section?.dataset.directiveOffset || '0')
    if (Number.isFinite(start) && Number.isFinite(local)) opts.onGoto?.(start + offset + local)
  })

  const deck = new Reveal(reveal, {
    embedded: true,
    hash: false,
    controls: true,
    progress: true,
    slideNumber: 'c/t',
    width: W,
    height: H,
    margin: 0,
    // 关闭 reveal 自带的翻页过渡：幻灯片动效统一由我们的 CSS slide-anim-*（「动效」下拉）控制，
    // 单一来源，避免与内置过渡叠加导致编辑/重建时画面飘移缩放
    transition: 'none',
    backgroundTransition: 'none',
    // 嵌入面板较窄，禁用 reveal 5 的自动滚动视图，保持幻灯片翻页体验
    scrollActivationWidth: 0,
  })
  await deck.initialize()
  deck.layout()
  const replayCssMotion = (delay = 80) => {
    if (!opts.animation || opts.animation === 'none') return
    window.setTimeout(() => {
      window.requestAnimationFrame(() => {
        const targets = reveal.querySelectorAll<HTMLElement>('.slides section.present .slide-inner, .slides section.present .slide-inner > *')
        targets.forEach((el) => { el.style.animation = 'none' })
        void reveal.offsetWidth
        targets.forEach((el) => { el.style.animation = '' })
      })
    }, delay)
  }
  if (opts.animateIn !== false) replayCssMotion()

  // 点击幻灯片 → 编辑器跳到该页起始行
  const onClick = (e: MouseEvent) => {
    const sec = (e.target as HTMLElement)?.closest?.('section[data-start-line]') as HTMLElement | null
    if (sec?.dataset.startLine) opts.onGoto?.(Number(sec.dataset.startLine))
  }
  reveal.addEventListener('click', onClick)

  // 手动翻页 → 编辑器滚到该页（程序化跳转期间用 navLock 抑制回声）
  let navLock = false
  deck.on('slidechanged', () => {
    if (navLock) return
    const st = starts[deck.getIndices().h]
    if (st != null) opts.onSlideLine?.(st)
    opts.onSlideChange?.(deck.getIndices().h, starts.length)
  })

  opts.onSlideChange?.(deck.getIndices().h, starts.length)

  return {
    destroy: () => {
      reveal.removeEventListener('click', onClick)
      cleanupMermaidTools()
      cleanupCharts()
      try {
        deck.destroy()
      } catch {
        /* ignore */
      }
      host.innerHTML = ''
    },
    gotoLine: (line: number, animate = true) => {
      const idx = lineToSlideIndex(starts, line)
      if (idx < 0 || idx === deck.getIndices().h) return
      navLock = true
      deck.slide(idx)
      if (animate) replayCssMotion(40)
      window.setTimeout(() => {
        navLock = false
      }, 400)
    },
    gotoIndex: (i: number, animate = true) => {
      if (i === deck.getIndices().h) return
      navLock = true
      deck.slide(i)
      if (animate) replayCssMotion(40)
      window.setTimeout(() => { navLock = false }, 400)
    },
    // 放映分步：reveal 内置 next/prev 已是「fragment 优先于翻页」；返回是否发生整页切换
    step: (dir: 1 | -1) => {
      const before = deck.getIndices().h
      if (dir > 0) deck.next()
      else deck.prev()
      const after = deck.getIndices().h
      return { changedSlide: after !== before, index: after }
    },
    replayMotion: () => replayCssMotion(90),
    total: () => starts.length,
    currentIndex: () => deck.getIndices().h,
    pages: () => displayPages,
  }
}

// 从 DOM 重建「每个横向幻灯片的起始源码行」。续页与原章节共享 data-start-line。
function rebuildStarts(slides: HTMLElement): number[] {
  return Array.from(slides.children).map((sec) => {
    const el = sec as HTMLElement
    const ds = el.dataset.startLine ?? el.querySelector<HTMLElement>('[data-start-line]')?.dataset.startLine
    return ds != null ? Number(ds) : 0
  })
}

function collectDisplayPages(slides: HTMLElement): SlideDisplayPage[] {
  return Array.from(slides.children).map((sec, index) => {
    const el = sec as HTMLElement
    const ds = el.dataset.startLine ?? el.querySelector<HTMLElement>('[data-start-line]')?.dataset.startLine
    const startLine = ds != null ? Number(ds) : 0
    const title = titleFromSection(el, index)
    const autoPage = el.dataset.autopage ? Number(el.dataset.autopage) : undefined
    return { index, startLine, title, autoPage, html: el.outerHTML }
  })
}

function titleFromSection(section: HTMLElement, index: number): string {
  const heading = section.querySelector<HTMLElement>('.slide-inner h1, .slide-inner h2, .slide-inner h3')
  const text = heading?.textContent?.trim()
  if (text) return text.slice(0, 32)
  const plain = section.querySelector<HTMLElement>('.slide-inner p, .slide-inner li')?.textContent?.trim()
  return plain ? plain.slice(0, 24) : `第 ${index + 1} 页`
}

function makeSection(md: string): HTMLElement {
  const { layout, body, directiveOffset, tag } = parseSlideLayout(md)
  const section = document.createElement('section')
  section.className = `slide-surface slide-layout-${layout}`
  // 存储 layout 注释偏移量，供 openCardEditor 行号补偿
  section.dataset.directiveOffset = String(directiveOffset)
  if (tag) section.dataset.slideTag = tag

  // M4-6: 步进动画 — 抹空 <!-- step --> 标记行（保持行数），渲染后按行号注入 fragment
  const { body: steppedBody, stepLines } = extractSteps(body)
  const html = renderMarkdown(steppedBody)
  section.innerHTML = `<div class="slide-inner">${html}</div>`
    const inner = section.querySelector<HTMLElement>('.slide-inner')
    if (inner) composeChartCards(inner)

  if (stepLines.length) {
    // 收集所有带 data-source-line 的块，按行号排序；
    // 给每个 step 标记后的「第一个块」加 class="fragment"（reveal.js 识别为分步出现）。
    const blocks = Array.from(
      section.querySelectorAll<HTMLElement>('.slide-inner [data-source-line]'),
    )
      .map((el) => ({ el, line: Number(el.dataset.sourceLine) }))
      .filter((b) => Number.isFinite(b.line))
      .sort((a, b) => a.line - b.line)
    for (const stepLine of stepLines) {
      const target = blocks.find((b) => b.line > stepLine)
      if (target) target.el.classList.add('fragment')
    }
  }

  return section
}

function layoutFromSection(section: HTMLElement) {
  const match = Array.from(section.classList)
    .find((name) => name.startsWith('slide-layout-'))
    ?.replace('slide-layout-', '')
  return (match || 'default') as ReturnType<typeof parseSlideLayout>['layout']
}
