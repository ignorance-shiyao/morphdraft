<script setup lang="ts">
import { computed, ref, nextTick, watch, onMounted, onBeforeUnmount } from 'vue'
import { usePreviewRender } from '../../composables/usePreviewRender'
import { useUiStore } from '../../stores/ui'
import { useDocumentStore } from '../../stores/document'
import { useSyncStore } from '../../stores/sync'
import { createWheelZoom } from '../../composables/useWheelZoom'
import { highlightCodeHtml } from '../../core/markdown/highlightCode'
import { wrapContentEditable, insertContentEditable } from '../../core/markdown/previewFormat'
import { mountCharts } from '../../core/charts/mount'
import { useThemeStore } from '../../stores/theme'
import katex from 'katex'
import {
  blockEditRange,
  fenceLanguageRange,
  fencedContentRange,
  findInlineEditRange,
  type InlineEditKind,
} from '../../core/markdown/editUnits'
import SelectMenu from '../SelectMenu.vue'
import {
  PAPER_SIZES, PAPER_LIST, MARGIN_LIST, MARGIN_PRESETS, LINE_HEIGHT_LIST, LINE_HEIGHTS, paperPadding,
  type PaperSize, type PaperMargin, type LineHeightKey,
} from '../../core/paper'
import { paginateBlocks, mergeSplitTables } from '../../core/export/paginate'
import { useI18n } from 'vue-i18n'
import LinkEditorPopover from '../LinkEditorPopover.vue'
import TableContextMenu from '../TableContextMenu.vue'
import ChipEditorPopover from '../ChipEditorPopover.vue'
import HoverPreviewCard from '../HoverPreviewCard.vue'
import Icon from '../Icon.vue'
import {
  buildMarkdownLink,
  parseMarkdownLink,
  type MarkdownLinkFields,
} from '../../core/markdown/linkEdit'
import { shouldSkipBlockEditor } from '../../core/markdown/previewClick'
import { blockEnterEdit, blockLinePrefix, blockLinePrefixKind, collapseDuplicateQuotePrefix, hasRenderedInlineChildren, lineContinueEnter, mapVisibleOffsetToSource } from '../../core/markdown/previewBlockEdit'
import { serializeInlineDom } from '../../core/markdown/inlineSerialize'
import { highlightMarkdownSource, mapInlineVisibleToSource } from '../../core/markdown/previewInlineSource'
import { parseChip, serializeChip, type ChipFields } from '../../core/markdown/chipEdit'
import { ICON_NAMES } from '../../core/markdown/icons'
import { findImageResizeRange, findImageResizeRangeByIndex, imageOccurrence, applyImageAttrs, readImageAttrs, type ImageAttrs, type ImageAlign } from '../../core/markdown/imageResize'
import { fileToAsset } from '../../core/clipboard'
import { collapsedHeadingHiddenLines, headingHasChildren, parseMarkdownHeadings } from '../../core/markdown/headingSections'
import { moveDocumentUnitByLine } from '../../core/markdown/documentReorder'
import {
  detectTable,
  formatTable,
  insertRow,
  deleteRow,
  insertCol,
  deleteCol,
  setColAlign,
  setCellText,
  moveRow,
  moveCol,
  tableToTsv,
  tableToCsv,
  tableToMarkdown,
  tableToHtml,
  type TableModel,
} from '../../core/markdown/tableEdit'
import {
  appendHtmlTableColumn,
  appendHtmlTableRow,
  findHtmlTableBlock,
  getHtmlTableCellText,
  mergeHtmlTableCells,
  setHtmlTableCellText,
  setHtmlTableColumnWidth,
} from '../../core/markdown/tableHtmlEdit'

const host = ref<HTMLDivElement | null>(null)
const ui = useUiStore()
const doc = useDocumentStore()
const { t } = useI18n({ useScope: 'global' })
const paperOpts = computed(() => PAPER_LIST.map((p) => ({ value: p.id, label: p.label })))
const marginOpts = computed(() => MARGIN_LIST.map((m) => ({
  value: m.id,
  label: t(`previewControls.margin${m.id === 'normal' ? 'Normal' : m.id === 'narrow' ? 'Narrow' : 'Wide'}`),
})))
const lineOpts = computed(() => LINE_HEIGHT_LIST.map((l) => ({
  value: l.id,
  label: t(`previewControls.line${l.id === 'normal' ? 'Normal' : l.id === 'tight' ? 'Tight' : 'Loose'}`),
})))
const paperBox = ref({ width: 0, height: 0 })
const inlineEditorOpen = ref(false)
const inlineEditorLine = ref(0)
const inlineEditorEndLine = ref(0)
const inlineEditorText = ref('')
const inlineEditorMode = ref<'rich' | 'code'>('rich')
const inlineEditorPresentation = ref<'inline' | 'block' | 'code' | 'chart' | 'math'>('block')
const inlineEditorColumnFrom = ref<number | null>(null)
const inlineEditorColumnTo = ref<number | null>(null)
const inlineCodeLang = ref('')
const inlineEditorTitle = ref('')
const inlineEditorLabel = ref('')
const inlineEditorPos = ref({ x: 0, y: 0, width: 0 })
const inlineEditorTypography = ref({
  fontFamily: 'var(--font-family)',
  fontSize: '1rem',
  fontWeight: '400',
  lineHeight: '1.6',
})
const linkEditor = ref<{
  line: number
  from: number
  to: number
  anchor: { left: number; top: number; bottom: number }
  fields: MarkdownLinkFields
} | null>(null)
const chipEditor = ref<{
  line: number
  from: number
  to: number
  anchor: { left: number; top: number; bottom: number }
  fields: ChipFields
} | null>(null)
// 预览侧表格右键菜单（复用编辑器侧的 TableContextMenu + tableEdit 纯函数）
const tableMenu = ref<{ x: number; y: number; model: TableModel; col: number; bodyIndex: number } | null>(null)
// GFM 表格用 model + col/bodyIndex 回写；HTML 表格（合并后）用 html.{sourceLine,row,col} 回写
const tableCellEditor = ref<{
  cell: HTMLTableCellElement
  text: string
  model?: TableModel
  col: number
  bodyIndex: number
  html?: { sourceLine: number; row: number; col: number }
} | null>(null)
// Notion 式悬停加行/加列「+」浮层（取长补短：保留 markdown 表格，借鉴 Notion 的便捷新增）。
// 坐标相对 .paper-scroll（视觉坐标，含缩放），故直接用 getBoundingClientRect。
const tableAddUi = ref<{
  line: number
  rowBtn?: { left: number; top: number; width: number }
  colBtn?: { left: number; top: number; height: number }
} | null>(null)
let tableAddHideTimer: number | null = null
let dragHandleHideTimer: number | null = null
// Notion 式多行选择 + 批量删除（取长补短：保留 markdown 表格，借鉴 Notion 的勾选批删）。
// rows = model.rows 的 bodyIndex 集合；仅对单个表格生效（换表即清空）。
const tableSelection = ref<{ line: number; rows: number[] } | null>(null)
const tableCellSelection = ref<{
  line: number
  rowStart: number
  rowEnd: number
  colStart: number
  colEnd: number
} | null>(null)
const collapsedHeadingLines = ref<Set<number>>(new Set())
const dragHandle = ref<{ x: number; y: number; h: number; line: number } | null>(null)
const draggingBlock = ref(false)
const dropY = ref<number | null>(null)
const inlineCode = ref<HTMLElement | null>(null)
const inlineGutter = ref<HTMLElement | null>(null)
const inlineEditorEl = ref<HTMLElement | null>(null)
// O7：源码下方的实时预览容器（代码块用 highlight、图表块挂载 chart、数学块用 KaTeX）
const inlinePreviewEl = ref<HTMLElement | null>(null)
const theme = useThemeStore()
const sync = useSyncStore()
// 编辑器↔预览滚动同步防回环：程序性滚动预览时短暂屏蔽预览侧上报（对称于 EditorPane 的 scrollLock）
let previewScrollLock = 0
let inlinePreviewKind: 'highlight' | 'chart' | 'math' | null = null
let inlinePreviewChartCleanup: (() => void) | null = null
let inlinePreviewChartType: 'mermaid' | 'echarts' | null = null
let inlinePreviewChartTimer: number | null = null
const scrollerEl = ref<HTMLElement | null>(null)
let paperObserver: ResizeObserver | null = null
let scrollerObserver: ResizeObserver | null = null
let editingTargetEl: HTMLElement | null = null
let editingCardEl: HTMLElement | null = null
let editorObserver: ResizeObserver | null = null
let directEditorEl: HTMLElement | null = null
let editingAnchorEl: HTMLElement | null = null
let tableResizeState: {
  table: HTMLElement
  index: number
  startX: number
  startSize: number
  nextSize: number
} | null = null

// 选中图片：浮动手柄 + 专用工具栏（位置用 fixed 贴合图片屏幕坐标）
const imgSel = ref<null | {
  rect: { left: number; top: number; width: number; height: number }
  attrs: ImageAttrs
  sourceLine: number   // 绝对行号，用于源码定位
  occurrence: number
  imageIndex: number   // 块内图片序号
  globalIndex: number  // 全文图片序号，用于重渲染后重新定位
}>(null)
const imgRatioLocked = ref(true)
const cellSelBarPos = ref<{ left: number; top: number; bottom: number } | null>(null)
const imgFileInput = ref<HTMLInputElement | null>(null)
let selImgEl: HTMLImageElement | null = null
let imgHandleDrag: {
  startX: number; startY: number; startW: number; startH: number
  ratio: number; fx: number; fy: number
} | null = null
let imgHandleSize: { w: number; h: number } | null = null
let tableCellDragStart: {
  table: HTMLElement
  row: number
  col: number
  line: number
  startX: number
  startY: number
  active: boolean
} | null = null
let hoverBlock: HTMLElement | null = null
let dragFromLine = -1
let dragToLine = -1
let dragPlaceAfter = false
let blockDragPointerId: number | null = null
// 点击代码块进入浮层编辑时，记下点击落点对应的字符偏移，编辑器打开后据此放置光标（落点精确、不再总跳到开头）
let pendingCodeCaretOffset: number | null = null
let directComposing = false
let directHighlightTimer: number | null = null
// 所见即所得（WYSIWYG）块编辑：保持渲染态，原地可编辑文字/行内，提交时按行内 DOM 序列化回写源码。
let wysiwygEl: HTMLElement | null = null
let wysiwygPrefix = ''
let wysiwygComposing = false
let wysiwygTimer: number | null = null
let lastAutoformatLine: number | null = null // 刚自动套用块型的行（用于「立刻退格撤销」）
let lastWysiwygPoint: { x: number; y: number; at: number } | null = null
let previewToolbarObserver: ResizeObserver | null = null
const hoverCard = ref<{
  anchor: { left: number; top: number; bottom: number }
  title: string
  content: string
  exists: boolean
} | null>(null)
let hoverCardTimer = 0
let hoverCardOnCard = false
const onWheelZoom = createWheelZoom({
  getValue: () => ui.previewZoom,
  setValue: (value) => ui.setPreviewZoom(value),
  max: 2,
})

const ZOOM_PRESETS = [50, 75, 100, 125, 150, 175, 200, 300]
const zoomOpts = computed(() => [
  { value: 'fit', label: t('previewControls.fitPage') },
  ...ZOOM_PRESETS.map((p) => ({ value: `${p}%`, label: `${p}%` })),
])
const zoomLabel = computed(() => `${Math.round(ui.previewZoom * 100)}%`)
function onZoomPick(v: string) {
  if (v === 'fit') { fitPreviewToPage(); return }
  const pct = Number(v.replace('%', ''))
  if (Number.isFinite(pct)) ui.setPreviewZoom(pct / 100)
}
// 步进缩放（替代原滑块）：±10%，钳在 25%–200%，与图表卡 − 100% + 同款交互
function stepZoom(dir: number) {
  const next = Math.min(2, Math.max(0.25, Math.round((ui.previewZoom + dir * 0.1) * 100) / 100))
  ui.setPreviewZoom(next)
}
// 双击缩放区域：按纸张宽度撑满可视视口（paper-scroll 左右各留 28px padding）。
// 进入「适应宽度」模式：之后拖拽分栏改变可视宽度时会自动重算（见 refitOnResize）。
function fitPreviewToPage() {
  ui.setPreviewFit(true)
  applyFitZoom()
}
// 按当前可视宽度重算缩放（不切换适应开关，供 fit 入口与 resize 复用）。
function applyFitZoom() {
  const scroller = scrollerEl.value
  if (!scroller) return
  const available = scroller.clientWidth - 56
  if (available <= 0) return
  // fromFit=true：保留 previewFit 开关，仅更新缩放值。
  ui.setPreviewZoom(available / ui.docPageWidth, true)
}

// 行号只数代码块自身的行（从 1 开始），不用文档里的绝对行号
const inlineLineNumbers = computed(() => {
  const count = Math.max(1, inlineEditorText.value.split('\n').length)
  return Array.from({ length: count }, (_, i) => i + 1)
})
// 代码块编辑器：≤50 行时整体撑开、不出滚动条；>50 行才限高并滚动。
const inlineCodeFitsNoScroll = computed(
  () => inlineEditorText.value.split('\n').length <= 50,
)

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

function wysiwygTextNodes(el: HTMLElement): Text[] {
  const nodes: Text[] = []
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement
      if (parent?.closest('.md-heading-toggle, .md-image-resize, .md-table-handle, .md-row-select, .md-table-resize')) {
        return NodeFilter.FILTER_REJECT
      }
      return (node.textContent ?? '').length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    },
  })
  while (walker.nextNode()) nodes.push(walker.currentNode as Text)
  return nodes
}

function serializeBeforeDomPosition(root: HTMLElement, node: Node, offset: number): string | null {
  if (!root.contains(node)) return null
  const range = document.createRange()
  range.selectNodeContents(root)
  try {
    range.setEnd(node, offset)
  } catch {
    return null
  }
  const wrapper = document.createElement('div')
  wrapper.appendChild(range.cloneContents())
  return serializeInlineDom(wrapper)
}

function wysiwygPointBlockPos(point: { x: number; y: number }): { lineWithinBlock: number; col: number } | null {
  if (!wysiwygEl) return null
  const nodes = wysiwygTextNodes(wysiwygEl)
  const total = nodes.reduce((sum, node) => sum + (node.textContent ?? '').length, 0)
  if (total > 5000) return null
  let best: { node: Text; offset: number; score: number } | null = null

  for (const node of nodes) {
    const len = (node.textContent ?? '').length
    for (let offset = 0; offset <= len; offset++) {
      const range = document.createRange()
      range.setStart(node, offset)
      range.collapse(true)
      const rect = range.getBoundingClientRect()
      if ((!rect.width && !rect.height) || !Number.isFinite(rect.left)) continue
      const lineDy = point.y < rect.top ? rect.top - point.y : point.y > rect.bottom ? point.y - rect.bottom : 0
      const xDy = Math.abs(point.x - rect.left)
      const score = lineDy * 10000 + xDy
      if (!best || score < best.score) best = { node, offset, score }
    }
  }
  if (!best) return null
  const before = serializeBeforeDomPosition(wysiwygEl, best.node, best.offset)
  if (before == null) return null
  const nl = before.lastIndexOf('\n')
  return {
    lineWithinBlock: nl === -1 ? 0 : before.slice(0, nl).split('\n').length,
    col: nl === -1 ? before.length : before.length - nl - 1,
  }
}

function recordWysiwygPoint(point?: { x: number; y: number }) {
  lastWysiwygPoint = point ? { ...point, at: Date.now() } : null
}

function visibleOffsetFromPointByGeometry(el: HTMLElement, point: { x: number; y: number }): number | null {
  const nodes = wysiwygTextNodes(el)
  const total = nodes.reduce((sum, node) => sum + (node.textContent ?? '').length, 0)
  if (total > 5000) return null
  let best: { node: Text; offset: number; score: number } | null = null

  for (const node of nodes) {
    const len = (node.textContent ?? '').length
    for (let offset = 0; offset <= len; offset++) {
      const range = document.createRange()
      range.setStart(node, offset)
      range.collapse(true)
      const rect = range.getBoundingClientRect()
      if ((!rect.width && !rect.height) || !Number.isFinite(rect.left)) continue
      const lineDy = point.y < rect.top ? rect.top - point.y : point.y > rect.bottom ? point.y - rect.bottom : 0
      const xDy = Math.abs(point.x - rect.left)
      const score = lineDy * 10000 + xDy
      if (!best || score < best.score) best = { node, offset, score }
    }
  }
  if (!best) return null
  const range = document.createRange()
  range.selectNodeContents(el)
  try {
    range.setEnd(best.node, best.offset)
  } catch {
    return null
  }
  return range.toString().length
}

function caretOffsetFromPoint(el: HTMLElement, x: number, y: number): number | null {
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
  if (!range || !el.contains(range.startContainer)) return null
  const preRange = range.cloneRange()
  preRange.selectNodeContents(el)
  preRange.setEnd(range.endContainer, range.endOffset)
  return preRange.toString().length
}

// 返回 null = 无法从点击点解析光标（无 point 或命中失败），调用方回落到行尾并用 placeCaretAtPoint 兜底。
// 解析成功时返回的偏移已是「按渲染态点击点」映射到源码的正确位置，不应再被源码态二次 hit-test 覆盖。
function resolveInitialCaret(target: HTMLElement, point: { x: number; y: number } | undefined, sourceText: string): number | null {
  if (!point) return null
  const visible = visibleOffsetFromPointByGeometry(target, point) ?? caretOffsetFromPoint(target, point.x, point.y)
  if (visible === null) return null
  if (inlineEditorPresentation.value === 'inline') {
    return mapInlineVisibleToSource(visible, sourceText)
  }
  return mapVisibleOffsetToSource(visible, sourceText)
}

// 在渲染态代码块上，按点击屏幕坐标算出落点在「纯代码文本」中的字符偏移。
// 每行是 .code-line（含行号 .code-lineno + 代码 .code-text），编辑器里的文本只有代码、无行号，
// 故只累加各行 .code-text 长度（行间补 \n），与编辑器文本一一对应；点到行号则取该行行首。
function clickCaretOffsetInCode(pre: HTMLElement, point?: { x: number; y: number }): number | null {
  if (!point) return null
  const d = document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null }
  const range = d.caretRangeFromPoint?.(point.x, point.y)
  if (!range || !pre.contains(range.startContainer)) return null
  const startEl = range.startContainer.nodeType === 3 ? range.startContainer.parentElement : (range.startContainer as HTMLElement)
  const lineEl = startEl?.closest('.code-line')
  const lines = [...pre.querySelectorAll<HTMLElement>('.code-line')]
  if (!lineEl || !lines.length) return null
  const lineIdx = lines.indexOf(lineEl as HTMLElement)
  if (lineIdx < 0) return null
  let offset = 0
  for (let i = 0; i < lineIdx; i++) offset += (lines[i].querySelector('.code-text')?.textContent?.length ?? 0) + 1
  const textEl = lineEl.querySelector('.code-text')
  if (textEl && textEl.contains(range.startContainer)) {
    const r = document.createRange()
    r.selectNodeContents(textEl)
    r.setEnd(range.startContainer, range.startOffset)
    offset += r.toString().length
  }
  return offset
}

// ===== 纯代码块「DOM 级真原地编辑」=====
// 不再炸开浮层：直接把渲染态 <pre><code> 的内容换成「行号 gutter + 可编辑高亮代码」，就在文档流原位编辑。
// 用 contenteditable=plaintext-only（回车即 \n、不会被浏览器塞 div/br 弄乱结构），停顿后再重高亮、光标稳定。
let codeInplace: {
  pre: HTMLElement
  code: HTMLElement
  gutter: HTMLElement
  edit: HTMLElement
  range: { start: number; end: number }
  lang: string
  timer: number | null
} | null = null

function renderCiGutter(gutter: HTMLElement, text: string) {
  const n = Math.max(1, text.split('\n').length)
  let html = ''
  for (let i = 1; i <= n; i++) html += `<div>${i}</div>`
  gutter.innerHTML = html
  // 软换行后逐行实测高度，让行号格与可能占多视觉行的逻辑行对齐
  requestAnimationFrame(syncCiGutterHeights)
}

// 量出 .ci-code 里每个逻辑行（按 \n 切分）的像素高度，写回对应行号格的高度。
// 软换行时一条逻辑行会占多视觉行，靠实测高度让左侧行号保持顶对齐、不再错位。
function syncCiGutterHeights() {
  if (!codeInplace) return
  const { edit, gutter } = codeInplace
  const text = edit.textContent ?? ''
  const lines = text.split('\n')
  const divs = gutter.children
  if (divs.length !== lines.length) return
  // 建立「字符偏移 → 文本节点位置」映射，用 Range 量每行高度
  const tnodes: { node: Text; start: number }[] = []
  const walker = document.createTreeWalker(edit, NodeFilter.SHOW_TEXT)
  let acc = 0
  let cur: Node | null
  while ((cur = walker.nextNode())) {
    tnodes.push({ node: cur as Text, start: acc })
    acc += (cur.textContent ?? '').length
  }
  const locate = (offset: number): [Node, number] => {
    for (let i = tnodes.length - 1; i >= 0; i--) {
      if (offset >= tnodes[i].start) return [tnodes[i].node, Math.min(offset - tnodes[i].start, tnodes[i].node.length)]
    }
    return [edit, 0]
  }
  let cursor = 0
  const range = document.createRange()
  for (let i = 0; i < lines.length; i++) {
    const start = cursor
    const end = cursor + lines[i].length
    cursor = end + 1 // 跳过 \n
    let h = 0
    if (tnodes.length) {
      try {
        const [sN, sO] = locate(start)
        const [eN, eO] = locate(end)
        range.setStart(sN, sO)
        range.setEnd(eN, eO)
        const rects = range.getClientRects()
        if (rects.length) {
          let top = Infinity, bottom = -Infinity
          for (const r of rects) { top = Math.min(top, r.top); bottom = Math.max(bottom, r.bottom) }
          h = bottom - top
        }
      } catch { /* 空行/边界忽略，走回退 */ }
    }
    ;(divs[i] as HTMLElement).style.height = h > 0 ? `${h}px` : ''
  }
}

function activateCodeInPlace(pre: HTMLElement, range: { start: number; end: number }, lang: string, point?: { x: number; y: number }): boolean {
  const code = pre.querySelector('code')
  if (!code) return false
  const lines = doc.markdown.split('\n')
  const rawCode = range.end < range.start ? '' : lines.slice(range.start, range.end + 1).join('\n')
  const caret = clickCaretOffsetInCode(pre, point) // 落点字符偏移（在原渲染态算，下面替换内容后还原）

  pre.classList.add('code-inplace-editing')
  const gutter = document.createElement('div')
  gutter.className = 'ci-gutter'
  gutter.setAttribute('contenteditable', 'false')
  const edit = document.createElement('div')
  edit.className = 'ci-code'
  edit.setAttribute('contenteditable', 'plaintext-only')
  edit.setAttribute('spellcheck', 'false')
  edit.innerHTML = highlightCodeHtml(rawCode, lang) || '​'
  code.replaceChildren(gutter, edit)
  renderCiGutter(gutter, rawCode)

  edit.addEventListener('input', onCiInput)
  edit.addEventListener('keydown', onCiKeydown)
  edit.addEventListener('blur', onCiBlur)
  edit.addEventListener('scroll', () => { if (codeInplace) codeInplace.gutter.scrollTop = edit.scrollTop })

  codeInplace = { pre, code, gutter, edit, range: { ...range }, lang, timer: null }
  editingTargetEl = pre
  editingAnchorEl = pre
  inlineEditorOpen.value = true // 挂起预览自动重渲染
  edit.focus({ preventScroll: true })
  if (caret != null) setCaretOffset(edit, Math.min(caret, (edit.textContent ?? '').length))
  return true
}

function onCiInput() {
  if (!codeInplace) return
  const text = codeInplace.edit.textContent ?? ''
  const lines = doc.markdown.split('\n')
  const parts = text.split('\n')
  lines.splice(codeInplace.range.start, codeInplace.range.end - codeInplace.range.start + 1, ...parts)
  codeInplace.range.end = codeInplace.range.start + parts.length - 1
  setMarkdownPreservePreviewScroll(lines.join('\n'))
  renderCiGutter(codeInplace.gutter, text)
  scheduleCiHighlight()
}

function scheduleCiHighlight() {
  if (!codeInplace) return
  if (codeInplace.timer !== null) window.clearTimeout(codeInplace.timer)
  codeInplace.timer = window.setTimeout(() => {
    if (!codeInplace || document.activeElement !== codeInplace.edit) return
    const offset = getCaretOffset(codeInplace.edit)
    codeInplace.edit.innerHTML = highlightCodeHtml(codeInplace.edit.textContent ?? '', codeInplace.lang) || '​'
    setCaretOffset(codeInplace.edit, offset)
    requestAnimationFrame(syncCiGutterHeights) // 高亮重排后行高可能变，重新对齐行号
  }, 140)
}

function onCiKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') { e.preventDefault(); closeCodeInplace() }
}
function onCiBlur() {
  // 让点击工具条按钮等不丢编辑（按钮 mousedown.prevent 不会真的失焦）；真失焦才关闭
  window.setTimeout(() => { if (codeInplace && document.activeElement !== codeInplace.edit) closeCodeInplace() }, 60)
}

function closeCodeInplace() {
  if (!codeInplace) return
  if (codeInplace.timer !== null) window.clearTimeout(codeInplace.timer)
  codeInplace = null
  inlineEditorOpen.value = false
  editingTargetEl = null
  editingAnchorEl = null
  void renderPreview() // 重渲染恢复正常代码块（行号/复制按钮/高亮）
}

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

