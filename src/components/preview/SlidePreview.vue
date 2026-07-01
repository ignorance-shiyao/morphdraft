<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { mountSlides, type SlideDisplayPage, type SlidesHandle } from '../../core/slides/reveal'
import { mountSlidevDeck } from '../../core/slidev/mount'
import { parseSlidevDeck } from '../../core/slidev/parse'
import { SLIDEV_THEMES } from '../../core/slidev/themes'
import { parseFrontmatter } from '../../core/markdown'
import SlideNavigator from '../SlideNavigator.vue'
import { usePresenter } from '../../composables/usePresenter'
import { useDocumentStore } from '../../stores/document'
import { useThemeStore } from '../../stores/theme'
import { useSyncStore } from '../../stores/sync'
import { useUiStore } from '../../stores/ui'
import { createWheelZoom } from '../../composables/useWheelZoom'
import SelectMenu from '../SelectMenu.vue'
import { SLIDE_RATIOS, SLIDE_RATIO_LIST, type SlideRatio } from '../../core/paper'
import { findSkin, SLIDE_SKINS, skinCssVars } from '../../core/slides/skins'
import AppLogo from '../AppLogo.vue'
import { renderMarkdown } from '../../core/markdown'
import {moveBlockByLine} from '../../core/markdown/blockReorder'
import Icon from '../Icon.vue'
import { htmlToMarkdown } from '../../core/clipboard'
import { highlightCodeHtml } from '../../core/markdown/highlightCode'
import {absoluteSlideSourceLine} from '../../core/slides/sourcemap'
import { useDialog } from '../../composables/useDialog'
import { useI18n } from 'vue-i18n'
import LinkEditorPopover from '../LinkEditorPopover.vue'
import TableContextMenu from '../TableContextMenu.vue'
import {
  applyLinkEdit,
  resolveLinkEditor,
  shouldSkipBlockEditor,
  inlineTarget,
  inlineOccurrence,
  type LinkEditorState,
} from '../../core/markdown/previewClick'
import {
  blockEditRange,
  fencedContentRange,
  findInlineEditRange,
} from '../../core/markdown/editUnits'
import type { MarkdownLinkFields } from '../../core/markdown/linkEdit'
import {
  detectTable,
  formatTable,
  insertRow,
  deleteRow,
  insertCol,
  deleteCol,
  setColAlign,
  moveRow,
  moveCol,
  tableToTsv,
  tableToCsv,
  tableToMarkdown,
  type TableModel,
} from '../../core/markdown/tableEdit'
import { useInlinePreviewPanel } from '../../composables/useInlinePreviewPanel'
import { wrapContentEditable, insertContentEditable } from '../../core/markdown/previewFormat'

const { t } = useI18n({ useScope: 'global' })
const engineOpts = computed(() => [
  { value: 'classic', label: t('slidePreview.classic') },
  { value: 'slidev', label: 'Slidev' },
])
const slidevThemeOpts = SLIDEV_THEMES.map((t) => ({
  value: t.id,
  label: t.name,
  preview: {
    '--preview-bg': t.bg,
    '--preview-fg': t.fg,
    '--preview-primary': t.primary,
    '--preview-panel': t.codeBg,
  },
}))
const animationOpts = computed(() => [
  { value: 'none', label: t('slidePreview.animations.none') },
  { value: 'smooth', label: t('slidePreview.animations.smooth') },
  { value: 'rise', label: t('slidePreview.animations.rise') },
  { value: 'fade-up', label: t('slidePreview.animations.fadeUp') },
  { value: 'zoom-pop', label: t('slidePreview.animations.zoomPop') },
  { value: 'blur', label: t('slidePreview.animations.blur') },
  { value: 'spotlight', label: t('slidePreview.animations.spotlight') },
  { value: 'stagger', label: t('slidePreview.animations.stagger') },
  { value: 'cascade', label: t('slidePreview.animations.cascade') },
  { value: 'cinema', label: t('slidePreview.animations.cinema') },
  { value: 'wipe', label: t('slidePreview.animations.wipe') },
  { value: 'glow', label: t('slidePreview.animations.glow') },
])

const doc = useDocumentStore()
const theme = useThemeStore()
const sync = useSyncStore()
const ui = useUiStore()
const dialog = useDialog()
const {
  inlinePreviewEl,
  renderInlinePreview,
  disposeInlinePreviewChart,
  dispose: disposeInlinePreview,
} = useInlinePreviewPanel(() => theme.tokens)

const linkEditor = ref<LinkEditorState | null>(null)
const tableMenu = ref<{ x: number; y: number; model: TableModel; col: number; bodyIndex: number } | null>(null)

const activeSlidevTheme = computed(() => SLIDEV_THEMES.find((item) => item.id === ui.slidevTheme))
const ratioOpts = SLIDE_RATIO_LIST.map((r) => ({ value: r.id, label: r.label }))
const activeSlidevThemeTitle = computed(() => {
  const item = activeSlidevTheme.value
  return item ? `${item.name} · ${item.author} · ${item.sourcePackage} · ${item.visualStyle}` : ''
})
const host = ref<HTMLDivElement | null>(null)
const stageEl = ref<HTMLElement | null>(null)

// —— 页内块拖拽重排 ——（hover 顶层块显手柄 → 拖手柄 → drop 到目标块 → 改写源码块顺序）
const dragHandle = ref<{ x: number; y: number; h: number } | null>(null)
const dragging = ref(false)
const dropY = ref<number | null>(null)
let hoverBlock: HTMLElement | null = null
let dragFromLine = -1
let dragToLine = -1
let dragPlaceAfter = false
let handle: SlidesHandle | null = null
let rebuilding = false

// M4-4: 演讲者模式
const presenter = usePresenter()

const slideIndex = ref(0)
const displayPages = ref<SlideDisplayPage[]>([])
const previewSkin = ref<string | null>(null)
const dims = computed(() => SLIDE_RATIOS[ui.slideRatio])
const activeSkinId = computed(() => previewSkin.value ?? ui.slideSkin)
const selectedSkin = computed(() => findSkin(activeSkinId.value))
const skinOpts = computed(() => [
  {
    value: 'none',
    label: t('slidePreview.followTheme'),
    preview: {
      '--preview-bg': theme.tokens.bg,
      '--preview-fg': theme.tokens.fg,
      '--preview-primary': theme.tokens.primaryColor,
      '--preview-panel': theme.tokens.panelBg,
    },
  },
  ...SLIDE_SKINS.map((s) => ({
    value: s.id,
    label: s.name,
    preview: {
      '--preview-bg': s.bg,
      '--preview-fg': s.fg,
      '--preview-primary': s.primary,
      '--preview-panel': s.panelBg,
    },
  })),
])
const stylePreview = computed(() => {
  const skin = selectedSkin.value
  if (!skin) {
    return {
      '--preview-bg': theme.tokens.bg,
      '--preview-fg': theme.tokens.fg,
      '--preview-primary': theme.tokens.primaryColor,
      '--preview-panel': theme.tokens.panelBg,
    }
  }
  return {
    '--preview-bg': skin.bg,
    '--preview-fg': skin.fg,
    '--preview-primary': skin.primary,
    '--preview-panel': skin.panelBg,
  }
})
const stageSize = ref({ w: 0, h: 0 })
let ro: ResizeObserver | null = null
const onStageWheelZoom = createWheelZoom({
  getValue: () => ui.slidePreviewZoom,
  setValue: (value) => ui.setSlidePreviewZoom(value),
  min: 0.5,
  max: 2.5,
  requireModifier: false,
})

// M4-4: 演讲者模式
function openPresenter() {
  const total = handle?.total() ?? 0
  if (total > 0) {
    presenter.open(total, slideIndex.value, makePresenterPreview(slideIndex.value))
  }
}

// —— 全屏演示系统：观众视角 / 演讲者视角（双模式，全屏，可切换）——
const presenting = ref(false)
const presentMode = ref<'audience' | 'presenter'>('audience')
const showNotes = ref(false)       // 观众视角备注浮层
const showOverview = ref(false)    // 幻灯片总览（两视角共用）
const laserOn = ref(false)         // 激光笔
const blackout = ref(false)        // 黑屏
const whiteout = ref(false)        // 白屏
const showHelp = ref(false)        // 快捷键帮助浮层
const controlsVisible = ref(true)  // 观众视角控件是否可见（静止自动隐藏）
let idleTimer: number | undefined
const laserPos = ref({ x: -200, y: -200 })
const notesFontScale = ref(1)
const elapsedSec = ref(0)
const wallClock = ref('')
const PRESENT_TARGET_SEC = 20 * 60 // 目标时长，用于「剩余」
let presentTimer: number | undefined

const slideTotal = computed(() => handle?.total() ?? displayPages.value.length)
// 仅观众视角、无浮层时才允许自动隐藏控件
const controlsHidden = computed(() =>
  !controlsVisible.value && presentMode.value === 'audience'
  && !showOverview.value && !showHelp.value && !blackout.value && !whiteout.value,
)
function fmtClock(s: number) {
  const sign = s < 0 ? '-' : ''
  const a = Math.abs(s)
  return `${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`
}
const elapsedLabel = computed(() => fmtClock(elapsedSec.value))
const remainingLabel = computed(() => fmtClock(PRESENT_TARGET_SEC - elapsedSec.value))
const docTitle = computed(() => doc.title || t('slidePreview.untitled'))
const currentNotesHtml = computed(() => {
  const n = extractNotes(doc.markdown, slideIndex.value)
  return n ? renderMarkdown(n) : ''
})
const nextTitle = computed(() => displayPages.value[slideIndex.value + 1]?.title ?? t('slidePreview.end'))
const hasNext = computed(() => slideIndex.value + 1 < slideTotal.value)
const nextSlideHtml = computed(() => displayPages.value[slideIndex.value + 1]?.html || cloneSlideHtml(slideIndex.value + 1) || '')
const overviewPages = computed(() =>
  displayPages.value.map((p, i) => ({ i, title: p.title ?? t('slidePreview.pageN', { n: i + 1 }), html: p.html || cloneSlideHtml(i) || '' })),
)
const miniSkinClass = computed(() => (selectedSkin.value ? `skin-${selectedSkin.value.id}` : ''))
const miniSkinStyle = computed(() => (selectedSkin.value ? skinCssVars(selectedSkin.value) : {}))
// 缩略图缩放：把 .slide-surface 从逻辑尺寸缩到容器宽度
const miniVars = computed(() => ({
  '--slide-w': `${dims.value.w}px`,
  '--slide-h': `${dims.value.h}px`,
}))
let miniRO: ResizeObserver | null = null
function rescaleMinis() {
  const boxes = stageEl.value?.querySelectorAll<HTMLElement>('.mini-box')
  if (!boxes) return
  miniRO?.disconnect()
  miniRO = new ResizeObserver((entries) => {
    for (const en of entries) {
      const el = en.target as HTMLElement
      el.style.setProperty('--ms', String(el.clientWidth / dims.value.w))
    }
  })
  boxes.forEach((b) => {
    b.style.setProperty('--ms', String(b.clientWidth / dims.value.w))
    miniRO!.observe(b)
  })
}

async function present(mode: 'audience' | 'presenter' = 'audience') {
  presentMode.value = mode
  presenting.value = true
  showNotes.value = false
  showOverview.value = false
  blackout.value = false
  whiteout.value = false
  showHelp.value = false
  laserOn.value = false
  elapsedSec.value = 0
  revealControls()
  const tick = () => { wallClock.value = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }) }
  tick()
  window.clearInterval(presentTimer)
  presentTimer = window.setInterval(() => { elapsedSec.value++; tick() }, 1000)
  const el = stageEl.value
  if (el?.requestFullscreen) { try { await el.requestFullscreen() } catch { /* 忽略 */ } }
  nextTick(rescaleMinis)
}
function exitPresent() {
  presenting.value = false
  window.clearInterval(presentTimer)
  window.clearTimeout(idleTimer)
  controlsVisible.value = true
  miniRO?.disconnect()
  if (document.fullscreenElement) void document.exitFullscreen()
}