function flushDirectEditor() {
  if (!directEditorEl) return
  inlineEditorText.value = directEditorText()
  replaceInlineEdit(inlineEditorText.value)
}

function renderInlineCode() {
  if (!inlineCode.value) return
  inlineCode.value.innerHTML = highlightCodeHtml(inlineEditorText.value, inlineCodeLang.value) || '​'
}

// O7：实时把源码渲染到下方预览。chart/math 各自调用底层渲染；code 直接 highlight。
function inlinePreviewSource(): string {
  const text = inlineEditorText.value
  if (inlineEditorPresentation.value !== 'math') return text
  // math-block 源码包含 $$ 定界符；取中间内容渲染
  const stripped = text.replace(/^\s*\$\$\s*/, '').replace(/\s*\$\$\s*$/, '')
  return stripped.trim() || text.trim()
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

function renderInlinePreview() {
  const host = inlinePreviewEl.value
  if (!host) return
  const presentation = inlineEditorPresentation.value
  if (presentation === 'code') {
    inlinePreviewKind = 'highlight'
    const lang = inlineCodeLang.value
    host.innerHTML = `<pre class="hljs"><code>${highlightCodeHtml(inlineEditorText.value, lang) || '​'}</code></pre>`
    return
  }
  if (presentation === 'math') {
    inlinePreviewKind = 'math'
    const src = inlinePreviewSource()
    try {
      host.innerHTML = `<div class="ipe-math">${katex.renderToString(src, { throwOnError: false, displayMode: true })}</div>`
    } catch (err) {
      host.innerHTML = `<div class="ipe-math-error">${(err as Error).message}</div>`
    }
    return
  }
  if (presentation === 'chart') {
    inlinePreviewKind = 'chart'
    inlinePreviewChartType = inlineCodeLang.value === 'mermaid' ? 'mermaid' : 'echarts'
    scheduleInlinePreviewChart()
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
  // 销毁上一帧的 chart 实例
  if (inlinePreviewChartCleanup) {
    try { inlinePreviewChartCleanup() } catch { /* ignore */ }
    inlinePreviewChartCleanup = null
  }
  host.innerHTML = ''
  const block = document.createElement('div')
  block.className = 'chart-block ipe-chart-block'
  block.dataset.chartType = inlinePreviewChartType
  block.dataset.chartCode = encodeURIComponent(inlineEditorText.value)
  host.appendChild(block)
  try {
    inlinePreviewChartCleanup = await mountCharts(host, { tokens: theme.tokens })
  } catch (err) {
    host.innerHTML = `<div class="ipe-chart-error">${(err as Error).message}</div>`
  }
}

// 编辑框挂在 .paper-zoom 内部（随其 transform:scale 一起定位/滚动），
// 这里只需要存「缩放=1 时」的逻辑坐标，定位天然随缩放联动，不用监听 zoom 变化重新测量。
// 框本身再叠加一个 scale(1/zoom) 抵消父级缩放，保持可读的自然字号/宽度。
function updateInlineEditorPos(el: HTMLElement, sourceWidth = 0) {
  const zoomEl = el.closest('.paper-zoom') as HTMLElement | null
  if (!zoomEl) return
  const rect = el.getBoundingClientRect()
  const zoomRect = zoomEl.getBoundingClientRect()
  const scale = ui.previewZoom || 1
  inlineEditorPos.value = {
    x: (rect.left - zoomRect.left) / scale,
    y: (rect.top - zoomRect.top) / scale,
    // 注意：宽度不能再除以 scale —— 编辑框自身的 scale(1/zoom) 已经抵消了父级 .paper-zoom
    // 的 scale(zoom)（合成后净缩放为 1），所以 width 要直接用屏幕像素宽度，
    // 否则会被多除一次 scale，导致编辑框比原内容窄/宽，缩放越大跑偏越明显
    width: inlineEditorPresentation.value === 'inline'
        ? Math.max(rect.width, sourceWidth)
        : rect.width,
  }
}

// 编辑期间原块被折叠（height:0），浮层编辑器又是 absolute 不占流。若原块本来很高
// （如 mermaid 图表），折叠后后续内容会整体上移到编辑器底下被遮挡，原块那片高度也成了留白。
// 这里把原块当成「占位高度 = 编辑器高度」的撑高块，让后续内容正好落在编辑器下方：不遮挡、不留白。
// 编辑器自带 scale(1/zoom)，offsetHeight 是缩放前的自然高；原块在 .paper-zoom(scale zoom) 里，
// 屏幕高 = 占位高×zoom，要让它等于编辑器屏幕高(=offsetHeight)，故占位高 = offsetHeight / zoom。
function syncEditingReserve() {
  if (!editingTargetEl || !inlineEditorEl.value) return
  const scale = ui.previewZoom || 1
  const cardTitleHeight = editingCardEl
    ? (editingCardEl.querySelector('.chart-card-title') as HTMLElement | null)?.offsetHeight ?? 0
    : 0
  const reserve = Math.max(0, inlineEditorEl.value.offsetHeight / scale - cardTitleHeight)
  editingTargetEl.style.setProperty('--ipe-reserve', `${reserve}px`)
}

function normalizeEditableTarget(el: HTMLElement) {
  return (el.closest(TEXT_BLOCK_SELECTOR) as HTMLElement | null) ?? el
}

function wysiwygBlockTarget(el: HTMLElement, sourceLine: number): HTMLElement {
  if (blockLinePrefixKind(doc.markdown.split('\n')[sourceLine] ?? '') === 'blockquote') {
    return el.closest<HTMLElement>('blockquote[data-source-line]') ?? el
  }
  return el
}

function bodyLineOffset(): number {
  const src = doc.markdown
  if (!src.startsWith('---')) return 0
  const end = src.indexOf('\n---', 3)
  if (end === -1) return 0
  const after = src.indexOf('\n', end + 1)
  if (after === -1) return 0
  return src.slice(0, after + 1).split('\n').length - 1
}

function findElementAtLine(absLine: number): HTMLElement | null {
  const root = host.value
  if (!root) return null
  const rel = absLine - bodyLineOffset()
  if (rel < 0) return null
  const hit = root.querySelector<HTMLElement>(`[data-source-line="${rel}"]`)
  if (!hit) return null
  if (hit.classList.contains('md-heading-hidden')) return null
  const block = hit.matches(TEXT_BLOCK_SELECTOR)
    ? hit
    : (hit.closest(TEXT_BLOCK_SELECTOR) as HTMLElement | null)
  return block ? normalizeEditableTarget(block) : null
}

/** 空行在渲染 DOM 中无对应块时，在前一块后挂占位段落以便继续编辑 */
function emptyLineEditAnchor(absLine: number): HTMLElement | null {
  const lines = doc.markdown.split('\n')
  if (absLine < 0 || absLine >= lines.length) return null
  const existing = findElementAtLine(absLine)
  if (existing) return existing
  if (lines[absLine]?.trim() !== '' || !host.value) return null

  const rel = absLine - bodyLineOffset()
  const reused = host.value.querySelector<HTMLElement>(`p.preview-edit-blank[data-source-line="${rel}"]`)
  if (reused) return reused

  const p = document.createElement('p')
  p.setAttribute('data-source-line', String(rel))
  p.className = 'preview-edit-blank'

  // 连续多个空行时，每个空行各有自己的占位条 .md-blank-line（纵向位置正确）。
  // 复用它的位置承载编辑占位段落，避免所有空行都塌到「前一块之后」同一处
  // （表现为：连按回车时光标一直停在第一空行）。
  const spacer = host.value.querySelector<HTMLElement>(`.md-blank-line[data-source-line="${rel}"]`)
  if (spacer) {
    spacer.replaceWith(p)
    return p
  }
  // 紧贴下一个块的那个空行没有占位条 → 插到下一个块之前（位置仍正确）
  for (let l = absLine + 1; l < lines.length; l++) {
    if (!lines[l].trim()) continue
    const nextEl = findElementAtLine(l)
    if (nextEl) { nextEl.parentNode?.insertBefore(p, nextEl); return p }
    break
  }
  // 文档末尾的连续空行没有后续块，渲染器不会生成 .md-blank-line。
  // 必须把从前一个非空块之后到当前行的空行占位按源码顺序补齐；
  // 否则每次回车都会重新插到同一个 blockquote/段落后面，视觉上像“始终停在第一空行”。
  for (let l = absLine - 1; l >= 0; l--) {
    if (!lines[l].trim()) continue
    const prevEl = findElementAtLine(l)
    if (prevEl) {
      let after = prevEl
      for (let blank = l + 1; blank <= absLine; blank++) {
        if (lines[blank]?.trim()) break
        const blankRel = blank - bodyLineOffset()
        const existing = host.value.querySelector<HTMLElement>(`[data-source-line="${blankRel}"]`)
        if (existing) { after = existing; continue }
        const node = blank === absLine ? p : document.createElement('div')
        if (blank !== absLine) {
          node.className = 'md-blank-line'
          node.appendChild(document.createElement('br'))
        }
        node.setAttribute('data-source-line', String(blankRel))
        after.insertAdjacentElement('afterend', node)
        after = node
      }
      return p
    }
    break
  }
  return null
}

/** `> ` 这类空引用行不会渲染成独立 DOM。补一个临时引用占位，避免回车后复用上一段 blockquote。 */
function formattedBlankLineEditAnchor(absLine: number): HTMLElement | null {
  const lines = doc.markdown.split('\n')
  if (absLine < 0 || absLine >= lines.length || !host.value) return null
  if (!/^\s*>\s*$/.test(lines[absLine] ?? '')) return null

  const rel = absLine - bodyLineOffset()
  const reused = host.value.querySelector<HTMLElement>(`blockquote.preview-edit-quote-blank[data-source-line="${rel}"]`)
  if (reused) return reused

  const quote = document.createElement('blockquote')
  quote.setAttribute('data-source-line', String(rel))
  quote.className = 'preview-edit-blank preview-edit-quote-blank'

  for (let l = absLine + 1; l < lines.length; l++) {
    if (!lines[l].trim()) continue
    const nextEl = findElementAtLine(l)
    if (nextEl) { nextEl.parentNode?.insertBefore(quote, nextEl); return quote }
    break
  }
  for (let l = absLine - 1; l >= 0; l--) {
    if (!lines[l].trim()) continue
    const prevEl = findElementAtLine(l)
    if (prevEl) { prevEl.insertAdjacentElement('afterend', quote); return quote }
    break
  }
  host.value.appendChild(quote)
  return quote
}

function isDeletableBlankSourceLine(line: string): boolean {
  return line.trim() === '' || /^\s*>\s*$/.test(line)
}

function caretOffsetInBlock(lines: string[], blockStart: number, absLine: number, colInLine: number): number {
  if (absLine <= blockStart) return colInLine
  const head = lines.slice(blockStart, absLine)
  return head.join('\n').length + 1 + colInLine
}

function visibleBodyLength(line: string): number {
  return line.slice(blockLinePrefix(line).length).length
}

function resumeCaretOffsetForLine(lines: string[], range: { start: number; end: number }, line: number, caretAt: 'start' | 'end'): number {
  const safeLine = Math.min(Math.max(line, range.start), range.end)
  let offset = 0
  for (let l = range.start; l < safeLine; l++) {
    offset += visibleBodyLength(lines[l] ?? '')
    offset += 1
  }
  if (caretAt === 'end') offset += visibleBodyLength(lines[safeLine] ?? '')
  return offset
}

async function rerenderAndResumeBlockEdit(editText: string, caret: number) {
  const top = scrollerEl.value?.scrollTop ?? 0
  const blockStartLine = inlineEditorLine.value
  const beforeCaret = editText.slice(0, caret)
  const lineParts = beforeCaret.split('\n')
  const colInLine = lineParts[lineParts.length - 1].length
  const absLine = blockStartLine + lineParts.length - 1

  deactivateDirectEditor()
  await renderPreview()

  const lines = doc.markdown.split('\n')
  // 续行/软换行产生的新行仍属原块（普通段落单 \n 软换行、列表续行）：渲染后该行没有独立
  // data-source-line 元素，元素仍挂在块首行。故先判断 absLine 是否仍落在「原块起始行所在块」内：
  //  · 在 → 沿用原块，元素取块首行、光标按块内偏移定位（修复回车后编辑框/光标定位丢失或跳位）。
  //  · 不在（回车两次产生独立空行、标题后另起无格式行等）→ 切到 absLine 所在新块 / 空行占位。
  const startBlock = blockEditRange(lines, blockStartLine)
  const inSameBlock = absLine >= startBlock.start && absLine <= startBlock.end
  const blockRange = inSameBlock ? startBlock : blockEditRange(lines, absLine)
  const el = inSameBlock
    ? findElementAtLine(blockRange.start)
    : (emptyLineEditAnchor(absLine) ?? findElementAtLine(absLine))
  if (!el) {
    restorePreviewScroll(top)
    return
  }

  inlineEditorLine.value = blockRange.start
  inlineEditorEndLine.value = blockRange.end
  inlineEditorColumnFrom.value = null
  inlineEditorColumnTo.value = null
  inlineEditorText.value = lines.slice(blockRange.start, blockRange.end + 1).join('\n')
  editingTargetEl = el
  editingAnchorEl = el
  inlineEditorPresentation.value = 'block'
  inlineEditorMode.value = 'rich'

  const newCaret = caretOffsetInBlock(lines, blockRange.start, absLine, colInLine)
  activateDirectEditor(el, undefined, newCaret)
  restorePreviewScroll(top)
  nextTick(refreshPreviewEditLayout)
}

const TEXT_BLOCK_SELECTOR = 'p[data-source-line], h1[data-source-line], h2[data-source-line], h3[data-source-line], h4[data-source-line], h5[data-source-line], h6[data-source-line], li[data-source-line], table[data-source-line], blockquote[data-source-line]'

const INLINE_SELECTOR = 'code, .math-inline, strong, em, s, del, mark, u, ins, kbd, sub, sup, a, img'

// 粗斜体 ***x***：markdown-it 渲染为 <em><strong>x</strong></em>（或反序）。点到任一层都视为整体。
function boldItalicEl(el: HTMLElement): HTMLElement | null {
  const same = (a: Element | null, b: Element | null) =>
    !!a && !!b && (a.textContent ?? '').trim() === (b.textContent ?? '').trim()
  if (el.matches('strong') && el.parentElement?.matches('em') && same(el, el.parentElement)) return el
  if (el.matches('em') && el.parentElement?.matches('strong') && same(el, el.parentElement)) return el
  if (el.matches('em') && el.firstElementChild?.matches('strong') && same(el, el.firstElementChild)) return el
  if (el.matches('strong') && el.firstElementChild?.matches('em') && same(el, el.firstElementChild)) return el
  return null
}

function inlineTarget(target: HTMLElement | null): {
  el: HTMLElement
  kind: InlineEditKind
  text: string
  selector: string
} | null {
  const el = target?.closest<HTMLElement>(INLINE_SELECTOR)
  if (!el || el.closest('pre')) return null
  const bi = boldItalicEl(el)
  if (bi) return {el: bi, kind: 'strongEmphasis', text: bi.textContent ?? '', selector: bi.matches('strong') ? 'strong' : 'em'}
  if (el.matches('code')) return {el, kind: 'code', text: el.textContent ?? '', selector: 'code'}
  if (el.matches('.math-inline')) {
    return {el, kind: 'math', text: el.dataset.mathSource ?? '', selector: '.math-inline'}
  }
  if (el.matches('strong')) return {el, kind: 'strong', text: el.textContent ?? '', selector: 'strong'}
  if (el.matches('em')) return {el, kind: 'emphasis', text: el.textContent ?? '', selector: 'em'}
  if (el.matches('s, del')) return {el, kind: 'strike', text: el.textContent ?? '', selector: 's, del'}
  if (el.matches('mark')) return {el, kind: 'mark', text: el.textContent ?? '', selector: 'mark'}
  if (el.matches('u, ins')) return {el, kind: 'underline', text: el.textContent ?? '', selector: 'u, ins'}
  if (el.matches('kbd')) return {el, kind: 'kbd', text: el.textContent ?? '', selector: 'kbd'}
  if (el.matches('sub')) return {el, kind: 'sub', text: el.textContent ?? '', selector: 'sub'}
  if (el.matches('sup')) return {el, kind: 'sup', text: el.textContent ?? '', selector: 'sup'}
  if (el.matches('img')) {
    return {el, kind: 'image', text: el.getAttribute('alt') ?? '', selector: 'img'}
  }
  return {el, kind: 'link', text: el.textContent ?? '', selector: 'a'}
}

function inlineOccurrence(root: HTMLElement, inline: ReturnType<typeof inlineTarget>): number {
  if (!inline) return 0
  // 与 findInlineEditRange 口径一致：在「相同可见文本」的同类元素里数第几个，
  // 否则多个不同文本的同类内联（如 **加粗** 与 ***粗斜体***）会把序号算错而回落整段。
  const want = (inline.el.textContent ?? '').trim()
  const matches = Array.from(root.querySelectorAll<HTMLElement>(inline.selector))
    .filter((m) => (m.textContent ?? '').trim() === want)
  return Math.max(0, matches.indexOf(inline.el))
}

function captureEditorTypography(target: HTMLElement) {
  const style = getComputedStyle(target)
  inlineEditorTypography.value = {
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    lineHeight: style.lineHeight,
  }
}

function directEditorText() {
  if (!directEditorEl) return ''
  const raw = directEditorEl.innerText ?? directEditorEl.textContent ?? ''
  return raw.replace(/\r\n?/g, '\n')
}

function renderDirectEditorSource() {
  if (!directEditorEl || directComposing) return
  const offset = getCaretOffset(directEditorEl)
  const text = directEditorText()
  inlineEditorText.value = text
  directEditorEl.innerHTML = highlightMarkdownSource(text)
  setCaretOffset(directEditorEl, Math.min(offset, text.length))
}

function scheduleDirectEditorHighlight() {
  if (directHighlightTimer !== null) window.clearTimeout(directHighlightTimer)
  directHighlightTimer = window.setTimeout(() => {
    directHighlightTimer = null
    renderDirectEditorSource()
  }, 60)
}

function applyDirectEditorText(next: string, caret: number) {
  inlineEditorText.value = next
  replaceInlineEdit(next)
  if (!directEditorEl) return
  directEditorEl.innerHTML = highlightMarkdownSource(next)
  setCaretOffset(directEditorEl, caret)
}

function onDirectEditorInput() {
  if (!directEditorEl || directComposing) return
  inlineEditorText.value = directEditorText()
  // 块级编辑只更新本地缓冲，关闭/换目标时再写回源码，避免多行 splice 中途丢字
  if (inlineEditorPresentation.value === 'inline' || inlineEditorColumnFrom.value !== null) {
    replaceInlineEdit(inlineEditorText.value)
  }
  scheduleDirectEditorHighlight()
  dispatchPreviewFormatStateFrom(directEditorEl)
}

function previewToolbarAnchor(): HTMLElement | null {
  if (tableCellEditor.value) return tableCellEditor.value.cell
  if (directEditorEl) return directEditorEl
  if (inlineEditorEl.value) return inlineEditorEl.value
  return editingTargetEl
}

// 共用工具条（EditorPane）需要知道「预览正在编辑哪个块、在屏幕上的位置」，以便在跟随焦点(浮动)模式下
// 浮在该块上方；固定模式仅用其有无来置灰结构类工具。这里把被编辑块的视口矩形派发出去（无则派 null）。
function dispatchPreviewEdit(rect: { top: number; left: number; right: number; bottom: number } | null) {
  window.dispatchEvent(new CustomEvent('morph:preview-editing', { detail: rect }))
}

function previewSelectionElement(): HTMLElement | null {
  const sel = window.getSelection()
  if (!sel?.rangeCount || !sel.anchorNode || !host.value?.contains(sel.anchorNode)) return null
  return sel.anchorNode instanceof HTMLElement ? sel.anchorNode : sel.anchorNode.parentElement
}

function sourceLineFromPreviewElement(el: HTMLElement | null): number {
  const block = el?.closest<HTMLElement>('[data-source-line]')
  const local = Number(block?.dataset.sourceLine)
  return Number.isFinite(local) ? local + markdownBodyLineOffset(doc.markdown) : inlineEditorLine.value
}

function dispatchPreviewFormatStateFrom(el: HTMLElement | null) {
  const formats = new Set<string>()
  let cur = el
  const root = host.value
  while (cur && root?.contains(cur)) {
    const tag = cur.tagName.toLowerCase()
    if (tag === 'strong' || tag === 'b') formats.add('bold')
    if (tag === 'em' || tag === 'i') formats.add('italic')
    if (tag === 's' || tag === 'del') formats.add('strike')
    if (tag === 'u' || tag === 'ins') formats.add('underline')
    if (tag === 'mark') formats.add('highlight')
    if (tag === 'code') formats.add('code')
    if (tag === 'a') formats.add('link')
    if (tag === 'table') formats.add('table')
    if (tag === 'img') formats.add('image')
    if (cur.classList.contains('math-inline') || cur.classList.contains('math-block')) formats.add('sigma')
    cur = cur.parentElement
  }
  // queryCommandState 会保留浏览器编辑命令的上下文；普通预览点击时读取它会把旧状态污染进来
  // （例如点行内 code 时误带 bold）。只在真正 contenteditable 编辑态内作为补充信号。
  const editable = el?.closest<HTMLElement>('[contenteditable="true"], [contenteditable="plaintext-only"]')
  if (editable) {
    try {
      if (document.queryCommandState('bold')) formats.add('bold')
      if (document.queryCommandState('italic')) formats.add('italic')
      if (document.queryCommandState('strikeThrough')) formats.add('strike')
      if (document.queryCommandState('underline')) formats.add('underline')
    } catch { /* queryCommandState is best-effort only */ }
  }

  const lines = doc.markdown.split('\n')
  const sourceLine = tableCellEditor.value?.html?.sourceLine ?? tableCellEditor.value?.model?.fromLine ?? sourceLineFromPreviewElement(el)
  const line = lines[sourceLine] ?? ''
  const heading = line.match(/^\s*(#{1,6})\s/)
  const kind = blockLinePrefixKind(line)
  if (kind === 'bullet' || kind === 'ordered' || kind === 'task') formats.add('list')
  if (/^\s*\|.*\|\s*$/.test(line)) formats.add('table')
  if (/!\[[^\]]*]\([^)]+\)/.test(line)) formats.add('image')
  const block = heading ? t(`editor.h${heading[1].length}` as 'editor.h1') : t('editor.body')
  window.dispatchEvent(new CustomEvent('morph:preview-format-state', { detail: { formats: Array.from(formats), block } }))
}

function dispatchPreviewFormatState() {
  const active = (document.activeElement as HTMLElement | null)
  const anchor = previewToolbarAnchor()
  const sel = window.getSelection()
  let node: Node | null = null
  if (sel?.rangeCount && sel.anchorNode && host.value?.contains(sel.anchorNode)) {
    node = sel.anchorNode
  } else if (active && host.value?.contains(active)) {
    node = active
  } else {
    node = anchor
  }
  dispatchPreviewFormatStateFrom(node instanceof HTMLElement ? node : node?.parentElement ?? null)
}

function updatePreviewToolbarPos() {
  const el = previewToolbarAnchor()
  if (!el || (!inlineEditorOpen.value && !tableCellEditor.value)) {
    dispatchPreviewEdit(null)
    window.dispatchEvent(new CustomEvent('morph:preview-format-state', { detail: { formats: [], block: t('editor.body') } }))
    return
  }
  // 有选区时工具条浮在「选区」上方，否则浮在「被编辑块」上方（贴合参考交互）。
  let r = el.getBoundingClientRect()
  const sel = window.getSelection()
  if (sel && sel.rangeCount && !sel.isCollapsed && sel.anchorNode && el.contains(sel.anchorNode)) {
    const sr = sel.getRangeAt(0).getBoundingClientRect()
    if (sr.width || sr.height) r = sr
  }
  dispatchPreviewEdit({ top: r.top, left: r.left, right: r.right, bottom: r.bottom })
  dispatchPreviewFormatState()
}

function onPreviewSelectionChange() {
  if (inlineEditorOpen.value || tableCellEditor.value) {
    updatePreviewToolbarPos()
    return
  }
  const el = previewSelectionElement()
  if (el) dispatchPreviewFormatStateFrom(el)
}

function onPreviewFormatPointerUp(e: PointerEvent) {
  const target = e.target as HTMLElement | null
  if (!target || !host.value?.contains(target)) return
  window.setTimeout(() => {
    dispatchPreviewFormatStateFrom(previewSelectionElement() ?? target)
  }, 0)
}

function onPreviewFormatKeyup() {
  const active = document.activeElement as HTMLElement | null
  if (!active || !host.value?.contains(active)) return
  dispatchPreviewFormatStateFrom(previewSelectionElement() ?? active)
}

function refreshPreviewEditLayout() {
  if (tableCellEditor.value) {
    updatePreviewToolbarPos()
    return
  }
  if (!inlineEditorOpen.value || !editingAnchorEl) return
  if (inlineEditorMode.value === 'code') {
    const sourceWidth = Math.min(560, Math.max(42, inlineEditorText.value.length * 8.2 + 18))
    updateInlineEditorPos(editingAnchorEl, sourceWidth)
    syncEditingReserve()
  }
  updatePreviewToolbarPos()
}

function observePreviewToolbarAnchor(el: HTMLElement | null) {
  previewToolbarObserver?.disconnect()
  previewToolbarObserver = null
  if (!el) return
  previewToolbarObserver = new ResizeObserver(() => refreshPreviewEditLayout())
  previewToolbarObserver.observe(el)
}

type PreviewFormatKind = 'bold' | 'italic' | 'strike' | 'underline' | 'highlight' | 'code' | 'link' | 'math'

// 共用工具条（EditorPane 固定顶栏）在预览处于编辑态时把格式动作派发过来
function onExternalFormat(e: CustomEvent<PreviewFormatKind>) {
  if (!wysiwygEl && !tableCellEditor.value && !directEditorEl && !inlineCode.value) return
  applyPreviewFormat(e.detail)
}

// 共用工具条在预览编辑态插入纯文本（如 emoji）到当前光标处
function onPreviewInsert(e: Event) {
  const text = (e as CustomEvent).detail as string
  const el = wysiwygEl ?? directEditorEl ?? (tableCellEditor.value?.cell ?? null) ?? inlineCode.value
  if (!el || !text) return
  insertContentEditable(el, text)
  if (wysiwygEl) commitWysiwyg()
  else if (directEditorEl) { inlineEditorText.value = directEditorText(); replaceInlineEdit(inlineEditorText.value); renderDirectEditorSource() }
  else if (inlineCode.value) onCodeInput()
}

function applyPreviewFormat(kind: PreviewFormatKind) {
  // WYSIWYG：粗/斜/删除线/下划线用 execCommand 即时渲染；高亮/行内代码/链接插入标记。序列化器统一还原回源码。
  if (wysiwygEl) {
    if (kind === 'bold') document.execCommand('bold')
    else if (kind === 'italic') document.execCommand('italic')
    else if (kind === 'strike') document.execCommand('strikeThrough')
    else if (kind === 'underline') document.execCommand('underline')
    else {
      const [b, a] = kind === 'code' ? ['`', '`'] : kind === 'highlight' ? ['==', '=='] : kind === 'math' ? ['$', '$'] : ['[', '](https://)']
      if (!wrapContentEditable(wysiwygEl, b, a)) insertContentEditable(wysiwygEl, b + a)
    }
    commitWysiwyg()
    updatePreviewToolbarPos()
    return
  }
  const el = tableCellEditor.value?.cell ?? directEditorEl ?? inlineCode.value
  if (!el) return
  const specs: Record<PreviewFormatKind, [string, string]> = {
    bold: ['**', '**'],
    italic: ['*', '*'],
    strike: ['~~', '~~'],
    underline: ['<u>', '</u>'],
    highlight: ['==', '=='],
    code: ['`', '`'],
    link: ['[', '](https://)'],
    math: ['$', '$'],
  }
  const [before, after] = specs[kind]
  if (!wrapContentEditable(el, before, after)) insertContentEditable(el, before + after)
  if (directEditorEl) {
    inlineEditorText.value = directEditorText()
    replaceInlineEdit(inlineEditorText.value)
    renderDirectEditorSource()
  }
  else if (inlineCode.value) onCodeInput()
  else if (tableCellEditor.value) {
    const state = tableCellEditor.value
    state.text = state.cell.innerText.replace(/\r\n?/g, '\n')
  }
  updatePreviewToolbarPos()
}

function activateDirectEditor(target: HTMLElement, point?: { x: number; y: number }, caretOverride?: number) {
  const top = scrollerEl.value?.scrollTop ?? 0
  // 须在替换 innerHTML 之前，根据渲染态 DOM 计算光标（引用/列表等前缀在预览里不可见）
  const resolvedCaret = caretOverride ?? resolveInitialCaret(target, point, inlineEditorText.value || '')
  // 解析成功 → 直接用该位置（已是源码偏移）；失败 → 回落行尾，稍后用源码态 hit-test 兜底定位。
  const caretResolved = resolvedCaret !== null
  const caret = resolvedCaret ?? (inlineEditorText.value || '').length
  directEditorEl = target
  editingAnchorEl = target
  directComposing = false
  target.classList.add(
      'typora-source-active',
      inlineEditorPresentation.value === 'inline' ? 'typora-source-inline' : 'typora-source-block',
  )
  if (inlineEditorPresentation.value === 'inline') {
    target.classList.add('preview-editing-inline')
  }
  target.setAttribute('contenteditable', 'true')
  target.setAttribute('spellcheck', 'false')
  target.innerHTML = highlightMarkdownSource(inlineEditorText.value || '')
  target.addEventListener('input', onDirectEditorInput)
  target.addEventListener('keydown', onDirectEditorKeydown)
  target.addEventListener('blur', onDirectEditorBlur)
  target.addEventListener('compositionstart', onDirectCompositionStart)
  target.addEventListener('compositionend', onDirectCompositionEnd)
  target.focus({ preventScroll: true })
  setCaretOffset(target, Math.min(caret, inlineEditorText.value.length))
  // 块级 rich：innerHTML 已换成字面源码，DOM 文本即源码本身。按原始点击点对源码 DOM
  // 再做一次 hit-test 落点，规避渲染态嵌套结构（如 blockquote>p、li>p）命中块边界、
  // 导致 caretRangeFromPoint 解析到 offset=0、只能定位到行首的问题。与「重复点击已编辑块」
  // 复用同一机制（placeCaretAtPoint 命中失败时不改选区，自动回退到上面计算出的 caret）。
  // 仅当按渲染态点击点未能解析出光标时，才在源码态 DOM 上再做一次 hit-test 兜底；
  // 否则会把已正确映射的光标覆盖成「源码态布局错位」的位置（用户报告的「光标跑到行尾附近」）。
  if (point && inlineEditorPresentation.value === 'block' && !caretResolved) {
    placeCaretAtPoint(target, point.x, point.y)
  }
  restorePreviewScroll(top)
  nextTick(() => {
    updatePreviewToolbarPos()
    observePreviewToolbarAnchor(target)
    refreshPreviewEditLayout()
  })
}

function onDirectCompositionStart() {
  directComposing = true
}

function onDirectCompositionEnd() {
  directComposing = false
  onDirectEditorInput()
  renderDirectEditorSource()
}

function deactivateDirectEditor() {
  if (directHighlightTimer !== null) {
    window.clearTimeout(directHighlightTimer)
    directHighlightTimer = null
  }
  if (!directEditorEl) return
  directEditorEl.removeEventListener('input', onDirectEditorInput)
  directEditorEl.removeEventListener('keydown', onDirectEditorKeydown)
  directEditorEl.removeEventListener('blur', onDirectEditorBlur)
  directEditorEl.removeEventListener('compositionstart', onDirectCompositionStart)
  directEditorEl.removeEventListener('compositionend', onDirectCompositionEnd)
  directEditorEl.removeAttribute('contenteditable')
  directEditorEl.removeAttribute('spellcheck')
  directEditorEl.classList.remove('typora-source-active', 'typora-source-inline', 'typora-source-block', 'preview-editing-inline')
  directEditorEl = null
  directComposing = false
}

function onDirectEditorKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    closeInlineEditor()
    return
  }
  if (e.key === 'Enter' && inlineEditorPresentation.value === 'inline') {
    e.preventDefault()
    closeInlineEditor()
    return
  }
  if (e.key !== 'Enter' || inlineEditorPresentation.value !== 'block' || !directEditorEl || e.isComposing) return
  const edit = blockEnterEdit(directEditorText(), getCaretOffset(directEditorEl))
  if (!edit) return
  e.preventDefault()
  applyDirectEditorText(edit.next, edit.caret)
  void rerenderAndResumeBlockEdit(edit.next, edit.caret)
}

function onDirectEditorBlur() {
  window.setTimeout(() => {
    if (directEditorEl && document.activeElement !== directEditorEl) closeInlineEditor()
  }, 0)
}

// —— 所见即所得块编辑 ——
// 进入：保持块的渲染 HTML，原地设为 contenteditable，在真实点击点放置光标（DOM 不变→精确、不跳）。
function activateWysiwygBlock(target: HTMLElement, startLine: number, endLine: number, point?: { x: number; y: number }) {
  const lines = doc.markdown.split('\n')
  const sourceLine = lines[startLine] ?? ''
  wysiwygPrefix = blockLinePrefix(sourceLine)
  wysiwygEl = target
  editingTargetEl = target
  editingAnchorEl = target
  wysiwygComposing = false
  inlineEditorLine.value = startLine
  inlineEditorEndLine.value = endLine
  inlineEditorColumnFrom.value = null
  inlineEditorColumnTo.value = null
  inlineEditorText.value = lines.slice(startLine, endLine + 1).join('\n')
  inlineEditorPresentation.value = 'block'
  inlineEditorMode.value = 'rich'
  inlineEditorOpen.value = true // 挂起自动重渲染
  target.classList.add('wysiwyg-editing')
  target.setAttribute('contenteditable', 'true')
  target.setAttribute('spellcheck', 'false')
  target.addEventListener('input', onWysiwygInput)
  target.addEventListener('keydown', onWysiwygKeydown)
  target.addEventListener('blur', onWysiwygBlur)
  target.addEventListener('pointerup', onWysiwygPointerUp)
  target.addEventListener('paste', onWysiwygPaste)
  target.addEventListener('compositionstart', onWysiwygCompositionStart)
  target.addEventListener('compositionend', onWysiwygCompositionEnd)
  syncWysiwygEmpty()
  target.focus({ preventScroll: true })
  // DOM 未变（仍是渲染态），按原始点击坐标放置光标即精确命中。
  let sourceGotoColumn: number | null = null
  if (point) {
    recordWysiwygPoint(point)
    const visible = visibleOffsetFromPointByGeometry(target, point)
    if (visible != null) {
      setCaretOffset(target, visible)
      sourceGotoColumn = mapVisibleOffsetToSource(visible, sourceLine)
    }
    else placeCaretAtPoint(target, point.x, point.y)
  }
  if (sourceGotoColumn === null
      && blockLinePrefixKind(sourceLine) === 'task'
      && sourceLine.slice(wysiwygPrefix.length).trim() === '') {
    // 空任务项渲染后只有 checkbox，没有正文文本节点；同步源码光标时应落在 `- [x]` 后面，而不是行首。
    sourceGotoColumn = sourceLine.length
  }
  if (sourceGotoColumn !== null) sync.requestGoto(startLine, sourceGotoColumn)
  // 显示浮动格式工具栏（粗/斜/删除线/代码/链接），与源码态编辑一致。
  nextTick(() => {
    updatePreviewToolbarPos()
    observePreviewToolbarAnchor(target)
  })
}

function onWysiwygCompositionStart() { wysiwygComposing = true }
function onWysiwygCompositionEnd() { wysiwygComposing = false; commitWysiwyg() }
function onWysiwygPointerUp(e: PointerEvent) { recordWysiwygPoint({ x: e.clientX, y: e.clientY }) }

function applyWysiwygPrefix(body: string): string {
  if (!wysiwygPrefix) return body
  const canDeduplicatePrefix = /^\s*>\s?$/.test(wysiwygPrefix)
  const taskPrefixNeedsSpace = /^\s*-\s+\[(?:\s|[xX])\]$/.test(wysiwygPrefix)
  return body.split('\n').map((line) => {
    const normalized = canDeduplicatePrefix ? line.replace(/^(\s*>\s?)+/, '') : line
    const prefix = taskPrefixNeedsSpace && normalized ? `${wysiwygPrefix} ` : wysiwygPrefix
    return prefix + normalized
  }).join('\n')
}

// 把当前渲染态行内 DOM 序列化为 markdown 正文，拼上原块前缀，回写源码（渲染已挂起，不会打断编辑）。
function commitWysiwyg() {
  if (!wysiwygEl || wysiwygComposing) return
  const body = serializeInlineDom(wysiwygEl)
  // body 含 \n（来自硬换行/多段）时：有前缀块（引用/列表/标题）逐行补前缀；无前缀段落直接落为正文。
  const md = applyWysiwygPrefix(body)
  inlineEditorText.value = md
  replaceInlineEdit(md)
}

function flushPendingWysiwygCommit() {
  if (wysiwygTimer !== null) {
    window.clearTimeout(wysiwygTimer)
    wysiwygTimer = null
  }
}

// 行首输入 markdown 前缀即时转块型（普通段落 → 列表/标题/引用），Typora 式自动套用。
const AUTOFORMAT_RE = /^(#{1,6} |> |[-*+] |\d+[.)] )/
function maybeAutoformatBlock(): boolean {
  if (!wysiwygEl || wysiwygPrefix || wysiwygComposing) return false // 仅对「无前缀的普通段落」转换，避免输入法中途误转
  if (!AUTOFORMAT_RE.test(serializeInlineDom(wysiwygEl))) return false
  // 源码行此刻即「前缀文本 + 内容」，markdown 会解析为对应块；提交→重渲染→重进 WYSIWYG，光标置内容起始。
  commitWysiwyg()
  lastAutoformatLine = inlineEditorLine.value // 标记：紧接的退格可撤销本次套用
  void resumeWysiwygAt(inlineEditorLine.value) // resumeWysiwygAt 内 nextTick 重抢焦点
  return true
}

// 行内即时套用：在内容末尾刚打完一对完整标记（**粗** / *斜* / `码` / ~~删~~ / ==高亮==）→ 立即渲染。
// 仅在「光标位于块视觉末尾」时触发，避免行中误转、并让重渲染后光标自然停在末尾。
// 单字符标记（* / `）用反向断言排除「双字符的一半」（如打到 **粗* 时不要误判成 *粗*）。
const INLINE_AUTOFORMAT_RES = [
  /(\*\*|~~|==)(?:(?!\1)[^\n])+?\1$/, // **粗** / ~~删~~ / ==高亮==
  /(?<!\*)\*[^*\n]+?\*$/,             // *斜*（前面不是 *，排除 ** 的一半）
  /(?<!`)`[^`\n]+?`$/,                // `码`（前面不是 `）
]
function maybeAutoformatInline(): boolean {
  if (!wysiwygEl || wysiwygComposing) return false
  if (getCaretOffset(wysiwygEl) !== (wysiwygEl.textContent ?? '').length) return false // 仅末尾触发
  const src = wysiwygPrefix + serializeInlineDom(wysiwygEl)
  if (!INLINE_AUTOFORMAT_RES.some((re) => re.test(src))) return false
  commitWysiwyg()
  void resumeWysiwygAt(inlineEditorLine.value, 'end')
  return true
}

// 空块占位：编辑中且内容为空时挂 class，CSS 显示「输入内容…」提示。
function syncWysiwygEmpty() {
  if (!wysiwygEl) return
  wysiwygEl.classList.toggle('wysiwyg-empty', (wysiwygEl.textContent ?? '').trim() === '')
}

// 智能粘贴：只取纯文本插入，避免外部 HTML 富文本污染（序列化器会被多余标签干扰）。
function onWysiwygPaste(e: ClipboardEvent) {
  const text = e.clipboardData?.getData('text/plain')
  if (text == null) return
  e.preventDefault()
  document.execCommand('insertText', false, text)
  onWysiwygInput()
}

function onWysiwygInput() {
  recordWysiwygPoint()
  syncWysiwygEmpty()
  if (maybeAutoformatBlock()) return
  if (maybeAutoformatInline()) return
  if (wysiwygTimer !== null) window.clearTimeout(wysiwygTimer)
  wysiwygTimer = window.setTimeout(() => { wysiwygTimer = null; commitWysiwyg() }, 80)
  dispatchPreviewFormatStateFrom(previewSelectionElement() ?? wysiwygEl)
}

// 当前光标在「块源码」中的偏移：前缀长度 + 光标前渲染内容序列化后的长度。
// 用于回车按真实光标位置拆分（而非一律行尾）。命中失败返回 null。
function wysiwygCaretSourceOffset(): number | null {
  if (!wysiwygEl) return null
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || !wysiwygEl.contains(sel.getRangeAt(0).endContainer)) return null
  const range = sel.getRangeAt(0)
  const pre = document.createRange()
  pre.selectNodeContents(wysiwygEl)
  pre.setEnd(range.endContainer, range.endOffset)
  const wrapper = document.createElement('div')
  wrapper.appendChild(pre.cloneContents())
  return wysiwygPrefix.length + serializeInlineDom(wrapper).length
}

// 光标在「块内」的行与列（按序列化文本算，列不含每行前缀）。用于回车时精确定位到光标所在的那一行。
function wysiwygCaretBlockPos(): { lineWithinBlock: number; col: number } | null {
  if (!wysiwygEl) return null
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || !wysiwygEl.contains(sel.getRangeAt(0).endContainer)) return null
  const range = sel.getRangeAt(0)
  const pre = document.createRange()
  pre.selectNodeContents(wysiwygEl)
  pre.setEnd(range.endContainer, range.endOffset)
  const wrapper = document.createElement('div')
  wrapper.appendChild(pre.cloneContents())
  const s = serializeInlineDom(wrapper)
  const nl = s.lastIndexOf('\n')
  return { lineWithinBlock: nl === -1 ? 0 : s.slice(0, nl).split('\n').length, col: nl === -1 ? s.length : s.length - nl - 1 }
}

// 在前缀首个标记字符前加反斜杠，使其渲染为字面（撤销自动套用，如 - → 列表 后立刻退格还原成「- 字面」）。
function escapeFirstMarker(line: string): string {
  if (/^\s*[#>\-*+] /.test(line)) return line.replace(/^(\s*)([#>\-*+])/, '$1\\$2')
  if (/^\s*\d+[.)] /.test(line)) return line.replace(/^(\s*)(\d+)([.)])/, '$1$2\\$3')
  return line
}

function onWysiwygKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') { e.preventDefault(); closeInlineEditor(); return }
  // 一次性消费「刚自动套用」标记：仅紧接其后的那一次按键可触发撤销。
  const justAutoformattedLine = lastAutoformatLine
  lastAutoformatLine = null
  // Cmd/Ctrl+B / I：对选区加粗 / 斜体（execCommand 即时渲染 <b>/<i>，序列化器还原为 **/*）。
  if ((e.metaKey || e.ctrlKey) && !e.altKey && wysiwygEl) {
    const k = e.key.toLowerCase()
    if (k === 'b') { e.preventDefault(); applyPreviewFormat('bold'); return }
    if (k === 'i') { e.preventDefault(); applyPreviewFormat('italic'); return }
    if (k === 'k') { e.preventDefault(); applyPreviewFormat('link'); return }
  }
  if (e.key !== 'Enter') recordWysiwygPoint()
  // Tab / Shift+Tab：列表项缩进 / 反缩进（每级 2 空格）。仅在列表块内拦截 Tab。
  if (e.key === 'Tab' && !e.isComposing && wysiwygEl) {
    const lines0 = doc.markdown.split('\n')
    const kind = blockLinePrefixKind(lines0[inlineEditorLine.value] ?? '')
    if (kind === 'bullet' || kind === 'ordered' || kind === 'task') {
      e.preventDefault()
      commitWysiwyg()
      const lines = doc.markdown.split('\n')
      let line = lines[inlineEditorLine.value] ?? ''
      line = e.shiftKey ? line.replace(/^ {1,2}/, '') : '  ' + line
      lines[inlineEditorLine.value] = line
      doc.setMarkdown(lines.join('\n'))
      void resumeWysiwygAt(inlineEditorLine.value)
    }
    return
  }
  // 退格落在块首且该块有前缀（列表/引用/标题）：
  //  · 紧接自动套用之后 → 撤销：把前缀转义为字面（- 列表 → 「- 字面」段落）；
  //  · 否则 → 去掉前缀降为普通段落（常见的「退格取消项目符号」）。
  if (e.key === 'Backspace' && !e.isComposing && wysiwygEl && wysiwygPrefix && getCaretOffset(wysiwygEl) === 0) {
    e.preventDefault()
    commitWysiwyg()
    const lines = doc.markdown.split('\n')
    const srcLine = lines[inlineEditorLine.value] ?? ''
    if (justAutoformattedLine === inlineEditorLine.value) {
      lines[inlineEditorLine.value] = escapeFirstMarker(srcLine)
    } else {
      const prefix = blockLinePrefix(srcLine)
      if (!prefix) return
      lines[inlineEditorLine.value] = srcLine.slice(prefix.length)
    }
    doc.setMarkdown(lines.join('\n'))
    void resumeWysiwygAt(inlineEditorLine.value)
    return
  }
  if (e.key === 'Enter' && !e.isComposing) {
    e.preventDefault()
    // 按光标「所在那一行」处理回车（多行块如引用/列表也精确，不再误伤首行或丢字）：
    // 有格式非空行→下一行延续同款格式；空格式行→退出为无格式空行；无格式→普通拆行。
    const recentPoint = lastWysiwygPoint && Date.now() - lastWysiwygPoint.at < 2000 ? lastWysiwygPoint : null
    const pos = recentPoint ? (wysiwygPointBlockPos(recentPoint) ?? wysiwygCaretBlockPos()) : wysiwygCaretBlockPos()
    recordWysiwygPoint()
    const start = inlineEditorLine.value
    let end = inlineEditorEndLine.value
    let lines = doc.markdown.split('\n')
    if (start === end && blockLinePrefixKind(lines[start] ?? '') === 'blockquote') {
      flushPendingWysiwygCommit()
      commitWysiwyg()
      lines = doc.markdown.split('\n')
      end = inlineEditorEndLine.value
    }
    const lineIdx = Math.min(start + (pos?.lineWithinBlock ?? (end - start)), end)
    let targetLine = lines[lineIdx] ?? ''
    if (blockLinePrefixKind(targetLine) === 'blockquote') {
      targetLine = collapseDuplicateQuotePrefix(targetLine)
      lines[lineIdx] = targetLine
    }
    const sourceCol = pos ? blockLinePrefix(targetLine).length + pos.col : targetLine.length
    let r = lineContinueEnter(targetLine, sourceCol)
    // 引用块不能在回车前 commit 整个 blockquote DOM：多源码行会合成一个 DOM 块，
    // 序列化时容易变成 `> > ...`，并污染 endLine，导致第二次回车无响应。
    if (blockLinePrefixKind(targetLine) !== 'blockquote') {
      commitWysiwyg()
      const latest = doc.markdown.split('\n')
      const latestLine = latest[lineIdx] ?? ''
      r = lineContinueEnter(latestLine, Math.min(sourceCol, latestLine.length))
      latest.splice(lineIdx, 1, ...r.lines)
      doc.setMarkdown(latest.join('\n'))
    } else {
      lines.splice(lineIdx, 1, ...r.lines)
      doc.setMarkdown(lines.join('\n'))
    }
    void resumeWysiwygAt(lineIdx + r.caretLine)
    return
  }
}

// 重渲染后定位到某源码行对应的块，重新进入 WYSIWYG（用于回车续行）。
async function resumeWysiwygAt(line: number, caretAt: 'start' | 'end' = 'start') {
  const top = scrollerEl.value?.scrollTop ?? 0
  // 已把内容提交进源码，这里只拆掉旧编辑器、不可再提交（否则会用旧 DOM 覆盖结果）。
  deactivateWysiwyg(false)
  inlineEditorOpen.value = false
  await renderPreview()
  const lines = doc.markdown.split('\n')
  const formattedBlank = formattedBlankLineEditAnchor(line)
  const range = formattedBlank ? { start: line, end: line } : blockEditRange(lines, line)
  const el = formattedBlank ?? findElementAtLine(range.start) ?? emptyLineEditAnchor(line)
  if (el) {
    const target = wysiwygBlockTarget(el, range.start)
    activateWysiwygBlock(target, range.start, range.end)
    const caretOffset = resumeCaretOffsetForLine(lines, range, line, caretAt)
    const setCaret = () => setCaretOffset(target, caretOffset)
    // start：行中拆分的后半段开头 / 新空行；end：行内即时套用格式后停在内容末尾。
    setCaret()
    // 由 input 事件触发的重进（自动套用）里，浏览器会在 input 周期结束时把焦点/选区还原到旧（已脱离）节点 → 焦点掉到 body；
    // 故再用一次 nextTick 重新抢焦点+置光标，确保套用后能继续打字。
    nextTick(() => { target.focus({ preventScroll: true }); setCaret() })
  }
  restorePreviewScroll(top)
}

function onWysiwygBlur() {
  window.setTimeout(() => {
    if (wysiwygEl && document.activeElement !== wysiwygEl) closeInlineEditor()
  }, 0)
}

function deactivateWysiwyg(commit = true) {
  if (wysiwygTimer !== null) { window.clearTimeout(wysiwygTimer); wysiwygTimer = null }
  if (!wysiwygEl) return
  if (commit) commitWysiwyg()
  wysiwygEl.classList.remove('wysiwyg-empty')
  wysiwygEl.removeEventListener('input', onWysiwygInput)
  wysiwygEl.removeEventListener('keydown', onWysiwygKeydown)
  wysiwygEl.removeEventListener('blur', onWysiwygBlur)
  wysiwygEl.removeEventListener('pointerup', onWysiwygPointerUp)
  wysiwygEl.removeEventListener('paste', onWysiwygPaste)
  wysiwygEl.removeEventListener('compositionstart', onWysiwygCompositionStart)
  wysiwygEl.removeEventListener('compositionend', onWysiwygCompositionEnd)
  wysiwygEl.removeAttribute('contenteditable')
  wysiwygEl.removeAttribute('spellcheck')
  wysiwygEl.classList.remove('wysiwyg-editing')
  wysiwygEl = null
  wysiwygComposing = false
  recordWysiwygPoint()
}

function resetEditingTarget() {
  editingTargetEl?.style.removeProperty('--ipe-reserve')
  editingCardEl?.classList.remove('chart-card-editing')
  editingCardEl = null
  host.value?.querySelectorAll('.preview-editing-target').forEach((node) => {
    node.classList.remove('preview-editing-target', 'preview-editing-inline')
  })
}