// 鼠标活动→显示控件，静止 2.6s 后自动隐藏（仅观众视角生效，见 controlsHidden）
function revealControls() {
  controlsVisible.value = true
  window.clearTimeout(idleTimer)
  idleTimer = window.setTimeout(() => { controlsVisible.value = false }, 2600)
}
function switchPresentMode() {
  presentMode.value = presentMode.value === 'audience' ? 'presenter' : 'audience'
  nextTick(rescaleMinis)
}
function presentGoTo(i: number) {
  const n = Math.max(0, Math.min(slideTotal.value - 1, i))
  handle?.gotoIndex(n)
  slideIndex.value = n
  updatePresenter(n)
  showOverview.value = false
  nextTick(rescaleMinis)
}
function onLaserMove(e: MouseEvent) {
  revealControls() // 任意鼠标移动都唤回控件
  if (!laserOn.value) return
  const r = stageEl.value?.getBoundingClientRect()
  laserPos.value = { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) }
}

// 观众视角点击幻灯片空白处→下一张（避开控件/浮层/激光）
function onPresentClick(e: MouseEvent) {
  if (presentMode.value !== 'audience' || laserOn.value) return
  if (blackout.value) { blackout.value = false; return }
  if (whiteout.value) { whiteout.value = false; return }
  const t = e.target as HTMLElement | null
  if (t?.closest('button, .aud-bar, .aud-rail, .present-overview, .present-notes, .present-help')) return
  nextSlide()
}
function bumpNotesFont(d: number) {
  notesFontScale.value = Math.max(0.8, Math.min(1.8, Math.round((notesFontScale.value + d) * 10) / 10))
}
function onFsChange() {
  if (!document.fullscreenElement && presenting.value) {
    presenting.value = false
    window.clearInterval(presentTimer)
    miniRO?.disconnect()
  }
}
function onPresentKey(e: KeyboardEvent) {
  if (!presenting.value) return
  revealControls()
  const k = e.key.toLowerCase()
  if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); nextSlide() }
  else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); prevSlide() }
  else if (e.key === 'Home') { e.preventDefault(); presentGoTo(0) }
  else if (e.key === 'End') { e.preventDefault(); presentGoTo(slideTotal.value - 1) }
  else if (e.key === 'Escape') { e.preventDefault(); exitPresent() }
  else if (k === 'n') { e.preventDefault(); showNotes.value = !showNotes.value }
  else if (k === 'p') { e.preventDefault(); switchPresentMode() }
  else if (k === 'b') { e.preventDefault(); blackout.value = !blackout.value }
  else if (k === 'w') { e.preventDefault(); whiteout.value = !whiteout.value }
  else if (k === 'g') { e.preventDefault(); showOverview.value = !showOverview.value }
  else if (e.key === '?' || (e.key === '/' && e.shiftKey)) { e.preventDefault(); showHelp.value = !showHelp.value }
}
watch([showOverview, () => presentMode.value, slideIndex], () => { if (presenting.value) nextTick(rescaleMinis) })
onMounted(() => {
  document.addEventListener('fullscreenchange', onFsChange)
  window.addEventListener('keydown', onPresentKey)
})
onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', onFsChange)
  window.removeEventListener('keydown', onPresentKey)
  window.clearInterval(presentTimer)
  miniRO?.disconnect()
})

// 从 markdown 中提取第 N 张幻灯片的备注。
// Slidev 引擎：备注来自每页 HTML 注释（解析器已收进 deck.slides[i].note）；
// 经典引擎：沿用 :::notes ... ::: 块。
function extractNotes(markdown: string, slideIndex: number): string {
  const fmEngine = parseFrontmatter(markdown).engine
  const engine = (typeof fmEngine === 'string' ? fmEngine : null) ?? ui.slideEngine
  if (engine === 'slidev') {
    const deck = parseSlidevDeck(markdown)
    return deck.slides[slideIndex]?.note?.trim() ?? ''
  }
  const body = markdown.replace(/^---[\s\S]*?---\n?/, '') // 去掉 frontmatter
  const slides = body.split(/\n---\n/)
  if (slideIndex < 0 || slideIndex >= slides.length) return ''
  const slideMd = slides[slideIndex]
  const notesMatch = slideMd.match(/:::notes\s*\n([\s\S]*?)\n:::/)
  return notesMatch ? notesMatch[1].trim() : ''
}

function makePresenterPreview(index: number) {
  const pages = displayPages.value
  const current = pages[index]
  const next = pages[index + 1]
  const reveal = host.value?.querySelector<HTMLElement>('.reveal')
  const notes = extractNotes(doc.markdown, index)
  return {
    currentHtml: cloneSlideHtml(index) || current?.html || '',
    nextHtml: cloneSlideHtml(index + 1) || next?.html || '',
    currentTitle: current?.title ?? t('slidePreview.pageN', { n: index + 1 }),
    nextTitle: next?.title ?? t('slidePreview.end'),
    notesHtml: notes ? renderMarkdown(notes) : '',
    revealClass: reveal?.className ?? 'reveal',
    revealStyle: reveal?.getAttribute('style') ?? '',
  }
}

function cloneSlideHtml(index: number): string {
  const section = host.value?.querySelectorAll<HTMLElement>('.reveal .slides > section')[index]
  if (!section) return ''
  const clone = section.cloneNode(true) as HTMLElement
  const sourceCanvases = Array.from(section.querySelectorAll<HTMLCanvasElement>('canvas'))
  const cloneCanvases = Array.from(clone.querySelectorAll<HTMLCanvasElement>('canvas'))
  cloneCanvases.forEach((canvas, i) => {
    const source = sourceCanvases[i]
    if (!source) return
    try {
      const img = document.createElement('img')
      img.src = source.toDataURL('image/png')
      img.alt = canvas.getAttribute('aria-label') || 'chart'
      img.style.cssText = canvas.getAttribute('style') || 'width:100%;height:100%;object-fit:contain;'
      canvas.replaceWith(img)
    } catch {
      /* keep canvas when the browser refuses export */
    }
  })
  clone.classList.remove('past', 'future')
  clone.classList.add('present')
  clone.removeAttribute('hidden')
  clone.removeAttribute('aria-hidden')
  return clone.outerHTML
}

function updatePresenter(index = slideIndex.value) {
  if (!presenter.isOpen.value) return
  presenter.update(index, handle?.total() ?? displayPages.value.length, makePresenterPreview(index))
}

function nextSlide() {
  const total = handle?.total() ?? 0
  if (!handle || total <= 0) return
  // 放映态：先推进当前页未显示的 fragment，全部显示后再翻页（changedSlide 时才更新页索引/演讲者预览）
  if (presenting.value) {
    const r = handle.step(1)
    if (r.changedSlide) { slideIndex.value = r.index; updatePresenter(r.index) }
    return
  }
  const next = Math.min(total - 1, slideIndex.value + 1)
  handle.gotoIndex(next)
  slideIndex.value = next
  updatePresenter(next)
}

function prevSlide() {
  if (!handle) return
  if (presenting.value) {
    const r = handle.step(-1)
    if (r.changedSlide) { slideIndex.value = r.index; updatePresenter(r.index) }
    return
  }
  const prev = Math.max(0, slideIndex.value - 1)
  handle.gotoIndex(prev)
  slideIndex.value = prev
  updatePresenter(prev)
}

interface SlidePngRequest {
  indices?: number[]
  resolve?: () => void
  reject?: (error: unknown) => void
}

async function exportSlidePages(indices: number[]) {
  try {
    const { exportSlidePngs } = await import('../../core/export/slide-png')
    const count = await exportSlidePngs(doc.markdown, theme.tokens, dims.value, indices, doc.title)
    if (count > 1) {
      await dialog.alert({
        title: t('slidePreview.exportDone'),
        message: '__TAURI_INTERNALS__' in window
          ? t('slidePreview.pngExported', { count })
          : t('slidePreview.pngZipped', { count }),
      })
    }
  } catch (error) {
    await dialog.alert({
      title: t('slidePreview.pngExportFailed'),
      message: error instanceof Error ? error.message : String(error),
      tone: 'danger',
    })
  }
}

async function onSlidePngRequest(event: Event) {
  const detail = (event as CustomEvent<SlidePngRequest>).detail
  try {
    const { exportSlidePngs } = await import('../../core/export/slide-png')
    await exportSlidePngs(
      doc.markdown,
      theme.tokens,
      dims.value,
      detail?.indices?.length ? detail.indices : [slideIndex.value],
      doc.title,
    )
    detail?.resolve?.()
  } catch (error) {
    detail?.reject?.(error)
    if (!detail?.reject) {
      await dialog.alert({
        title: t('slidePreview.pngExportFailed'),
        message: error instanceof Error ? error.message : String(error),
        tone: 'danger',
      })
    }
  }
}

// M4-1: 卡片内点选原地编辑
const inlineEditorOpen = ref(false)
const inlineEditorLine = ref(0)
const inlineEditorEndLine = ref(0)
const inlineEditorText = ref('')
const inlineEditorHtml = ref('')
const inlineEditorMode = ref<'rich' | 'code'>('rich')
const inlineEditorPresentation = ref<'block' | 'code' | 'chart' | 'math'>('block')
const inlineCodeLang = ref('')
const inlineEditorPos = ref({ x: 0, y: 0, width: 0 })
const inlineRich = ref<HTMLElement | null>(null)
const inlineCode = ref<HTMLElement | null>(null)
const inlineGutter = ref<HTMLElement | null>(null)
const inlineEditorEl = ref<HTMLElement | null>(null)
let editingTargetEl: HTMLElement | null = null
let editorObserver: ResizeObserver | null = null
let editOriginalMarkdown = '' // 开编辑时的快照，用于「取消」还原
let editDirty = false // 本次编辑是否真正改过内容（否则关闭时无需重建，免闪烁）
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const hotkeyHint = computed(() => (isMac ? '⌘↵' : 'Ctrl+↵'))
const editKindLabel = computed(() => {
  if (inlineEditorMode.value === 'rich') return t('slidePreview.content')
  if (inlineCodeLang.value === 'markdown') return t('slidePreview.sourceMarkdown')
  return inlineCodeLang.value || t('slidePreview.code')
})
const toolbarBelow = ref(false) // 顶部空间不足时工具条翻到编辑器下方

function isBlockStart(line: string) {
  return /^#{1,6}\s+/.test(line)
    || /^([-*_])(?:\s*\1){2,}\s*$/.test(line)
    || /^(\s*)([-*+]|\d+[.)])\s+/.test(line)
    || /^>\s?/.test(line)
    || /^```|^~~~|^:::/.test(line)
    || /^\s*\|/.test(line)
}

function editableRange(startLine: number) {
  const lines = doc.markdown.split('\n')
  const start = Math.max(0, Math.min(startLine, lines.length - 1))
  const first = lines[start] || ''
  let end = start

  const fence = first.match(/^(```|~~~)/)
  if (fence) {
    for (let i = start + 1; i < lines.length; i++) {
      end = i
      if (lines[i].startsWith(fence[1])) break
    }
    return { start, end }
  }

  if (/^:::/.test(first)) {
    for (let i = start + 1; i < lines.length; i++) {
      end = i
      if (/^:::\s*$/.test(lines[i])) break
    }
    return { start, end }
  }

  if (/^\s*\|/.test(first)) {
    while (end + 1 < lines.length && /^\s*\|/.test(lines[end + 1])) end++
    return { start, end }
  }

  if (/^#{1,6}\s+/.test(first) || /^([-*_])(?:\s*\1){2,}\s*$/.test(first)) return { start, end }

  if (/^(\s*)([-*+]|\d+[.)])\s+/.test(first) || /^>\s?/.test(first)) {
    while (end + 1 < lines.length && lines[end + 1].trim() && !/^#{1,6}\s+/.test(lines[end + 1])) end++
    return { start, end }
  }

  while (end + 1 < lines.length) {
    const next = lines[end + 1]
    if (!next.trim() || isBlockStart(next)) break
    end++
  }
  return { start, end }
}

// 行号只数代码块自身的行（从 1 开始），不用文档里的绝对行号
const inlineLineNumbers = computed(() => {
  const count = Math.max(1, inlineEditorText.value.split('\n').length)
  return Array.from({ length: count }, (_, i) => i + 1)
})