function openInlineEditor(
  line: number,
  el: HTMLElement,
  clicked: HTMLElement | null = null,
  point?: { x: number; y: number },
): boolean {
  // 已在编辑：点当前区域内只重定位光标，不重新炸开/重置
  if (directEditorEl && clicked && (directEditorEl === clicked || directEditorEl.contains(clicked))) {
    if (point) placeCaretAtPoint(directEditorEl, point.x, point.y)
    directEditorEl.focus({ preventScroll: true })
    return true
  }
  // WYSIWYG 块内再次点击：只移动光标（点到具体行内元素则继续往下走 inline 源码编辑）。
  if (wysiwygEl && clicked && (wysiwygEl === clicked || wysiwygEl.contains(clicked))) {
    if (!inlineTarget(clicked)) {
      if (point) {
        recordWysiwygPoint(point)
        const visible = visibleOffsetFromPointByGeometry(wysiwygEl, point)
        if (visible != null) setCaretOffset(wysiwygEl, visible)
        else placeCaretAtPoint(wysiwygEl, point.x, point.y)
      }
      wysiwygEl.focus({ preventScroll: true })
      return true
    }
    closeInlineEditor() // 点到行内元素：退出 WYSIWYG，转交下方 inline 源码编辑
  }
  if (directEditorEl && inlineEditorOpen.value) flushDirectEditor()
  deactivateDirectEditor()

  const lines = doc.markdown.split('\n')
  const blockRange = blockEditRange(lines, line)
  const languageBadge = clicked?.closest<HTMLElement>('.code-lang') ?? null
  const languageRange = languageBadge ? fenceLanguageRange(lines[blockRange.start] ?? '') : null
  // O7：把整个 <p class="math-block"> 视为可编辑目标（与 pre/chart-block 同档），不再回落到段落级 rich 编辑
  const mathBlockEl = clicked?.closest<HTMLElement>('.math-block') ?? null
  const inline = mathBlockEl ? null : inlineTarget(clicked)
  let inlineRange = !languageRange && inline
      ? findInlineEditRange(lines, blockRange, inline.kind, inline.text, inlineOccurrence(el, inline))
      : null
  if (!inlineRange && inline?.kind === 'link') {
    inlineRange = findInlineEditRange(lines, blockRange, 'autoLink', inline.text, inlineOccurrence(el, inline))
  }
  // 点中了行内语法但没能精确定位源码时，不能退回整段 rich 编辑；
  // 否则会把一整行 markdown 语法全部展开成源码。
  if (!languageRange && inline && !inlineRange) return false
  const target = languageRange && languageBadge
      ? languageBadge
      : mathBlockEl
          ? mathBlockEl
          : inlineRange && inline
              ? inline.el
              : normalizeEditableTarget(el)
  const targetForWysiwyg = wysiwygBlockTarget(target, blockRange.start)
  // 含行内渲染标签的段落/标题/列表项：所见即所得原地编辑（保持渲染、不炸成源码、不跳变）。
  // 引用块即使是纯文本也走 WYSIWYG；否则会退回源码块编辑，Enter 在 blockquote>p 结构下体验不稳定。
  // 点选具体行内元素（粗体/链接/代码）仍走上面的 inline 源码编辑；这里处理点到「普通文字」的情况。
  // 仅对单源码行块启用（多行块的行内序列化更复杂，暂保持原行为，避免误写）。
  if (!languageRange && !inlineRange && (targetForWysiwyg.matches('blockquote') || hasRenderedInlineChildren(target))
      && target.matches('p, h1, h2, h3, h4, h5, h6, li, blockquote')) {
    resetEditingTarget()
    activateWysiwygBlock(targetForWysiwyg, blockRange.start, blockRange.end, point)
    return true
  }
  // 纯代码块：DOM 级真原地编辑（不炸开浮层）。mermaid/echarts/公式等是 .chart-block/.math-block，不走这里。
  if (!languageRange && !inlineRange && target.matches('pre.hljs')) {
    if (codeInplace) { closeCodeInplace(); return true } // 正在原地编辑别的代码块 → 先收尾（重渲染后再点开新的）
    resetEditingTarget()
    inlineCodeLang.value = target.querySelector('.code-lang')?.textContent?.trim() ?? ''
    if (activateCodeInPlace(target, fencedContentRange(lines, blockRange), inlineCodeLang.value, point)) return true
  }
  let range = languageRange
      ? {start: blockRange.start, end: blockRange.start}
      : inlineRange
          ? {start: inlineRange.line, end: inlineRange.line}
          : blockRange
  if (!languageRange && !inlineRange && target.matches('pre, .chart-block')) {
    range = fencedContentRange(lines, blockRange)
  }
  resetEditingTarget()
  inlineEditorLine.value = range.start
  inlineEditorEndLine.value = range.end
  inlineEditorColumnFrom.value = languageRange?.from ?? inlineRange?.from ?? null
  inlineEditorColumnTo.value = languageRange?.to ?? inlineRange?.to ?? null
  inlineEditorText.value = languageRange?.source ?? inlineRange?.source
      ?? (range.end < range.start ? '' : lines.slice(range.start, range.end + 1).join('\n'))
  inlineEditorMode.value = languageRange
      ? 'rich'
      : target.matches('pre, .chart-block, .math-block')
          ? 'code'
          : 'rich'
  inlineEditorPresentation.value = languageRange || inlineRange
      ? 'inline'
      : target.matches('.math-block')
          ? 'math'
          : target.matches('.chart-block')
              ? 'chart'
              : target.matches('pre')
                  ? 'code'
                  : 'block'
  if (inlineEditorMode.value === 'code') {
    // 折叠前先按点击落点算出代码内的字符偏移（在原渲染态 code 上算，布局/缩放无关），编辑器打开后还原光标
    pendingCodeCaretOffset = target.matches('pre.hljs') ? clickCaretOffsetInCode(target, point) : null
    // 防跳动：先用「原块当前布局高度」种下占位高，再加折叠类——这样原块不会先塌成 0 再被撑回，
    // 后续内容保持原位；编辑器挂载后 syncEditingReserve 再平滑校正到编辑器实际高度。
    // offsetHeight 与 --ipe-reserve 同处 .paper-zoom 内的布局坐标（transform 前），无需再除以缩放。
    const naturalH = target.offsetHeight
    target.style.setProperty('--ipe-reserve', `${naturalH}px`)
    target.classList.add('preview-editing-target')
  }
  if (target.matches('pre.hljs')) {
    inlineCodeLang.value = target.querySelector('.code-lang')?.textContent?.trim() ?? ''
    inlineEditorTitle.value = inlineCodeLang.value ? `${inlineCodeLang.value} 代码块` : '代码块'
    inlineEditorLabel.value = inlineCodeLang.value || 'code'
  } else if (target.matches('.chart-block')) {
    const card = target.closest<HTMLElement>('.chart-card')
    inlineCodeLang.value = target.dataset.chartType === 'mermaid' ? 'mermaid' : 'json'
    // 标题已移出卡片，作为卡片前的普通标题（H3）存在，从前一兄弟取
    const prevHeading = card?.previousElementSibling as HTMLElement | null
    inlineEditorTitle.value =
      (prevHeading && /^H[1-6]$/.test(prevHeading.tagName) ? prevHeading.textContent?.trim() : '') || '图表'
    inlineEditorLabel.value = target.dataset.chartType ?? 'chart'
    editingCardEl = card
    editingCardEl?.classList.add('chart-card-editing')
  } else if (target.matches('.math-block')) {
    inlineCodeLang.value = 'latex'
    inlineEditorTitle.value = '数学公式'
    inlineEditorLabel.value = 'tex'
  } else {
    inlineCodeLang.value = ''
    inlineEditorTitle.value = ''
    inlineEditorLabel.value = ''
  }
  editingTargetEl = target
  editingAnchorEl = editingCardEl ?? target
  captureEditorTypography(target)
  inlineEditorOpen.value = true
  // Markdown 正文：所见即所得原地编辑（保持渲染、不跳变）；点到具体行内 token 走源码就地编辑；
  // 代码块/图表/公式仍走浮层「上源码下预览」。
  if (inlineEditorMode.value === 'rich') {
    if (inlineEditorPresentation.value === 'block') {
      activateWysiwygBlock(target, range.start, range.end, point)
    } else {
      activateDirectEditor(target, point) // 行内 token：露出该 token 的源码标记编辑
    }
    return true
  }
  const sourceWidth = Math.min(560, Math.max(42, inlineEditorText.value.length * 8.2 + 18))
  updateInlineEditorPos(editingCardEl ?? target, sourceWidth)
  nextTick(() => {
    const top = scrollerEl.value?.scrollTop ?? 0
    const editor = inlineCode.value
    renderInlineCode()
    renderInlinePreview()
    editor?.focus({ preventScroll: true })
    // 把光标放到点击落点对应的字符位置（高亮后按字符偏移还原，布局无关、精确）
    if (editor && pendingCodeCaretOffset != null) {
      setCaretOffset(editor, Math.min(pendingCodeCaretOffset, (editor.textContent ?? '').length))
    }
    pendingCodeCaretOffset = null
    restorePreviewScroll(top)
    syncEditingReserve()
    // 编辑器随输入长高/变矮时，实时同步原块占位高，保持后续内容紧贴编辑器底部
    if (inlineEditorEl.value) {
      editorObserver?.disconnect()
      editorObserver = new ResizeObserver(() => refreshPreviewEditLayout())
      editorObserver.observe(inlineEditorEl.value)
    }
    refreshPreviewEditLayout()
    observePreviewToolbarAnchor(inlineEditorEl.value)
  })
  return true
}

function openLinkEditor(line: number, block: HTMLElement, anchor: HTMLElement): boolean {
  const lines = doc.markdown.split('\n')
  const range = blockEditRange(lines, line)
  const inline = inlineTarget(anchor)
  if (!inline || inline.kind !== 'link') return false
  const located = findInlineEditRange(lines, range, 'link', inline.text, inlineOccurrence(block, inline))
  if (!located) return false
  const fields = parseMarkdownLink(located.source)
  if (!fields) return false
  const rect = anchor.getBoundingClientRect()
  linkEditor.value = {
    line: located.line,
    from: located.from,
    to: located.to,
    anchor: { left: rect.left, top: rect.top, bottom: rect.bottom },
    fields,
  }
  return true
}

function saveLink(fields: MarkdownLinkFields) {
  const state = linkEditor.value
  if (!state) return
  const lines = doc.markdown.split('\n')
  const line = lines[state.line]
  if (line === undefined) return
  lines[state.line] = line.slice(0, state.from) + buildMarkdownLink(fields) + line.slice(state.to)
  linkEditor.value = null
  setMarkdownPreservePreviewScroll(lines.join('\n'))
}

// 去链接：把 [文字](url) 源码替换为纯文字（保留链接文字，移除链接语法）
function unlinkLink() {
  const state = linkEditor.value
  if (!state) return
  const lines = doc.markdown.split('\n')
  const line = lines[state.line]
  if (line === undefined) return
  lines[state.line] = line.slice(0, state.from) + (state.fields.text || state.fields.url) + line.slice(state.to)
  linkEditor.value = null
  setMarkdownPreservePreviewScroll(lines.join('\n'))
}

function restorePreviewScroll(top: number) {
  const scroller = scrollerEl.value
  if (!scroller) return
  scroller.scrollTop = top
  requestAnimationFrame(() => {
    if (!scrollerEl.value) return
    scrollerEl.value.scrollTop = top
    requestAnimationFrame(() => {
      if (scrollerEl.value) scrollerEl.value.scrollTop = top
    })
  })
}

function setMarkdownPreservePreviewScroll(markdown: string) {
  const top = scrollerEl.value?.scrollTop ?? 0
  doc.setMarkdown(markdown)
  void nextTick(() => restorePreviewScroll(top))
}

function markdownBodyLineOffset(markdown: string): number {
  if (!markdown.startsWith('---')) return 0
  const end = markdown.indexOf('\n---', 3)
  if (end === -1) return 0
  const after = markdown.indexOf('\n', end + 1)
  if (after === -1) return 0
  return markdown.slice(0, after + 1).split('\n').length - 1
}

const CHIP_SELECTOR = '.pill, .ui-bar, .ui-spark, .md-icon'

function chipOccurrence(root: HTMLElement, chip: HTMLElement): number {
  const chips = Array.from(root.querySelectorAll<HTMLElement>(CHIP_SELECTOR))
  return Math.max(0, chips.indexOf(chip))
}

function chipCandidates(lines: string[], start: number, end: number) {
  const out: { line: number; from: number; to: number; fields: ChipFields }[] = []
  const paren = /\(\(\s*([^()]+?)\s*\)\)/g
  const icon = /:([a-z][a-z0-9-]*):/gi
  for (let lineNo = start; lineNo <= end; lineNo++) {
    const line = lines[lineNo] ?? ''
    let m: RegExpExecArray | null
    paren.lastIndex = 0
    while ((m = paren.exec(line))) {
      const fields = parseChip(m[0])
      if (fields) out.push({ line: lineNo, from: m.index, to: m.index + m[0].length, fields })
    }
    icon.lastIndex = 0
    while ((m = icon.exec(line))) {
      if (!ICON_NAMES.includes(m[1])) continue
      const fields = parseChip(m[0])
      if (fields?.kind === 'icon') out.push({ line: lineNo, from: m.index, to: m.index + m[0].length, fields })
    }
  }
  return out.sort((a, b) => a.line - b.line || a.from - b.from)
}

function openChipEditor(line: number, block: HTMLElement, chip: HTMLElement): boolean {
  const lines = doc.markdown.split('\n')
  const range = blockEditRange(lines, line)
  const located = chipCandidates(lines, range.start, range.end)[chipOccurrence(block, chip)]
  if (!located) return false
  const rect = chip.getBoundingClientRect()
  chipEditor.value = {
    ...located,
    anchor: { left: rect.left, top: rect.top, bottom: rect.bottom },
  }
  return true
}

function saveChip(fields: ChipFields) {
  const state = chipEditor.value
  if (!state) return
  const lines = doc.markdown.split('\n')
  const line = lines[state.line]
  if (line === undefined) return
  lines[state.line] = line.slice(0, state.from) + serializeChip(fields) + line.slice(state.to)
  chipEditor.value = null
  setMarkdownPreservePreviewScroll(lines.join('\n'))
}

function tableContextFromCell(
  table: HTMLElement,
  cell: HTMLTableCellElement,
  tr: HTMLTableRowElement,
  absoluteSourceLine?: number,
) {
  const localSourceLine = Number(table.dataset.sourceLine)
  const sourceLine = absoluteSourceLine ?? (
    Number.isFinite(localSourceLine)
      ? localSourceLine + markdownBodyLineOffset(doc.markdown)
      : NaN
  )
  if (!Number.isFinite(sourceLine)) return null
  const model = detectTable(doc.markdown.split('\n'), sourceLine)
  if (!model) return null
  const col = Math.min(Math.max(0, cell.cellIndex), model.header.length - 1)
  let bodyIndex = -1
  if (!tr.closest('thead')) {
    const tbody = tr.closest('tbody')
    bodyIndex = tbody ? Array.from(tbody.rows).indexOf(tr) : -1
  }
  bodyIndex = Math.min(bodyIndex, model.rows.length - 1)
  return { model, col, bodyIndex }
}

function applyTableModel(model: TableModel, next: TableModel) {
  const lines = doc.markdown.split('\n')
  const text = formatTable(next).join('\n')
  lines.splice(model.fromLine, model.toLine - model.fromLine + 1, ...text.split('\n'))
  setMarkdownPreservePreviewScroll(lines.join('\n'))
}

function sourceLineFromTable(table: HTMLElement): number | null {
  const local = Number(table.dataset.sourceLine)
  if (!Number.isFinite(local)) return null
  return local + markdownBodyLineOffset(doc.markdown)
}

function editableHtmlTableSource(table: HTMLElement): { fromLine: number; toLine: number; html: string } | null {
  const sourceLine = sourceLineFromTable(table)
  if (sourceLine == null) return null
  const lines = doc.markdown.split('\n')
  const htmlBlock = findHtmlTableBlock(lines, sourceLine)
  if (htmlBlock) return htmlBlock
  const model = detectTable(lines, sourceLine)
  if (!model) return null
  return { fromLine: model.fromLine, toLine: model.toLine, html: tableToHtml(model) }
}

function commitTableSize(table: HTMLElement, index: number, px: number) {
  const source = editableHtmlTableSource(table)
  if (!source) return
  const nextHtml = setHtmlTableColumnWidth(source.html, index, px)
  const lines = doc.markdown.split('\n')
  lines.splice(source.fromLine, source.toLine - source.fromLine + 1, ...nextHtml.split('\n'))
  setMarkdownPreservePreviewScroll(lines.join('\n'))
}

function applyHtmlTable(table: HTMLElement, update: (html: string) => string): boolean {
  const sourceLine = sourceLineFromTable(table)
  if (sourceLine == null) return false
  const lines = doc.markdown.split('\n')
  const block = findHtmlTableBlock(lines, sourceLine)
  if (!block) return false
  const next = update(block.html)
  lines.splice(block.fromLine, block.toLine - block.fromLine + 1, ...next.split('\n'))
  setMarkdownPreservePreviewScroll(lines.join('\n'))
  return true
}

function commitMergeHtmlCells(table: HTMLElement, sel: NonNullable<typeof tableCellSelection.value>) {
  const source = editableHtmlTableSource(table)
  if (!source) return
  const nextHtml = mergeHtmlTableCells(source.html, sel.rowStart, sel.rowEnd, sel.colStart, sel.colEnd)
  if (nextHtml !== source.html) {
    const lines = doc.markdown.split('\n')
    lines.splice(source.fromLine, source.toLine - source.fromLine + 1, ...nextHtml.split('\n'))
    setMarkdownPreservePreviewScroll(lines.join('\n'))
  }
  tableCellSelection.value = null
  applyCellSelClasses()
}

// 由表格元素求源码行 → 模型（无需具体单元格，用于悬停加行/加列）。
function tableModelFromEl(table: HTMLElement): TableModel | null {
  const local = Number(table.dataset.sourceLine)
  const sourceLine = Number.isFinite(local) ? local + markdownBodyLineOffset(doc.markdown) : NaN
  if (!Number.isFinite(sourceLine)) return null
  return detectTable(doc.markdown.split('\n'), sourceLine)
}

// 悬停到底行/右列 → 算出底部「加行」条与右侧「加列」条的位置（相对 .paper-scroll 内容坐标）。
function updateTableAddUi(table: HTMLElement, target: HTMLElement | null, point?: { x: number; y: number }) {
  const scroller = scrollerEl.value
  if (!scroller || (inlineEditorOpen.value && !tableCellEditor.value)) { tableAddUi.value = null; return }
  const local = Number(table.dataset.sourceLine)
  if (!Number.isFinite(local)) { tableAddUi.value = null; return }
  const cell = target?.closest<HTMLTableCellElement>('td, th')
  const row = cell?.closest<HTMLTableRowElement>('tr')
  const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>('tr'))
  const lastRow = rows[rows.length - 1]
  const maxCol = tableVisualColumnCount(table) - 1
  const tr = table.getBoundingClientRect()
  let onLastRow = false
  let onLastCol = false
  if (cell && row && table.contains(cell)) {
    const coord = tableCellCoord(table, cell)
    onLastRow = row === lastRow
    onLastCol = coord !== null && maxCol >= 0 && (coord.col + Math.max(1, cell.colSpan || 1) - 1) >= maxCol
  } else if (point) {
    const edge = 40
    onLastRow = point.x >= tr.left - 14 && point.x <= tr.right + 34 && point.y >= tr.bottom - edge && point.y <= tr.bottom + edge
    onLastCol = point.y >= tr.top - 14 && point.y <= tr.bottom + 34 && point.x >= tr.right - edge && point.x <= tr.right + edge
  } else {
    tableAddUi.value = null
    return
  }
  if (!onLastRow && !onLastCol) { tableAddUi.value = null; return }
  const sr = scroller.getBoundingClientRect()
  const next: NonNullable<typeof tableAddUi.value> = { line: local }
  const left = tr.left - sr.left + scroller.scrollLeft
  const top = tr.top - sr.top + scroller.scrollTop
  if (onLastRow) next.rowBtn = { left, top: tr.bottom - sr.top + scroller.scrollTop, width: tr.width }
  if (onLastCol) next.colBtn = { left: tr.right - sr.left + scroller.scrollLeft, top, height: tr.height }
  tableAddUi.value = {
    ...next,
  }
}

function tableNearAddEdge(x: number, y: number): HTMLElement | null {
  const root = host.value
  if (!root) return null
  const edge = 44
  for (const table of Array.from(root.querySelectorAll<HTMLElement>('table[data-source-line]'))) {
    const r = table.getBoundingClientRect()
    const nearBottom = x >= r.left - 14 && x <= r.right + 38 && y >= r.bottom - edge && y <= r.bottom + edge
    const nearRight = y >= r.top - 14 && y <= r.bottom + 38 && x >= r.right - edge && x <= r.right + edge
    if (nearBottom || nearRight) return table
  }
  return null
}

function cancelTableAddHide() {
  if (tableAddHideTimer !== null) { window.clearTimeout(tableAddHideTimer); tableAddHideTimer = null }
}

function scheduleTableAddHide(delay = 520) {
  if (tableAddHideTimer !== null) return
  tableAddHideTimer = window.setTimeout(() => {
    const hovered = host.value?.querySelector('.tbl-add:hover')
    if (hovered) { tableAddHideTimer = null; scheduleTableAddHide(delay); return }
    tableAddUi.value = null
    tableAddHideTimer = null
  }, delay)
}

function onPreviewPointerLeave() {
  cancelTableAddHide()
  cancelDragHandleHide()
  tableAddUi.value = null
  if (!draggingBlock.value) { dragHandle.value = null; hoverBlock = null }
}

function onTablePointerMove(e: MouseEvent) {
  const tgt = e.target as HTMLElement | null
  const table = tgt?.closest<HTMLElement>('table[data-source-line]') ?? tableNearAddEdge(e.clientX, e.clientY)
  if (table) {
    cancelTableAddHide()
    updateTableAddUi(table, tgt, { x: e.clientX, y: e.clientY })
  } else if (tgt?.closest('.tbl-add')) {
    // 停留在「+」按钮上：保持显示，取消任何待执行的隐藏（之前漏了这一步，导致移到按钮上后仍被定时器吃掉）
    cancelTableAddHide()
  } else {
    // 离开表格且不在「+」按钮上：稍延迟隐藏，便于从单元格穿过空隙移动到按钮。
    scheduleTableAddHide()
  }
}

function sourceLineFromBlock(block: HTMLElement): number | null {
  const local = Number(block.dataset.sourceLine)
  if (!Number.isFinite(local)) return null
  return local + bodyLineOffset()
}

function blockUnderPointer(target: HTMLElement | null): HTMLElement | null {
  if (!target || !host.value?.contains(target)) return null
  if (target.closest('.doc-block-drag-handle, .md-heading-toggle, .md-image-resize, .md-table-handle, .md-table-resize, .md-row-select, .tbl-add')) return null
  const table = target.closest<HTMLElement>('table[data-source-line]')
  if (table) return table
  const block = target.closest<HTMLElement>(
    `${TEXT_BLOCK_SELECTOR}, pre[data-source-line], .chart-block[data-source-line], .math-block[data-source-line], .md-blank-line[data-source-line], .preview-edit-blank[data-source-line]`,
  )
  if (!block || block.classList.contains('md-heading-hidden')) return null
  return normalizeEditableTarget(block)
}

function nearestBlockAtPoint(x: number, y: number): HTMLElement | null {
  const root = host.value
  if (!root) return null
  const seen = new Set<HTMLElement>()
  const blocks = Array.from(root.querySelectorAll<HTMLElement>(
    `${TEXT_BLOCK_SELECTOR}, pre[data-source-line], .chart-block[data-source-line], .math-block[data-source-line], .md-blank-line[data-source-line], .preview-edit-blank[data-source-line], table[data-source-line]`,
  ))
    .map((el) => normalizeEditableTarget(el))
    .filter((el) => {
      if (!el || seen.has(el) || el.classList.contains('md-heading-hidden')) return false
      seen.add(el)
      return true
    })
  let best: { el: HTMLElement; distance: number } | null = null
  for (const el of blocks) {
    const r = el.getBoundingClientRect()
    if (r.bottom < 0 || r.top > window.innerHeight) continue
    const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0
    const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0
    const distance = Math.hypot(dx, dy)
    if (!best || distance < best.distance) best = { el, distance }
  }
  return best?.el ?? null
}

function blockLogicalRect(block: HTMLElement): { left: number; top: number; bottom: number; height: number; rawTop: number; rawHeight: number } | null {
  const zoomEl = block.closest('.paper-zoom') as HTMLElement | null
  if (!zoomEl) return null
  const r = block.getBoundingClientRect()
  const zr = zoomEl.getBoundingClientRect()
  const scale = ui.previewZoom || 1
  return {
    left: (r.left - zr.left) / scale,
    top: (r.top - zr.top) / scale,
    bottom: (r.bottom - zr.top) / scale,
    height: r.height / scale,
    rawTop: r.top,
    rawHeight: r.height,
  }
}

function cancelDragHandleHide() {
  if (dragHandleHideTimer !== null) { window.clearTimeout(dragHandleHideTimer); dragHandleHideTimer = null }
}

function onPreviewDragHover(e: PointerEvent) {
  if (draggingBlock.value) return
  if (inlineEditorOpen.value || tableCellEditor.value || tableResizeState || imgHandleDrag || imgSel.value) {
    cancelDragHandleHide()
    dragHandle.value = null
    hoverBlock = null
    return
  }
  // 指针落在拖拽手柄本身：保持显示（手柄被 blockUnderPointer 排除，否则一移上去就消失，根本没法抓住拖动）
  if ((e.target as HTMLElement | null)?.closest('.doc-block-drag-handle')) {
    cancelDragHandleHide()
    return
  }
  const block = blockUnderPointer(e.target as HTMLElement | null)
  const line = block ? sourceLineFromBlock(block) : null
  const rect = block ? blockLogicalRect(block) : null
  if (!block || line === null || !rect) {
    // 块与手柄之间隔着一段纸张留白，移动途中会短暂落在空白处；延迟隐藏，给指针时间抵达手柄。
    if (dragHandle.value && dragHandleHideTimer === null) {
      dragHandleHideTimer = window.setTimeout(() => { dragHandle.value = null; hoverBlock = null; dragHandleHideTimer = null }, 240)
    }
    return
  }
  cancelDragHandleHide()
  hoverBlock = block
  dragHandle.value = {
    x: Math.max(0, rect.left - 34),
    y: rect.top,
    h: Math.max(22, rect.height),
    line,
  }
}

function resetBlockDrag() {
  draggingBlock.value = false
  dropY.value = null
  dragFromLine = -1
  dragToLine = -1
  dragPlaceAfter = false
  blockDragPointerId = null
}

function updateBlockDragTarget(clientX: number, clientY: number): boolean {
  const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null
  const block = blockUnderPointer(el) ?? nearestBlockAtPoint(clientX, clientY)
  const line = block ? sourceLineFromBlock(block) : null
  const rect = block ? blockLogicalRect(block) : null
  if (!block || line === null || !rect) return false
  dragToLine = line
  dragPlaceAfter = (clientY - rect.rawTop) > rect.rawHeight / 2
  dropY.value = dragPlaceAfter ? rect.bottom : rect.top
  return true
}

function commitBlockDrag() {
  const next = dragFromLine >= 0 && dragToLine >= 0
    ? moveDocumentUnitByLine(doc.markdown, dragFromLine, dragToLine, dragPlaceAfter)
    : doc.markdown
  resetBlockDrag()
  window.removeEventListener('pointermove', onBlockPointerMove, true)
  window.removeEventListener('pointerup', onBlockPointerUp, true)
  window.removeEventListener('pointercancel', onBlockPointerCancel, true)
  if (next !== doc.markdown) setMarkdownPreservePreviewScroll(next)
}

function onBlockPointerMove(e: PointerEvent) {
  if (!draggingBlock.value || (blockDragPointerId !== null && e.pointerId !== blockDragPointerId)) return
  e.preventDefault()
  updateBlockDragTarget(e.clientX, e.clientY)
}

function onBlockPointerUp(e: PointerEvent) {
  if (!draggingBlock.value || (blockDragPointerId !== null && e.pointerId !== blockDragPointerId)) return
  e.preventDefault()
  updateBlockDragTarget(e.clientX, e.clientY)
  commitBlockDrag()
}

function onBlockPointerCancel() {
  resetBlockDrag()
  window.removeEventListener('pointermove', onBlockPointerMove, true)
  window.removeEventListener('pointerup', onBlockPointerUp, true)
  window.removeEventListener('pointercancel', onBlockPointerCancel, true)
}

function startBlockPointerDrag(e: PointerEvent) {
  if (e.button !== 0) return
  const line = dragHandle.value?.line ?? (hoverBlock ? sourceLineFromBlock(hoverBlock) : null)
  if (line === null || line === undefined) {
    e.preventDefault()
    return
  }
  e.preventDefault()
  e.stopPropagation()
  cancelDragHandleHide()
  if (inlineEditorOpen.value) closeInlineEditor()
  cleanupTableCellEditor(true)
  tableMenu.value = null
  tableAddUi.value = null
  dragFromLine = line
  dragToLine = line
  blockDragPointerId = e.pointerId
  draggingBlock.value = true
  updateBlockDragTarget(e.clientX, e.clientY)
  window.addEventListener('pointermove', onBlockPointerMove, true)
  window.addEventListener('pointerup', onBlockPointerUp, true)
  window.addEventListener('pointercancel', onBlockPointerCancel, true)
}

function onBlockHandleDragStart(e: DragEvent) {
  const line = dragHandle.value?.line ?? (hoverBlock ? sourceLineFromBlock(hoverBlock) : null)
  if (line === null || line === undefined) {
    e.preventDefault()
    return
  }
  cancelDragHandleHide()
  dragFromLine = line
  dragToLine = line
  draggingBlock.value = true
  updateBlockDragTarget(e.clientX, e.clientY)
  e.dataTransfer?.setData('text/plain', String(line))
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}

function onPreviewDragOver(e: DragEvent) {
  if (!draggingBlock.value) return
  const block = blockUnderPointer(e.target as HTMLElement | null)
  const line = block ? sourceLineFromBlock(block) : null
  const rect = block ? blockLogicalRect(block) : null
  if (!block || line === null || !rect) return
  dragToLine = line
  dragPlaceAfter = (e.clientY - rect.rawTop) > rect.rawHeight / 2
  dropY.value = dragPlaceAfter ? rect.bottom : rect.top
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  e.preventDefault()
}

function onPreviewDrop(e: DragEvent) {
  if (!draggingBlock.value) return
  e.preventDefault()
  updateBlockDragTarget(e.clientX, e.clientY)
  commitBlockDrag()
}

function tableHoveredEl(): HTMLElement | null {
  const line = tableAddUi.value?.line
  if (line == null) return null
  return host.value?.querySelector<HTMLElement>(`table[data-source-line="${line}"]`) ?? null
}

function addRowToHoveredTable() {
  const table = tableHoveredEl(); if (!table) return
  const model = tableModelFromEl(table)
  if (model) applyTableModel(model, insertRow(model, model.rows.length - 1)) // 末尾追加一行
  else applyHtmlTable(table, appendHtmlTableRow)
  tableAddUi.value = null
}

function addColToHoveredTable() {
  const table = tableHoveredEl(); if (!table) return
  const model = tableModelFromEl(table)
  if (model) applyTableModel(model, insertCol(model, model.header.length)) // 末尾追加一列
  else applyHtmlTable(table, appendHtmlTableColumn)
  tableAddUi.value = null
}

function pruneCollapsedHeadings() {
  const valid = new Set(parseMarkdownHeadings(doc.markdown).map((h) => h.line))
  const next = new Set<number>()
  for (const line of collapsedHeadingLines.value) {
    if (valid.has(line)) next.add(line)
  }
  collapsedHeadingLines.value = next
}

function headingAbsLine(el: HTMLElement): number | null {
  const rel = Number(el.dataset.sourceLine)
  if (!Number.isFinite(rel)) return null
  return rel + bodyLineOffset()
}

function headingToggleIcon(collapsed: boolean): string {
  const d = collapsed ? 'M9 6l6 6-6 6' : 'M6 9l6 6 6-6'
  return `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`
}

function applyHeadingCollapseClasses() {
  const root = host.value
  if (!root) return
  const hidden = collapsedHeadingHiddenLines(doc.markdown, collapsedHeadingLines.value)
  const offset = bodyLineOffset()
  root.querySelectorAll<HTMLElement>('[data-source-line]').forEach((el) => {
    const rel = Number(el.dataset.sourceLine)
    const abs = Number.isFinite(rel) ? rel + offset : NaN
    el.classList.toggle('md-heading-hidden', Number.isFinite(abs) && hidden.has(abs))
  })
  root.querySelectorAll<HTMLElement>('h1[data-source-line], h2[data-source-line], h3[data-source-line], h4[data-source-line], h5[data-source-line], h6[data-source-line]').forEach((heading) => {
    const line = headingAbsLine(heading)
    const collapsed = line !== null && collapsedHeadingLines.value.has(line)
    heading.classList.toggle('md-heading-collapsed', collapsed)
    const btn = heading.querySelector<HTMLButtonElement>(':scope > .md-heading-toggle')
    if (btn) {
      btn.innerHTML = headingToggleIcon(collapsed)
      btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true')
      btn.title = collapsed ? '展开本节' : '折叠本节'
    }
  })
}

function refreshHeadingCollapseLayout() {
  const top = scrollerEl.value?.scrollTop ?? 0
  applyHeadingCollapseClasses()
  paginate()
  decorateTableHandles()
  decorateImageHandles()
  decorateCodeCopy()
  decorateRowSelect()
  applyCellSelClasses()
  nextTick(() => {
    measurePaperBox()
    restorePreviewScroll(top)
  })
}

function toggleHeadingCollapse(line: number) {
  const next = new Set(collapsedHeadingLines.value)
  if (next.has(line)) next.delete(line)
  else next.add(line)
  collapsedHeadingLines.value = next
  if (inlineEditorOpen.value || codeInplace) closeInlineEditor()
  cleanupTableCellEditor(true)
  tableMenu.value = null
  tableAddUi.value = null
  refreshHeadingCollapseLayout()
}

function decorateHeadingCollapse() {
  const root = host.value
  if (!root) return
  pruneCollapsedHeadings()
  root.querySelectorAll('.md-heading-toggle').forEach((node) => node.remove())
  root.querySelectorAll<HTMLElement>('h1[data-source-line], h2[data-source-line], h3[data-source-line], h4[data-source-line], h5[data-source-line], h6[data-source-line]').forEach((heading) => {
    const line = headingAbsLine(heading)
    if (line === null || !headingHasChildren(doc.markdown, line)) return
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'md-heading-toggle'
    btn.innerHTML = headingToggleIcon(false)
    btn.setAttribute('aria-label', '折叠或展开本节')
    btn.addEventListener('mousedown', (ev) => { ev.preventDefault(); ev.stopPropagation() })
    btn.addEventListener('click', (ev) => {
      ev.preventDefault()
      ev.stopPropagation()
      toggleHeadingCollapse(line)
    })
    heading.insertBefore(btn, heading.firstChild)
  })
  applyHeadingCollapseClasses()
}

function tableSelectedEl(): HTMLElement | null {
  const line = tableSelection.value?.line
  if (line == null) return null
  return host.value?.querySelector<HTMLElement>(`table[data-source-line="${line}"]`) ?? null
}

// 把 tableSelection 反映到行 class 与勾选框状态（纯 DOM，不触发重渲染）。
function applyRowSelClasses() {
  const root = host.value
  if (!root) return
  const sel = tableSelection.value
  root.querySelectorAll<HTMLElement>('table[data-source-line]').forEach((table) => {
    const line = Number(table.dataset.sourceLine)
    const active = sel && sel.line === line ? sel.rows : []
    const bodyRows = Array.from(table.querySelectorAll<HTMLTableRowElement>('tbody > tr'))
    bodyRows.forEach((tr, i) => {
      const on = active.includes(i)
      tr.classList.toggle('md-row-selected', on)
      const cb = tr.querySelector<HTMLElement>('.md-row-select')
      if (cb) { cb.classList.toggle('on', on); cb.setAttribute('aria-checked', on ? 'true' : 'false') }
    })
    const all = table.querySelector<HTMLElement>('thead .md-row-select')
    if (all) {
      const allOn = !!sel && sel.line === line && bodyRows.length > 0 && sel.rows.length === bodyRows.length
      all.classList.toggle('on', allOn)
      all.setAttribute('aria-checked', allOn ? 'true' : 'false')
    }
  })
}

function toggleRowSelect(line: number, bodyIndex: number) {
  const cur = tableSelection.value
  let rows: number[]
  if (!cur || cur.line !== line) rows = [bodyIndex]
  else {
    const set = new Set(cur.rows)
    if (set.has(bodyIndex)) set.delete(bodyIndex)
    else set.add(bodyIndex)
    rows = Array.from(set).sort((a, b) => a - b)
  }
  tableSelection.value = rows.length ? { line, rows } : null
  applyRowSelClasses()
}

function toggleSelectAll(line: number, total: number) {
  const cur = tableSelection.value
  const allOn = !!cur && cur.line === line && cur.rows.length === total
  tableSelection.value = allOn || total === 0 ? null : { line, rows: Array.from({ length: total }, (_, i) => i) }
  applyRowSelClasses()
}

function clearTableSelection() {
  if (!tableSelection.value) return
  tableSelection.value = null
  applyRowSelClasses()
}

function tableCellCoord(table: HTMLElement, cell: HTMLTableCellElement): { row: number; col: number } | null {
  const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>('tr'))
  const occupied = new Map<number, Set<number>>()
  const mark = (row: number, col: number) => {
    const set = occupied.get(row) ?? new Set<number>()
    set.add(col)
    occupied.set(row, set)
  }
  for (let row = 0; row < rows.length; row++) {
    let col = 0
    for (const cur of Array.from(rows[row].cells)) {
      while (occupied.get(row)?.has(col)) col++
      const rowspan = Math.max(1, cur.rowSpan || 1)
      const colspan = Math.max(1, cur.colSpan || 1)
      if (cur === cell) return { row, col }
      for (let rr = row; rr < row + rowspan; rr++) {
        for (let cc = col; cc < col + colspan; cc++) mark(rr, cc)
      }
      col += colspan
    }
  }
  return null
}

function tableVisualColumnCount(table: HTMLElement): number {
  let max = 0
  table.querySelectorAll<HTMLTableCellElement>('th, td').forEach((cell) => {
    const coord = tableCellCoord(table, cell)
    if (!coord) return
    max = Math.max(max, coord.col + Math.max(1, cell.colSpan || 1))
  })
  return max
}

function normalizedCellSelection() {
  const sel = tableCellSelection.value
  if (!sel) return null
  return {
    line: sel.line,
    rowStart: Math.min(sel.rowStart, sel.rowEnd),
    rowEnd: Math.max(sel.rowStart, sel.rowEnd),
    colStart: Math.min(sel.colStart, sel.colEnd),
    colEnd: Math.max(sel.colStart, sel.colEnd),
  }
}

function applyCellSelClasses() {
  const root = host.value
  if (!root) return
  const sel = normalizedCellSelection()
  root.querySelectorAll<HTMLElement>('table[data-source-line]').forEach((table) => {
    const line = Number(table.dataset.sourceLine)
    const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>('tr'))
    rows.forEach((tr, r) => {
      Array.from(tr.cells).forEach((cell, c) => {
        const coord = tableCellCoord(table, cell)
        const row = coord?.row ?? r
        const col = coord?.col ?? c
        const rowEnd = row + Math.max(1, cell.rowSpan || 1) - 1
        const colEnd = col + Math.max(1, cell.colSpan || 1) - 1
        const on = !!sel && sel.line === line
          && row <= sel.rowEnd && rowEnd >= sel.rowStart
          && col <= sel.colEnd && colEnd >= sel.colStart
        cell.classList.toggle('md-cell-selected', on)
      })
    })
  })
  updateCellSelBarPos()
}

// 合并浮条贴近所选单元格：取所有选中格的并集矩形，浮条落在其上方居中（贴顶时翻到下方）
function updateCellSelBarPos() {
  const root = host.value
  const cells = root?.querySelectorAll<HTMLElement>('.md-cell-selected')
  if (!cells || !cells.length) { cellSelBarPos.value = null; return }
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity
  cells.forEach((c) => {
    const r = c.getBoundingClientRect()
    left = Math.min(left, r.left); right = Math.max(right, r.right)
    top = Math.min(top, r.top); bottom = Math.max(bottom, r.bottom)
  })
  cellSelBarPos.value = { left: (left + right) / 2, top, bottom }
}

function clearTableCellSelection() {
  if (!tableCellSelection.value) return
  tableCellSelection.value = null
  applyCellSelClasses()
}

function selectedCellCount(): number {
  const sel = normalizedCellSelection()
  return sel ? (sel.rowEnd - sel.rowStart + 1) * (sel.colEnd - sel.colStart + 1) : 0
}

// 通知源码侧：预览正在做表格选择/合并时，隐藏源码侧的表格浮动工具条（避免两个工具条并存）
watch(() => !!tableCellSelection.value, (active) => {
  window.dispatchEvent(new CustomEvent('morph:preview-table-active', { detail: active }))
})

function mergeSelectedCells() {
  const sel = normalizedCellSelection()
  if (!sel || selectedCellCount() < 2) return
  const table = host.value?.querySelector<HTMLElement>(`table[data-source-line="${sel.line}"]`)
  if (!table) return
  commitMergeHtmlCells(table, sel)
}

function deleteSelectedRows() {
  const sel = tableSelection.value
  const table = tableSelectedEl()
  if (!sel || !table) return
  const model = tableModelFromEl(table)
  if (!model) return
  let next = model
  for (const idx of [...sel.rows].sort((a, b) => b - a)) { // 降序删除，保持 bodyIndex 稳定
    if (idx >= 0 && idx < next.rows.length) next = deleteRow(next, idx)
  }
  tableSelection.value = null
  applyTableModel(model, next)
}

// 行选择勾选框：表头「全选」+ 每个 body 行一个；渲染后重注入（.md-row-select 已在 morph 签名里剔除）。
function decorateRowSelect() {
  const root = host.value
  if (!root) return
  root.querySelectorAll('button.md-row-select').forEach((b) => b.remove())
  root.querySelectorAll<HTMLElement>('table[data-source-line]').forEach((table) => {
    const line = Number(table.dataset.sourceLine)
    if (!Number.isFinite(line)) return
    const bodyRows = Array.from(table.querySelectorAll<HTMLTableRowElement>('tbody > tr'))
    const total = bodyRows.length
    const mkBox = (cell: HTMLTableCellElement, onPick: () => void) => {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'md-row-select'
      btn.setAttribute('role', 'checkbox')
      btn.setAttribute('aria-checked', 'false')
      btn.tabIndex = -1
      btn.addEventListener('mousedown', (ev) => { ev.preventDefault(); ev.stopPropagation() })
      btn.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); cleanupTableCellEditor(true); onPick() })
      cell.appendChild(btn)
    }
    const headCell = table.querySelector<HTMLTableCellElement>('thead th:first-child')
    if (headCell) mkBox(headCell, () => toggleSelectAll(line, total))
    bodyRows.forEach((tr, i) => {
      const cell = tr.querySelector<HTMLTableCellElement>('td:first-child')
      if (cell) mkBox(cell, () => toggleRowSelect(line, i))
    })
  })
  applyRowSelClasses()
}

function cleanupTableCellEditor(commit: boolean) {
  const state = tableCellEditor.value
  if (!state) return
  const nextText = state.cell.innerText.replace(/\r\n?/g, '\n').trim()
  state.cell.removeAttribute('contenteditable')
  state.cell.removeAttribute('spellcheck')
  state.cell.classList.remove('md-table-cell-editing')
  state.cell.removeEventListener('keydown', onTableCellKeydown)
  state.cell.removeEventListener('input', onTableCellInput)
  state.cell.removeEventListener('blur', onTableCellBlur)
  tableCellEditor.value = null
  dispatchPreviewEdit(null)
  previewToolbarObserver?.disconnect()
  previewToolbarObserver = null
  const top = scrollerEl.value?.scrollTop ?? 0
  if (commit && nextText !== state.text) {
    if (state.html) {
      // HTML 表格：按视觉坐标改写对应单元格内容，保留 colspan/rowspan/样式
      const lines = doc.markdown.split('\n')
      const block = findHtmlTableBlock(lines, state.html.sourceLine)
      if (block) {
        const nextHtml = setHtmlTableCellText(block.html, state.html.row, state.html.col, nextText)
        lines.splice(block.fromLine, block.toLine - block.fromLine + 1, ...nextHtml.split('\n'))
        setMarkdownPreservePreviewScroll(lines.join('\n'))
      }
    } else if (state.model) {
      applyTableModel(state.model, setCellText(state.model, state.bodyIndex, state.col, nextText))
    }
  } else if (!commit) {
    state.cell.textContent = state.text
  }
  // 失焦后恢复单元格渲染态（`<code>` 等），避免停留在 `` `text` `` 源码外观
  void renderPreview()
  void nextTick(() => restorePreviewScroll(top))
}

function onTableCellKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    cleanupTableCellEditor(false)
  } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    cleanupTableCellEditor(true)
  }
}

function onTableCellInput() {
  if (!tableCellEditor.value) return
  // 注意：不要把 state.text 改成当前值——它必须保留「打开时的原始文本」，
  // 否则提交时 nextText === state.text 会判定为「没变」而跳过回写（编辑永远不生效）。
  dispatchPreviewFormatStateFrom(tableCellEditor.value.cell)
}

function onTableCellBlur() {
  window.setTimeout(() => cleanupTableCellEditor(true), 0)
}

function beginCellEditing(cell: HTMLTableCellElement, text: string) {
  cell.classList.add('md-table-cell-editing')
  cell.setAttribute('contenteditable', 'plaintext-only')
  cell.setAttribute('spellcheck', 'false')
  cell.textContent = text // 同时清掉单元格里注入的 ⋮ 手柄，编辑结束重渲染后再注入
  cell.addEventListener('keydown', onTableCellKeydown)
  cell.addEventListener('input', onTableCellInput)
  cell.addEventListener('blur', onTableCellBlur)
  cell.focus()
  setCaretOffset(cell, cell.textContent?.length ?? 0)
  nextTick(() => {
    updatePreviewToolbarPos()
    observePreviewToolbarAnchor(cell)
    refreshPreviewEditLayout()
  })
}

function openTableCellEditor(
  table: HTMLElement,
  cell: HTMLTableCellElement,
  tr: HTMLTableRowElement,
  absoluteSourceLine?: number,
): boolean {
  const localLine = Number(table.dataset.sourceLine)
  const sourceLine = absoluteSourceLine ?? (
    Number.isFinite(localLine) ? localLine + markdownBodyLineOffset(doc.markdown) : NaN
  )
  if (!Number.isFinite(sourceLine)) return false

  // HTML 表格（合并/列宽后升级成 <table>）：detectTable 解析不了，用视觉坐标按单元格回写
  const htmlBlock = findHtmlTableBlock(doc.markdown.split('\n'), sourceLine)
  if (htmlBlock) {
    const coord = tableCellCoord(table, cell)
    if (!coord) return false
    const text = getHtmlTableCellText(htmlBlock.html, coord.row, coord.col)
    cleanupTableCellEditor(true)
    tableCellEditor.value = { cell, text, col: 0, bodyIndex: 0, html: { sourceLine, row: coord.row, col: coord.col } }
    beginCellEditing(cell, text)
    return true
  }

  const context = tableContextFromCell(table, cell, tr, absoluteSourceLine)
  if (!context || !context.model) return false
  cleanupTableCellEditor(true)
  const text = context.bodyIndex < 0
    ? context.model.header[context.col] ?? ''
    : context.model.rows[context.bodyIndex]?.[context.col] ?? ''
  tableCellEditor.value = { ...context, cell, text }
  beginCellEditing(cell, text)
  return true
}

// 预览渲染后的表格上右键 → 弹 O3 表格菜单。列由命中的 td/th.cellIndex 决定，
// 行由命中的 tr 在 thead/tbody 中的位置决定（表头 = bodyIndex -1），模型由源码 detectTable 解析。
function onTableContextMenu(e: MouseEvent) {
  const target = e.target as HTMLElement | null
  const table = target?.closest<HTMLElement>('table[data-source-line]')
  const cell = target?.closest<HTMLTableCellElement>('td, th')
  const tr = target?.closest<HTMLTableRowElement>('tr')
  if (!table || !cell || !tr) { tableMenu.value = null; return }
  const context = tableContextFromCell(table, cell, tr)
  if (!context) { tableMenu.value = null; return }
  e.preventDefault()
  tableMenu.value = { x: e.clientX, y: e.clientY, ...context }
}