function getCaretOffset(el: HTMLElement): number {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return 0
  const range = sel.getRangeAt(0)
  const preRange = range.cloneRange()
  preRange.selectNodeContents(el)
  preRange.setEnd(range.endContainer, range.endOffset)
  return preRange.toString().length
}

function setCaretOffset(el: HTMLElement, offset: number) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let node: Text | null = null
  let remaining = offset
  while (walker.nextNode()) {
    const text = walker.currentNode as Text
    if (remaining <= text.length) { node = text; break }
    remaining -= text.length
  }
  const range = document.createRange()
  const sel = window.getSelection()
  if (node) range.setStart(node, Math.max(0, remaining))
  else { range.selectNodeContents(el); range.collapse(false) }
  range.collapse(true)
  sel?.removeAllRanges()
  sel?.addRange(range)
}

function renderInlineCode() {
  if (!inlineCode.value) return
  inlineCode.value.innerHTML = highlightCodeHtml(inlineEditorText.value, inlineCodeLang.value) || '​'
}

// 画布永远使用逻辑尺寸排版；外层只改变显示比例，避免适配预览时重排内容。
const frameScale = computed(() => {
  const { w: aw, h: ah } = dims.value
  const { w: sw, h: sh } = stageSize.value
  if (!sw || !sh) return 1
  return Math.min(sw / aw, sh / ah) * ui.slidePreviewZoom
})
const frameBoxStyle = computed(() => {
  const { w, h } = dims.value
  const scale = frameScale.value
  return {
    width: `${Math.floor(w * scale)}px`,
    height: `${Math.floor(h * scale)}px`,
  }
})
const frameStyle = computed(() => {
  const { w, h } = dims.value
  return {
    width: `${w}px`,
    height: `${h}px`,
    transform: `scale(${frameScale.value})`,
  }
})

async function rebuild(preserveIndex = false, animate = false) {
  if (!host.value || rebuilding) return
  const targetIndex = preserveIndex ? slideIndex.value : null
  rebuilding = true
  try {
    handle?.destroy()
    handle = null
    // 引擎选择：frontmatter `engine: slidev` 优先，否则 UI 设置；其余走经典 reveal 皮肤引擎（不变）。
    const fmEngine = parseFrontmatter(doc.markdown).engine
    const engine = (typeof fmEngine === 'string' ? fmEngine : null) ?? ui.slideEngine
    const callbacks = {
      dark: theme.dark,
      tokens: theme.tokens,
      width: dims.value.w,
      height: dims.value.h,
      onGoto: (line: number) => sync.requestGoto(line),
      onSlideLine: (line: number) => sync.requestScroll(line, 'preview'),
      onSlideChange: (i: number) => {
        slideIndex.value = i
        if (presenter.isOpen.value) updatePresenter(i)
      },
      onPagesChange: (pages: SlideDisplayPage[]) => { displayPages.value = pages },
    }
    handle = engine === 'slidev'
      ? await mountSlidevDeck(host.value, doc.markdown, { ...callbacks, themeId: ui.slidevTheme })
      : await mountSlides(host.value, doc.markdown, {
          ...callbacks,
          skin: activeSkinId.value,
          animation: ui.slideAnimation,
          animateIn: animate, // 内容编辑触发的重建不重放进场动效
        })
    if (targetIndex != null) handle.gotoIndex(Math.min(targetIndex, handle.total() - 1), animate)
    else handle.gotoLine(sync.cursorLine, animate)
    slideIndex.value = handle.currentIndex()
    if (animate) handle.replayMotion()
  } finally {
    rebuilding = false
  }
}

function selectPreviewPage(index: number) {
  handle?.gotoIndex(index)
  slideIndex.value = index
}

function pickRatio(r: SlideRatio) {
  ui.setSlideRatio(r)
}

function previewSlideSkin(id: string | null) {
  previewSkin.value = id
}

function pickSlideSkin(id: string) {
  previewSkin.value = null
  ui.setSlideSkin(id)
}

function pickEngine(id: string) {
  ui.setSlideEngine(id) // 重建由 watcher 触发
}
function pickSlidevTheme(id: string) {
  ui.setSlidevTheme(id)
}

// M4-1: 卡片内点选编辑
function onSlideClick(e: MouseEvent) {
  if (presenting.value) return
  const target = e.target as HTMLElement
  if (target.closest('button, input, textarea, .slide-navigator, .presenter-btn, .inline-slide-editor')) return

  const sourceEl = target.closest('[data-source-line]') as HTMLElement | null
  const section = target.closest('section[data-start-line]') as HTMLElement | null
  if (!sourceEl?.dataset.sourceLine || !section?.dataset.startLine) {
    if (section?.dataset.startLine) {
      const startLine = Number(section.dataset.startLine)
      if (!isNaN(startLine)) openInlineEditor(startLine, section)
    }
    return
  }

  const localLine = Number(sourceEl.dataset.sourceLine)
  const startLine = Number(section.dataset.startLine)
  const directiveOffset = Number(section.dataset.directiveOffset || '0')
  if (isNaN(localLine) || isNaN(startLine)) return

  const pageLocals = section.dataset.autopage
    ? Array.from(section.querySelectorAll<HTMLElement>('.slide-body [data-source-line]'))
        .map((el) => Number(el.dataset.sourceLine))
        .filter(Number.isFinite)
    : []
  const autoPageFirstLocal = pageLocals.length ? Math.min(...pageLocals) : undefined
  const absLine = absoluteSlideSourceLine(startLine, directiveOffset, localLine, autoPageFirstLocal)

  const anchor = target.closest<HTMLElement>('a')
  if (anchor) {
    const resolved = resolveLinkEditor(doc.markdown, absLine, sourceEl, anchor)
    if (resolved) {
      e.preventDefault()
      linkEditor.value = resolved
      return
    }
  }

  if (shouldSkipBlockEditor(e, target)) return

  e.preventDefault()
  openInlineEditor(absLine, sourceEl, { x: e.clientX, y: e.clientY }, target)
}

function saveLink(fields: MarkdownLinkFields) {
  const state = linkEditor.value
  if (!state) return
  doc.setMarkdown(applyLinkEdit(doc.markdown, state, fields))
  linkEditor.value = null
}

function onTableContextMenu(e: MouseEvent) {
  const target = e.target as HTMLElement | null
  const table = target?.closest<HTMLElement>('table[data-source-line]')
  const cell = target?.closest<HTMLTableCellElement>('td, th')
  const tr = target?.closest<HTMLTableRowElement>('tr')
  if (!table || !cell || !tr) { tableMenu.value = null; return }
  const sourceLine = Number(table.dataset.sourceLine)
  const section = table.closest('section[data-start-line]') as HTMLElement | null
  if (!Number.isFinite(sourceLine) || !section?.dataset.startLine) { tableMenu.value = null; return }
  const absLine = absoluteSlideSourceLine(
    Number(section.dataset.startLine),
    Number(section.dataset.directiveOffset || '0'),
    sourceLine,
  )
  const model = detectTable(doc.markdown.split('\n'), absLine)
  if (!model) { tableMenu.value = null; return }
  const col = Math.min(Math.max(0, cell.cellIndex), model.header.length - 1)
  let bodyIndex = -1
  if (!tr.closest('thead')) {
    const tbody = tr.closest('tbody')
    bodyIndex = tbody ? Array.from(tbody.rows).indexOf(tr) : -1
  }
  bodyIndex = Math.min(bodyIndex, model.rows.length - 1)
  e.preventDefault()
  tableMenu.value = { x: e.clientX, y: e.clientY, model, col, bodyIndex }
}

function onTableMenuOp(id: string) {
  const state = tableMenu.value
  if (!state) return
  const { model, col, bodyIndex } = state
  const apply = (next: TableModel) => {
    const lines = doc.markdown.split('\n')
    const text = formatTable(next).join('\n')
    lines.splice(model.fromLine, model.toLine - model.fromLine + 1, ...text.split('\n'))
    doc.setMarkdown(lines.join('\n'))
  }
  switch (id) {
    case 'row-above': apply(insertRow(model, bodyIndex - 1)); break
    case 'row-below': apply(insertRow(model, bodyIndex)); break
    case 'row-del': if (bodyIndex >= 0) apply(deleteRow(model, bodyIndex)); break
    case 'row-up': if (bodyIndex >= 0) apply(moveRow(model, bodyIndex, -1)); break
    case 'row-down': if (bodyIndex >= 0) apply(moveRow(model, bodyIndex, 1)); break
    case 'col-left': apply(insertCol(model, col)); break
    case 'col-right': apply(insertCol(model, col + 1)); break
    case 'col-del': apply(deleteCol(model, col)); break
    case 'col-move-left': apply(moveCol(model, col, -1)); break
    case 'col-move-right': apply(moveCol(model, col, 1)); break
    case 'align-left': apply(setColAlign(model, col, 'left')); break
    case 'align-center': apply(setColAlign(model, col, 'center')); break
    case 'align-right': apply(setColAlign(model, col, 'right')); break
    case 'copy-tsv': void navigator.clipboard.writeText(tableToTsv(model)); break
    case 'copy-csv': void navigator.clipboard.writeText(tableToCsv(model)); break
    case 'copy-md': void navigator.clipboard.writeText(tableToMarkdown(model)); break
  }
  tableMenu.value = null
}

// —— 页内块拖拽重排实现 ——
// 顶层可拖块：slide-body 的直接子块（排除标题/页眉）。
function topBlockUnder(el: HTMLElement | null): HTMLElement | null {
  return (el?.closest('.slide-body > [data-source-line]') as HTMLElement | null) ?? null
}

// 块 → 绝对源码行号（复用 onSlideClick 的映射）
function blockAbsLine(el: HTMLElement): number | null {
  const section = el.closest('section[data-start-line]') as HTMLElement | null
  const local = el.dataset.sourceLine
  if (!section?.dataset.startLine || local == null) return null
  const start = Number(section.dataset.startLine)
  const off = Number(section.dataset.directiveOffset || '0')
  const ln = Number(local)
  if (isNaN(start) || isNaN(ln)) return null
  return start + off + ln
}

function logicalRect(el: HTMLElement) {
  const frameEl = host.value?.closest('.slide-frame') as HTMLElement | null
  if (!frameEl) return null
  const r = el.getBoundingClientRect()
  const fr = frameEl.getBoundingClientRect()
  const s = frameScale.value || 1
  return {
    left: (r.left - fr.left) / s,
    top: (r.top - fr.top) / s,
    height: r.height / s,
    bottom: (r.bottom - fr.top) / s,
    rawTop: r.top,
    rawHeight: r.height
  }
}

// hover 顶层块 → 在其左侧显示拖拽手柄
function onHostHover(e: PointerEvent) {
  if (dragging.value || inlineEditorOpen.value || presenting.value) return
  const block = topBlockUnder(e.target as HTMLElement)
  if (!block) {
    if (hoverBlock) {
      hoverBlock = null;
      dragHandle.value = null
    }
    return
  }
  if (block === hoverBlock) return
  hoverBlock = block
  const lr = logicalRect(block)
  if (lr) dragHandle.value = {x: Math.max(0, lr.left - 26), y: lr.top, h: lr.height}
}

function onHandleDragStart(e: DragEvent) {
  if (!hoverBlock) {
    e.preventDefault();
    return
  }
  const line = blockAbsLine(hoverBlock)
  if (line == null) {
    e.preventDefault();
    return
  }
  dragFromLine = line
  dragging.value = true
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', 'block')
  }
}

function onHostDragOver(e: DragEvent) {
  if (!dragging.value) return
  const block = topBlockUnder(e.target as HTMLElement)
  if (!block) return
  const line = blockAbsLine(block)
  if (line == null) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  const lr = logicalRect(block)
  if (!lr) return
  dragPlaceAfter = (e.clientY - lr.rawTop) > lr.rawHeight / 2
  dragToLine = line
  dropY.value = dragPlaceAfter ? lr.bottom : lr.top
}

function onHostDrop(e: DragEvent) {
  if (!dragging.value) return
  e.preventDefault()
  if (dragFromLine >= 0 && dragToLine >= 0 && dragFromLine !== dragToLine) {
    doc.setMarkdown(moveBlockByLine(doc.markdown, dragFromLine, dragToLine, dragPlaceAfter))
  }
  resetDrag()
}