function onTableMenuOp(id: string) {
  const state = tableMenu.value
  if (!state) { return }
  const { model, col, bodyIndex } = state
  const apply = (next: TableModel) => applyTableModel(model, next)
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

function openTableMenuFromCell(cell: HTMLTableCellElement, table: HTMLElement, tr: HTMLTableRowElement) {
  const context = tableContextFromCell(table, cell, tr)
  if (!context) return
  const rect = cell.getBoundingClientRect()
  tableMenu.value = { x: rect.left + 12, y: rect.top + 18, ...context }
}

function applyTableResizePreview(state: NonNullable<typeof tableResizeState>) {
  state.table.querySelectorAll<HTMLTableRowElement>('tr').forEach((tr) => {
    const cell = tr.cells[state.index] as HTMLTableCellElement | undefined
    if (cell) {
      cell.style.width = `${state.nextSize}px`
      cell.style.minWidth = `${state.nextSize}px`
    }
  })
}

function onTableResizeMove(ev: PointerEvent) {
  const state = tableResizeState
  if (!state) return
  ev.preventDefault()
  state.nextSize = Math.round(Math.max(24, state.startSize + (ev.clientX - state.startX)))
  applyTableResizePreview(state)
}

function finishTableResize(commit: boolean) {
  const state = tableResizeState
  if (!state) return
  window.removeEventListener('pointermove', onTableResizeMove, true)
  window.removeEventListener('pointerup', onTableResizeUp, true)
  window.removeEventListener('pointercancel', onTableResizeCancel, true)
  state.table.classList.remove('md-table-resizing')
  tableResizeState = null
  if (commit && Math.abs(state.nextSize - state.startSize) >= 2) {
    commitTableSize(state.table, state.index, state.nextSize)
  } else {
    void renderPreview()
  }
}

function onTableResizeUp() {
  finishTableResize(true)
}

function onTableResizeCancel() {
  finishTableResize(false)
}

function onTableCellSelectMove(ev: PointerEvent) {
  const state = tableCellDragStart
  if (!state) return
  if (!state.active) {
    const moved = Math.abs(ev.clientX - state.startX) + Math.abs(ev.clientY - state.startY)
    if (moved < 6) return
    state.active = true
  }
  const target = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null
  const cell = target?.closest<HTMLTableCellElement>('td, th')
  if (!cell || !state.table.contains(cell)) return
  const coord = tableCellCoord(state.table, cell)
  if (!coord) return
  tableCellSelection.value = {
    line: state.line,
    rowStart: state.row,
    rowEnd: coord.row,
    colStart: state.col,
    colEnd: coord.col,
  }
  applyCellSelClasses()
}

function finishTableCellSelection() {
  if (!tableCellDragStart) return
  window.removeEventListener('pointermove', onTableCellSelectMove, true)
  window.removeEventListener('pointerup', finishTableCellSelection, true)
  window.removeEventListener('pointercancel', cancelTableCellSelection, true)
  tableCellDragStart = null
  applyCellSelClasses()
}

function cancelTableCellSelection() {
  tableCellDragStart = null
  clearTableCellSelection()
  window.removeEventListener('pointermove', onTableCellSelectMove, true)
  window.removeEventListener('pointerup', finishTableCellSelection, true)
  window.removeEventListener('pointercancel', cancelTableCellSelection, true)
}

function startTableCellSelection(ev: PointerEvent, table: HTMLElement, cell: HTMLTableCellElement) {
  if (ev.button !== 0) return
  const target = ev.target as HTMLElement | null
  if (target?.closest('.md-table-handle, .md-table-resize, .md-row-select')) return
  const line = Number(table.dataset.sourceLine)
  if (!Number.isFinite(line)) return
  const coord = tableCellCoord(table, cell)
  if (!coord) return
  cleanupTableCellEditor(true)
  clearTableSelection()
  tableMenu.value = null
  tableAddUi.value = null
  tableCellDragStart = { table, line, ...coord, startX: ev.clientX, startY: ev.clientY, active: false }
  window.addEventListener('pointermove', onTableCellSelectMove, true)
  window.addEventListener('pointerup', finishTableCellSelection, true)
  window.addEventListener('pointercancel', cancelTableCellSelection, true)
}

function startTableResize(ev: PointerEvent, table: HTMLElement, index: number, startSize: number) {
  if (ev.button !== 0) return
  ev.preventDefault()
  ev.stopPropagation()
  cleanupTableCellEditor(true)
  tableMenu.value = null
  tableAddUi.value = null
  table.classList.add('md-table-resizing')
  tableResizeState = {
    table,
    index,
    startX: ev.clientX,
    startSize,
    nextSize: startSize,
  }
  window.addEventListener('pointermove', onTableResizeMove, true)
  window.addEventListener('pointerup', onTableResizeUp, true)
  window.addEventListener('pointercancel', onTableResizeCancel, true)
}

function imgRectOf(img: HTMLImageElement) {
  const r = img.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

// 在源码里定位当前选中图片所在的 `![]()` / `<img>` 片段（asset:// 用块内序号兜底）。
function selImageRange(lines: string[]) {
  const s = imgSel.value
  if (!s) return null
  const blockRange = s.sourceLine >= 0
    ? blockEditRange(lines, s.sourceLine)
    : { start: 0, end: lines.length - 1 }
  return findImageResizeRangeByIndex(lines, blockRange.start, blockRange.end, s.imageIndex)
    ?? findImageResizeRange(lines, blockRange.start, blockRange.end, s.attrs.src, s.attrs.alt, s.occurrence)
}

function selectImage(img: HTMLImageElement) {
  const root = host.value
  if (!root) return
  if (inlineEditorOpen.value) closeInlineEditor()
  cleanupTableCellEditor(true)
  tableMenu.value = null
  tableAddUi.value = null
  const block = img.closest<HTMLElement>('[data-source-line]') ?? root
  const localLine = Number(block.dataset.sourceLine)
  const sourceLine = Number.isFinite(localLine) ? localLine + markdownBodyLineOffset(doc.markdown) : -1
  const inBlock = Array.from(block.querySelectorAll<HTMLImageElement>('img'))
  const all = Array.from(root.querySelectorAll<HTMLImageElement>('img'))
  selImgEl = img
  const lines = doc.markdown.split('\n')
  imgSel.value = {
    rect: imgRectOf(img),
    attrs: readImageAttrs(''),
    sourceLine,
    occurrence: imageOccurrence(block, img),
    imageIndex: Math.max(0, inBlock.indexOf(img)),
    globalIndex: Math.max(0, all.indexOf(img)),
  }
  const range = selImageRange(lines)
  if (range) imgSel.value = { ...imgSel.value, attrs: readImageAttrs(range.source) }
}

// 重渲染后按全文序号找回选中图片并刷新位置/属性；找不到则取消选中。
function relocateSelectedImage() {
  const s = imgSel.value
  if (!s) return
  const all = Array.from(host.value?.querySelectorAll<HTMLImageElement>('img') ?? [])
  const img = all[s.globalIndex]
  if (!img) { imgSel.value = null; selImgEl = null; return }
  selImgEl = img
  const range = selImageRange(doc.markdown.split('\n'))
  imgSel.value = { ...s, rect: imgRectOf(img), attrs: range ? readImageAttrs(range.source) : s.attrs }
}

function refreshImgSelRect() {
  if (!selImgEl || !imgSel.value) return
  if (!selImgEl.isConnected) { imgSel.value = null; selImgEl = null; return }
  imgSel.value = { ...imgSel.value, rect: imgRectOf(selImgEl) }
}

function patchSelectedImage(patch: Partial<ImageAttrs>) {
  const lines = doc.markdown.split('\n')
  const range = selImageRange(lines)
  if (!range) return
  const next = applyImageAttrs(range.source, patch)
  lines[range.line] = lines[range.line].slice(0, range.from) + next + lines[range.line].slice(range.to)
  setMarkdownPreservePreviewScroll(lines.join('\n'))
  nextTick(relocateSelectedImage)
}

// 八方向手柄拖拽缩放：默认等比例（锁），关闭锁后边线单轴、角点自由。
function startImgResize(ev: PointerEvent, dir: string) {
  if (ev.button !== 0 || !selImgEl || !imgSel.value) return
  ev.preventDefault()
  ev.stopPropagation()
  const zoom = ui.previewZoom || 1
  const r = selImgEl.getBoundingClientRect()
  const w = Math.max(24, Math.round(r.width / zoom))
  const h = Math.max(24, Math.round(r.height / zoom))
  imgHandleDrag = {
    startX: ev.clientX,
    startY: ev.clientY,
    startW: w,
    startH: h,
    ratio: w / h || 1,
    fx: dir.includes('e') ? 1 : dir.includes('w') ? -1 : 0,
    fy: dir.includes('s') ? 1 : dir.includes('n') ? -1 : 0,
  }
  imgHandleSize = { w, h }
  window.addEventListener('pointermove', onImgResizeMove, true)
  window.addEventListener('pointerup', onImgResizeUp, true)
  window.addEventListener('pointercancel', onImgResizeUp, true)
}

function onImgResizeMove(ev: PointerEvent) {
  const d = imgHandleDrag
  if (!d || !selImgEl || !imgSel.value) return
  ev.preventDefault()
  const zoom = ui.previewZoom || 1
  const dx = (ev.clientX - d.startX) / zoom
  const dy = (ev.clientY - d.startY) / zoom
  let w = d.startW + d.fx * dx
  let h = d.startH + d.fy * dy
  if (imgRatioLocked.value) {
    if (d.fx) h = w / d.ratio
    else if (d.fy) w = h * d.ratio
  } else {
    if (!d.fx) w = d.startW
    if (!d.fy) h = d.startH
  }
  w = Math.max(24, Math.round(w))
  h = Math.max(24, Math.round(h))
  selImgEl.style.width = `${w}px`
  selImgEl.style.height = `${h}px`
  imgHandleSize = { w, h }
  imgSel.value = { ...imgSel.value, rect: imgRectOf(selImgEl) }
}

function onImgResizeUp() {
  window.removeEventListener('pointermove', onImgResizeMove, true)
  window.removeEventListener('pointerup', onImgResizeUp, true)
  window.removeEventListener('pointercancel', onImgResizeUp, true)
  const d = imgHandleDrag
  const size = imgHandleSize
  imgHandleDrag = null
  imgHandleSize = null
  if (!d || !size) return
  if (Math.abs(size.w - d.startW) + Math.abs(size.h - d.startH) < 2) return
  // 等比例：只写宽度（高度交给浏览器按原比例算），自由：宽高都写
  patchSelectedImage(imgRatioLocked.value ? { width: size.w, height: null } : { width: size.w, height: size.h })
}

function imgSetAlign(a: ImageAlign) {
  const cur = imgSel.value?.attrs.align
  patchSelectedImage({ align: cur === a ? 'none' : a })
}
function imgToggleRounded() { patchSelectedImage({ rounded: !imgSel.value?.attrs.rounded }) }
function imgToggleShadow() { patchSelectedImage({ shadow: !imgSel.value?.attrs.shadow }) }
function imgEditPath() {
  const cur = imgSel.value?.attrs.src ?? ''
  const v = window.prompt(t('imageToolbar.editPathPrompt'), cur)
  if (v != null) patchSelectedImage({ src: v.trim() })
}
function imgEditAlt() {
  const cur = imgSel.value?.attrs.alt ?? ''
  const v = window.prompt(t('imageToolbar.editAltPrompt'), cur)
  if (v != null) patchSelectedImage({ alt: v })
}
function imgReplace() { imgFileInput.value?.click() }
async function onImgFilePicked(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const placeholder = await fileToAsset(file)
  if (placeholder) patchSelectedImage({ src: placeholder })
}

function decorateImageHandles() {
  const root = host.value
  if (!root) return
  root.querySelectorAll('.md-image-resize').forEach((node) => node.remove())
  root.querySelectorAll<HTMLImageElement>('img').forEach((img) => {
    if (img.closest('.app-logo, .md-icon, svg, button')) return
    if (img.closest('pre')) return
    img.classList.add('md-resizable-image')
    if (img.dataset.imgBound) return
    img.dataset.imgBound = '1'
    img.addEventListener('click', (ev) => {
      ev.preventDefault()
      ev.stopPropagation()
      selectImage(img)
    })
  })
  if (imgSel.value) nextTick(relocateSelectedImage)
}

function decorateTableHandles() {
  const root = host.value
  if (!root) return
  root.querySelectorAll('button.md-table-handle').forEach((b) => b.remove())
  root.querySelectorAll('.md-table-resize').forEach((b) => b.remove())
  root.querySelectorAll<HTMLElement>('table[data-source-line]').forEach((table) => {
    table.classList.add('md-editable-table')
    const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>('tr'))
    const firstRow = rows[0]
    table.querySelectorAll<HTMLTableCellElement>('th, td').forEach((cell) => {
      const tr = cell.closest<HTMLTableRowElement>('tr')
      if (!tr) return
      cell.addEventListener('pointerdown', (ev) => startTableCellSelection(ev, table, cell))
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'md-table-handle'
      btn.textContent = '⋮'
      btn.title = tr.closest('thead') ? t('tableMenu.alignColumn') : t('tableMenu.addRow')
      btn.addEventListener('click', (ev) => {
        ev.preventDefault()
        ev.stopPropagation()
        cleanupTableCellEditor(true)
        openTableMenuFromCell(cell, table, tr)
      })
      cell.appendChild(btn)
      // 行高不再支持手动拖拽：随列宽 / 内容自动调整更合理（仅保留列宽拖拽）
    })
    if (firstRow) {
      Array.from(firstRow.cells).forEach((cell, col) => {
        const colGrip = document.createElement('span')
        colGrip.className = 'md-table-resize md-table-col-resize'
        colGrip.title = '拖拽调整列宽'
        colGrip.addEventListener('pointerdown', (ev) => startTableResize(ev, table, col, cell.getBoundingClientRect().width))
        cell.appendChild(colGrip)
      })
    }
  })
}

// 预览侧代码块「复制」按钮：每次渲染后重注入（md-code-copy 已在 usePreviewRender 的 morph 签名里剔除，不破坏块复用）。
function decorateCodeCopy() {
  const root = host.value
  if (!root) return
  root.querySelectorAll('button.md-code-copy').forEach((b) => b.remove())
  root.querySelectorAll<HTMLElement>('pre.hljs').forEach((pre) => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'md-code-copy'
    btn.textContent = t('codeBlock.copy')
    btn.title = t('codeBlock.copy')
    btn.addEventListener('click', (ev) => {
      ev.preventDefault()
      ev.stopPropagation()
      // 取纯代码：优先逐行 .code-text（去掉行号），回退 code.textContent
      const texts = Array.from(pre.querySelectorAll('.code-text')).map((n) => n.textContent ?? '')
      const code = texts.length ? texts.join('\n') : (pre.querySelector('code')?.textContent ?? '')
      void navigator.clipboard?.writeText(code).then(() => {
        btn.textContent = t('codeBlock.copied')
        btn.classList.add('copied')
        window.setTimeout(() => {
          btn.textContent = t('codeBlock.copy')
          btn.classList.remove('copied')
        }, 1200)
      }).catch(() => { /* 剪贴板不可用静默 */ })
    })
    pre.appendChild(btn)
  })
}

function decorateBlankQuoteBlocks() {
  const root = host.value
  if (!root) return
  const lines = doc.markdown.split('\n')
  const offset = bodyLineOffset()
  root.querySelectorAll<HTMLElement>('blockquote[data-source-line]').forEach((quote) => {
    const local = Number(quote.dataset.sourceLine)
    if (!Number.isFinite(local)) return
    const absLine = local + offset
    if (!/^\s*>\s*$/.test(lines[absLine] ?? '')) return
    quote.classList.add('md-empty-quote-line')
    if (!quote.textContent?.trim() && !quote.querySelector('br')) quote.appendChild(document.createElement('br'))
  })
}

function onPreviewSourceClick(payload: {
  line: number
  el: HTMLElement
  event: MouseEvent
  target?: HTMLElement
}) {
  const target = payload.target ?? payload.event.target as HTMLElement | null
  if (!target?.closest('.code-lang')
      && target?.closest('button, input, textarea, select, [contenteditable="true"]')) {
    if (directEditorEl && target && directEditorEl.contains(target)) {
      placeCaretAtPoint(directEditorEl, payload.event.clientX, payload.event.clientY)
      payload.event.preventDefault()
      return true
    }
    return false
  }
  const chip = target?.closest<HTMLElement>(CHIP_SELECTOR)
  if (chip && openChipEditor(payload.line, payload.el, chip)) {
    payload.event.preventDefault()
    payload.event.stopPropagation()
    return true
  }
  const table = target?.closest<HTMLElement>('table[data-source-line]')
  const cell = target?.closest<HTMLTableCellElement>('td, th')
  const tr = target?.closest<HTMLTableRowElement>('tr')
  if (table && cell && tr && !target?.closest('.md-table-handle')) {
    payload.event.preventDefault()
    payload.event.stopPropagation()
    return openTableCellEditor(table, cell, tr, payload.line)
  }
  const anchor = target?.closest<HTMLElement>('a')
  if (anchor && openLinkEditor(payload.line, payload.el, anchor)) {
    payload.event.preventDefault()
    return true
  }
  // 普通段落/标题/列表等块级文本：点击文字区域可展开块级编辑（空行/空白处仍由守卫拦截）
  const hasEditableInline = !!inlineTarget(target)
  const hasEditableBlock = !!target?.closest('.code-lang, pre, .chart-block, .math-block')
  const textBlock = target?.closest<HTMLElement>(TEXT_BLOCK_SELECTOR)
  if (!hasEditableInline && !hasEditableBlock) {
    if (!textBlock || shouldSkipBlockEditor(payload.event, target)) return false
  }
  if (!openInlineEditor(
    payload.line,
    payload.el,
    target,
    { x: payload.event.clientX, y: payload.event.clientY },
  )) return false
  payload.event.preventDefault()
  return true
}

function closeInlineEditor() {
  if (codeInplace) { closeCodeInplace(); return } // 代码块原地编辑：走专用收尾
  const top = scrollerEl.value?.scrollTop ?? 0
  if (inlineCodeHighlightTimer !== null) { window.clearTimeout(inlineCodeHighlightTimer); inlineCodeHighlightTimer = null }
  dispatchPreviewEdit(null)
  previewToolbarObserver?.disconnect()
  previewToolbarObserver = null
  if (wysiwygEl) deactivateWysiwyg() // WYSIWYG：提交序列化后的内容（不能走 flushDirectEditor，它读的是源码态）
  else flushDirectEditor()
  inlineEditorOpen.value = false
  editorObserver?.disconnect()
  editorObserver = null
  disposeInlinePreviewChart()
  inlinePreviewKind = null
  inlinePreviewChartType = null
  deactivateDirectEditor()
  editingAnchorEl = null
  // 退出防跳动：保持旧块的占位/隐藏态，等重渲染把它换成干净新块后再清理编辑痕迹——
  // 避免「先撤占位 → 旧块以原高闪现 → 再重渲染」的退出跳动。
  // （内容变了的文本/代码块会被 morph 换成新节点；图块按 code 复用不被替换，故仍需事后清理其编辑类）
  void renderPreview().then(() => {
    resetEditingTarget()
    editingTargetEl = null
    restorePreviewScroll(top)
  })
}

function replaceInlineEdit(nextMarkdown: string) {
  const lines = doc.markdown.split('\n')
  if (inlineEditorColumnFrom.value !== null && inlineEditorColumnTo.value !== null) {
    const line = lines[inlineEditorLine.value] ?? ''
    lines[inlineEditorLine.value] = line.slice(0, inlineEditorColumnFrom.value)
      + nextMarkdown
      + line.slice(inlineEditorColumnTo.value)
    inlineEditorColumnTo.value = inlineEditorColumnFrom.value + nextMarkdown.length
    doc.setMarkdown(lines.join('\n'))
    return
  }
  const nextLines = nextMarkdown.split('\n')
  lines.splice(
    inlineEditorLine.value,
    inlineEditorEndLine.value - inlineEditorLine.value + 1,
    ...nextLines,
  )
  inlineEditorEndLine.value = inlineEditorLine.value + nextLines.length - 1
  doc.setMarkdown(lines.join('\n'))
}

let inlineCodeHighlightTimer: number | null = null
// 防闪烁/防光标乱跳：浏览器已把输入即时显示在 contenteditable 里，无需每次按键都重写 innerHTML 重高亮
// （重写会销毁重建文本节点、逼着按字符偏移还原光标，复杂内容下易错位、肉眼可见闪烁）。
// 改为停顿后再高亮一次：打字时只更新源码与（图表/公式）预览，光标稳如磐石；停下来颜色再补上。
function scheduleInlineCodeHighlight() {
  if (inlineCodeHighlightTimer !== null) window.clearTimeout(inlineCodeHighlightTimer)
  inlineCodeHighlightTimer = window.setTimeout(() => {
    inlineCodeHighlightTimer = null
    if (!inlineCode.value || document.activeElement !== inlineCode.value) { renderInlineCode(); return }
    const offset = getCaretOffset(inlineCode.value)
    renderInlineCode()
    setCaretOffset(inlineCode.value, offset)
  }, 140)
}

function onCodeInput() {
  if (!inlineCode.value) return
  inlineEditorText.value = inlineCode.value.textContent ?? ''
  replaceInlineEdit(inlineEditorText.value)
  renderInlinePreview()
  scheduleInlineCodeHighlight()
}

function onInlineKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') closeInlineEditor()
}

function onInlineBlur() {
  window.setTimeout(() => {
    if (!inlineEditorOpen.value) return
    const active = document.activeElement as HTMLElement | null
    if (!active?.closest('.inline-preview-editor')) closeInlineEditor()
  }, 0)
}

// 点击编辑框以外的地方（切换到别的段落 / 点击别处）时，先关闭并把内容flush回预览，
// 避免出现“暂停渲染”状态被遗留、或新编辑框打开时旧内容还没同步的错乱现象
function onGlobalPointerDown(e: PointerEvent) {
  // 选中图片时：点到图片浮层/工具栏/被选图片以外即取消选中
  if (imgSel.value) {
    const t0 = e.target as HTMLElement | null
    if (!t0?.closest('.md-img-overlay, .md-img-toolbar, .img-hidden-input') && t0 !== selImgEl) {
      imgSel.value = null
      selImgEl = null
    }
  }
  if (!inlineEditorOpen.value) return
  const target = e.target as HTMLElement | null
  if (target?.closest('.inline-preview-editor, .preview-edit-toolbar, .floating-editor-tools, .heading-menu, .insert-menu, .emoji-menu') || (directEditorEl && target && directEditorEl.contains(target))) return
  if (codeInplace && target && codeInplace.pre.contains(target)) return // 代码块原地编辑：点编辑器内部不关闭
  if (tableCellEditor.value && target?.closest('.md-table-cell-editing')) return
  // 点到另一个可编辑块时交给 onPreviewSourceClick 直接切换目标（不走 render），
  // 避免这里先 flush 重渲染、和紧接着打开的新编辑器之间出现竞态导致内容重复
  if (target && host.value?.contains(target) && target.closest('[data-source-line]')) return
  closeInlineEditor()
}

function syncInlineScroll() {
  if (inlineGutter.value && inlineCode.value) inlineGutter.value.scrollTop = inlineCode.value.scrollTop
}

function measurePaperBox() {
  const el = host.value
  if (!el) return
  paperBox.value = {
    width: el.offsetWidth,
    height: el.offsetHeight,
  }
}

// 真实分页：把渲染后的顶层块按纸张可用高度打包进多张「纸」(.page-sheet)，整块不拆。
function paginate() {
  const el = host.value
  if (!el) return
  // 先还原成扁平结构（拎回已有 page-sheet 里的内容）
  const sheets = el.querySelectorAll(':scope > .page-sheet')
  if (sheets.length) {
    const frag = document.createDocumentFragment()
    sheets.forEach((s) => { while (s.firstChild) frag.appendChild(s.firstChild) })
    el.replaceChildren(frag)
    // 把上一轮跨页拆分的表格片段拼回完整表格，避免设置变化（纸张/边距等）触发的重新分页
    // 把续页片段当成独立小表格，越拆越碎
    mergeSplitTables(el)
  }
  if (!ui.paginate) {
    el.classList.remove('paged')
    el.classList.add('flow')
    return
  }
  el.classList.remove('flow')
  el.classList.add('paged')

  const groups = paginateBlocks(el, ui.paperSize, ui.paperMargin, 1)
  if (!groups.length) return

  const frag = document.createDocumentFragment()
  for (const g of groups) {
    const sheet = document.createElement('div')
    sheet.className = 'page-sheet'
    g.elements.forEach((n) => sheet.appendChild(n))
    frag.appendChild(sheet)
  }
  el.replaceChildren(frag)
}

const { render: renderPreview } = usePreviewRender(host, {
  onRendered: () => {
    decorateHeadingCollapse()
    paginate()
    decorateTableHandles()
    decorateImageHandles()
    decorateCodeCopy()
    decorateBlankQuoteBlocks()
    decorateRowSelect()
    applyCellSelClasses()
    nextTick(measurePaperBox)
  },
  onSourceClick: onPreviewSourceClick,
  isRenderSuspended: () => inlineEditorOpen.value || !!tableCellEditor.value,
})

// 纸张/边距/行距/分页开关变化时重新分页（内容已渲染，等样式生效后再量）
watch(
  () => [ui.paginate, ui.paperSize, ui.paperMargin, ui.lineHeight],
  () => nextTick(() => {
    applyHeadingCollapseClasses()
    paginate()
    measurePaperBox()
  }),
)

// 编辑期间缩放变化时，占位高(=editor offsetHeight / zoom)随之改变，需要重算
watch(() => ui.previewZoom, () => {
  if (inlineEditorOpen.value) nextTick(syncEditingReserve)
  if (inlineEditorOpen.value || tableCellEditor.value) nextTick(refreshPreviewEditLayout)
})

// 编辑器滚动 → 预览跟随（仅响应编辑器来源；预览自身来源由 EditorPane 监听处理，避免回环）
watch(() => sync.scrollNonce, () => {
  if (sync.scrollSource !== 'editor') return
  if (inlineEditorOpen.value || tableCellEditor.value) return
  scrollPreviewToLine(sync.scrollLine)
})

function onPaperScroll() {
  if (tableAddUi.value) tableAddUi.value = null // 绝对定位的悬停「+」不随内容滚动，滚动时先隐藏
  if (imgSel.value) refreshImgSelRect()
  if (cellSelBarPos.value) updateCellSelBarPos()
  refreshPreviewEditLayout()
  reportPreviewScrollLine()
}

// 预览 → 编辑器：取视口顶部第一个仍可见的带源码行号的块，按其真实源码行（含 front-matter 偏移）上报。
// 用 data-source-line 而非像素比例，故空行不渲染也不会让两边漂移。
function reportPreviewScrollLine() {
  const scroller = scrollerEl.value
  if (!scroller || !host.value) return
  // 编辑中 / 程序性滚动期间不反向驱动编辑器，避免打断与回环
  if (inlineEditorOpen.value || tableCellEditor.value || Date.now() < previewScrollLock) return
  const top = scroller.getBoundingClientRect().top + 4
  let best: HTMLElement | null = null
  for (const el of host.value.querySelectorAll<HTMLElement>('[data-source-line]')) {
    if (el.classList.contains('md-heading-hidden')) continue
    const rect = el.getBoundingClientRect()
    if (rect.bottom >= top) { best = el; break }
  }
  if (!best) return
  const rel = Number(best.getAttribute('data-source-line'))
  if (!Number.isFinite(rel)) return
  sync.requestScroll(rel + bodyLineOffset(), 'preview')
}

// 编辑器 → 预览：把目标源码行对应的块对齐到视口顶部。空行无对应块时回退到其后/前最近的块。
function scrollPreviewToLine(absLine: number) {
  const scroller = scrollerEl.value
  if (!scroller || !host.value) return
  const lines = doc.markdown.split('\n')
  let el = findElementAtLine(absLine)
  for (let l = absLine + 1; !el && l < lines.length && l <= absLine + 40; l++) el = findElementAtLine(l)
  for (let l = absLine - 1; !el && l >= 0 && l >= absLine - 40; l--) el = findElementAtLine(l)
  if (!el) return
  const scrollerRect = scroller.getBoundingClientRect()
  const delta = el.getBoundingClientRect().top - (scrollerRect.top + 28)
  previewScrollLock = Date.now() + 250
  scroller.scrollTop += delta
}

const paperStyle = computed(() => ({
  '--paper-width': `${ui.docPageWidth}px`,
  '--paper-min-height': `${PAPER_SIZES[ui.paperSize].heightMm}mm`,
  '--paper-padding': paperPadding(ui.paperSize, ui.paperMargin),
  '--paper-line-height': String(LINE_HEIGHTS[ui.lineHeight].value),
}))
const paperFrameStyle = computed(() => {
  const scale = ui.previewZoom
  const width = paperBox.value.width || ui.docPageWidth
  const height = paperBox.value.height
  return {
    width: `${Math.round(width * scale)}px`,
    height: height ? `${Math.round(height * scale)}px` : undefined,
  }
})
const paperZoomStyle = computed(() => ({
  transform: `scale(${ui.previewZoom})`,
}))

function stripMarkdownSimple(md: string): string {
  return md
    .replace(/^---[\s\S]*?---\n?/, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    .replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, '$1')
    .replace(/^\s*[-*>|+]\s*/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 220)
}

let hoverCardGen = 0

function onPreviewMouseover(e: MouseEvent) {
  // 编辑期间不弹悬停卡，避免打扰行内编辑
  if (inlineEditorOpen.value) return
  const target = e.target as HTMLElement | null
  if (!target) return
  // 悬停在非链接/脚注区域时尽早返回，省掉无谓的 closest 判定（mouseover 在子元素边界频繁触发）
  if (!target.closest('.wikilink[data-page], .footnote-ref')) return
  const wikiEl = target.closest<HTMLElement>('.wikilink[data-page]')
  if (wikiEl) {
    clearTimeout(hoverCardTimer)
    hoverCardTimer = window.setTimeout(async () => {
      const gen = ++hoverCardGen
      const page = wikiEl.dataset.page!
      const rect = wikiEl.getBoundingClientRect()
      const found = doc.list.find((d) => d.title === page)
      let content = ''
      if (found) {
        try {
          const full = found.id === doc.currentId
            ? { contentMarkdown: doc.markdown }
            : await doc.backend.get(found.id)
          content = stripMarkdownSimple(full.contentMarkdown)
        } catch { /* ignore */ }
      }
      if (gen !== hoverCardGen) return
      hoverCard.value = {
        anchor: { left: rect.left, top: rect.top, bottom: rect.bottom },
        title: page,
        content,
        exists: !!found,
      }
    }, 280)
    return
  }
  const fnEl = target.closest<HTMLElement>('.footnote-ref')
  if (fnEl) {
    const href = fnEl.querySelector('a')?.getAttribute('href')
    if (!href?.startsWith('#')) return
    const fnId = href.slice(1)
    const fnLi = host.value?.querySelector<HTMLElement>(`#${fnId}`)
    if (!fnLi) return
    clearTimeout(hoverCardTimer)
    hoverCardTimer = window.setTimeout(() => {
      const rect = fnEl.getBoundingClientRect()
      // 去掉回跳箭头再取正文：脚注可能被引用多次 → 有多个 .footnote-backref，
      // 且箭头字符含变体选择符（↩︎），直接正则裁文本会残留。克隆后移除元素最稳。
      const clone = fnLi.cloneNode(true) as HTMLElement
      clone.querySelectorAll('.footnote-backref').forEach((n) => n.remove())
      const rawText = clone.textContent?.trim() ?? ''
      hoverCard.value = {
        anchor: { left: rect.left, top: rect.top, bottom: rect.bottom },
        title: `[${fnId.replace('fn', '')}]`,
        content: rawText.slice(0, 220),
        exists: true,
      }
    }, 280)
  }
}

function onPreviewMouseout(e: MouseEvent) {
  const related = e.relatedTarget as HTMLElement | null
  if (related?.closest('.hover-preview-card')) return
  clearTimeout(hoverCardTimer)
  if (!hoverCardOnCard) hoverCard.value = null
}
function onHoverCardEnter() { hoverCardOnCard = true }
function onHoverCardLeave() { hoverCardOnCard = false; hoverCard.value = null }

function onReadingModeKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && ui.readingMode) { e.stopPropagation(); ui.exitReadingMode() }
}

function nodeInsideHost(node: Node | null): boolean {
  return !!node && !!host.value?.contains(node)
}

function rangeIntersectsNodeSafe(range: Range, node: Node): boolean {
  try {
    return range.intersectsNode(node)
  } catch {
    return false
  }
}

function rectsOverlap(a: DOMRect, b: DOMRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

function selectionTouchesElement(sel: Selection, el: HTMLElement): boolean {
  if ((sel.anchorNode && el.contains(sel.anchorNode)) || (sel.focusNode && el.contains(sel.focusNode))) return true
  for (let i = 0; i < sel.rangeCount; i++) {
    const range = sel.getRangeAt(i)
    if (rangeIntersectsNodeSafe(range, el)) return true
    const er = el.getBoundingClientRect()
    const rects = Array.from(range.getClientRects())
    if (rects.some((r) => rectsOverlap(r, er))) return true
  }
  return false
}

function selectedBlankSourceLines(sel: Selection): number[] {
  const root = host.value
  if (!root || (!nodeInsideHost(sel.anchorNode) && !nodeInsideHost(sel.focusNode))) return []
  const lines = doc.markdown.split('\n')
  const offset = bodyLineOffset()
  const selected = new Set<number>()
  root.querySelectorAll<HTMLElement>('.md-blank-line[data-source-line], .preview-edit-blank[data-source-line], blockquote[data-source-line]').forEach((el) => {
    const local = Number(el.dataset.sourceLine)
    if (!Number.isFinite(local)) return
    const absLine = local + offset
    if (!isDeletableBlankSourceLine(lines[absLine] ?? '')) return
    if (selectionTouchesElement(sel, el)) selected.add(absLine)
  })
  return Array.from(selected).sort((a, b) => a - b)
}

async function deleteSelectedBlankSourceLines(sel: Selection, linesToDelete: number[]) {
  const top = scrollerEl.value?.scrollTop ?? 0
  const lines = doc.markdown.split('\n')
  const uniqueDesc = Array.from(new Set(linesToDelete)).sort((a, b) => b - a)
  for (const line of uniqueDesc) {
    if (line < 0 || line >= lines.length) continue
    if (!isDeletableBlankSourceLine(lines[line] ?? '')) continue
    lines.splice(line, 1)
  }
  doc.setMarkdown(lines.length ? lines.join('\n') : '')
  sel.removeAllRanges()
  await renderPreview()
  restorePreviewScroll(top)
}

function onPreviewBlankLineKeydown(e: KeyboardEvent) {
  if (e.key !== 'Backspace' && e.key !== 'Delete') return
  if (inlineEditorOpen.value || tableCellEditor.value || codeInplace) return
  const active = document.activeElement as HTMLElement | null
  if (active?.closest('input, textarea, select, [contenteditable="true"]')) return
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return
  const linesToDelete = selectedBlankSourceLines(sel)
  if (!linesToDelete.length) return
  e.preventDefault()
  e.stopPropagation()
  void deleteSelectedBlankSourceLines(sel, linesToDelete)
}

onMounted(() => {
  if (!host.value) return
  paperObserver = new ResizeObserver(measurePaperBox)
  paperObserver.observe(host.value)
  nextTick(measurePaperBox)
  // 适应宽度模式下，滚动容器宽度变化（拖拽分栏 / 窗口缩放 / 收起侧栏）即重算缩放，纸张始终不被裁切。
  if (scrollerEl.value) {
    let lastW = scrollerEl.value.clientWidth
    scrollerObserver = new ResizeObserver(() => {
      const w = scrollerEl.value?.clientWidth ?? 0
      if (w === lastW) return
      lastW = w
      if (ui.previewFit) applyFitZoom()
    })
    scrollerObserver.observe(scrollerEl.value)
    if (ui.previewFit) nextTick(applyFitZoom)
  }
  window.addEventListener('pointerdown', onGlobalPointerDown, true)
  window.addEventListener('resize', refreshImgSelRect)
  window.addEventListener('keydown', onReadingModeKeydown, true)
  window.addEventListener('keydown', onPreviewBlankLineKeydown, true)
  window.addEventListener('morph:preview-format', onExternalFormat as EventListener)
  window.addEventListener('morph:preview-insert', onPreviewInsert)
  document.addEventListener('selectionchange', onPreviewSelectionChange)
  host.value.addEventListener('pointerup', onPreviewFormatPointerUp, true)
  host.value.addEventListener('keyup', onPreviewFormatKeyup, true)
  host.value.addEventListener('mouseover', onPreviewMouseover)
  host.value.addEventListener('mouseout', onPreviewMouseout)
})
onBeforeUnmount(() => {
  clearTimeout(hoverCardTimer)
  window.dispatchEvent(new CustomEvent('morph:preview-table-active', { detail: false }))
  cancelTableCellSelection()
  finishTableResize(false)
  resetBlockDrag()
  cleanupTableCellEditor(false)
  deactivateWysiwyg()
  paperObserver?.disconnect()
  scrollerObserver?.disconnect()
  editorObserver?.disconnect()
  previewToolbarObserver?.disconnect()
  window.removeEventListener('pointerdown', onGlobalPointerDown, true)
  window.removeEventListener('resize', refreshImgSelRect)
  window.removeEventListener('keydown', onReadingModeKeydown, true)
  window.removeEventListener('keydown', onPreviewBlankLineKeydown, true)
  window.removeEventListener('morph:preview-format', onExternalFormat as EventListener)
  window.removeEventListener('morph:preview-insert', onPreviewInsert)
  document.removeEventListener('selectionchange', onPreviewSelectionChange)
  host.value?.removeEventListener('pointerup', onPreviewFormatPointerUp, true)
  host.value?.removeEventListener('keyup', onPreviewFormatKeyup, true)
  host.value?.removeEventListener('mouseover', onPreviewMouseover)
  host.value?.removeEventListener('mouseout', onPreviewMouseout)
})
</script>

<template>
  <div class="pane paper-preview">
    <div class="preview-bar">
      <div class="tool-group">
        <span class="group-label">{{ t('previewControls.page') }}</span>
        <span class="ctl"><span>{{ t('previewControls.paper') }}</span>
          <SelectMenu :value="ui.paperSize" :options="paperOpts" @update="ui.setPaperSize($event as PaperSize)" />
        </span>
        <span class="ctl"><span>{{ t('previewControls.margin') }}</span>
          <SelectMenu :value="ui.paperMargin" :options="marginOpts" @update="ui.setPaperMargin($event as PaperMargin)" />
        </span>
        <span class="ctl"><span>{{ t('previewControls.lineHeight') }}</span>
          <SelectMenu :value="ui.lineHeight" :options="lineOpts" @update="ui.setLineHeight($event as LineHeightKey)" />
        </span>
      </div>
      <div class="tool-group">
        <span class="group-label">{{ t('previewControls.display') }}</span>
        <div class="seg">
          <button :class="{ on: ui.paginate }" @click="ui.setPaginate(true)">{{ t('previewControls.paginated') }}</button>
          <button :class="{ on: !ui.paginate }" @click="ui.setPaginate(false)">{{ t('previewControls.continuous') }}</button>
        </div>
        <span class="zoom-seg" :title="t('previewControls.fitPageTip')" @dblclick="fitPreviewToPage">
          <button
            type="button"
            class="zoom-step"
            :aria-label="t('mermaid.zoomOut')"
            @click="stepZoom(-1)"
          >−</button>
          <SelectMenu
            class="zoom-sel"
            :value="zoomLabel"
            :options="zoomOpts"
            :width="120"
            align="right"
            @update="onZoomPick"
          />
          <button
            type="button"
            class="zoom-step"
            :aria-label="t('mermaid.zoomIn')"
            @click="stepZoom(1)"
          >+</button>
        </span>
        <button
          type="button"
          class="reading-mode-btn"
          :class="{ on: ui.readingMode }"
          :title="ui.readingMode ? t('previewControls.exitReadingMode') : t('previewControls.readingMode')"
          @click="ui.toggleReadingMode()"
        >
          <Icon name="maximize" :size="14" />
        </button>
      </div>
    </div>
    <div
      class="paper-scroll"
      ref="scrollerEl"
      @wheel="onWheelZoom"
      @scroll="onPaperScroll"
      @pointermove="onPreviewDragHover"
      @mousemove="onTablePointerMove"
      @mouseleave="onPreviewPointerLeave"
    >
      <!-- Notion 式悬停加行/加列「+」（取长补短：markdown 表格 + 便捷新增） -->
      <button
        v-if="tableAddUi?.rowBtn"
        class="tbl-add tbl-add-row"
        title="添加一行"
        :style="{ left: tableAddUi.rowBtn.left + 'px', top: tableAddUi.rowBtn.top + 'px', width: tableAddUi.rowBtn.width + 'px' }"
        @mouseenter="cancelTableAddHide"
        @mouseleave="scheduleTableAddHide()"
        @pointerdown.prevent
        @click="addRowToHoveredTable"
      ><span>+</span></button>
      <button
        v-if="tableAddUi?.colBtn"
        class="tbl-add tbl-add-col"
        title="添加一列"
        :style="{ left: tableAddUi.colBtn.left + 'px', top: tableAddUi.colBtn.top + 'px', height: tableAddUi.colBtn.height + 'px' }"
        @mouseenter="cancelTableAddHide"
        @mouseleave="scheduleTableAddHide()"
        @pointerdown.prevent
        @click="addColToHoveredTable"
      ><span>+</span></button>
      <div class="paper-frame" :style="paperFrameStyle">
        <div
          class="paper-zoom"
          :style="paperZoomStyle"
          @dragover="onPreviewDragOver"
          @drop="onPreviewDrop"
        >
          <div class="doc-preview flow" ref="host" :style="paperStyle" @contextmenu="onTableContextMenu"></div>
          <button
            v-if="dragHandle"
            type="button"
            class="doc-block-drag-handle"
            :class="{ active: draggingBlock }"
            draggable="true"
            title="拖动排序"
            :style="{ left: dragHandle.x + 'px', top: dragHandle.y + 'px', height: dragHandle.h + 'px' }"
            @pointerdown="startBlockPointerDrag"
            @dragstart="onBlockHandleDragStart"
            @dragend="onBlockPointerCancel"
          >
            <Icon name="grip-vertical" :size="16" :stroke="2.8" />
          </button>
          <div
            v-if="draggingBlock && dropY !== null"
            class="doc-block-drop-line"
            :style="{ top: dropY + 'px' }"
          ></div>
          <Transition name="ipe-pop">
            <div
                v-if="inlineEditorOpen && inlineEditorMode === 'code'"
              ref="inlineEditorEl"
              class="inline-preview-editor"
                :class="`ipe-mode-${inlineEditorPresentation}`"
              :style="{
                left: inlineEditorPos.x + 'px',
                top: inlineEditorPos.y + 'px',
                width: inlineEditorPos.width + 'px',
                '--ipe-scale': String(1 / (ui.previewZoom || 1)),
                '--ipe-font-family': inlineEditorTypography.fontFamily,
                '--ipe-font-size': inlineEditorTypography.fontSize,
                '--ipe-font-weight': inlineEditorTypography.fontWeight,
                '--ipe-line-height': inlineEditorTypography.lineHeight,
              }"
            >
              <div
                  class="ipe-code-card"
                  :class="{
                    'is-chart': inlineEditorPresentation === 'chart',
                    'is-plain-code': inlineEditorPresentation === 'code',
                    'ipe-fit': inlineEditorPresentation === 'code' && inlineCodeFitsNoScroll,
                  }"
              >
                <div v-if="inlineEditorPresentation === 'chart'" class="ipe-header">
                  <span class="ipe-title">{{ inlineEditorTitle }}</span>
                  <span class="ipe-lang">{{ inlineEditorLabel }}</span>
                </div>
                <span v-else class="ipe-code-lang">{{ inlineEditorLabel }}</span>
                <div class="ipe-body">
                  <div ref="inlineGutter" class="ipe-gutter">
                    <span v-for="lineNo in inlineLineNumbers" :key="lineNo">{{ lineNo }}</span>
                  </div>
                  <div
                    ref="inlineCode"
                    class="ipe-code"
                    contenteditable="plaintext-only"
                    spellcheck="false"
                    @input="onCodeInput"
                    @keydown="onInlineKeydown"
                    @blur="onInlineBlur"
                    @scroll="syncInlineScroll"
                  ></div>
                </div>
                <!-- 预览对照只对真正会「渲染成别的样子」的块有意义：图表(mermaid/echarts/甘特)与公式。
                     纯代码块的预览只是把同样的代码再高亮一遍，纯属浪费，故不再展示。 -->
                <div
                  v-if="inlineEditorPresentation === 'chart' || inlineEditorPresentation === 'math'"
                  class="ipe-preview"
                  :class="`ipe-preview-${inlineEditorPresentation}`"
                  @pointerdown.stop
                >
                  <div class="ipe-preview-tab">{{ t('previewControls.renderedPreview') }}</div>
                  <div ref="inlinePreviewEl" class="ipe-preview-body"></div>
                </div>
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </div>
    <LinkEditorPopover
      v-if="linkEditor"
      :anchor="linkEditor.anchor"
      :fields="linkEditor.fields"
      @cancel="linkEditor = null"
      @done="saveLink"
      @unlink="unlinkLink"
    />
    <ChipEditorPopover
      v-if="chipEditor"
      :anchor="chipEditor.anchor"
      :fields="chipEditor.fields"
      @cancel="chipEditor = null"
      @done="saveChip"
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
    <HoverPreviewCard
      v-if="hoverCard"
      :anchor="hoverCard.anchor"
      :title="hoverCard.title"
      :content="hoverCard.content"
      :exists="hoverCard.exists"
      :not-found-text="t('hoverCard.notFound')"
      @mouseenter="onHoverCardEnter"
      @mouseleave="onHoverCardLeave"
    />
    <!-- 合并浮条：贴近所选单元格上方居中（贴顶则翻到下方），不再固定在面板底部 -->
    <Transition name="tsb-pop">
      <div
        v-if="tableCellSelection && selectedCellCount() > 1 && cellSelBarPos"
        class="tbl-select-bar tbl-cell-select-bar"
        :style="cellSelBarPos.top < 110
          ? { position: 'fixed', left: cellSelBarPos.left + 'px', top: (cellSelBarPos.bottom + 8) + 'px', bottom: 'auto', transform: 'translate(-50%, 0)' }
          : { position: 'fixed', left: cellSelBarPos.left + 'px', top: (cellSelBarPos.top - 8) + 'px', bottom: 'auto', transform: 'translate(-50%, -100%)' }"
      >
        <span class="tsb-count">已选择 {{ selectedCellCount() }} 个单元格</span>
        <button class="tsb-btn" @click="mergeSelectedCells">合并单元格</button>
        <button class="tsb-btn tsb-cancel" @click="clearTableCellSelection">取消</button>
      </div>
    </Transition>
    <Transition name="tsb-pop">
      <div v-if="tableSelection && tableSelection.rows.length" class="tbl-select-bar">
        <span class="tsb-count">已选择 {{ tableSelection.rows.length }} 行</span>
        <button class="tsb-btn tsb-del" @click="deleteSelectedRows">删除</button>
        <button class="tsb-btn tsb-cancel" @click="clearTableSelection">取消</button>
      </div>
    </Transition>

    <!-- 选中图片：八方向缩放手柄 + 专用浮动工具栏 -->
    <template v-if="imgSel">
      <div
        class="md-img-overlay"
        :style="{ left: imgSel.rect.left + 'px', top: imgSel.rect.top + 'px', width: imgSel.rect.width + 'px', height: imgSel.rect.height + 'px' }"
      >
        <span class="ih ih-nw" @pointerdown="startImgResize($event, 'nw')"></span>
        <span class="ih ih-n" @pointerdown="startImgResize($event, 'n')"></span>
        <span class="ih ih-ne" @pointerdown="startImgResize($event, 'ne')"></span>
        <span class="ih ih-e" @pointerdown="startImgResize($event, 'e')"></span>
        <span class="ih ih-se" @pointerdown="startImgResize($event, 'se')"></span>
        <span class="ih ih-s" @pointerdown="startImgResize($event, 's')"></span>
        <span class="ih ih-sw" @pointerdown="startImgResize($event, 'sw')"></span>
        <span class="ih ih-w" @pointerdown="startImgResize($event, 'w')"></span>
      </div>
      <div
        class="md-img-toolbar"
        :class="{ 'imgtb-below': imgSel.rect.top < 92 }"
        :style="{
          left: (imgSel.rect.left + imgSel.rect.width / 2) + 'px',
          top: (imgSel.rect.top < 92 ? imgSel.rect.top + imgSel.rect.height + 6 : imgSel.rect.top - 6) + 'px',
        }"
        @pointerdown.stop
      >
        <button class="imgtb-btn" :class="{ on: imgSel.attrs.align === 'left' }" :title="t('imageToolbar.alignLeft')" @click="imgSetAlign('left')"><Icon name="align-left" /></button>
        <button class="imgtb-btn" :class="{ on: imgSel.attrs.align === 'center' }" :title="t('imageToolbar.alignCenter')" @click="imgSetAlign('center')"><Icon name="align-center" /></button>
        <button class="imgtb-btn" :class="{ on: imgSel.attrs.align === 'right' }" :title="t('imageToolbar.alignRight')" @click="imgSetAlign('right')"><Icon name="align-right" /></button>
        <span class="imgtb-sep"></span>
        <button class="imgtb-btn" :class="{ on: imgSel.attrs.rounded }" :title="t('imageToolbar.rounded')" @click="imgToggleRounded"><Icon name="rounded" /></button>
        <button class="imgtb-btn" :class="{ on: imgSel.attrs.shadow }" :title="t('imageToolbar.shadow')" @click="imgToggleShadow"><Icon name="shadow" /></button>
        <button class="imgtb-btn" :class="{ on: imgRatioLocked }" :title="t('imageToolbar.lockRatio')" @click="imgRatioLocked = !imgRatioLocked"><Icon name="maximize" /></button>
        <span class="imgtb-sep"></span>
        <button class="imgtb-btn" :title="t('imageToolbar.replace')" @click="imgReplace"><Icon name="replace" /></button>
        <button class="imgtb-btn" :title="t('imageToolbar.editPath')" @click="imgEditPath"><Icon name="link" /></button>
        <button class="imgtb-btn" :title="t('imageToolbar.editAlt')" @click="imgEditAlt"><Icon name="type" /></button>
      </div>
      <input ref="imgFileInput" type="file" accept="image/*" class="img-hidden-input" @change="onImgFilePicked" />
    </template>
  </div>
</template>

<style scoped>
.paper-preview {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--app-shell-bg);
}
.preview-bar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--app-hairline);
  background: var(--app-shell-bg);
  overflow-x: auto;
  scrollbar-width: none;
}
.preview-bar::-webkit-scrollbar { display: none; }
.tool-group {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 4px 8px;
  border: 1px solid var(--app-control-border);
  border-radius: var(--radius-lg);
  background: var(--app-control-bg);
  box-shadow: 0 1px 0 var(--app-edge) inset;
  white-space: nowrap;
}
.group-label {
  font-size: 11px;
  font-weight: 800;
  color: color-mix(in srgb, var(--app-primary-color) 72%, var(--app-muted));
}
.ctl { display: inline-flex; align-items: center; gap: 6px; font-size: var(--font-size-xs); font-weight: 650; color: var(--app-muted); }
.ctl select {
  font: inherit; font-size: var(--font-size-xs); font-weight: 650; color: var(--app-fg);
  padding: 5px 8px; border: 1px solid var(--app-control-border);
  border-radius: var(--radius-md); background: var(--app-elevated); cursor: pointer;
  transition: border-color var(--transition-fast);
}
.ctl select:hover { border-color: color-mix(in srgb, var(--app-primary-color) 45%, var(--app-border)); }
.spacer { flex: 1 1 auto; }
.seg {
  display: inline-flex; padding: 2px; border-radius: var(--radius-md);
  background: var(--app-elevated);
  border: 1px solid var(--app-control-border);
}
.seg button {
  font: inherit; font-size: var(--font-size-xs); font-weight: 650; cursor: pointer;
  padding: 3px 9px; border: 0; border-radius: var(--radius-xs); background: none; color: var(--app-muted);
  transition: background var(--transition-fast), color var(--transition-fast);
}
.seg button.on { background: var(--app-primary-color); color: #fff; }
/* 紧凑分段缩放步进器（与图表卡 − 100% + 同款）：省去滑块，节约空间 */
.zoom-seg {
  display: inline-flex;
  align-items: center;
  padding: 2px;
  border-radius: var(--radius-md);
  background: var(--app-elevated);
  border: 1px solid var(--app-control-border);
}
.zoom-step {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-xs);
  background: none;
  color: var(--app-muted);
  font: 700 15px/1 system-ui, sans-serif;
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);
}
.zoom-step:hover {
  color: var(--app-primary-color);
  background: color-mix(in srgb, var(--app-primary-color) 10%, transparent);
}
.zoom-sel :deep(.sel-trigger) {
  font-variant-numeric: tabular-nums;
  font-size: var(--font-size-xs);
  font-weight: 650;
  min-width: 46px;
  justify-content: center;
  padding: 3px 4px;
  border: 0;
  background: none;
}