function resetDrag() {
  dragging.value = false
  dropY.value = null
  dragHandle.value = null
  hoverBlock = null
  dragFromLine = dragToLine = -1
}

// 编辑框挂在 .slide-frame 内部（随其 transform:scale 一起定位/滚动），
// 这里只存「缩放=1 时」的逻辑坐标，定位天然随缩放联动，不用监听 zoom 变化重新测量。
// 框本身再叠加一个 scale(1/frameScale) 抵消父级缩放，保持可读的自然字号/宽度。
function updateInlineEditorPos(target: HTMLElement) {
  const frameEl = target.closest('.slide-frame') as HTMLElement | null
  if (!frameEl) return
  const rect = target.getBoundingClientRect()
  const frameRect = frameEl.getBoundingClientRect()
  const scale = frameScale.value || 1
  const preferredWidth = target.matches('table') ? 520
      : target.matches('pre, .chart-block') ? 480
          : 300
  const width = Math.min(640, Math.max(rect.width, preferredWidth), frameRect.width)
  const screenX = Math.max(frameRect.left, Math.min(rect.left, frameRect.right - width))
  // 顶部空间不足（约一条工具条高）时把工具条翻到编辑器下方，避免被画布顶边裁切
  toolbarBelow.value = rect.top - frameRect.top < 44
  inlineEditorPos.value = {
    x: (screenX - frameRect.left) / scale,
    y: (rect.top - frameRect.top) / scale,
    // 注意：宽度不能再除以 scale —— 编辑框自身的 scale(1/frameScale) 已经抵消了父级
    // .slide-frame 的 scale(frameScale)（合成后净缩放为 1），直接用屏幕像素宽度即可，
    // 否则会被多除一次 scale，导致编辑框比原内容窄/宽，缩放越大跑偏越明显
    width,
  }
}

// 编辑期间原块被折叠（height:0），浮层编辑器又是 absolute 不占流。若原块本来很高
// （如 mermaid 图表），折叠后后续内容会整体上移到编辑器底下被遮挡，原块那片高度也成了留白。
// 这里把原块当成「占位高度 = 编辑器高度」的撑高块，让后续内容正好落在编辑器下方：不遮挡、不留白。
// 编辑器自带 scale(1/frameScale)，offsetHeight 是缩放前自然高；原块在 .slide-frame(scale frameScale) 里，
// 屏幕高 = 占位高×frameScale，要让它等于编辑器屏幕高(=offsetHeight)，故占位高 = offsetHeight / frameScale。
function syncEditingReserve() {
  if (!editingTargetEl || !inlineEditorEl.value) return
  const scale = frameScale.value || 1
  const reserve = inlineEditorEl.value.offsetHeight / scale
  editingTargetEl.style.setProperty('--ise-reserve', `${reserve}px`)
}

function normalizeEditableTarget(el: HTMLElement) {
  return (el.closest('li[data-source-line], table[data-source-line], blockquote[data-source-line]') as HTMLElement | null) ?? el
}

function editableOuterHtml(el: HTMLElement) {
  const clone = el.cloneNode(true) as HTMLElement
  clone.classList.remove('slide-editing-target', 'src-active')
  return clone.outerHTML
}

// 在编辑器内把光标落到屏幕坐标处（编辑器浮于点击位置之上，故直接用点击坐标）
function placeCaretAtPoint(editorEl: HTMLElement, x: number, y: number): boolean {
  const d = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
  }
  let range: Range | null = null
  if (d.caretRangeFromPoint) range = d.caretRangeFromPoint(x, y)
  else if (d.caretPositionFromPoint) {
    const p = d.caretPositionFromPoint(x, y)
    if (p) { range = document.createRange(); range.setStart(p.offsetNode, p.offset) }
  }
  if (range && editorEl.contains(range.startContainer)) {
    range.collapse(true)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
    return true
  }
  return false
}

function openInlineEditor(line: number, target: HTMLElement, point?: { x: number; y: number }, clicked: HTMLElement | null = null) {
  const lines = doc.markdown.split('\n')
  if (line < 0 || line >= lines.length) return
  editOriginalMarkdown = doc.markdown
  editDirty = false

  const blockRange = blockEditRange(lines, line)
  const mathBlockEl = clicked?.closest<HTMLElement>('.math-block') ?? null
  const inline = mathBlockEl ? null : inlineTarget(clicked)
  const inlineRange = inline
    ? findInlineEditRange(lines, blockRange, inline.kind, inline.text, inlineOccurrence(target, inline))
    : null

  let range = inlineRange
    ? { start: inlineRange.line, end: inlineRange.line }
    : blockRange
  const editTarget = normalizeEditableTarget(target)
  if (!inlineRange && editTarget.matches('pre, .chart-block, .math-block')) {
    range = fencedContentRange(lines, blockRange)
  }

  host.value?.querySelectorAll('.slide-editing-target').forEach((node) => node.classList.remove('slide-editing-target'))
  editTarget.classList.add('slide-editing-target')
  inlineEditorLine.value = range.start
  inlineEditorEndLine.value = range.end
  inlineEditorText.value = inlineRange?.source
    ?? lines.slice(range.start, range.end + 1).join('\n')

  const richOk = !inlineRange
    && editTarget.matches('p, h1, h2, h3, h4, h5, h6')
    && !editTarget.querySelector('img, table, .chart-block, .md-icon, .pill, .ui-bar, .ui-spark')
  inlineEditorMode.value = richOk ? 'rich' : 'code'

  if (editTarget.matches('pre.hljs')) {
    inlineCodeLang.value = editTarget.querySelector('.code-lang')?.textContent?.trim() ?? ''
    inlineEditorPresentation.value = 'code'
  } else if (editTarget.matches('.chart-block')) {
    inlineCodeLang.value = editTarget.dataset.chartType === 'mermaid' ? 'mermaid' : 'json'
    inlineEditorPresentation.value = 'chart'
  } else if (editTarget.matches('.math-block')) {
    inlineCodeLang.value = 'latex'
    inlineEditorPresentation.value = 'math'
  } else {
    inlineCodeLang.value = inlineEditorMode.value === 'code' ? 'markdown' : ''
    inlineEditorPresentation.value = 'block'
  }

  inlineEditorHtml.value = editableOuterHtml(editTarget)
  editingTargetEl = editTarget
  updateInlineEditorPos(editTarget)
  inlineEditorOpen.value = true
  nextTick(() => {
    const editor = inlineEditorMode.value === 'code' ? inlineCode.value : inlineRich.value
    if (inlineEditorMode.value === 'code') {
      renderInlineCode()
      if (inlineEditorPresentation.value !== 'block') {
        renderInlinePreview(inlineEditorText.value, inlineEditorPresentation.value, inlineCodeLang.value)
      }
    }
    editor?.focus()
    if (editor && point) placeCaretAtPoint(editor, point.x, point.y)
    syncEditingReserve()
    if (inlineEditorEl.value) {
      editorObserver?.disconnect()
      editorObserver = new ResizeObserver(() => syncEditingReserve())
      editorObserver.observe(inlineEditorEl.value)
    }
  })
}

function closeInlineEditor() {
  inlineEditorOpen.value = false
  disposeInlinePreview()
  editorObserver?.disconnect()
  editorObserver = null
  editingTargetEl?.style.removeProperty('--ise-reserve')
  editingTargetEl = null
  host.value?.querySelectorAll('.slide-editing-target').forEach((node) => node.classList.remove('slide-editing-target'))
  window.clearTimeout(timer)
  // 仅在真正改过内容时才重挂载（否则点开又关只需恢复折叠的块，免闪烁）
  if (editDirty) rebuild(true)
  editDirty = false
}

// 完成：保留改动并关闭。若块被清空，删掉残留空行。
function commitInlineEditor() {
  const lines = doc.markdown.split('\n')
  const s = inlineEditorLine.value
  const e = inlineEditorEndLine.value
  if (s >= 0 && e >= s && e < lines.length && lines.slice(s, e + 1).join('').trim() === '') {
    lines.splice(s, e - s + 1)
    editDirty = true
    doc.setMarkdown(lines.join('\n').replace(/\n{3,}/g, '\n\n'))
  }
  closeInlineEditor()
}

// 取消：还原到编辑前快照再关闭
function cancelInlineEditor() {
  if (editOriginalMarkdown && editOriginalMarkdown !== doc.markdown) {
    doc.setMarkdown(editOriginalMarkdown)
  }
  closeInlineEditor()
}

function replaceInlineEdit(nextMarkdown: string) {
  const lines = doc.markdown.split('\n')
  const nextLines = nextMarkdown.split('\n')
  if (inlineEditorLine.value >= 0 && inlineEditorLine.value < lines.length) {
    lines.splice(
      inlineEditorLine.value,
      inlineEditorEndLine.value - inlineEditorLine.value + 1,
      ...nextLines,
    )
    inlineEditorEndLine.value = inlineEditorLine.value + nextLines.length - 1
    editDirty = true
    doc.setMarkdown(lines.join('\n'))
  }
}

function applySlidePreviewFormat(kind: 'bold' | 'italic' | 'strike' | 'code' | 'link') {
  const el = inlineEditorMode.value === 'code' ? inlineCode.value : inlineRich.value
  if (!el) return
  const specs: Record<typeof kind, [string, string]> = {
    bold: ['**', '**'],
    italic: ['*', '*'],
    strike: ['~~', '~~'],
    code: ['`', '`'],
    link: ['[', '](https://)'],
  }
  const [before, after] = specs[kind]
  if (!wrapContentEditable(el, before, after)) insertContentEditable(el, before + after)
  if (inlineEditorMode.value === 'code') onCodeInput()
  else onRichInput()
}

function onRichInput() {
  if (!inlineRich.value) return
  // 不要把 innerHTML 回写到 inlineEditorHtml：v-html 重新 patch 会重置光标。
  // contenteditable 的 DOM 由用户输入直接维护，这里只把内容同步成 markdown。
  replaceInlineEdit(htmlToMarkdown(inlineRich.value.innerHTML))
}

function onCodeInput() {
  if (!inlineCode.value) return
  const offset = getCaretOffset(inlineCode.value)
  inlineEditorText.value = inlineCode.value.textContent ?? ''
  replaceInlineEdit(inlineEditorText.value)
  renderInlineCode()
  if (inlineEditorPresentation.value === 'code' || inlineEditorPresentation.value === 'chart' || inlineEditorPresentation.value === 'math') {
    renderInlinePreview(inlineEditorText.value, inlineEditorPresentation.value, inlineCodeLang.value)
  }
  if (inlineCode.value) setCaretOffset(inlineCode.value, offset)
}

function onInlineKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    cancelInlineEditor() // Esc = 取消并还原
  } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    commitInlineEditor() // ⌘/Ctrl+Enter = 完成
  } else if (e.key === 'Tab') {
    // Tab 不应跳出编辑器：代码模式插入两个空格，富文本模式仅吞掉
    e.preventDefault()
    if (inlineEditorMode.value === 'code') document.execCommand('insertText', false, '  ')
  }
}

// 点击编辑框以外的地方（切换到别的卡片 / 点击别处）时，先关闭并把内容flush回预览，
// 避免出现"暂停重挂载"状态被遗留、或新编辑框打开时旧内容还没同步的错乱现象
function onGlobalPointerDown(e: PointerEvent) {
  if (!inlineEditorOpen.value) return
  const target = e.target as HTMLElement | null
  if (target?.closest('.inline-slide-editor')) return
  // 点到另一个可编辑块时交给 onSlideClick 直接切换目标（不走 rebuild），
  // 避免这里先 flush 重挂载、和紧接着打开的新编辑器之间出现竞态导致内容重复
  if (target && host.value?.contains(target) && target.closest('[data-source-line], section[data-start-line]')) return
  commitInlineEditor() // 点击别处=保留关闭（含空块清理）
}

function syncInlineScroll() {
  if (inlineGutter.value && inlineCode.value) inlineGutter.value.scrollTop = inlineCode.value.scrollTop
}

onMounted(() => {
  rebuild(false, true) // 首次挂载播放一次进场动效
  if (stageEl.value) {
    ro = new ResizeObserver(([e]) => {
      stageSize.value = { w: e.contentRect.width, h: e.contentRect.height }
    })
    ro.observe(stageEl.value)
  }
  window.addEventListener('message', onPresenterMessage)
  window.addEventListener('keydown', onPresenterShortcut)
  window.addEventListener('pointerdown', onGlobalPointerDown, true)
  window.addEventListener('morph:export-slide-png', onSlidePngRequest)
})
watch(() => sync.cursorLine, (l) => {
  if (inlineEditorOpen.value || linkEditor.value) return
  handle?.gotoLine(l)
  if (handle) slideIndex.value = handle.currentIndex()
})
// 编辑期间缩放变化时，占位高(=editor offsetHeight / frameScale)随之改变，需要重算
watch(frameScale, () => {
  if (inlineEditorOpen.value) nextTick(syncEditingReserve)
})
let timer: number | undefined
watch(
  () => doc.markdown,
  () => {
    window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      if (inlineEditorOpen.value) return
      // O6 修复：编辑内容后保留当前所在页，避免重渲染把页面甩回首页。
      rebuild(true)
    }, 200)
  },
)
watch(
  () => [theme.effectiveId, ui.slideRatio, activeSkinId.value, ui.slideAnimation, ui.slideEngine, ui.slidevTheme],
  () => {
    window.clearTimeout(timer)
    timer = window.setTimeout(() => rebuild(true), previewSkin.value ? 60 : 120)
  },
)
onBeforeUnmount(() => {
  window.clearTimeout(timer)
  disposeInlinePreview()
  window.removeEventListener('message', onPresenterMessage)
  window.removeEventListener('keydown', onPresenterShortcut)
  window.removeEventListener('pointerdown', onGlobalPointerDown, true)
  window.removeEventListener('morph:export-slide-png', onSlidePngRequest)
  ro?.disconnect()
  editorObserver?.disconnect()
  handle?.destroy()
})

function onPresenterMessage(e: MessageEvent) {
  if (e.origin !== window.location.origin || !e.data?.type) return
  if (e.data.type === 'mddoc-presenter-next') nextSlide()
  if (e.data.type === 'mddoc-presenter-prev') prevSlide()
}

function onPresenterShortcut(e: KeyboardEvent) {
  if (e.key.toLowerCase() !== 's') return
  const target = e.target as HTMLElement | null
  if (target?.closest('input, textarea, [contenteditable="true"], .cm-editor')) return
  e.preventDefault()
  openPresenter()
}
</script>

<template>
  <div class="slide-pane">
    <div class="preview-bar">
      <div class="tool-group">
        <span class="group-label">{{ t('slidePreview.engine') }}</span>
        <span class="ctl">
          <SelectMenu :value="ui.slideEngine" :options="engineOpts" @update="pickEngine" />
        </span>
        <span v-if="ui.slideEngine === 'slidev'" class="ctl" :title="activeSlidevThemeTitle"><span>{{ t('slidePreview.theme') }}</span>
          <SelectMenu :value="ui.slidevTheme" :options="slidevThemeOpts" @update="pickSlidevTheme" />
        </span>
      </div>
      <div v-if="ui.slideEngine !== 'slidev'" class="tool-group style-group">
        <span class="group-label">{{ t('slidePreview.style') }}</span>
        <span class="ctl">
          <SelectMenu
            :value="ui.slideSkin"
            :options="skinOpts"
            @hover="previewSlideSkin"
            @update="pickSlideSkin"
          />
          <span class="style-preview" :style="stylePreview" aria-hidden="true">
            <span class="style-preview-title"></span>
            <span class="style-preview-line"></span>
            <span class="style-preview-block"></span>
          </span>
        </span>
      </div>
      <div class="tool-group">
        <span class="group-label">{{ t('slidePreview.canvas') }}</span>
        <span class="ctl"><span>{{ t('slidePreview.ratio') }}</span>
          <SelectMenu :value="ui.slideRatio" :options="ratioOpts" @update="pickRatio($event as SlideRatio)" />
        </span>
        <span class="ctl"><span>{{ t('slidePreview.animation') }}</span>
          <SelectMenu :value="ui.slideAnimation" :options="animationOpts" @update="ui.setSlideAnimation($event)" />
        </span>
      </div>
      <span class="spacer"></span>
      <div class="tool-group action-group">
        <span class="group-label">{{ t('slidePreview.present') }}</span>
        <button class="present-btn ghost" @click="present('presenter')" :title="t('slidePreview.presenterTip')">
          <Icon name="columns" :size="13" /> {{ t('slidePreview.presenter') }}
        </button>
        <button class="present-btn" @click="present('audience')" :title="t('slidePreview.audienceTip')">
          <Icon name="play" :size="13" /> {{ t('slidePreview.audience') }}
        </button>
      </div>
    </div>
    <div class="slide-stage" :class="{ 'is-presenting': presenting }" ref="stageEl" @wheel="onStageWheelZoom">
      <div class="slide-frame-box" :style="frameBoxStyle">
        <div class="slide-frame" :style="frameStyle">
          <div
              class="slide-frame-inner"
              @pointermove="onHostHover"
              @dragover="onHostDragOver"
              @drop="onHostDrop"
          >
            <div class="slide-host" ref="host" @click.capture="onSlideClick" @contextmenu="onTableContextMenu"></div>
          </div>
          <!-- 页内块拖拽手柄 + 落点指示 -->
          <div
              v-if="dragHandle && !presenting"
              class="block-drag-handle"
              :class="{ active: dragging }"
              draggable="true"
              :style="{ left: dragHandle.x + 'px', top: dragHandle.y + 'px', height: dragHandle.h + 'px' }"
              :title="t('slidePreview.dragBlock')"
              @dragstart="onHandleDragStart"
              @dragend="resetDrag"
          >⠿
          </div>
          <div v-if="dragging && dropY != null" class="block-drop-line" :style="{ top: dropY + 'px' }"></div>
          <Transition name="ise-pop">
            <div
              v-if="inlineEditorOpen"
              ref="inlineEditorEl"
              class="inline-slide-editor"
              :style="{
                left: inlineEditorPos.x + 'px',
                top: inlineEditorPos.y + 'px',
                width: inlineEditorPos.width + 'px',
                '--ise-scale': String(1 / (frameScale || 1)),
              }"
            >
              <div class="ise-toolbar" :class="{ below: toolbarBelow }">
                <div class="ise-format">
                  <button type="button" class="ise-fmt" :title="t('editor.bold')" @mousedown.prevent @click="applySlidePreviewFormat('bold')"><Icon name="bold" :size="14" /></button>
                  <button type="button" class="ise-fmt" :title="t('editor.italic')" @mousedown.prevent @click="applySlidePreviewFormat('italic')"><Icon name="italic" :size="14" /></button>
                  <button type="button" class="ise-fmt" :title="t('editor.strike')" @mousedown.prevent @click="applySlidePreviewFormat('strike')"><Icon name="strike" :size="14" /></button>
                  <button type="button" class="ise-fmt" :title="t('editor.inlineCode')" @mousedown.prevent @click="applySlidePreviewFormat('code')"><Icon name="code" :size="14" /></button>
                  <button type="button" class="ise-fmt" :title="t('editor.link')" @mousedown.prevent @click="applySlidePreviewFormat('link')"><Icon name="link" :size="14" /></button>
                </div>
                <span class="ise-sep"></span>
                <span class="ise-kind">{{ editKindLabel }}</span>
                <span class="ise-hint">{{ t('slidePreview.hotkeyDone', { hotkey: hotkeyHint }) }}</span>
                <span class="ise-spacer"></span>
                <button class="ise-btn" type="button" @mousedown.prevent @click="cancelInlineEditor">{{ t('slidePreview.cancel') }}</button>
                <button class="ise-btn primary" type="button" @mousedown.prevent @click="commitInlineEditor">{{ t('slidePreview.done') }}</button>
              </div>
              <div v-if="inlineEditorMode === 'code'" class="ise-body">
                <div ref="inlineGutter" class="ise-gutter">
                  <span v-for="lineNo in inlineLineNumbers" :key="lineNo">{{ lineNo }}</span>
                </div>
                <div
                  ref="inlineCode"
                  class="ise-code"
                  contenteditable="plaintext-only"
                  spellcheck="false"
                  @input="onCodeInput"
                  @keydown="onInlineKeydown"
                  @scroll="syncInlineScroll"
                ></div>
                <div
                  v-if="inlineEditorPresentation === 'code' || inlineEditorPresentation === 'chart' || inlineEditorPresentation === 'math'"
                  class="ise-preview"
                  :class="`ise-preview-${inlineEditorPresentation}`"
                  @pointerdown.stop
                >
                  <div class="ise-preview-tab">{{ t('previewControls.renderedPreview') }}</div>
                  <div ref="inlinePreviewEl" class="ise-preview-body"></div>
                </div>
              </div>
              <div
                v-else
                ref="inlineRich"
                class="ise-rich doc-preview"
                contenteditable="true"
                spellcheck="false"
                v-html="inlineEditorHtml"
                @input="onRichInput"
                @keydown="onInlineKeydown"
              ></div>
            </div>
          </Transition>
        </div>
      </div>

      <!-- 全屏演示覆盖层（在 .slide-stage 内，全屏时可见） -->
      <div
        v-if="presenting"
        class="present-overlay"
        :class="[`pm-${presentMode}`, { 'controls-hidden': controlsHidden }]"
        @mousemove="onLaserMove"
      >
        <!-- 观众视角：透明点击层，点幻灯片空白处翻到下一张（在控制条之下、内容之上） -->
        <div v-if="presentMode === 'audience'" class="aud-clickcatch" @click="onPresentClick"></div>
        <div v-if="blackout" class="present-blackout" @click="blackout = false"></div>
        <div v-if="whiteout" class="present-whiteout" @click="whiteout = false"></div>

        <!-- ===== 观众视角 ===== -->
        <template v-if="presentMode === 'audience'">
          <div class="aud-badge"><span class="live-dot"></span>{{ t('slidePreview.live') }}</div>
          <div class="aud-rail">
            <button v-for="i in slideTotal" :key="i" class="aud-rail-dot" :class="{ on: i - 1 === slideIndex }" :title="t('slidePreview.pageN', { n: i })" @click="presentGoTo(i - 1)"></button>
          </div>
          <div class="aud-foot"><AppLogo :size="20" /> <span class="aud-brand">墨形 MorphDraft</span> <span class="aud-foot-sep"></span> <span class="aud-doc">{{ docTitle }}</span></div>
          <div class="aud-pageno">{{ String(slideIndex + 1).padStart(2, '0') }}</div>
          <span v-if="laserOn" class="laser-dot" :style="{ left: laserPos.x + 'px', top: laserPos.y + 'px' }"></span>

          <div v-if="showNotes" class="present-notes aud-notes">
            <div class="pn-title">{{ t('slidePreview.notesTitle', { n: slideIndex + 1 }) }}</div>
            <div v-if="currentNotesHtml" class="pn-body doc-preview" v-html="currentNotesHtml"></div>
            <div v-else class="pn-empty">{{ t('slidePreview.noNotes') }}</div>
          </div>

          <div class="present-bar aud-bar">
            <button class="pp-btn" @click="prevSlide" :title="`${t('slidePreview.previous')} (←)`"><Icon name="chevron-right" :size="18" style="transform:rotate(180deg)" /></button>
            <span class="pp-page">{{ slideIndex + 1 }} / {{ slideTotal }}</span>
            <button class="pp-btn" @click="nextSlide" :title="`${t('slidePreview.next')} (→)`"><Icon name="chevron-right" :size="18" /></button>
            <span class="pp-sep"></span>
            <button class="pp-btn ic" :class="{ on: showOverview }" :title="`${t('slidePreview.overview')} (G)`" @click="showOverview = !showOverview"><Icon name="table" :size="16" /></button>
            <button class="pp-btn ic" :class="{ on: laserOn }" :title="t('slidePreview.laserPointer')" @click="laserOn = !laserOn"><Icon name="pointer" :size="16" /></button>
            <button class="pp-btn ic" :class="{ on: showNotes }" :title="`${t('slidePreview.notes')} (N)`" @click="showNotes = !showNotes"><Icon name="message" :size="16" /></button>
            <span class="pp-timer"><Icon name="timer" :size="15" /> {{ elapsedLabel }}</span>
            <span class="pp-sep"></span>
            <button class="pp-btn ic" :title="`${t('slidePreview.presenterView')} (P)`" @click="switchPresentMode"><Icon name="monitor" :size="16" /></button>
            <button class="pp-btn ic" :class="{ on: showHelp }" :title="`${t('slidePreview.shortcuts')} (?)`" @click="showHelp = !showHelp">?</button>
            <button class="pp-btn ic pp-exit" :title="`${t('slidePreview.exit')} (Esc)`" @click="exitPresent"><Icon name="close" :size="16" /></button>
          </div>
        </template>

        <!-- ===== 演讲者视角 ===== -->
        <div v-else class="presenter">
          <div class="pr-top">
            <span class="pr-brand"><AppLogo :size="20" /> <span class="pr-name">墨形 MorphDraft</span> <span class="pr-divider"></span> <span class="pr-mode">{{ t('slidePreview.presenterMode') }}</span></span>
            <span class="pr-title">{{ docTitle }}</span>
            <span class="pr-right">
              <span class="pr-conn"><span class="live-dot"></span>{{ t('slidePreview.audienceConnected') }}</span>
              <span class="pr-clock">{{ wallClock }}</span>
              <button class="pr-end" @click="exitPresent">{{ t('slidePreview.endPresentation') }}</button>
            </span>
          </div>
          <div class="pr-body">
            <div class="pr-current">
              <div class="pr-label">{{ t('slidePreview.currentSlide') }} · {{ slideIndex + 1 }} / {{ slideTotal }}</div>
              <div class="mini-box" :style="miniVars"><div class="mini-surface reveal" :class="miniSkinClass" :style="miniSkinStyle" v-html="overviewPages[slideIndex]?.html"></div></div>
            </div>
            <div class="pr-side">
              <div class="pr-next">
                <div class="pr-label">{{ t('slidePreview.nextSlide') }} · {{ hasNext ? (slideIndex + 2) + ' ' + nextTitle : t('slidePreview.end') }}</div>
                <div v-if="hasNext" class="mini-box sm" :style="miniVars"><div class="mini-surface reveal" :class="miniSkinClass" :style="miniSkinStyle" v-html="nextSlideHtml"></div></div>
                <div v-else class="pr-end-card">{{ t('slidePreview.presentationEnded') }}</div>
              </div>
              <div class="pr-notes">
                <div class="pr-notes-head">{{ t('slidePreview.notes') }} <button class="pr-aplus" :title="t('slidePreview.increaseNotesFont')" @click="bumpNotesFont(0.1)">A+</button></div>
                <div v-if="currentNotesHtml" class="pr-notes-body doc-preview" :style="{ fontSize: notesFontScale + 'em' }" v-html="currentNotesHtml"></div>
                <div v-else class="pn-empty">{{ t('slidePreview.noNotes') }}</div>
              </div>
            </div>
          </div>
          <div class="pr-bar">
            <div class="pr-stats">
              <span class="pr-stat"><b>{{ elapsedLabel }}</b><i>{{ t('slidePreview.elapsed') }}</i></span>
              <span class="pr-stat"><b>{{ remainingLabel }}</b><i>{{ t('slidePreview.remaining') }}</i></span>
              <span class="pr-stat pr-stat-prog"><b>{{ slideIndex + 1 }} / {{ slideTotal }}</b><i>{{ t('slidePreview.progress') }}</i>
                <span class="pr-progress"><span :style="{ width: (slideTotal > 1 ? (slideIndex / (slideTotal - 1) * 100) : 0) + '%' }"></span></span>
              </span>
            </div>
            <div class="pr-controls">
              <button class="pp-btn lbl" @click="prevSlide">{{ t('slidePreview.previousPage') }}</button>
              <button class="pp-btn lbl" @click="nextSlide">{{ t('slidePreview.nextPage') }}</button>
              <button class="pp-btn lbl" :class="{ on: showOverview }" @click="showOverview = !showOverview"><Icon name="table" :size="15" /> {{ t('slidePreview.overviewShort') }}</button>
              <button class="pp-btn lbl" :class="{ on: laserOn }" @click="laserOn = !laserOn"><Icon name="pointer" :size="15" /> {{ t('slidePreview.laser') }}</button>
              <button class="pp-btn lbl" :class="{ on: blackout }" @click="blackout = !blackout"><Icon name="eye" :size="15" /> {{ t('slidePreview.blackout') }}</button>
              <button class="pp-btn lbl" @click="switchPresentMode"><Icon name="monitor" :size="15" /> {{ t('slidePreview.audienceView') }}</button>
              <button class="pp-btn lbl" :class="{ on: showHelp }" @click="showHelp = !showHelp">? {{ t('slidePreview.shortcuts') }}</button>
            </div>
            <div class="pr-tail">
              <span class="pr-fontctl">{{ t('slidePreview.notesFont') }} <button @click="bumpNotesFont(-0.1)">A-</button><button @click="bumpNotesFont(0.1)">A+</button></span>
              <span class="pr-stable"><Icon name="check" :size="13" /> {{ t('slidePreview.autoLayoutStable') }}</span>
            </div>
          </div>
        </div>

        <!-- ===== 幻灯片总览（两视角共用） ===== -->
        <div v-if="showOverview" class="present-overview" @click.self="showOverview = false">
          <div class="ov-head">{{ t('slidePreview.overviewTitle', { count: slideTotal }) }}</div>
          <div class="ov-grid">
            <button v-for="p in overviewPages" :key="p.i" class="ov-card" :class="{ on: p.i === slideIndex }" @click="presentGoTo(p.i)">
              <span class="ov-idx">{{ p.i + 1 }}</span>
              <div class="mini-box" :style="miniVars"><div class="mini-surface reveal" :class="miniSkinClass" :style="miniSkinStyle" v-html="p.html"></div></div>
              <span class="ov-title">{{ p.title }}</span>
            </button>
          </div>
        </div>

        <!-- ===== 快捷键帮助（两视角共用，? 唤出） ===== -->
        <div v-if="showHelp" class="present-help" @click.self="showHelp = false">
          <div class="ph-card">
            <div class="ph-head">{{ t('slidePreview.shortcuts') }}</div>
            <ul class="ph-list">
              <li><kbd class="md-kbd">→</kbd><kbd class="md-kbd">Space</kbd><span>{{ t('slidePreview.shortcutNext') }}</span></li>
              <li><kbd class="md-kbd">←</kbd><span>{{ t('slidePreview.shortcutPrev') }}</span></li>
              <li><kbd class="md-kbd">Home</kbd><kbd class="md-kbd">End</kbd><span>{{ t('slidePreview.shortcutHomeEnd') }}</span></li>
              <li><kbd class="md-kbd">G</kbd><span>{{ t('slidePreview.shortcutOverview') }}</span></li>
              <li><kbd class="md-kbd">N</kbd><span>{{ t('slidePreview.shortcutNotes') }}</span></li>
              <li><kbd class="md-kbd">P</kbd><span>{{ t('slidePreview.shortcutSwitchView') }}</span></li>
              <li><kbd class="md-kbd">B</kbd><kbd class="md-kbd">W</kbd><span>{{ t('slidePreview.shortcutBlackWhite') }}</span></li>
              <li><kbd class="md-kbd">Esc</kbd><span>{{ t('slidePreview.shortcutExit') }}</span></li>
              <li><kbd class="md-kbd">?</kbd><span>{{ t('slidePreview.shortcutToggleHelp') }}</span></li>
            </ul>
            <div class="ph-foot">{{ t('slidePreview.clickToNext') }}</div>
          </div>
        </div>
      </div>
    </div>
    <SlideNavigator
      :active="slideIndex"
      :display-pages="displayPages"
      @select="selectPreviewPage"
      @export-png="exportSlidePages"
    />
    <LinkEditorPopover
      v-if="linkEditor"
      :anchor="linkEditor.anchor"
      :fields="linkEditor.fields"
      @cancel="linkEditor = null"
      @done="saveLink"
    />
    <TableContextMenu
      v-if="tableMenu"
      :x="tableMenu.x"
      :y="tableMenu.y"
      :can-delete-row="tableMenu.bodyIndex >= 0"
      :can-move-row-up="tableMenu.bodyIndex > 0"
      :can-move-row-down="tableMenu.bodyIndex >= 0 && tableMenu.bodyIndex < tableMenu.model.rows.length - 1"
      :can-move-col-left="tableMenu.col > 0"
      :can-move-col-right="tableMenu.col < tableMenu.model.header.length - 1"
      :can-delete-col="tableMenu.model.header.length > 1"
      @op="onTableMenuOp"
      @close="tableMenu = null"
    />
  </div>