/* Notion 式悬停加行/加列「+」：只在底行/右列出现，悬于表格底/右边缘，点击在末尾追加 */
.tbl-add {
  position: absolute;
  z-index: 26;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  padding: 0;
  cursor: pointer;
  color: #fff;
  background: color-mix(in srgb, var(--primary-color) 86%, #0f172a);
  border: 1px solid color-mix(in srgb, var(--primary-color) 42%, white);
  box-shadow:
    0 2px 6px rgba(15, 23, 42, 0.18),
    0 12px 26px rgba(15, 23, 42, 0.16),
    inset 0 1px 0 rgba(255,255,255,.24);
  opacity: 0.94;
  transition: opacity 0.1s ease, background 0.1s ease, color 0.1s ease, box-shadow 0.1s ease, transform 0.1s ease;
}
.tbl-add::before {
  content: '';
  position: absolute;
  inset: -12px;
  border-radius: inherit;
}
.tbl-add span { font-size: 16px; font-weight: 820; line-height: 1; }
.tbl-add:hover {
  opacity: 1;
  color: #fff;
  background: color-mix(in srgb, var(--primary-color) 96%, #0f172a);
  transform: scale(1.02);
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--primary-color) 15%, transparent),
    0 14px 32px rgba(15, 23, 42, 0.18);
}
.tbl-add-row {
  height: 24px;
  margin-top: 4px;
  border-radius: 999px;
}
.tbl-add-col {
  width: 24px;
  margin-left: 4px;
  border-radius: 999px;
}
.tbl-add-row span { transform: translateY(-1px); }

.paper-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  position: relative;
  /* flex 列 + 子级 margin:auto：纸张比视口窄时水平居中，比视口宽（放大/窄分栏）时
     两侧都可滚动到，不再像 block margin:auto 那样被钉在左侧、右侧被裁切。 */
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  /* 中性底，纸张作为卡片悬浮其上 */
  padding: 28px;
  background: var(--app-shell-bg);
}
.paper-frame {
  margin: 0 auto;
  position: relative;
  transform-origin: top center;
  flex: 0 0 auto;
}
.paper-zoom {
  width: max-content;
  position: relative;
  transform-origin: top left;
}

.doc-block-drag-handle {
  position: absolute;
  z-index: 22;
  width: 28px;
  min-height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--primary-color) 28%, var(--app-hairline));
  border-radius: 12px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--bg) 96%, white), color-mix(in srgb, var(--bg) 90%, transparent));
  color: color-mix(in srgb, var(--primary-color) 66%, var(--muted));
  cursor: grab;
  user-select: none;
  opacity: 0.92;
  box-shadow:
    0 10px 24px rgba(15, 23, 42, 0.14),
    inset 0 1px 0 rgba(255,255,255,.5);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  transition: opacity 0.12s ease, transform 0.12s ease, color 0.12s ease, background 0.12s ease, border-color 0.12s ease;
}

.doc-block-drag-handle:hover,
.doc-block-drag-handle.active {
  opacity: 1;
  color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 9%, var(--bg));
  border-color: color-mix(in srgb, var(--primary-color) 44%, var(--app-hairline));
  transform: translateX(-1px);
}

.doc-block-drag-handle.active {
  cursor: grabbing;
}

.doc-block-drop-line {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 21;
  height: 3px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary-color) 82%, white);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--primary-color) 20%, transparent), 0 6px 18px color-mix(in srgb, var(--primary-color) 28%, transparent);
  pointer-events: none;
}

/* 内容容器：flow=单张连续纸；paged=多张纸竖排（之间留间隔） */
.doc-preview {
  width: var(--paper-width);
  max-width: none;
  margin: 0 auto;
  color: var(--fg);
  line-height: var(--paper-line-height);
}
/* 纸张卡片观感：边框 + 轻阴影，与底背景区分 */
.doc-preview.flow {
  background: var(--bg);
  padding: var(--paper-padding);
  min-height: var(--paper-min-height);
  border: 1px solid var(--app-hairline);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-paper);
}
.doc-preview.paged {
  display: flex;
  flex-direction: column;
  gap: 24px;
  background: transparent;
  padding: 0;
}
.doc-preview.paged :deep(.page-sheet) {
  width: 100%;
  box-sizing: border-box;
  min-height: var(--paper-min-height);
  padding: var(--paper-padding);
  background: var(--bg);
  border: 1px solid var(--app-hairline);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-paper);
  overflow: hidden;
}
.doc-preview.paged :deep(.page-sheet > :first-child) { margin-top: 0; }
.doc-preview.paged :deep(.page-sheet > :last-child) { margin-bottom: 0; }

.doc-preview :deep(.md-heading-hidden) {
  display: none !important;
}

.doc-preview :deep(h1[data-source-line]),
.doc-preview :deep(h2[data-source-line]),
.doc-preview :deep(h3[data-source-line]),
.doc-preview :deep(h4[data-source-line]),
.doc-preview :deep(h5[data-source-line]),
.doc-preview :deep(h6[data-source-line]) {
  position: relative;
}

.doc-preview :deep(.md-heading-toggle) {
  position: absolute;
  left: -28px;
  top: 0.12em;
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 7px;
  background: color-mix(in srgb, var(--bg) 84%, transparent);
  color: color-mix(in srgb, var(--primary-color) 76%, var(--muted));
  font: 800 14px/1 var(--font-family);
  cursor: pointer;
  opacity: 0;
  transform: translateX(3px) scale(0.94);
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--primary-color) 12%, transparent),
    0 6px 16px rgba(15, 23, 42, 0.10);
  transition: opacity 0.12s ease, transform 0.12s ease, background 0.12s ease, color 0.12s ease;
}

.doc-preview :deep(h1[data-source-line]:hover > .md-heading-toggle),
.doc-preview :deep(h2[data-source-line]:hover > .md-heading-toggle),
.doc-preview :deep(h3[data-source-line]:hover > .md-heading-toggle),
.doc-preview :deep(h4[data-source-line]:hover > .md-heading-toggle),
.doc-preview :deep(h5[data-source-line]:hover > .md-heading-toggle),
.doc-preview :deep(h6[data-source-line]:hover > .md-heading-toggle),
.doc-preview :deep(.md-heading-toggle:focus-visible),
.doc-preview :deep(.md-heading-collapsed > .md-heading-toggle) {
  opacity: 1;
  transform: translateX(0) scale(1);
}

.doc-preview :deep(.md-heading-toggle:hover) {
  color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 9%, var(--bg));
}

.doc-preview :deep(.md-heading-collapsed) {
  margin-bottom: 0.45em;
}

.doc-preview :deep(.md-resizable-image) {
  max-width: 100%;
  vertical-align: middle;
  cursor: pointer;
}

/* 选中图片：八方向缩放手柄浮层（fixed，贴合图片屏幕坐标） */
.md-img-overlay {
  position: fixed;
  z-index: 60;
  pointer-events: none;
  outline: 1.5px solid color-mix(in srgb, var(--primary-color) 70%, transparent);
  outline-offset: 1px;
  border-radius: 2px;
}
.md-img-overlay .ih {
  position: absolute;
  width: 12px;
  height: 12px;
  margin: -6px 0 0 -6px;
  border-radius: 50%;
  background: var(--bg);
  border: 2px solid var(--primary-color);
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.25);
  pointer-events: auto;
}
.md-img-overlay .ih-nw { left: 0; top: 0; cursor: nwse-resize; }
.md-img-overlay .ih-n { left: 50%; top: 0; cursor: ns-resize; }
.md-img-overlay .ih-ne { left: 100%; top: 0; cursor: nesw-resize; }
.md-img-overlay .ih-e { left: 100%; top: 50%; cursor: ew-resize; }
.md-img-overlay .ih-se { left: 100%; top: 100%; cursor: nwse-resize; }
.md-img-overlay .ih-s { left: 50%; top: 100%; cursor: ns-resize; }
.md-img-overlay .ih-sw { left: 0; top: 100%; cursor: nesw-resize; }
.md-img-overlay .ih-w { left: 0; top: 50%; cursor: ew-resize; }

/* 选中图片：专用浮动工具栏（在图片上方居中） */
.md-img-toolbar {
  position: fixed;
  z-index: 61;
  transform: translate(-50%, -100%);
  display: flex;
  align-items: center;
  gap: 2px;
}
.md-img-toolbar.imgtb-below {
  transform: translate(-50%, 0);
  padding: 3px 5px;
  border-radius: 10px;
  background: var(--bg);
  border: 1px solid color-mix(in srgb, var(--text) 12%, transparent);
  box-shadow: 0 6px 24px rgba(15, 23, 42, 0.18);
}
.md-img-toolbar .imgtb-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
}
.md-img-toolbar .imgtb-btn:hover {
  background: color-mix(in srgb, var(--primary-color) 12%, var(--bg));
}
.md-img-toolbar .imgtb-btn.on {
  background: color-mix(in srgb, var(--primary-color) 18%, var(--bg));
  color: var(--primary-color);
}
.md-img-toolbar .imgtb-sep {
  width: 1px;
  height: 18px;
  margin: 0 3px;
  background: color-mix(in srgb, var(--text) 14%, transparent);
}
.img-hidden-input {
  position: fixed;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
  left: -9999px;
}

.doc-preview :deep(.md-editable-table th),
.doc-preview :deep(.md-editable-table td) {
  position: relative;
  /* 默认更舒适的行高/列宽：空表格也不至于又扁又窄，内容多时仍会自动撑开 */
  min-width: 92px;
  height: 2.8em;
  transition: background 0.12s ease, box-shadow 0.12s ease, border-color 0.12s ease;
}

.doc-preview :deep(.md-editable-table tr:hover > th),
.doc-preview :deep(.md-editable-table tr:hover > td) {
  background: color-mix(in srgb, var(--primary-color) 4%, var(--bg));
}

.doc-preview :deep(.md-table-handle) {
  position: absolute;
  z-index: 5;
  top: 50%;
  right: 6px;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--app-hairline) 80%, transparent);
  border-radius: 9px;
  background: color-mix(in srgb, var(--bg) 92%, transparent);
  color: color-mix(in srgb, var(--muted) 76%, var(--primary-color));
  box-shadow:
    0 8px 22px rgba(15, 23, 42, 0.13),
    inset 0 1px 0 rgba(255, 255, 255, 0.42);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  cursor: pointer;
  font: 900 16px/1 var(--font-family);
  opacity: 0;
  transform: translateY(-50%) translateX(3px) scale(0.94);
  transition: opacity 0.12s ease, transform 0.12s ease, background 0.12s ease, color 0.12s ease;
}

/* 每个单元格都可触发：悬停到哪个单元格，就显示哪个单元格的 ⋮（不再只限首行/首列） */
.doc-preview :deep(.md-editable-table td),
.doc-preview :deep(.md-editable-table th) {
  position: relative;
}
.doc-preview :deep(.md-editable-table td:hover > .md-table-handle),
.doc-preview :deep(.md-editable-table th:hover > .md-table-handle),
.doc-preview :deep(.md-table-handle:focus-visible) {
  opacity: 1;
  transform: translateY(-50%) translateX(0) scale(1);
}

.doc-preview :deep(.md-table-handle:hover) {
  background: color-mix(in srgb, var(--primary-color) 9%, var(--bg));
  color: var(--primary-color);
}

.doc-preview :deep(.md-table-resize) {
  position: absolute;
  z-index: 4;
  display: block;
  opacity: 0;
  transition: opacity 0.12s ease, background 0.12s ease, box-shadow 0.12s ease;
}

.doc-preview :deep(.md-table-col-resize) {
  top: -1px;
  right: -8px;
  bottom: -1px;
  width: 16px;
  cursor: col-resize;
}

.doc-preview :deep(.md-table-col-resize::after) {
  content: '';
  position: absolute;
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary-color) 70%, transparent);
  top: 7px;
  bottom: 7px;
  left: 7px;
  width: 2px;
}

.doc-preview :deep(.md-editable-table:hover .md-table-resize),
.doc-preview :deep(.md-table-resize:hover),
.doc-preview :deep(.md-table-resizing .md-table-resize) {
  opacity: 0.18;
}

.doc-preview :deep(.md-table-resize:hover),
.doc-preview :deep(.md-table-resizing .md-table-resize) {
  background: color-mix(in srgb, var(--primary-color) 8%, transparent);
  opacity: 1;
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--primary-color) 10%, transparent);
}

.doc-preview :deep(.md-table-resize:hover::after),
.doc-preview :deep(.md-table-resizing .md-table-resize::after) {
  background: var(--primary-color);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary-color) 16%, transparent);
}

/* Notion 式行选择勾选框：表格悬停或已选时显形，落在表格左外缘的留白里 */
.doc-preview :deep(.md-row-select) {
  position: absolute;
  z-index: 3;
  top: 50%;
  left: -24px;
  width: 16px;
  height: 16px;
  padding: 0;
  border-radius: 4px;
  border: 1.5px solid color-mix(in srgb, var(--primary-color) 42%, var(--muted));
  background: var(--bg);
  cursor: pointer;
  opacity: 0;
  transform: translateY(-50%) scale(0.92);
  transition: opacity 0.12s ease, transform 0.12s ease, background 0.12s ease, border-color 0.12s ease;
}
.doc-preview :deep(.md-editable-table:hover .md-row-select),
.doc-preview :deep(.md-row-select.on),
.doc-preview :deep(.md-row-select:focus-visible) {
  opacity: 1;
  transform: translateY(-50%) scale(1);
}
.doc-preview :deep(.md-row-select.on) {
  background: var(--primary-color);
  border-color: var(--primary-color);
}
.doc-preview :deep(.md-row-select.on::after) {
  content: '✓';
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 11px;
  font-weight: 900;
  line-height: 1;
}
.doc-preview :deep(.md-row-selected > td),
.doc-preview :deep(.md-row-selected > th) {
  background: color-mix(in srgb, var(--primary-color) 12%, var(--bg)) !important;
}

.doc-preview :deep(.md-cell-selected) {
  background: color-mix(in srgb, var(--primary-color) 12%, var(--bg)) !important;
  box-shadow:
    inset 0 0 0 2px color-mix(in srgb, var(--primary-color) 74%, transparent),
    inset 0 0 0 999px color-mix(in srgb, var(--primary-color) 4%, transparent);
}

/* 多行选择浮条 */
.tbl-select-bar {
  position: absolute;
  left: 50%;
  bottom: 22px;
  transform: translateX(-50%);
  z-index: 28;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px 7px 12px;
  border: 1px solid color-mix(in srgb, var(--app-hairline) 72%, transparent);
  border-radius: 14px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--app-panel-bg, #fff) 96%, white), var(--app-panel-bg, #fff));
  box-shadow:
    0 18px 44px rgba(15, 23, 42, 0.20),
    0 3px 12px rgba(15, 23, 42, 0.10),
    inset 0 1px 0 rgba(255, 255, 255, 0.42);
  backdrop-filter: blur(16px) saturate(1.2);
  -webkit-backdrop-filter: blur(16px) saturate(1.2);
  font-size: 13px;
  white-space: nowrap;
  flex-wrap: nowrap;
  max-width: none;
  width: max-content;
}
.tbl-cell-select-bar {
  bottom: 66px;
}
.tbl-select-bar .tsb-btn { white-space: nowrap; flex: 0 0 auto; }
.tsb-count {
  color: var(--app-text, #2b2f36);
  font-weight: 650;
  letter-spacing: -0.01em;
  white-space: nowrap;
}
.tsb-btn {
  border: 0;
  border-radius: 9px;
  padding: 5px 11px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 650;
  background: color-mix(in srgb, var(--primary-color, var(--app-primary-color, #2b7)) 92%, black);
  color: #fff;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.22);
}
.tsb-btn:hover { filter: brightness(0.97); }
.tsb-del { background: #e5484d; color: #fff; }
.tsb-del:hover { background: #d23b40; }
.tsb-cancel {
  background: color-mix(in srgb, var(--app-muted, #889) 16%, transparent);
  color: var(--app-text, #2b2f36);
  box-shadow: none;
}
.tsb-cancel:hover { background: color-mix(in srgb, var(--app-muted, #889) 28%, transparent); }
.tsb-pop-enter-active, .tsb-pop-leave-active { transition: opacity 0.14s ease, transform 0.14s ease; }
.tsb-pop-enter-from, .tsb-pop-leave-to { opacity: 0; transform: translate(-50%, 8px); }

.doc-preview :deep(.md-table-cell-editing) {
  outline: none;
  background: color-mix(in srgb, var(--primary-color) 6%, var(--bg)) !important;
  box-shadow:
    inset 3px 0 0 color-mix(in srgb, var(--primary-color) 80%, transparent),
    inset 0 -1px 0 color-mix(in srgb, var(--primary-color) 42%, transparent);
  caret-color: var(--primary-color);
  cursor: text;
}

/* 行内编辑期间把原内容从版面中隐去，但保留一段「占位高度」(= 编辑器高度，由 JS 写入
   --ipe-reserve)，让后续内容正好落在浮层编辑器下方：既不被遮挡，也不留下原块（如高图表）
   那一大片空白。默认 0，编辑器挂载后由 syncEditingReserve 实时写入实际高度。 */
.doc-preview :deep(.preview-editing-target:not(.preview-editing-inline)) {
  display: block;
  height: var(--ipe-reserve, 0) !important;
  min-height: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  overflow: hidden !important;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s ease;
}

/* WYSIWYG 原地编辑：保持渲染外观，仅给出可编辑光标反馈，不改版式不跳变 */
.doc-preview :deep(.wysiwyg-editing) {
  outline: none;
  caret-color: var(--primary-color);
  cursor: text;
}
/* 空块占位提示 */
.doc-preview :deep(.wysiwyg-editing.wysiwyg-empty)::before {
  content: '输入内容…';
  color: var(--app-muted, #9aa);
  opacity: 0.6;
  pointer-events: none;
}
.doc-preview :deep(.typora-source-active) {
  outline: none;
  caret-color: var(--primary-color);
  font-family: var(--font-family-mono);
  font-style: normal;
  text-decoration: none;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.doc-preview :deep(.typora-source-inline) {
  display: inline;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  /* O8b：去除原本的主题色下划线，rich 编辑期间不再改变文字颜色/装饰，只保留光标位置反馈 */
  box-shadow: none;
  color: inherit;
  font-size: inherit;
  font-weight: 400;
  line-height: inherit;
}

.doc-preview :deep(.typora-source-block) {
  min-height: 1em;
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
  color: var(--fg);
}

/* O8b：focus 时不再加底色，靠 caret-color 单独标识编辑位置即可 */
.doc-preview :deep(.typora-source-active:focus) {
  background: transparent;
  outline: none;
}

.doc-preview :deep(.md-syntax-token) {
  color: color-mix(in srgb, var(--primary-color) 78%, var(--fg));
  font-weight: 750;
  opacity: 0.9;
}

.doc-preview :deep(.preview-edit-blank) {
  min-height: 1.6em;
  margin: 0;
}
.doc-preview :deep(blockquote.preview-edit-quote-blank) {
  min-height: 2.4em;
}
.inline-preview-editor {
  position: absolute;
  z-index: 20;
  min-width: 0;
  border: 0;
  border-radius: 0;
  overflow: visible;
  background: transparent;
  box-shadow: none;
  transform-origin: top left;
  /* 用 1/zoom 的反向缩放抵消父级 .paper-zoom 的 transform:scale，
     使编辑框始终按自然字号渲染，且位置随页面缩放实时跟随（纯 CSS 联动，无需重新测量 DOM） */
  transform: scale(var(--ipe-scale, 1));
}

.inline-preview-editor.ipe-mode-inline {
  transform: translateY(-1px) scale(var(--ipe-scale, 1));
}
.ipe-code-card {
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  max-height: min(600px, 72vh);
  border: 1px solid color-mix(in srgb, var(--border) 86%, transparent);
  border-radius: 11px;
  background: var(--code-bg);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary-color) 10%, transparent);
}
/* 纯代码块且 ≤50 行：整卡随内容撑开，不限高、不出滚动条 */
.ipe-code-card.ipe-fit { max-height: none; }
.ipe-code-card.ipe-fit .ipe-body { max-height: none; }
.ipe-code-card.ipe-fit .ipe-code { max-height: none; overflow-y: visible; }

.ipe-code-lang {
  position: absolute;
  z-index: 1;
  top: 5px;
  right: 8px;
  padding: 1px 5px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--primary-color) 7%, var(--code-bg));
  color: color-mix(in srgb, var(--primary-color) 72%, var(--muted));
  font: 600 10px/1.3 var(--font-family-mono);
}

.ipe-code-card.is-chart {
  border-color: var(--preview-editor-border);
  border-radius: var(--radius-xl);
  background: var(--preview-editor-bg);
  box-shadow: 0 0 0 3px var(--preview-editor-ring), var(--preview-editor-shadow);
}
/* 纯代码块「原地编辑」：去掉浮窗弹出感（厚环/重阴影），贴合渲染态代码块外观——
   看着像就地变可编辑，而不是炸开一个浮层。mermaid/echarts/公式等需要源码↔效果对照的仍走完整卡片。 */
.inline-preview-editor.ipe-mode-code .ipe-code-card {
  border-radius: 12px;
  border-color: color-mix(in srgb, var(--primary-color) 32%, var(--border));
  box-shadow: none;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--primary-color) 3%, transparent), transparent 46%),
    var(--code-bg);
}
.ipe-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 38px;
  padding: 7px 12px;
  border-bottom: 1px solid var(--preview-card-border);
  background: var(--preview-card-title-bg);
}
.ipe-title {
  min-width: 0;
  overflow: hidden;
  color: var(--preview-card-title-fg);
  font-size: 12px;
  font-weight: 750;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ipe-lang {
  flex: 0 0 auto;
  padding: 2px 7px;
  border: 1px solid color-mix(in srgb, var(--app-primary-color) 22%, var(--app-border));
  border-radius: 6px;
  color: color-mix(in srgb, var(--app-primary-color) 78%, var(--app-fg));
  font: 650 10px/1.3 var(--font-family-mono);
  text-transform: lowercase;
}
.ipe-pop-enter-active {
  transition: opacity 0.14s ease, transform 0.14s cubic-bezier(0.2, 0.8, 0.3, 1.1);
}
.ipe-pop-leave-active {
  transition: opacity 0.1s ease, transform 0.1s ease;
}
.ipe-pop-enter-from,
.ipe-pop-leave-to {
  opacity: 0;
  transform: scale(calc(var(--ipe-scale, 1) * 0.98)) translateY(-2px);
}
.ipe-body {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  flex: 1 1 auto;
  min-height: 60px;
  max-height: min(400px, 58vh);
  overflow: hidden;
  background: transparent;
}
.ipe-gutter {
  overflow: hidden;
  padding: 8px 0;
  border-right: 1px solid color-mix(in srgb, var(--app-border) 48%, transparent);
  background: color-mix(in srgb, var(--app-shell-bg) 60%, transparent);
  color: color-mix(in srgb, var(--app-muted) 58%, transparent);
  font-family: var(--font-family-mono);
  font-size: 11px;
  line-height: 1.55;
  text-align: right;
  user-select: none;
}
.ipe-gutter span {
  display: block;
  padding-right: 8px;
}
.ipe-preview {
  position: relative;
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  border-top: 1px solid color-mix(in srgb, var(--app-border) 60%, transparent);
  background: color-mix(in srgb, var(--app-shell-bg) 35%, transparent);
}
.ipe-preview-tab {
  flex: 0 0 auto;
  align-self: flex-start;
  margin: 6px 10px 0;
  padding: 1px 7px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--app-primary-color) 9%, transparent);
  color: color-mix(in srgb, var(--app-primary-color) 72%, var(--app-muted));
  font: 650 10px/1.4 var(--font-family-mono);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  user-select: none;
}
.ipe-preview-body {
  flex: 1 1 auto;
  min-height: 0;
  max-height: min(200px, 30vh);
  overflow: auto;
  padding: 6px 10px 10px;
}
.ipe-preview-body :deep(pre.hljs) {
  margin: 0;
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--app-border) 50%, transparent);
  border-radius: 6px;
  background: var(--code-bg);
  font-family: var(--font-family-mono);
  font-size: 12px;
  line-height: 1.48;
  overflow: auto;
}
.ipe-preview-body :deep(.ipe-math) {
  display: flex;
  justify-content: center;
  padding: 8px 4px;
  font-size: 1.05rem;
}
.ipe-preview-body :deep(.ipe-math-error),
.ipe-preview-body :deep(.ipe-chart-error) {
  padding: 6px 8px;
  border-radius: 6px;
  background: color-mix(in srgb, #e5484d 12%, transparent);
  color: #e5484d;
  font-family: var(--font-family-mono);
  font-size: 11.5px;
}
.ipe-preview-body :deep(.ipe-chart-block) {
  min-height: 180px;
  max-height: 240px;
}
.ipe-code {
  min-height: 1.55em;
  max-height: min(380px, 56vh);
  padding: 8px 10px;
  border: 0;
  outline: none;
  /* 与左侧源码编辑器一致：长行不换行、横向可滚动（双向滚动）。
     行号 gutter 是独立网格列，不随横向滚动；pre（非 pre-wrap）下逻辑行=视觉行，gutter 行号也始终对齐。 */
  overflow-x: auto;
  overflow-y: auto;
  white-space: pre;
  overflow-wrap: anywhere;
  background: transparent;
  color: var(--app-fg);
  caret-color: var(--app-primary-color);
  font-family: var(--font-family-mono);
  font-size: 12px;
  line-height: 1.48;
  tab-size: 2;
}

.reading-mode-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--app-muted);
  cursor: pointer;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}
.reading-mode-btn:hover {
  background: color-mix(in srgb, var(--app-primary-color) 9%, transparent);
  border-color: color-mix(in srgb, var(--app-primary-color) 22%, transparent);
  color: var(--app-primary-color);
}
.reading-mode-btn.on {
  background: color-mix(in srgb, var(--app-primary-color) 12%, transparent);
  border-color: color-mix(in srgb, var(--app-primary-color) 30%, transparent);
  color: var(--app-primary-color);
}

</style>