</template>

<style scoped>
.slide-pane {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  /* 整个幻灯片面板统一一种中性底，只让幻灯片卡片凸出，杜绝多层背景叠加 */
  background: var(--app-shell-bg);
}
.preview-bar {
  flex: 0 0 auto;
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--app-hairline);
  background: var(--app-shell-bg);
  position: relative;
  z-index: 12;
  overflow-x: auto;
  scrollbar-width: none;
}
.preview-bar::-webkit-scrollbar { display: none; }
.tool-group {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 4px 8px;
  border: 1px solid var(--app-control-border);
  border-radius: var(--radius-lg);
  background: var(--app-control-bg);
  box-shadow: 0 1px 0 var(--app-edge) inset;
  white-space: nowrap;
}
.style-group { padding-right: 7px; }
.action-group { margin-left: 0; }
.group-label {
  font-size: 11px;
  font-weight: 800;
  color: color-mix(in srgb, var(--app-primary-color) 72%, var(--app-muted));
}
.spacer { flex: 1 1 auto; }
.present-btn {
  display: inline-flex; align-items: center; gap: 5px;
  font: inherit; font-size: 11px; font-weight: 700;
  padding: 5px 12px; border-radius: var(--radius-md);
  border: 1px solid var(--app-primary-color);
  background: var(--app-primary-color); color: #fff;
  cursor: pointer; transition: all 0.12s ease;
  box-shadow: 0 1px 2px color-mix(in srgb, var(--app-primary-color) 40%, transparent);
}
.present-btn:hover { background: color-mix(in srgb, var(--app-primary-color) 88%, #000); }
.present-btn.ghost {
  background: var(--app-elevated); color: var(--app-fg-soft);
  border-color: var(--app-control-border); box-shadow: none;
}
.present-btn.ghost:hover { color: var(--app-primary-color); border-color: color-mix(in srgb, var(--app-primary-color) 45%, var(--app-border)); background: var(--app-hover); }

/* ===================== 全屏演示覆盖层 ===================== */
.present-overlay { position: absolute; inset: 0; z-index: 60; pointer-events: none; color: #fff; }
.present-blackout { position: absolute; inset: 0; background: #000; z-index: 80; pointer-events: auto; }
.present-whiteout { position: absolute; inset: 0; background: #fff; z-index: 80; pointer-events: auto; }
/* 观众视角点击翻页层：在控制条(z70+)之下、幻灯片之上 */
.aud-clickcatch { position: absolute; inset: 0; z-index: 62; pointer-events: auto; cursor: pointer; }
.present-overlay.controls-hidden .aud-clickcatch { cursor: none; }
/* 观众视角静止自动隐藏控件 + 光标 */
.present-overlay.controls-hidden { cursor: none; }
.present-overlay.controls-hidden .aud-badge,
.present-overlay.controls-hidden .aud-rail,
.present-overlay.controls-hidden .aud-foot,
.present-overlay.controls-hidden .aud-pageno,
.present-overlay.controls-hidden .present-bar {
  opacity: 0 !important;
  pointer-events: none !important;
  transition: opacity .35s ease;
}
/* 快捷键帮助浮层 */
.present-help {
  position: absolute; inset: 0; z-index: 90; display: grid; place-items: center;
  background: color-mix(in srgb, var(--app-shell-bg) 58%, transparent);
  backdrop-filter: blur(8px) saturate(1.08);
  pointer-events: auto;
}
.ph-card {
  width: min(430px, 86%); padding: 20px 22px; border-radius: 16px;
  background: var(--app-menu-bg); color: var(--app-fg);
  border: 1px solid var(--app-control-border);
  box-shadow: 0 24px 60px color-mix(in srgb, var(--app-fg) 18%, transparent);
}
.ph-head { font-size: 16px; font-weight: 800; margin-bottom: 14px; }
.ph-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 9px; }
.ph-list li { display: flex; align-items: center; gap: 6px; font-size: 13px; }
.ph-list li span { color: var(--app-muted); margin-left: 6px; }
.ph-list kbd { min-width: 22px; text-align: center; }
.ph-foot {
  margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--app-control-border);
  font-size: 12px; color: var(--app-muted);
}
.live-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--app-primary-color); box-shadow: 0 0 0 3px color-mix(in srgb, var(--app-primary-color) 22%, transparent); }

/* 缩略图缩放盒（当前/下一张/总览共用） */
.mini-box {
  position: relative; width: 100%;
  aspect-ratio: var(--slide-w) / var(--slide-h);
  overflow: hidden; border-radius: 12px; background: #fff;
  border: 1px solid color-mix(in srgb, #000 10%, transparent);
  box-shadow: 0 8px 30px rgba(15,23,42,.14);
}
.mini-box.sm { border-radius: 10px; box-shadow: 0 4px 14px rgba(15,23,42,.12); }
.mini-surface { width: 100%; height: 100%; pointer-events: none; }
.mini-surface :deep(.slide-surface) {
  width: var(--slide-w); height: var(--slide-h); min-height: var(--slide-h);
  transform: scale(var(--ms, 0.2)); transform-origin: top left;
  box-shadow: none !important;
}

/* ---------- 观众视角 ---------- */
.aud-badge {
  position: absolute; top: 22px; right: 30px; z-index: 70; pointer-events: none;
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 14px; font-weight: 700; color: var(--app-fg-soft);
}
.aud-rail { position: absolute; left: 28px; top: 50%; transform: translateY(-50%); z-index: 70; display: flex; flex-direction: column; gap: 12px; pointer-events: auto; }
.aud-rail-dot { width: 8px; height: 8px; padding: 0; border: 0; border-radius: 50%; cursor: pointer; background: color-mix(in srgb, var(--app-fg) 18%, transparent); transition: all .14s ease; }
.aud-rail-dot:hover { background: color-mix(in srgb, var(--app-primary-color) 50%, transparent); }
.aud-rail-dot.on { background: var(--app-primary-color); box-shadow: 0 0 0 4px color-mix(in srgb, var(--app-primary-color) 18%, transparent); }
.aud-foot { position: absolute; left: 40px; bottom: 30px; z-index: 70; display: inline-flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 700; color: var(--app-fg); pointer-events: none; }
.aud-brand { color: var(--app-fg); }
.aud-foot-sep { width: 1px; height: 16px; background: color-mix(in srgb, var(--app-fg) 24%, transparent); }
.aud-doc { color: var(--app-primary-color); }
.aud-pageno { position: absolute; right: 40px; bottom: 30px; z-index: 70; font-size: 22px; font-weight: 800; color: color-mix(in srgb, var(--app-fg) 70%, transparent); font-variant-numeric: tabular-nums; pointer-events: none; }
.laser-dot { position: absolute; z-index: 75; width: 16px; height: 16px; margin: -8px 0 0 -8px; border-radius: 50%; background: var(--app-primary-color); box-shadow: 0 0 0 6px color-mix(in srgb, var(--app-primary-color) 24%, transparent), 0 0 18px 4px color-mix(in srgb, var(--app-primary-color) 50%, transparent); pointer-events: none; }

/* 底部控制条（深色玻璃） */
.present-bar {
  position: absolute; left: 50%; bottom: 26px; transform: translateX(-50%); z-index: 72;
  display: inline-flex; align-items: center; gap: 8px;
  padding: 8px 14px; border-radius: 999px;
  background: color-mix(in srgb, #1a1f2e 78%, transparent);
  backdrop-filter: blur(10px);
  box-shadow: 0 12px 34px rgba(0,0,0,0.4);
  pointer-events: auto; opacity: 0.55; transition: opacity .2s ease;
}
.present-overlay:hover .present-bar { opacity: 1; }
.pp-btn {
  display: inline-flex; align-items: center; gap: 5px;
  font: inherit; font-size: 12px; font-weight: 700; line-height: 1;
  height: 32px; padding: 0 11px;
  border: 0; border-radius: 999px;
  background: rgba(255,255,255,0.10); color: #fff;
  cursor: pointer; transition: background .12s ease;
}
.pp-btn.ic { padding: 0; width: 32px; justify-content: center; }
.pp-btn:hover { background: rgba(255,255,255,0.24); }
.pp-btn.on { background: var(--app-primary-color); }
.pp-page { color: #fff; font-size: 12px; font-weight: 800; padding: 0 4px; font-variant-numeric: tabular-nums; }
.pp-timer { display: inline-flex; align-items: center; gap: 5px; color: #fff; font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; padding: 0 4px; }
.pp-sep { width: 1px; height: 18px; background: rgba(255,255,255,0.22); margin: 0 2px; }
.pp-exit:hover { background: #e5484d; }

/* 观众视角备注浮层 */
.present-notes {
  position: absolute; right: 30px; bottom: 90px; width: 380px; max-height: 46vh; overflow: auto; z-index: 73;
  padding: 16px 18px; border-radius: 14px;
  background: color-mix(in srgb, #1a1f2e 82%, transparent);
  backdrop-filter: blur(12px); color: #fff; pointer-events: auto;
  box-shadow: 0 16px 40px rgba(0,0,0,0.5);
}
.pn-title { font-size: 12px; font-weight: 800; opacity: 0.7; margin-bottom: 10px; letter-spacing: 0.03em; }
.pn-body { color: #fff; font-size: 15px; line-height: 1.7; }
.pn-body :deep(*) { color: #fff !important; }
.pn-empty { font-size: 13px; opacity: 0.6; line-height: 1.6; }

/* ---------- 演讲者视角 ---------- */
.presenter {
  position: absolute; inset: 0; z-index: 78; pointer-events: auto;
  display: grid; grid-template-rows: auto 1fr auto;
  background: var(--app-shell-bg); color: var(--app-fg);
}
.pr-top {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 12px 20px; border-bottom: 1px solid var(--app-hairline); background: var(--app-elevated);
}
.pr-brand { display: inline-flex; align-items: center; gap: 8px; font-weight: 800; font-size: 14px; }
.pr-divider { width: 1px; height: 16px; background: color-mix(in srgb, var(--app-fg) 22%, transparent); }
.pr-mode { font-size: 13px; font-weight: 700; color: var(--app-muted); }
.pr-title { font-size: 14px; font-weight: 700; color: var(--app-fg-soft); }
.pr-right { display: inline-flex; align-items: center; gap: 14px; }
.pr-icon-btn { display: inline-grid; place-items: center; width: 30px; height: 30px; border: 0; border-radius: 8px; background: transparent; color: var(--app-muted); cursor: pointer; transition: color .12s ease, background .12s ease; }
.pr-icon-btn:hover { color: var(--app-primary-color); background: var(--app-hover); }
.pr-aplus { font: inherit; font-size: 11px; font-weight: 800; padding: 2px 8px; border-radius: 6px; cursor: pointer; border: 1px solid var(--app-control-border); background: var(--app-control-bg); color: var(--app-fg-soft); }
.pr-aplus:hover { color: var(--app-primary-color); border-color: color-mix(in srgb, var(--app-primary-color) 40%, var(--app-border)); }
.pr-conn { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 700; color: var(--app-muted); }
.pr-conn .live-dot { background: #16a34a; box-shadow: 0 0 0 3px color-mix(in srgb, #16a34a 22%, transparent); }
.pr-clock { font-size: 13px; font-weight: 700; color: var(--app-fg-soft); font-variant-numeric: tabular-nums; }
.pr-end { font: inherit; font-size: 13px; font-weight: 700; padding: 7px 16px; border-radius: 9px; cursor: pointer; color: #e5484d; border: 1px solid color-mix(in srgb, #e5484d 45%, transparent); background: color-mix(in srgb, #e5484d 8%, transparent); }
.pr-end:hover { color: #fff; background: #e5484d; }
.pr-body { display: grid; grid-template-columns: 1.4fr 1fr; gap: 18px; padding: 18px 20px; min-height: 0; }
.pr-current { display: flex; flex-direction: column; gap: 10px; min-height: 0; }
.pr-side { display: grid; grid-template-rows: auto 1fr; gap: 16px; min-height: 0; }
.pr-next { display: flex; flex-direction: column; gap: 8px; }
.pr-label { font-size: 12px; font-weight: 800; color: var(--app-muted); letter-spacing: .02em; }
.pr-current .mini-box { flex: 0 1 auto; max-height: 100%; }
.pr-end-card { aspect-ratio: 16/9; display: grid; place-items: center; border-radius: 10px; background: color-mix(in srgb, var(--app-fg) 5%, var(--app-elevated)); color: var(--app-muted); font-weight: 700; }
.pr-notes { min-height: 0; display: flex; flex-direction: column; padding: 14px 16px; border-radius: 14px; background: var(--app-elevated); border: 1px solid var(--app-hairline); }
.pr-notes-head { display: flex; align-items: center; justify-content: space-between; font-size: 13px; font-weight: 800; margin-bottom: 8px; }
.pr-font { display: inline-flex; gap: 4px; }
.pr-font button, .pr-notes-head .pr-font button { font: inherit; font-size: 11px; font-weight: 700; width: 26px; height: 22px; border-radius: 6px; cursor: pointer; border: 1px solid var(--app-control-border); background: var(--app-control-bg); color: var(--app-fg-soft); }
.pr-notes-body { overflow: auto; line-height: 1.7; color: var(--app-fg); }
.pr-bar {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 12px 20px; border-top: 1px solid var(--app-hairline); background: var(--app-elevated);
}
.pr-stats { display: inline-flex; gap: 22px; }
.pr-stat { display: inline-flex; flex-direction: column; line-height: 1.1; }
.pr-stat b { font-size: 22px; font-weight: 800; font-variant-numeric: tabular-nums; color: var(--app-fg); }
.pr-stat i { font-size: 11px; font-weight: 700; font-style: normal; color: var(--app-muted); margin-top: 3px; }
.pr-stat-prog { min-width: 96px; }
.pr-progress { margin-top: 6px; height: 4px; border-radius: 999px; background: color-mix(in srgb, var(--app-primary-color) 14%, transparent); overflow: hidden; }
.pr-progress > span { display: block; height: 100%; border-radius: 999px; background: var(--app-primary-color); transition: width .25s ease; }
.pr-controls { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: center; }
.pr-controls .pp-btn { background: var(--app-control-bg); color: var(--app-fg-soft); border: 1px solid var(--app-control-border); }
.pr-controls .pp-btn.lbl { padding: 0 12px; }
.pr-controls .pp-btn:hover { color: var(--app-primary-color); border-color: color-mix(in srgb, var(--app-primary-color) 40%, var(--app-border)); background: var(--app-hover); }
.pr-controls .pp-btn.on { color: #fff; background: var(--app-primary-color); border-color: var(--app-primary-color); }
.pr-tail { display: inline-flex; align-items: center; gap: 16px; }
.pr-fontctl { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: var(--app-muted); }
.pr-fontctl button { font: inherit; font-size: 11px; font-weight: 700; width: 28px; height: 26px; border-radius: 7px; cursor: pointer; border: 1px solid var(--app-control-border); background: var(--app-control-bg); color: var(--app-fg-soft); }
.pr-fontctl button:hover { color: var(--app-primary-color); border-color: color-mix(in srgb, var(--app-primary-color) 40%, var(--app-border)); }
.pr-stable { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: #16a34a; }

/* ---------- 幻灯片总览 ---------- */
.present-overview {
  position: absolute; inset: 0; z-index: 85; pointer-events: auto;
  background: color-mix(in srgb, #0b1020 86%, transparent); backdrop-filter: blur(6px);
  padding: 56px 64px; overflow: auto;
}
.ov-head { color: #fff; font-size: 14px; font-weight: 800; margin-bottom: 20px; opacity: .85; }
.ov-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; }
.ov-card { position: relative; display: flex; flex-direction: column; gap: 8px; padding: 0; border: 0; background: none; cursor: pointer; text-align: left; }
.ov-card .mini-box { border: 2px solid transparent; transition: border-color .12s ease, transform .12s ease; }
.ov-card:hover .mini-box { transform: translateY(-2px); }
.ov-card.on .mini-box { border-color: var(--app-primary-color); box-shadow: 0 0 0 4px color-mix(in srgb, var(--app-primary-color) 28%, transparent); }
.ov-idx { position: absolute; left: 8px; top: 8px; z-index: 2; min-width: 18px; height: 18px; padding: 0 5px; display: grid; place-items: center; font-size: 11px; font-weight: 800; color: #fff; border-radius: 6px; background: color-mix(in srgb, #000 50%, transparent); }
.ov-card.on .ov-idx { background: var(--app-primary-color); }
.ov-title { font-size: 12px; font-weight: 700; color: #fff; opacity: .85; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.presenter-btn:hover { color: var(--app-primary-color); border-color: var(--app-primary-color); }
.ctl { display: inline-flex; align-items: center; gap: 6px; font-size: var(--font-size-xs); font-weight: 650; color: var(--app-muted); }
.mode-tools {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  min-width: 0;
}
.ctl select {
  font: inherit; font-size: var(--font-size-xs); font-weight: 650; color: var(--app-fg);
  padding: 5px 8px; border: 1px solid var(--app-control-border);
  border-radius: var(--radius-md); background: var(--app-elevated); cursor: pointer;
}
.ctl select:hover { border-color: color-mix(in srgb, var(--app-primary-color) 45%, var(--app-border)); }
.style-preview {
  width: 54px;
  height: 30px;
  border-radius: var(--radius-sm);
  box-sizing: border-box;
  padding: 5px;
  display: grid;
  grid-template-rows: 5px 4px 1fr;
  gap: 3px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--preview-primary) 18%, transparent), transparent 58%),
    var(--preview-bg);
  border: 1px solid color-mix(in srgb, var(--preview-primary) 30%, var(--app-border));
  box-shadow: var(--shadow-sm);
}
.style-preview-title {
  width: 42%;
  border-radius: 3px;
  background: var(--preview-primary);
}
.style-preview-line {
  width: 76%;
  border-radius: 3px;
  background: color-mix(in srgb, var(--preview-fg) 42%, transparent);
}
.style-preview-block {
  width: 100%;
  border-radius: 3px;
  background: color-mix(in srgb, var(--preview-panel) 74%, transparent);
  border: 1px solid color-mix(in srgb, var(--preview-primary) 20%, transparent);
}
.slide-stage {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  display: grid;
  place-items: center;
  padding: 28px;
  /* 与外壳一致的中性背景：幻灯片只是它上面的"一张卡片"，不再是白框套深框的多层观感 */
  background: var(--app-shell-bg);
  box-sizing: border-box;
  overflow: auto;
  scrollbar-width: thin;
  position: relative;
}
/* 全屏演示：纯黑底、去内边距，幻灯片居中铺满（保持比例，黑边留白） */
.slide-stage:fullscreen { background: #000; padding: 0; }
.slide-frame {
  position: relative;
  transform-origin: top left;
}
/* 圆角裁切 + 柔和阴影单独放内层包一层，.slide-frame 本身不再 overflow:hidden，
   这样挂在它下面的行内编辑浮层（按自然字号渲染，常比缩小后的原内容大）才不会被裁掉 */
.slide-frame-inner {
  width: 100%;
  height: 100%;
  background: var(--bg);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-paper);
  overflow: hidden;
}
.slide-frame-box {
  position: relative;
}
.slide-host {
  width: 100%;
  height: 100%;
  position: relative;
}
/* 放映态恢复 fragment 分步：未 .visible 的分步块隐藏（比 slides.css 的默认全显更具体，故生效） */
.slide-stage.is-presenting :deep(.reveal .fragment:not(.visible)) {
  opacity: 0 !important;
  visibility: hidden !important;
}

/* 页内块拖拽手柄：hover 某块时浮现在其左侧 */
.block-drag-handle {
  position: absolute;
  z-index: 6;
  width: 22px;
  min-height: 20px;
  display: grid;
  place-items: center;
  border-radius: 6px;
  background: color-mix(in srgb, var(--app-primary-color) 12%, var(--app-elevated));
  border: 1px solid color-mix(in srgb, var(--app-primary-color) 32%, var(--app-border));
  color: var(--app-primary-color);
  font-size: 13px;
  line-height: 1;
  cursor: grab;
  user-select: none;
  box-shadow: var(--shadow-sm);
  transition: background .12s ease, box-shadow .12s ease;
}

.block-drag-handle:hover {
  background: color-mix(in srgb, var(--app-primary-color) 20%, var(--app-elevated));
}

.block-drag-handle.active {
  cursor: grabbing;
}

/* 落点指示线 */
.block-drop-line {
  position: absolute;
  left: 0;
  right: 0;
  height: 3px;
  z-index: 6;
  border-radius: 999px;
  background: var(--app-primary-color);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--app-primary-color) 18%, transparent);
  pointer-events: none;
}
/* 行内编辑期间把原内容彻底从版面中移除（而非只调透明度），
   避免编辑框变高/变宽时与卡片里其它内容压在一起 */
/* 编辑期间原内容隐去，但保留一段「占位高度」(= 编辑器高度，由 JS 写入 --ise-reserve)，
   让后续内容正好落在浮层编辑器下方：既不被遮挡，也不留下原块（如高图表）那一大片空白。 */
/* 可编辑块的 hover 提示：克制的浅底高亮 + 文本光标，暗示「点击可原地编辑」 */
.slide-host :deep(.slide-body > [data-source-line]) {
  border-radius: 5px;
  transition: background 0.12s ease, box-shadow 0.12s ease;
}
.slide-host :deep(.slide-body > [data-source-line]:hover) {
  background: color-mix(in srgb, var(--app-primary-color) 7%, transparent);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--app-primary-color) 7%, transparent);
  cursor: text;
}
.slide-host :deep(.slide-editing-target) {
  display: block;
  height: var(--ise-reserve, 0) !important;
  min-height: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  overflow: hidden !important;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s ease;
}
.ise-pop-enter-active {
  transition: opacity 0.14s ease, transform 0.14s cubic-bezier(0.2, 0.8, 0.3, 1.1);
}
.ise-pop-leave-active {
  transition: opacity 0.1s ease, transform 0.1s ease;
}
.ise-pop-enter-from,
.ise-pop-leave-to {
  opacity: 0;
  transform: scale(calc(var(--ise-scale, 1) * 0.98)) translateY(-2px);
}
.inline-slide-editor {
  position: absolute;
  z-index: 18;
  min-width: 260px;
  border: 0;
  border-radius: 0;
  overflow: visible;
  background: transparent;
  box-shadow: none;
  transform-origin: top left;
  /* 用 1/frameScale 的反向缩放抵消父级 .slide-frame 的 transform:scale，
     使编辑框始终按自然字号渲染，且位置随画布缩放实时跟随 */
  transform: scale(var(--ise-scale, 1));
}
/* 编辑工具条：浮在编辑器上方，不挤压编辑区 */
.ise-toolbar {
  position: absolute;
  left: 0;
  bottom: 100%;
  margin-bottom: 7px;
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  padding: 5px 6px 5px 10px;
  border-radius: 9px;
  background: var(--app-menu-bg);
  border: 1px solid var(--app-control-border);
  box-shadow: 0 8px 22px -12px rgba(15, 23, 42, 0.4);
  white-space: nowrap;
  user-select: none;
}
.ise-toolbar.below {
  bottom: auto;
  top: 100%;
  margin-bottom: 0;
  margin-top: 7px;
}
.ise-format {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.ise-fmt {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--app-muted);
  cursor: pointer;
}
.ise-fmt:hover {
  background: color-mix(in srgb, var(--app-primary-color) 10%, transparent);
  color: var(--app-primary-color);
}
.ise-sep {
  width: 1px;
  height: 18px;
  background: var(--app-hairline);
  flex: 0 0 auto;
}
.ise-kind {
  font-size: 11px;
  font-weight: 700;
  color: var(--app-primary-color);
  background: color-mix(in srgb, var(--app-primary-color) 12%, transparent);
  padding: 1px 8px;
  border-radius: 999px;
}
.ise-hint {
  font-size: 11px;
  color: var(--app-muted);
}
.ise-spacer { flex: 1 1 auto; min-width: 6px; }
.ise-btn {
  font-size: 12px;
  font-weight: 600;
  padding: 3px 12px;
  border-radius: 7px;
  border: 1px solid var(--app-control-border);
  background: var(--app-control-bg);
  color: var(--app-fg);
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease;
}
.ise-btn:hover { border-color: color-mix(in srgb, var(--app-primary-color) 40%, var(--app-border)); }
.ise-btn.primary {
  border-color: transparent;
  background: var(--app-primary-color);
  color: #fff;
}
.ise-btn.primary:hover { background: color-mix(in srgb, var(--app-primary-color) 88%, #000); }
.ise-body {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  max-height: min(420px, 58vh);
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--app-primary-color) 26%, var(--app-border));
  border-radius: 12px;
  background: color-mix(in srgb, var(--app-code-bg) 88%, var(--bg));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--app-primary-color) 10%, transparent),
  0 14px 28px -22px color-mix(in srgb, var(--app-primary-color) 38%, transparent);
}
.ise-preview {
  grid-column: 1 / -1;
  border-top: 1px solid color-mix(in srgb, var(--app-border) 55%, transparent);
  background: color-mix(in srgb, var(--app-bg) 92%, transparent);
}
.ise-preview-tab {
  padding: 5px 10px;
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--app-muted);
  border-bottom: 1px solid color-mix(in srgb, var(--app-border) 50%, transparent);
}
.ise-preview-body {
  max-height: min(200px, 28vh);
  overflow: auto;
  padding: 8px 10px;
}
.ise-preview-body :deep(pre.hljs) {
  margin: 0;
  padding: 0;
  background: transparent;
  font-size: 12px;
  line-height: 1.45;
}
.ise-preview-body :deep(.ipe-math) {
  display: flex;
  justify-content: center;
  padding: 6px 0;
  overflow-x: auto;
}
.ise-gutter {
  overflow: hidden;
  padding: 8px 0;
  border-right: 1px solid color-mix(in srgb, var(--app-border) 48%, transparent);
  background: color-mix(in srgb, var(--app-shell-bg) 60%, transparent);
  color: color-mix(in srgb, var(--app-muted) 58%, transparent);
  font-family: var(--font-family-mono);
  font-size: 11px;
  line-height: 1.48;
  text-align: right;
  user-select: none;
}
.ise-gutter span {
  display: block;
  padding-right: 8px;
}
.ise-code {
  min-height: 1.55em;
  max-height: min(280px, 40vh);
  padding: 8px 10px;
  border: 0;
  outline: none;
  overflow-x: hidden;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
  background: transparent;
  color: var(--fg);
  font-family: var(--font-family-mono);
  font-size: 12px;
  line-height: 1.48;
  tab-size: 2;
}
.ise-rich {
  width: 100%;
  box-sizing: border-box;
  min-height: 1.8em;
  max-width: none;
  margin: 0;
  padding: 0.38em 0.56em;
  border: 1px solid color-mix(in srgb, var(--app-primary-color) 24%, var(--border));
  border-left: 3px solid color-mix(in srgb, var(--app-primary-color) 72%, var(--primary-color));
  border-radius: 10px;
  outline: none;
  background: color-mix(in srgb, var(--app-primary-color) 3%, var(--bg));
  color: var(--fg);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--app-primary-color) 9%, transparent),
  0 14px 28px -24px color-mix(in srgb, var(--app-primary-color) 34%, transparent);
  caret-color: var(--app-primary-color);
}
.ise-rich.doc-preview {
  line-height: inherit;
}
.ise-rich :deep(*) {
  outline: none;
}
.ise-rich :deep(> :first-child) { margin-top: 0; }
.ise-rich :deep(> :last-child) { margin-bottom: 0; }
@media (max-width: 980px) {
  .slide-stage { padding: 18px; min-height: 420px; }
}
</style>
