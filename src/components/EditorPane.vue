<script setup lang="ts">
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  highlightActiveLine,
  keymap,
  lineNumbers,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view'
import { EditorState, Compartment, type Extension } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { search, searchKeymap, openSearchPanel, searchPanelOpen } from '@codemirror/search'
import { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap } from '@codemirror/autocomplete'
import { markdown, markdownLanguage, insertNewlineContinueMarkup, deleteMarkupBackward } from '@codemirror/lang-markdown'
import { useDocumentStore } from '../stores/document'
import { useThemeStore } from '../stores/theme'
import { useSyncStore } from '../stores/sync'
import { useUiStore } from '../stores/ui'
import { useDialog } from '../composables/useDialog'
import { makeEditorTheme } from '../core/editor/cmTheme'
import { CODE_LANGUAGES } from '../core/editor/codeLanguages'
import { slashCompletions } from '../core/editor/slashMenu'
import { createLinkCompletions } from '../core/editor/linkComplete'
import { linkDiagnosticsExtension } from '../core/editor/linkDiagnostics'
import { useWorkspaceIndex } from '../composables/useWorkspaceIndex'
import { useWorkspaceDiagnostics } from '../composables/useWorkspaceDiagnostics'
import { diagnosticMessageKey } from '../core/workspace/diagnostics'
import { smartPunctuationExtension } from '../core/editor/smartPunctuation'
import { wrapSelectionExtension } from '../core/editor/wrapSelection'
import { frontmatterDecoration } from '../core/editor/frontmatterDecoration'
import { mathDecoration } from '../core/editor/mathDecoration'
import { placeFloatingPanel } from '../core/editor/floatingPosition'
import {
  applyHeadingToLine,
  emptyLinkMarkers,
  splitLineBlockPrefix,
  toggleInlineMarkers,
  toggleLinePrefix,
  type LinePrefixKind,
} from '../core/editor/lineFormat'
import { createFloatingSearchPanel } from '../core/editor/floatingSearchPanel'
import { pickImageFile } from '../core/export/save'
import { htmlToMarkdown, fileToAsset, firstImageFile } from '../core/clipboard'
import { externalizeDataImages } from '../core/markdown/externalizeImages'
import {
  parseTaskLine,
  setTaskCheckedAndSort,
  sortTaskBlock,
  toggleTaskAndSort,
} from '../core/markdown/taskToggle'
import { MERMAID_TEMPLATES, ECHARTS_TEMPLATES } from '../core/editor/chartTemplates'
import TableToolbar from './TableToolbar.vue'
import TableContextMenu from './TableContextMenu.vue'
import Icon from './Icon.vue'
import SelectMenu from './SelectMenu.vue'
import { PAPER_LIST, type PaperSize } from '../core/paper'
import {
  detectTable,
  formatTable,
  colAtChar,
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
  resolveTableContext,
  makeEmptyTable,
  type TableModel,
  type Align,
} from '../core/markdown/tableEdit'
import { useI18n } from 'vue-i18n'

const { t } = useI18n({ useScope: 'global' })
const doc = useDocumentStore()
const theme = useThemeStore()
const sync = useSyncStore()
const ui = useUiStore()
const dialog = useDialog()
const { workspaceIndex } = useWorkspaceIndex()
const { currentDiagnostics } = useWorkspaceDiagnostics()
const linkCompletions = createLinkCompletions(
  () => workspaceIndex.value,
  () => doc.currentId ?? '',
)

// U1：自动保存指示 / 手动保存 / 历史版本已统一放在顶栏 ModeControls，编辑器工具条不再重复。

const host = ref<HTMLDivElement | null>(null)
const paperOpts = PAPER_LIST.map((p) => ({ value: p.id, label: p.label }))
let view: EditorView | null = null
const themeCompartment = new Compartment()
const slidePagesCompartment = new Compartment()
const focusCompartment = new Compartment()
const typewriterCompartment = new Compartment()
const smartPunctCompartment = new Compartment() // T5: 智能标点按设置项开关
let scrollLock = 0 // 程序化滚动后短暂忽略滚动回声，避免来回抖动
const editorPageStyle = computed(() => ({
  '--editor-page-width': `${ui.docPageWidth}px`,
}))

// ---- 表格可视化编辑状态 ----
interface TableUi { top: number; left: number; model: TableModel; col: number; bodyIndex: number }
const tableUi = ref<TableUi | null>(null)
// O3：表格右键菜单（macOS 风）
interface TableMenuState { x: number; y: number; model: TableModel; col: number; bodyIndex: number }
const tableMenu = ref<TableMenuState | null>(null)
function closeTableMenu() { tableMenu.value = null }
function onTableContextMenu(e: MouseEvent) {
  if (!view) return
  const pos = view.posAtCoords({ x: e.clientX, y: e.clientY })
  if (pos == null) {
    closeTableMenu()
    return
  }
  const curLine = view.state.doc.lineAt(pos)
  const lines: string[] = []
  for (let n = 1; n <= view.state.doc.lines; n++) lines.push(view.state.doc.line(n).text)
  const context = resolveTableContext(lines, curLine.number - 1, pos - curLine.from)
  if (!context) {
    closeTableMenu()
    return
  }
  e.preventDefault()
  view.dispatch({ selection: { anchor: pos } })
  tableMenu.value = { x: e.clientX, y: e.clientY, ...context }
}
function onTableMenuOp(id: string) {
  if (!tableMenu.value) return
  // 复用 onTableOp（依赖 tableUi.value），先把 tableUi 临时设为菜单上下文
  const prev = tableUi.value
  tableUi.value = {
    top: 0, left: 0,
    model: tableMenu.value.model,
    col: tableMenu.value.col,
    bodyIndex: tableMenu.value.bodyIndex,
  }
  try { onTableOp(id) } finally { if (!tableUi.value || tableUi.value !== prev) { /* applyTableModel 会 recompute，无需还原 */ } }
}

// ---- 随当前编辑行出现的工具岛 ----
const floatingToolbarOpen = ref(false)
const floatingToolbarEl = ref<HTMLElement | null>(null)
const floatingToolbarPlacement = ref<'top' | 'bottom'>('top')
const floatingToolbarStyle = ref<{ left: string; top: string; width?: string }>({ left: '8px', top: '8px' })
// 固定且左右对照（横向）时，工具条铺成横跨「源码区+预览区」的整条顶栏（页面/PPT 共用同一条，消除割裂感）。
const toolbarSpanBoth = computed(
  () =>
    ui.editorToolbarPinned &&
    (ui.mode === 'document' || ui.mode === 'slide') &&
    !ui.isSourceHidden &&
    !ui.isPreviewHidden &&
    ui.splitOrientation === 'horizontal',
)
// 预览正在编辑的块的视口矩形（由 DocumentPreview 派发，无则 null）。
// 跟随焦点(浮动)模式下据此把「共用工具条」浮在预览块上方；顶栏据此把结构类工具置灰。
const previewEditRect = ref<{ top: number; left: number; right: number; bottom: number } | null>(null)
const previewEditing = computed(() => !!previewEditRect.value)
// 预览侧正在做表格交互（选格/合并）时，源码侧的表格浮动工具条应隐藏，避免两个工具条同时出现。
const previewTableActive = ref(false)
function onPreviewTableActive(e: Event) {
  previewTableActive.value = !!(e as CustomEvent).detail
  if (previewTableActive.value) tableUi.value = null
}
function onPreviewEditing(e: Event) {
  previewEditRect.value = (e as CustomEvent).detail ?? null
  if (!previewEditRect.value) toolbarActiveFormats.value = new Set()
  if (ui.editorToolbarPinned) return
  // 浮动模式：编辑预览时常驻显示并随预览块位置（滚动/输入变化）实时浮到其上方。
  // 用 showFloatingToolbar（内部 await nextTick）确保工具条元素已挂载后再定位，否则首次会因元素未渲染而落空。
  if (previewEditRect.value) {
    if (floatingToolbarOpen.value) updateFloatingToolbarPosition()
    else void showFloatingToolbar()
  } else if (!view?.hasFocus) {
    hideFloatingToolbar()
  }
}
// 行内格式工具（粗/斜/删除线/下划线/高亮/行内码/链接）在预览编辑态仍可用并路由到预览；其余结构类置灰。
const PREVIEW_FORMAT_ICONS = new Set(['bold', 'italic', 'strike', 'underline', 'highlight', 'code', 'link', 'sigma', 'smile'])
const toolbarActiveFormats = ref<Set<string>>(new Set())
function onPreviewFormatState(e: Event) {
  const detail = (e as CustomEvent<{ formats?: string[]; block?: string }>).detail
  toolbarActiveFormats.value = new Set(detail?.formats ?? [])
  if (detail?.block) currentBlockLabel.value = detail.block
}

// 当前焦点是否落在右侧预览的可编辑区（WYSIWYG / 行内编辑器）。是则把格式动作路由到预览。
function previewEditFocused(): boolean {
  const a = document.activeElement as HTMLElement | null
  return !!a?.closest('.paper-preview') && (a.isContentEditable || a.tagName === 'TEXTAREA')
}
// 共用工具条：格式按钮作用于「当前焦点侧」——预览在编辑→派发给预览；否则作用于源码编辑器。
function routeFmt(kind: string, sourceFn: () => void) {
  if (previewEditFocused()) {
    window.dispatchEvent(new CustomEvent('morph:preview-format', { detail: kind }))
    return
  }
  sourceFn()
}
// 在当前光标处插入纯文本（如 emoji）：焦点在预览→派发给预览；否则插入源码编辑器。
function insertInline(s: string) {
  if (!view) return
  const { from, to } = view.state.selection.main
  view.dispatch({ changes: { from, to, insert: s }, selection: { anchor: from + s.length } })
  view.focus()
}
function routeInsertText(s: string) {
  if (previewEditFocused()) { window.dispatchEvent(new CustomEvent('morph:preview-insert', { detail: s })); return }
  insertInline(s)
}
// emoji 选择面板（常用集）
const EMOJIS = ['😀', '😄', '😁', '😆', '😉', '😊', '🙂', '😍', '😘', '😎', '🤔', '😏', '😅', '😂', '🤣', '😭', '😡', '😱', '😴', '🥳', '👍', '👎', '👏', '🙏', '💪', '🤝', '👀', '🔥', '✨', '⭐', '🎉', '🎯', '✅', '❌', '❗', '❓', '💡', '📌', '📎', '📝', '🚀', '⚡', '💯', '❤️', '🧡', '💙', '💚', '💜', '🐱', '🌟']
const emojiMenuOpen = ref(false)
const emojiEl = ref<HTMLElement | null>(null)
const emojiMenuEl = ref<HTMLElement | null>(null)
const emojiMenuStyle = ref({ left: '0px', top: '0px' })
async function toggleEmojiMenu() {
  emojiMenuOpen.value = !emojiMenuOpen.value
  if (!emojiMenuOpen.value) return
  headingMenuOpen.value = false
  listMenuOpen.value = false
  insertOpen.value = false
  await nextTick()
  const r = emojiEl.value?.getBoundingClientRect()
  if (r) emojiMenuStyle.value = { left: `${Math.max(8, Math.min(r.left, window.innerWidth - 268))}px`, top: `${r.bottom + 6}px` }
}
function pickEmoji(e: string) {
  emojiMenuOpen.value = false
  routeInsertText(e)
}
function closeEmojiMenu(ev: MouseEvent) {
  const target = ev.target as Node
  if (emojiEl.value?.contains(target) || emojiMenuEl.value?.contains(target)) return
  emojiMenuOpen.value = false
}
let floatingToolbarFrame = 0

// O13：选区格式浮层（非空选区时显示，替代行级工具条）
const selectionToolbarOpen = ref(false)
const selectionToolbarEl = ref<HTMLElement | null>(null)
const selectionToolbarPlacement = ref<'top' | 'bottom'>('top')
const selectionToolbarStyle = ref({ left: '8px', top: '8px' })
let selectionToolbarFrame = 0

function selectionAnchor() {
  if (!view) return null
  const { from, to } = view.state.selection.main
  if (from === to) return null
  const start = view.coordsAtPos(from, 1)
  const end = view.coordsAtPos(to, -1)
  if (!start || !end) return null
  return {
    left: Math.min(start.left, end.left),
    right: Math.max(start.right, end.right),
    top: Math.min(start.top, end.top),
    bottom: Math.max(start.bottom, end.bottom),
  }
}

function updateSelectionToolbarPosition() {
  cancelAnimationFrame(selectionToolbarFrame)
  selectionToolbarFrame = requestAnimationFrame(() => {
    const anchor = selectionAnchor()
    const element = selectionToolbarEl.value
    if (!anchor || !element) return
    const rect = element.getBoundingClientRect()
    const centerX = (anchor.left + anchor.right) / 2
    const pseudoAnchor = {
      left: centerX,
      right: centerX,
      top: anchor.top,
      bottom: anchor.bottom,
      width: 0,
      height: 0,
    } as DOMRect
    const placed = placeFloatingPanel(
      pseudoAnchor,
      { width: rect.width, height: rect.height },
      { width: window.innerWidth, height: window.innerHeight },
      10,
    )
    selectionToolbarPlacement.value = placed.placement
    selectionToolbarStyle.value = { left: `${placed.left}px`, top: `${placed.top}px` }
  })
}

// 选区浮动工具条已废弃：全局只保留顶部固定工具条，选区格式化走顶栏（不可用项置灰）。
async function syncSelectionToolbar(_show: boolean) {
  selectionToolbarOpen.value = false
}

function currentLineAnchor() {
  if (!view) return null
  return view.coordsAtPos(view.state.selection.main.head)
}

function updateFloatingToolbarPosition() {
  cancelAnimationFrame(floatingToolbarFrame)
  floatingToolbarFrame = requestAnimationFrame(() => {
    const element = floatingToolbarEl.value
    if (!element) return
    if (ui.editorToolbarPinned) {
      updatePinnedToolbarPosition()
      return
    }
    setWorkbenchBarReserve(0) // 非固定：不预留顶栏空间
    // 跟随焦点：编辑预览 → 浮在预览块上方（用 DocumentPreview 派发的视口矩形）；否则 → 浮在源码光标行上方
    if (previewEditRect.value) {
      const a = previewEditRect.value
      const rect2 = element.getBoundingClientRect()
      const placed2 = placeFloatingPanel(
        { left: a.left, right: a.right, top: a.top, bottom: a.bottom },
        { width: rect2.width, height: rect2.height },
        { width: window.innerWidth, height: window.innerHeight },
        10,
      )
      floatingToolbarPlacement.value = placed2.placement
      floatingToolbarStyle.value = { left: `${placed2.left}px`, top: `${placed2.top}px`, width: undefined }
      return
    }
    const anchor = currentLineAnchor()
    if (!anchor) return
    const editorRect = view?.scrollDOM.getBoundingClientRect()
    if (!editorRect || anchor.bottom < editorRect.top || anchor.top > editorRect.bottom) {
      floatingToolbarOpen.value = false
      return
    }
    const rect = element.getBoundingClientRect()
    const placed = placeFloatingPanel(
      anchor,
      { width: rect.width, height: rect.height },
      { width: window.innerWidth, height: window.innerHeight },
      14,
    )
    floatingToolbarPlacement.value = placed.placement
    floatingToolbarStyle.value = { left: `${placed.left}px`, top: `${placed.top}px`, width: undefined }
  })
}

function setWorkbenchBarReserve(px: number) {
  const wb = host.value?.closest('.workbench') as HTMLElement | null
  if (!wb) return
  if (px > 0) wb.style.setProperty('--pinned-bar-h', `${px}px`)
  else wb.style.removeProperty('--pinned-bar-h')
}

function updatePinnedToolbarPosition() {
  const element = floatingToolbarEl.value
  if (!element) return
  // 横向对照：横跨整个 workbench（源码+预览/PPT）顶部，铺成一条停靠顶栏，
  // 并把同等高度作为 workbench 顶部内边距预留出来——顶栏占位、不遮挡正文和 PPT 控制条。
  if (toolbarSpanBoth.value) {
    const wb = (host.value?.closest('.workbench') as HTMLElement | null) ?? host.value
    const r = wb?.getBoundingClientRect()
    if (!r) return
    floatingToolbarPlacement.value = 'bottom'
    floatingToolbarStyle.value = { left: `${Math.round(r.left)}px`, top: `${Math.round(r.top)}px`, width: `${Math.round(r.width)}px` }
    setWorkbenchBarReserve(Math.ceil(element.getBoundingClientRect().height))
    return
  }
  setWorkbenchBarReserve(0)
  const hostRect = host.value?.getBoundingClientRect()
  if (!hostRect) return
  const rect = element.getBoundingClientRect()
  const left = Math.max(8, hostRect.left + (hostRect.width - rect.width) / 2)
  const top = hostRect.top + 8
  floatingToolbarPlacement.value = 'bottom'
  floatingToolbarStyle.value = { left: `${left}px`, top: `${top}px`, width: undefined }
}

async function showFloatingToolbar() {
  floatingToolbarOpen.value = true
  await nextTick()
  updateFloatingToolbarPosition()
}

function hideFloatingToolbar() {
  // 固定模式：常驻顶栏，不收起。浮动模式下若正在编辑预览，也常驻（浮在预览块上方），不因源码失焦而收起。
  if (ui.editorToolbarPinned || previewEditRect.value) return
  window.setTimeout(() => {
    const active = document.activeElement
    if (
      floatingToolbarEl.value?.contains(active)
      || selectionToolbarEl.value?.contains(active)
      || headingMenuEl.value?.contains(active)
      || insertMenuEl.value?.contains(active)
      || tablePickerEl.value?.contains(active)
    ) return
    if (!view?.hasFocus) {
      floatingToolbarOpen.value = false
      selectionToolbarOpen.value = false
      closeTablePicker()
    }
  }, 80)
}

// 插入表格的网格选择器
const headingMenuOpen = ref(false)
const headingEl = ref<HTMLElement | null>(null)
const headingMenuEl = ref<HTMLElement | null>(null)
const headingMenuStyle = ref({ left: '0px', top: '0px' })
function updateHeadingMenuPosition() {
  const rect = headingEl.value?.getBoundingClientRect()
  if (!rect) return
  headingMenuStyle.value = {
    left: `${Math.max(8, Math.min(rect.left, window.innerWidth - 168))}px`,
    top: `${rect.bottom + 6}px`,
  }
}
async function toggleHeadingMenu() {
  headingMenuOpen.value = !headingMenuOpen.value
  if (headingMenuOpen.value) {
    insertOpen.value = false
    listMenuOpen.value = false
    await nextTick()
    updateHeadingMenuPosition()
  }
}
function closeHeadingMenu(e: MouseEvent) {
  const target = e.target as Node
  if (headingEl.value?.contains(target) || headingMenuEl.value?.contains(target)) return
  headingMenuOpen.value = false
}

// ---- 浮动 tooltip（固定定位，避开工具栏的 overflow 裁剪） ----
const tipVisible = ref(false)
const tipText = ref('')
const tipX = ref(0)
const tipY = ref(0)
const tipBelow = ref(false)
function showTip(text: string, e: MouseEvent) {
  const el = e.currentTarget as HTMLElement
  const r = el.getBoundingClientRect()
  tipText.value = text
  tipX.value = r.left + r.width / 2
  // 工具条固定在顶部时按钮贴边，气泡放上方会被裁出视口 → 自动翻到按钮下方
  const below = r.top < 64
  tipBelow.value = below
  tipY.value = below ? r.bottom + 8 : r.top - 8
  tipVisible.value = true
}
function hideTip() {
  tipVisible.value = false
}

const pickerOpen = ref(false)
const tablePickerEl = ref<HTMLElement | null>(null)
const tablePickerAnchorEl = ref<HTMLElement | null>(null)
const tablePickerStyle = ref({ left: '8px', top: '8px' })
const hoverR = ref(0)
const hoverC = ref(0)
const PICK_ROWS = 6
const PICK_COLS = 8
// E3: 网格之外，支持直接输入行列数
const numR = ref(3)
const numC = ref(3)
let pickerLeaveTimer = 0

function closeTablePicker() {
  pickerOpen.value = false
  hoverR.value = 0
  hoverC.value = 0
}

function closeTablePickerOnClick(e: MouseEvent) {
  const target = e.target as Node
  if (tablePickerEl.value?.contains(target)) return
  if (tablePickerAnchorEl.value?.contains(target)) return
  if (pickerOpen.value) closeTablePicker()
}

function onTablePickerMouseLeave() {
  hoverR.value = 0
  hoverC.value = 0
  window.clearTimeout(pickerLeaveTimer)
  pickerLeaveTimer = window.setTimeout(() => {
    if (!tablePickerEl.value?.matches(':hover') && !tablePickerAnchorEl.value?.matches(':hover')) {
      closeTablePicker()
    }
  }, 140)
}

async function toggleTablePicker() {
  if (pickerOpen.value) {
    closeTablePicker()
    return
  }
  pickerOpen.value = true
  tableUi.value = null
  hoverR.value = 0
  hoverC.value = 0
  await nextTick()
  tablePickerAnchorEl.value = floatingToolbarEl.value?.querySelector('[data-tool="table"]') as HTMLElement | null
  updateTablePickerPosition()
}
function updateTablePickerPosition() {
  const anchorRect = tablePickerAnchorEl.value?.getBoundingClientRect()
  const element = tablePickerEl.value
  if (!anchorRect || !element) return
  const rect = element.getBoundingClientRect()
  const pseudoAnchor = {
    left: anchorRect.left,
    right: anchorRect.right,
    top: anchorRect.top,
    bottom: anchorRect.bottom,
  } as DOMRect
  const placed = placeFloatingPanel(
    pseudoAnchor,
    { width: rect.width, height: rect.height },
    { width: window.innerWidth, height: window.innerHeight },
    10,
  )
  tablePickerStyle.value = { left: `${placed.left}px`, top: `${placed.top}px` }
}
function pickTable(r: number, c: number) {
  closeTablePicker()
  insertBlock(makeEmptyTable(r, c)) // r = 正文行数，另含 1 行表头
}
// E3: 按输入框的行列数建表（钳制到合法范围）
function pickTableByNumber() {
  const r = Math.max(1, Math.min(100, Math.floor(Number(numR.value) || 1)))
  const c = Math.max(1, Math.min(50, Math.floor(Number(numC.value) || 1)))
  pickTable(r, c)
}

const F = '```'

class PageMarkerWidget extends WidgetType {
  constructor(
    readonly pageNo: number,
    readonly insertAfterPos: number,
    readonly deleteRange?: { from: number; to: number },
  ) {
    super()
  }

  toDOM(view: EditorView) {
    const wrap = document.createElement('div')
    wrap.className = 'cm-slide-page-marker'
    const label = document.createElement('span')
    label.textContent = `第 ${this.pageNo} 节`
    const actions = document.createElement('div')
    actions.className = 'cm-slide-page-actions'

    const add = document.createElement('button')
    add.type = 'button'
    add.textContent = '+节'
    add.title = '在当前节下方新增一节'
    add.addEventListener('mousedown', (e) => e.preventDefault())
    add.addEventListener('click', () => insertSlideAfter(view, this.insertAfterPos))
    actions.appendChild(add)

    if (this.deleteRange) {
      const del = document.createElement('button')
      del.type = 'button'
      del.className = 'danger'
      del.textContent = '删'
      del.title = '删除当前节'
      del.addEventListener('mousedown', (e) => e.preventDefault())
      del.addEventListener('click', () => {
        void deleteSlidePage(view, this.pageNo, this.deleteRange!)
      })
      actions.appendChild(del)
    }

    wrap.appendChild(label)
    wrap.appendChild(actions)
    return wrap
  }

  ignoreEvent() {
    return false
  }
}

// 用户反馈：PPT 源码里的 --- 分页符无需额外渲染成「第 N 节」胶片块，保持纯文本更清爽。
// 关掉标记渲染（保留下方实现以便将来需要时一行开回）。
const SLIDE_MARKERS_ENABLED = false
function buildSlidePageDecorations(view: EditorView): DecorationSet {
  const widgets = []
  if (SLIDE_MARKERS_ENABLED) {
    const bodyStartLine = findBodyStartLine(view)
    const bodyStart = bodyStartLine <= view.state.doc.lines ? view.state.doc.line(bodyStartLine).from : view.state.doc.length
    const breaks = []
    for (let n = bodyStartLine; n <= view.state.doc.lines; n++) {
      const line = view.state.doc.line(n)
      if (!/^---\s*$/.test(line.text)) continue
      breaks.push(line)
      widgets.push(Decoration.line({ class: 'cm-slide-break-line' }).range(line.from))
    }
    for (let i = 0; i <= breaks.length; i++) {
      const prevBreak = breaks[i - 1]
      const nextBreak = breaks[i]
      const pageNo = i + 1
      const markerPos = prevBreak ? prevBreak.to : bodyStart
      const insertAfterPos = nextBreak ? nextBreak.from : view.state.doc.length
      const deleteRange = prevBreak
        ? { from: prevBreak.from, to: nextBreak ? nextBreak.from : view.state.doc.length }
        : undefined
      widgets.push(
        Decoration.widget({
          widget: new PageMarkerWidget(pageNo, insertAfterPos, deleteRange),
          side: prevBreak ? 1 : -1,
        }).range(markerPos),
      )
    }
  }
  return Decoration.set(widgets, true)
}

function findBodyStartLine(view: EditorView): number {
  if (view.state.doc.lines === 0) return 1
  const first = view.state.doc.line(1)
  if (first.text.trim() !== '---') return 1
  for (let n = 2; n <= view.state.doc.lines; n++) {
    if (view.state.doc.line(n).text.trim() === '---') return n + 1
  }
  return 1
}

function insertSlideAfter(view: EditorView, pos: number) {
  const text = view.state.doc.toString()
  const before = pos > 0 && text.slice(0, pos).endsWith('\n\n') ? '' : pos > 0 && text.slice(0, pos).endsWith('\n') ? '\n' : '\n\n'
  const after = pos < text.length && text.slice(pos).startsWith('\n') ? '' : '\n'
  const insert = `${before}---\n\n## 新小节\n\n${after}`
  view.dispatch({
    changes: { from: pos, to: pos, insert },
    selection: { anchor: pos + insert.length - after.length },
  })
  view.focus()
}

async function deleteSlidePage(view: EditorView, pageNo: number, range: { from: number; to: number }) {
  const ok = await dialog.confirm({
    title: t('editor.deleteSectionTitle', { n: pageNo }),
    message: t('editor.deleteSectionMessage'),
    confirmText: t('common.delete'),
    cancelText: t('common.cancel'),
    tone: 'danger',
  })
  if (!ok) return
  view.dispatch({
    changes: { from: range.from, to: range.to, insert: '' },
    selection: { anchor: Math.min(range.from, view.state.doc.length) },
  })
  view.focus()
}

function slidePageDecorations(): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet

      constructor(view: EditorView) {
        this.decorations = buildSlidePageDecorations(view)
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildSlidePageDecorations(update.view)
        }
      }
    },
    { decorations: (v) => v.decorations },
  )
}

// ---- 专注模式：非当前行变暗 ----
function focusDimExtension(): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      constructor(view: EditorView) {
        this.decorations = this.build(view)
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.selectionSet || u.viewportChanged) this.decorations = this.build(u.view)
      }
      build(view: EditorView): DecorationSet {
        const headLine = view.state.doc.lineAt(view.state.selection.main.head).number
        const ranges = []
        for (const { from, to } of view.visibleRanges) {
          let pos = from
          while (pos <= to) {
            const line = view.state.doc.lineAt(pos)
            if (line.number !== headLine) {
              ranges.push(Decoration.line({ class: 'cm-dim-line' }).range(line.from))
            }
            pos = line.to + 1
          }
        }
        return Decoration.set(ranges)
      }
    },
    { decorations: (v) => v.decorations },
  )
}

// ---- 打字机模式：光标变动时居中 ----
function typewriterExtension(): Extension {
  return EditorView.updateListener.of((u) => {
    if (!u.selectionSet && !u.docChanged) return
    const head = u.state.selection.main.head
    requestAnimationFrame(() => {
      if (!view) return
      scrollLock = Date.now() + 120
      view.dispatch({ effects: EditorView.scrollIntoView(head, { y: 'center' }) })
    })
  })
}

// ---- 表格工具条：随光标位置探测当前 GFM 表格并定位浮层 ----
function cursorInTable(state = view?.state): boolean {
  if (!state) return false
  const head = state.selection.main.head
  const curLine = state.doc.lineAt(head)
  if (!curLine.text.includes('|')) return false
  const lines: string[] = []
  for (let n = 1; n <= state.doc.lines; n++) lines.push(state.doc.line(n).text)
  return !!detectTable(lines, curLine.number - 1)
}

function recomputeTable() {
  if (!view || pickerOpen.value || previewTableActive.value || previewEditing.value) {
    // 预览侧正在编辑/做表格交互：不在源码侧再弹表格工具条
    tableUi.value = null
    return
  }
  const head = view.state.selection.main.head
  const curLine = view.state.doc.lineAt(head)
  if (!curLine.text.includes('|')) {
    tableUi.value = null
    return
  }
  const lines: string[] = []
  for (let n = 1; n <= view.state.doc.lines; n++) lines.push(view.state.doc.line(n).text)
  const model = detectTable(lines, curLine.number - 1)
  if (!model) {
    tableUi.value = null
    return
  }
  const col = Math.min(colAtChar(curLine.text, head - curLine.from), model.header.length - 1)
  const rel = curLine.number - 1 - model.fromLine
  const bodyIndex = rel >= 2 ? rel - 2 : -1

  const fromPos = view.state.doc.line(model.fromLine + 1).from
  const toLine = view.state.doc.line(model.toLine + 1)
  const coords = view.coordsAtPos(fromPos)
  const endCoords = view.coordsAtPos(toLine.to)
  const hostRect = host.value?.getBoundingClientRect()
  if (!coords || !hostRect) {
    tableUi.value = null
    return
  }
  if (coords.top < hostRect.top - 4 || coords.top > hostRect.bottom) {
    tableUi.value = null
    return
  }
  const tableRight = endCoords?.right ?? coords.right + 240
  const centerX = (coords.left + tableRight) / 2
  const panelWidth = 280
  const left = Math.max(8, Math.min(centerX - panelWidth / 2, window.innerWidth - panelWidth - 8))
  const top = Math.max(8, coords.top - 44)
  tableUi.value = { top, left, model, col, bodyIndex }
}

function applyTableModel(next: TableModel) {
  if (!view || !tableUi.value) return
  const m = tableUi.value.model
  const fromPos = view.state.doc.line(m.fromLine + 1).from
  const toPos = view.state.doc.line(m.toLine + 1).to
  const text = formatTable(next).join('\n')
  scrollLock = Date.now() + 120
  view.dispatch({ changes: { from: fromPos, to: toPos, insert: text } })
  view.focus()
  recomputeTable()
}

function onTableOp(id: string) {
  if (!tableUi.value) return
  const { model, col, bodyIndex } = tableUi.value
  const setAlign = (a: Align) => applyTableModel(setColAlign(model, col, a))
  switch (id) {
    case 'row-above': applyTableModel(insertRow(model, bodyIndex - 1)); break
    case 'row-below': applyTableModel(insertRow(model, bodyIndex)); break
    case 'row-del': if (bodyIndex >= 0) applyTableModel(deleteRow(model, bodyIndex)); break
    case 'row-up': if (bodyIndex >= 0) applyTableModel(moveRow(model, bodyIndex, -1)); break
    case 'row-down': if (bodyIndex >= 0) applyTableModel(moveRow(model, bodyIndex, 1)); break
    case 'col-left': applyTableModel(insertCol(model, col)); break
    case 'col-right': applyTableModel(insertCol(model, col + 1)); break
    case 'col-del': applyTableModel(deleteCol(model, col)); break
    case 'col-move-left': applyTableModel(moveCol(model, col, -1)); break
    case 'col-move-right': applyTableModel(moveCol(model, col, 1)); break
    case 'align-left': setAlign('left'); break
    case 'align-center': setAlign('center'); break
    case 'align-right': setAlign('right'); break
    case 'copy-tsv': void navigator.clipboard.writeText(tableToTsv(model)); break
    case 'copy-csv': void navigator.clipboard.writeText(tableToCsv(model)); break
    case 'copy-md': void navigator.clipboard.writeText(tableToMarkdown(model)); break
  }
}

// ---- 插入助手 ----
function wrap(before: string, after = before) {
  if (!view) return
  const { from, to } = view.state.selection.main
  if (from !== to) {
    const sel = view.state.sliceDoc(from, to)
    const { text } = toggleInlineMarkers(sel, before, after)
    view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from, head: from + text.length },
    })
    view.focus()
    return
  }
  const line = view.state.doc.lineAt(from)
  const { prefix, body } = splitLineBlockPrefix(line.text)
  const innerFrom = line.from + prefix.length
  const innerTo = line.to
  const inner = view.state.sliceDoc(innerFrom, innerTo)
  const { text, cursorOffset } = toggleInlineMarkers(inner, before, after)
  const newCursor = innerFrom + Math.max(0, (from - innerFrom) + cursorOffset)
  view.dispatch({
    changes: { from: innerFrom, to: innerTo, insert: text },
    selection: { anchor: Math.min(newCursor, innerFrom + text.length) },
  })
  view.focus()
}

function wrapLink() {
  if (!view) return
  const { from, to } = view.state.selection.main
  if (from !== to) {
    const sel = view.state.sliceDoc(from, to)
    const insert = `[${sel}](https://)`
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + insert.length },
    })
    view.focus()
    return
  }
  const line = view.state.doc.lineAt(from)
  const { prefix, body } = splitLineBlockPrefix(line.text)
  const innerFrom = line.from + prefix.length
  const innerTo = line.to
  const inner = view.state.sliceDoc(innerFrom, innerTo)
  if (inner.trim() === '') {
    const { text, cursorOffset } = emptyLinkMarkers()
    view.dispatch({
      changes: { from: innerFrom, to: innerTo, insert: text },
      selection: { anchor: innerFrom + cursorOffset },
    })
  } else {
    const insert = `[${inner}](https://)`
    view.dispatch({
      changes: { from: innerFrom, to: innerTo, insert },
      selection: { anchor: innerFrom + insert.length },
    })
  }
  view.focus()
}

function togglePrefix(kind: LinePrefixKind) {
  if (!view) return
  const { from } = view.state.selection.main
  const line = view.state.doc.lineAt(from)
  const next = toggleLinePrefix(line.text, kind)
  const cursorOffset = from - line.from
  view.dispatch({
    changes: { from: line.from, to: line.to, insert: next },
    selection: { anchor: line.from + Math.min(cursorOffset + (next.length - line.text.length), next.length) },
  })
  view.focus()
}

function prefixLine(kind: LinePrefixKind) {
  togglePrefix(kind)
}

function setHeadingLevel(level: number) {
  if (!view) return
  const { from } = view.state.selection.main
  const line = view.state.doc.lineAt(from)
  const next = applyHeadingToLine(line.text, level)
  const cursorOffset = from - line.from
  const oldPrefixLen = line.text.length - line.text.replace(/^#{1,6}\s*/, '').length
  const newPrefixLen = next.length - next.replace(/^#{1,6}\s*/, '').length
  const newCursor = line.from + Math.max(0, cursorOffset - oldPrefixLen + newPrefixLen)
  view.dispatch({
    changes: { from: line.from, to: line.to, insert: next },
    selection: { anchor: Math.min(newCursor, line.from + next.length) },
  })
  view.focus()
}
function insertBlock(text: string) {
  if (!view) return
  const { from } = view.state.selection.main
  const line = view.state.doc.lineAt(from)
  const pos = line.to
  const insert = (line.length ? '\n\n' : '') + text
  view.dispatch({
    changes: { from: pos, to: pos, insert },
    selection: { anchor: pos + insert.length },
  })
  view.focus()
}

type TaskMenuAction = 'insert' | 'toggle' | 'complete' | 'incomplete' | 'sort'

function runTaskAction(action: TaskMenuAction): boolean {
  if (!view) return false
  const head = view.state.selection.main.head
  const line = view.state.doc.lineAt(head)
  const lineIndex = line.number - 1
  const markdown = view.state.doc.toString()
  const task = parseTaskLine(line.text)

  if (action === 'insert' && task) {
    const insert = '\n- [ ] 待办事项'
    view.dispatch({
      changes: { from: line.to, insert },
      selection: { anchor: line.to + insert.length },
    })
    view.focus()
    return true
  }

  if (!task) {
    if (action === 'sort') return false
    const checked = action === 'complete'
    view.dispatch({
      changes: { from: line.from, insert: `- [${checked ? 'x' : ' '}] ` },
      selection: { anchor: head + 6 },
    })
    view.focus()
    return true
  }

  const next = action === 'toggle'
    ? toggleTaskAndSort(markdown, lineIndex)
    : action === 'complete'
      ? setTaskCheckedAndSort(markdown, lineIndex, true)
      : action === 'incomplete'
        ? setTaskCheckedAndSort(markdown, lineIndex, false)
        : action === 'sort'
          ? sortTaskBlock(markdown, lineIndex)
          : markdown

  if (next !== markdown) {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: next },
      selection: { anchor: Math.min(head, next.length) },
    })
  }
  view.focus()
  return true
}

// E2: 插入图片 → 存附件库（asset://），不再强转 base64（与粘贴/拖拽一致）
async function insertImage() {
  const file = await pickImageFile()
  if (!file) return
  const url = await fileToAsset(file)
  if (url) insertBlock(`![图片](${url})`)
}

// E1: 图表插入按类型选择（mermaid / echarts），选完插入对应模板
async function insertMermaid() {
  insertOpen.value = false
  const v = await dialog.select({
    title: t('editor.pickMermaid'),
    options: MERMAID_TEMPLATES.map((t) => ({ label: t.label, value: t.value, hint: t.hint })),
  })
  const tpl = MERMAID_TEMPLATES.find((t) => t.value === v)
  if (tpl) insertBlock(tpl.code)
}
async function insertECharts() {
  insertOpen.value = false
  const v = await dialog.select({
    title: t('editor.pickECharts'),
    options: ECHARTS_TEMPLATES.map((t) => ({ label: t.label, value: t.value, hint: t.hint })),
  })
  const tpl = ECHARTS_TEMPLATES.find((t) => t.value === v)
  if (tpl) insertBlock(tpl.code)
}

// 在指定位置（默认当前选区）替换插入文本
function replaceText(text: string, at?: number) {
  if (!view) return
  if (at != null) {
    view.dispatch({ changes: { from: at, to: at, insert: text }, selection: { anchor: at + text.length } })
  } else {
    const { from, to } = view.state.selection.main
    view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } })
  }
  view.focus()
}

// 智能粘贴/拖放：图片→附件库(asset://)，富文本 HTML→Markdown，纯文本走默认。
const smartPaste = EditorView.domEventHandlers({
  paste(event, v) {
    const dt = event.clipboardData
    if (!dt) return false
    const img = firstImageFile(dt)
    if (img) {
      event.preventDefault()
      void fileToAsset(img).then((url) => url && replaceText(`![图片](${url})`))
      return true
    }
    const html = dt.getData('text/html')
    const plain = dt.getData('text/plain')
    // T4: 选中文字时粘贴单个 URL → [选中文字](URL)（优先于富文本，复制超链接也按选区意图处理）
    const psel = v.state.selection.main
    if (!psel.empty && plain && /^https?:\/\/\S+$/i.test(plain.trim())) {
      event.preventDefault()
      const text = v.state.sliceDoc(psel.from, psel.to)
      const md = `[${text}](${plain.trim()})`
      v.dispatch({ changes: { from: psel.from, to: psel.to, insert: md }, selection: { anchor: psel.from + md.length } })
      v.focus()
      return true
    }
    // 纯文本本身就是 markdown（标题/引用/列表/表格/围栏/链接等）→ 直接按原样插入，
    // 不走 HTML→markdown 转换（否则源应用包的 HTML 会被 turndown 再转一道、污染语法）。
    if (plain && plain.trim() && /^(?:#{1,6}\s|>\s|[-*+]\s|\d+[.)]\s|\|.*\||```|~~~|\s{0,3}!?\[[^\]]*\]\()/m.test(plain)) {
      return false // 交给 CodeMirror 默认粘贴：原样插入纯文本
    }
    // 仅当存在真实富文本（非把纯文本包成 html）时才转换
    if (html && html.trim() && /<(table|h[1-6]|ul|ol|li|strong|em|b|i|a|blockquote|pre|code|img)\b/i.test(html)) {
      const md = htmlToMarkdown(html)
      if (md) {
        event.preventDefault()
        const { from, to } = v.state.selection.main
        // 富文本里的内联 base64 图片转存为 asset://，再插入（异步，不阻塞 preventDefault）
        void externalizeDataImages(md).then((clean) => {
          v.dispatch({ changes: { from, to, insert: clean }, selection: { anchor: from + clean.length } })
          v.focus()
        })
        return true
      }
    }
    void plain
    return false
  },
  drop(event, v) {
    const img = firstImageFile(event.dataTransfer)
    if (!img) return false
    event.preventDefault()
    const pos = v.posAtCoords({ x: event.clientX, y: event.clientY }) ?? v.state.selection.main.from
    void fileToAsset(img).then((url) => url && replaceText(`![图片](${url})`, pos))
    return true
  },
})

interface IconTool { icon: string; title: string; run: () => void }
interface InsertItem {
  key: string
  label: string
  icon?: string
  title?: string
  shortcut?: string
  run?: () => void
  children?: InsertItem[]
}

// 标题下拉选项（label 走 t() 以随语言切换；插入的正文占位保持原文，属文档内容）
const headingItems = computed(() => [
  { level: 1, label: 'H1', hint: t('editor.h1') },
  { level: 2, label: 'H2', hint: t('editor.h2') },
  { level: 3, label: 'H3', hint: t('editor.h3') },
  { level: 4, label: 'H4', hint: t('editor.h4') },
  { level: 5, label: 'H5', hint: t('editor.h5') },
  { level: 6, label: 'H6', hint: t('editor.h6') },
])
function pickHeading(level: number) {
  headingMenuOpen.value = false
  setHeadingLevel(level)
}

// 当前块类型标签（参考 Notion：下拉触发器直接显示「正文 / 标题 N」），按源码光标行实时更新。
const currentBlockLabel = ref('')
function refreshCurrentBlockLabel(state = view?.state) {
  if (!state) return
  const m = state.doc.lineAt(state.selection.main.head).text.match(/^\s*(#{1,6})\s/)
  currentBlockLabel.value = m ? t(`editor.h${m[1].length}` as 'editor.h1') : t('editor.body')
}

function collectSourceFormatState(state = view?.state): Set<string> {
  const out = new Set<string>()
  if (!state) return out
  const sel = state.selection.main
  const full = state.doc.toString()
  const line = state.doc.lineAt(sel.head)
  const lineText = line.text
  const col = sel.head - line.from
  const selected = sel.from !== sel.to
  const before = full.slice(Math.max(0, sel.from - 16), sel.from)
  const after = full.slice(sel.to, Math.min(full.length, sel.to + 32))
  const hasWrap = (open: string, close = open) => {
    if (selected) return before.endsWith(open) && after.startsWith(close)
    let idx = -1
    while ((idx = lineText.indexOf(open, idx + 1)) !== -1) {
      const end = lineText.indexOf(close, idx + open.length)
      if (end !== -1 && idx + open.length <= col && end >= col) return true
    }
    return false
  }
  const inside = (re: RegExp) => {
    let m: RegExpExecArray | null
    re.lastIndex = 0
    while ((m = re.exec(lineText))) {
      if (m.index <= col && m.index + m[0].length >= col) return true
      if (!m[0]) re.lastIndex += 1
    }
    return false
  }
  if (hasWrap('**') || hasWrap('__') || inside(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g)) out.add('bold')
  if (hasWrap('*') || hasWrap('_') || inside(/(^|[^*_])(\*|_)(?=\S)([^*_]*?\S)\2(?!\*)/g)) out.add('italic')
  if (hasWrap('~~') || inside(/~~(?=\S)([\s\S]*?\S)~~/g)) out.add('strike')
  if (hasWrap('<u>', '</u>') || inside(/<u>([\s\S]*?)<\/u>/g)) out.add('underline')
  if (hasWrap('==') || inside(/==(?=\S)([\s\S]*?\S)==/g)) out.add('highlight')
  if (hasWrap('`') || inside(/`[^`\n]+`/g)) out.add('code')
  if (inside(/\[[^\]\n]+\]\([^)]+\)/g) || inside(/https?:\/\/[^\s<>()]+/g)) out.add('link')
  if (hasWrap('$') || inside(/\$[^$\n]+\$/g)) out.add('sigma')
  if (/^\s*\|.*\|\s*$/.test(lineText)) out.add('table')
  if (/!\[[^\]]*]\([^)]+\)/.test(lineText)) out.add('image')
  if (/^\s*([-*+]|\d+[.)])\s+/.test(lineText) || /^\s*[-*+]\s+\[[ xX]\]\s+/.test(lineText)) out.add('list')
  return out
}

function refreshToolbarFormatState(state = view?.state) {
  if (previewEditFocused()) return
  toolbarActiveFormats.value = collectSourceFormatState(state)
}

const selectionFormatTools = computed<IconTool[]>(() => [
  { icon: 'bold', title: t('editor.bold'), run: () => wrap('**') },
  { icon: 'italic', title: t('editor.italic'), run: () => wrap('*') },
  { icon: 'link', title: t('editor.link'), run: wrapLink },
  { icon: 'code', title: t('editor.inlineCode'), run: () => wrap('`', '`') },
])

// 图标工具条：核心格式 + 结构（参考稿干净图标条）
const formatTools = computed<(IconTool | 'sep')[]>(() => [
  { icon: 'bold', title: t('editor.bold'), run: () => routeFmt('bold', () => wrap('**')) },
  { icon: 'italic', title: t('editor.italic'), run: () => routeFmt('italic', () => wrap('*')) },
  { icon: 'strike', title: t('editor.strike'), run: () => routeFmt('strike', () => wrap('~~')) },
  { icon: 'underline', title: t('editor.underline'), run: () => routeFmt('underline', () => wrap('<u>', '</u>')) },
  { icon: 'highlight', title: t('editor.highlight'), run: () => routeFmt('highlight', () => wrap('==')) },
  { icon: 'code', title: t('editor.inlineCode'), run: () => routeFmt('code', () => wrap('`', '`')) },
  { icon: 'link', title: t('editor.link'), run: () => routeFmt('link', wrapLink) },
  { icon: 'sigma', title: t('editor.math'), run: () => routeFmt('math', () => wrap('$')) },
  { icon: 'quote', title: t('editor.quote'), run: () => prefixLine('quote') },
  { icon: 'divider', title: t('editor.divider'), run: () => insertBlock('---') },
  'sep',
  { icon: 'table', title: t('editor.table'), run: toggleTablePicker },
  { icon: 'image', title: t('editor.image'), run: insertImage },
])

const todoInsertItems = computed<InsertItem[]>(() => [
  { key: 'todo-new', icon: 'check-square', label: t('editor.todoNew'), title: '- [ ]', shortcut: '⌘⇧T', run: () => runTaskAction('insert') },
  { key: 'todo-toggle', icon: 'check', label: t('editor.todoToggle'), shortcut: '⌘↵', run: () => runTaskAction('toggle') },
  { key: 'todo-complete', icon: 'check-circle', label: t('editor.todoComplete'), shortcut: '⌘⇧↵', run: () => runTaskAction('complete') },
  { key: 'todo-incomplete', icon: 'circle', label: t('editor.todoIncomplete'), shortcut: '⌥⌘↵', run: () => runTaskAction('incomplete') },
  { key: 'todo-sort', icon: 'arrow-down', label: t('editor.todoMoveDone'), shortcut: '⌥⌘↓', run: () => runTaskAction('sort') },
])

// O4：工具条 List 嵌套下拉（对齐参考图）
const listMenuOpen = ref(false)
const listEl = ref<HTMLElement | null>(null)
const listMenuEl = ref<HTMLElement | null>(null)
const listSubmenuEl = ref<HTMLElement | null>(null)
const listSubmenu = ref<{ key: string; items: InsertItem[] } | null>(null)
const listMenuStyle = ref({ left: '0px', top: '0px' })
const listSubmenuStyle = ref({ left: '0px', top: '0px' })
const listMenuItems = computed<InsertItem[]>(() => [
  { key: 'ul', icon: 'list', label: t('editor.ul'), shortcut: '⌘⇧8', run: () => prefixLine('ul') },
  { key: 'ol', icon: 'list-ordered', label: t('editor.ol'), shortcut: '⌘⇧7', run: () => prefixLine('ol') },
  { key: 'todo', icon: 'check-square', label: t('editor.taskList'), children: todoInsertItems.value },
])
function updateListMenuPosition() {
  const rect = listEl.value?.getBoundingClientRect()
  if (!rect) return
  listMenuStyle.value = {
    left: `${Math.max(8, Math.min(rect.left, window.innerWidth - 220))}px`,
    top: `${rect.bottom + 6}px`,
  }
}
async function toggleListMenu() {
  listMenuOpen.value = !listMenuOpen.value
  listSubmenu.value = null
  if (listMenuOpen.value) {
    headingMenuOpen.value = false
    insertOpen.value = false
    await nextTick()
    updateListMenuPosition()
  }
}
function runListItem(it: InsertItem) {
  if (!it.run) return
  listMenuOpen.value = false
  listSubmenu.value = null
  it.run()
}
async function openListSubmenu(it: InsertItem, event: MouseEvent) {
  if (!it.children) {
    listSubmenu.value = null
    return
  }
  listSubmenu.value = { key: it.key, items: it.children }
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  await nextTick()
  const menuRect = listSubmenuEl.value?.getBoundingClientRect()
  const width = menuRect?.width ?? 220
  const height = menuRect?.height ?? it.children.length * 34 + 12
  const left = rect.right + 6 + width <= window.innerWidth - 8
    ? rect.right + 6
    : rect.left - width - 6
  listSubmenuStyle.value = {
    left: `${Math.max(8, left)}px`,
    top: `${Math.max(8, Math.min(rect.top - 6, window.innerHeight - height - 8))}px`,
  }
}
function closeListMenu(e: MouseEvent) {
  const target = e.target as Node
  if (
    listEl.value?.contains(target)
    || listMenuEl.value?.contains(target)
    || listSubmenuEl.value?.contains(target)
  ) return
  listMenuOpen.value = false
  listSubmenu.value = null
}
const calloutInsertItems = computed<InsertItem[]>(() => [
  { key: 'callout-note', icon: 'notes', label: t('editor.note'), title: ':::note', shortcut: '⌥⌘1', run: () => insertBlock(':::note\n要点提示\n:::') },
  { key: 'callout-info', icon: 'info', label: t('editor.calloutInfo'), title: ':::info', shortcut: '⌥⌘2', run: () => insertBlock(':::info\n信息内容\n:::') },
  { key: 'callout-success', icon: 'check-circle', label: t('editor.calloutSuccess'), title: ':::success', shortcut: '⌥⌘3', run: () => insertBlock(':::success\n操作成功\n:::') },
  { key: 'callout-warning', icon: 'alert-triangle', label: t('editor.calloutWarning'), title: ':::warning', shortcut: '⌥⌘4', run: () => insertBlock(':::warning\n注意事项\n:::') },
  { key: 'callout-question', icon: 'help', label: t('editor.calloutQuestion'), title: ':::question', shortcut: '⌥⌘5', run: () => insertBlock(':::question\n待解决的问题\n:::') },
  { key: 'callout-details', icon: 'chevron-right-square', label: t('editor.calloutDetails'), title: ':::details', shortcut: '⌥⌘6', run: () => insertBlock(':::details 点击展开\n隐藏的内容\n:::') },
])
const structureInsertItems = computed<InsertItem[]>(() => [
  { key: 'code', icon: 'code-square', label: t('editor.codeBlock'), title: '```code', run: () => insertBlock(`${F}\n代码\n${F}`) },
  { key: 'card', icon: 'card', label: t('editor.card'), title: ':::card', run: () => insertBlock(':::card\n卡片内容\n:::') },
  { key: 'cols', icon: 'columns', label: t('editor.cols'), title: ':::cols', run: () => insertBlock(':::cols\n:::col\n左列\n:::\n:::col\n右列\n:::\n:::') },
  { key: 'timeline', icon: 'timeline', label: t('editor.timeline'), title: ':::timeline', run: () => insertBlock(':::timeline\n- 第一阶段\n- 第二阶段\n- 第三阶段\n:::') },
  { key: 'steps', icon: 'steps', label: t('editor.steps'), title: ':::steps', run: () => insertBlock(':::steps\n- 准备\n- 执行\n- 复盘\n:::') },
  { key: 'footnote', icon: 'footnote', label: t('editor.footnote'), title: '[^1]', run: () => insertBlock('[^1]: 脚注内容') },
  { key: 'toc', icon: 'toc', label: t('editor.toc'), title: '[toc]', run: () => insertBlock('[toc]') },
])
// 图示与图表：做成三级菜单（图示与图表 › 流程图/图示 | 数据图表 › 具体类型），点叶子直接插模板，
// 不再弹选择框，和其它工具条下拉的层级体验一致。
const mediaInsertItems = computed<InsertItem[]>(() => [
  {
    key: 'mermaid',
    icon: 'flow',
    label: t('editor.mermaid'),
    title: 'Mermaid',
    children: MERMAID_TEMPLATES.map((tpl) => ({ key: `m-${tpl.value}`, icon: 'flow', label: tpl.label, title: tpl.hint, run: () => insertBlock(tpl.code) })),
  },
  {
    key: 'echarts',
    icon: 'chart',
    label: t('editor.echarts'),
    title: 'ECharts',
    children: ECHARTS_TEMPLATES.map((tpl) => ({ key: `e-${tpl.value}`, icon: 'chart', label: tpl.label, title: tpl.hint, run: () => insertBlock(tpl.code) })),
  },
])
const slideInsertItems = computed<InsertItem[]>(() => [
  { key: 'slide-new', icon: 'divider', label: t('editor.slideNew'), title: '---', run: () => insertBlock('---') },
  { key: 'slide-cover', icon: 'monitor', label: t('editor.slideCover'), title: 'layout: cover', run: () => insertBlock('<!-- layout: cover -->\n\n# 标题\n\n副标题') },
  { key: 'slide-section', icon: 'panel-left', label: t('editor.slideSection'), title: 'layout: section', run: () => insertBlock('<!-- layout: section -->\n\n# 章节标题') },
])
// 「插入」拆成工具条上的分类图标按钮（列表/引用/分隔线等已在标题·列表下拉里，故不再重复）。
// 每个分类点开后在按钮下方弹出其子项菜单。
const insertCategories = computed<{ key: string; icon: string; label: string; items: InsertItem[] }[]>(() => [
  { key: 'callout', icon: 'callout', label: t('editor.callout'), items: calloutInsertItems.value },
  { key: 'structure', icon: 'columns', label: t('editor.structure'), items: structureInsertItems.value },
  { key: 'media', icon: 'chart', label: t('editor.media'), items: mediaInsertItems.value },
  ...(ui.mode === 'slide' ? [{ key: 'slides', icon: 'monitor', label: t('editor.slides'), items: slideInsertItems.value }] : []),
])
let categoryAnchor: HTMLElement | null = null
function positionCategoryMenu() {
  if (!categoryAnchor || !insertSubmenu.value) return
  const rect = categoryAnchor.getBoundingClientRect()
  const width = insertSubmenuEl.value?.getBoundingClientRect().width ?? 220
  insertSubmenuStyle.value = {
    left: `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`,
    top: `${rect.bottom + 6}px`,
  }
}
async function toggleCategory(cat: { key: string; items: InsertItem[] }, e: MouseEvent) {
  catSubmenu.value = null
  if (insertSubmenu.value?.key === cat.key) { insertSubmenu.value = null; categoryAnchor = null; return }
  headingMenuOpen.value = false
  listMenuOpen.value = false
  insertOpen.value = false
  categoryAnchor = e.currentTarget as HTMLElement
  insertSubmenu.value = { key: cat.key, items: cat.items }
  await nextTick()
  positionCategoryMenu()
}

const insertOpen = ref(false)
const insertEl = ref<HTMLElement | null>(null)
const insertMenuEl = ref<HTMLElement | null>(null)
const insertSubmenuEl = ref<HTMLElement | null>(null)
const insertSubmenu = ref<{ key: string; items: InsertItem[] } | null>(null)
const insertMenuStyle = ref({ left: '0px', top: '0px' })
const insertSubmenuStyle = ref({ left: '0px', top: '0px' })
// 三级菜单的第 3 层（如 图示与图表 › 流程图/图示 › 具体类型）
const catSubmenuEl = ref<HTMLElement | null>(null)
const catSubmenu = ref<{ key: string; items: InsertItem[] } | null>(null)
const catSubmenuStyle = ref({ left: '0px', top: '0px' })
async function openCatSubmenu(it: InsertItem, event: MouseEvent) {
  if (!it.children) { catSubmenu.value = null; return }
  catSubmenu.value = { key: it.key, items: it.children }
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  await nextTick()
  const menuRect = catSubmenuEl.value?.getBoundingClientRect()
  const width = menuRect?.width ?? 200
  const height = menuRect?.height ?? it.children.length * 32 + 12
  const left = rect.right + 6 + width <= window.innerWidth - 8 ? rect.right + 6 : rect.left - width - 6
  catSubmenuStyle.value = {
    left: `${Math.max(8, left)}px`,
    top: `${Math.max(8, Math.min(rect.top - 6, window.innerHeight - height - 8))}px`,
  }
}
function updateInsertMenuPosition() {
  const rect = insertEl.value?.getBoundingClientRect()
  if (!rect) return
  const menuRect = insertMenuEl.value?.getBoundingClientRect()
  const width = menuRect?.width ?? 240
  const height = menuRect?.height ?? 330
  const top = rect.bottom + 6 + height <= window.innerHeight - 8
    ? rect.bottom + 6
    : rect.top - height - 6
  insertMenuStyle.value = {
    left: `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`,
    top: `${Math.max(8, top)}px`,
  }
}
async function toggleInsertMenu() {
  insertOpen.value = !insertOpen.value
  insertSubmenu.value = null
  if (insertOpen.value) {
    headingMenuOpen.value = false
    await nextTick()
    updateInsertMenuPosition()
  }
}
function runInsert(it: InsertItem) {
  if (!it.run) return
  insertOpen.value = false
  insertSubmenu.value = null
  catSubmenu.value = null
  categoryAnchor = null
  it.run()
}
async function openInsertSubmenu(it: InsertItem, event: MouseEvent) {
  if (!it.children) {
    insertSubmenu.value = null
    return
  }
  insertSubmenu.value = { key: it.key, items: it.children }
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  await nextTick()
  const menuRect = insertSubmenuEl.value?.getBoundingClientRect()
  const width = menuRect?.width ?? 240
  const height = menuRect?.height ?? it.children.length * 34 + 12
  const left = rect.right + 6 + width <= window.innerWidth - 8
    ? rect.right + 6
    : rect.left - width - 6
  insertSubmenuStyle.value = {
    left: `${Math.max(8, left)}px`,
    top: `${Math.max(8, Math.min(rect.top - 6, window.innerHeight - height - 8))}px`,
  }
}
function closeInsert(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (
    target.closest?.('.cat-trigger')
    || insertEl.value?.contains(target)
    || insertMenuEl.value?.contains(target)
    || insertSubmenuEl.value?.contains(target)
    || catSubmenuEl.value?.contains(target)
  ) return
  insertOpen.value = false
  insertSubmenu.value = null
  catSubmenu.value = null
  categoryAnchor = null
}
function updateOpenToolbarMenus() {
  if (headingMenuOpen.value) updateHeadingMenuPosition()
  if (listMenuOpen.value) updateListMenuPosition()
  if (insertOpen.value) {
    insertSubmenu.value = null
    updateInsertMenuPosition()
  } else if (insertSubmenu.value && categoryAnchor) {
    positionCategoryMenu()
  }
  if (selectionToolbarOpen.value) updateSelectionToolbarPosition()
  else if (floatingToolbarOpen.value) updateFloatingToolbarPosition()
  if (pickerOpen.value) updateTablePickerPosition()
  if (tableUi.value) recomputeTable()
}

function refreshEditorToolbars(state = view?.state) {
  if (!view || !state) return
  if (searchPanelOpen(state)) {
    floatingToolbarOpen.value = false
    selectionToolbarOpen.value = false
    return
  }
  if (pickerOpen.value) {
    tableUi.value = null
  }
  if (cursorInTable(state)) {
    floatingToolbarOpen.value = false
    selectionToolbarOpen.value = false
    return
  }
  // 有无选区都用同一条共用工具条（选区工具条已废弃）：选中文本后工具条不再消失，
  // 浮动模式下浮在光标/选区处，固定模式下常驻顶部。
  selectionToolbarOpen.value = false
  if (view.hasFocus) void showFloatingToolbar()
}

onMounted(() => {
  view = new EditorView({
    parent: host.value!,
    state: EditorState.create({
      doc: doc.markdown,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        history(),
        closeBrackets(),
        autocompletion({ override: [slashCompletions, linkCompletions], icons: false }),
        linkDiagnosticsExtension(
          () => currentDiagnostics.value,
          (diagnostic) => t(diagnosticMessageKey(diagnostic.code), diagnostic.messageParams),
        ),
        search({
          createPanel: createFloatingSearchPanel(() => ({
            find: t('search.find'),
            replace: t('search.replace'),
            previous: t('search.previous'),
            next: t('search.next'),
            all: t('search.all'),
            replaceNext: t('search.replaceNext'),
            replaceAll: t('search.replaceAll'),
            matchCase: t('search.matchCase'),
            regexp: t('search.regexp'),
            wholeWord: t('search.wholeWord'),
            options: t('search.options'),
            close: t('search.close'),
          })),
        }),
        keymap.of([
          ...closeBracketsKeymap,
          ...completionKeymap,
          ...searchKeymap,
          // T1: Typora 级智能列表/续行——回车续列表/引用标记、空项回车退出、Backspace 删标记。
          // 放在 defaultKeymap 之前以取得 Enter/Backspace 优先权（补全打开时 completionKeymap 已先消费 Enter）。
          { key: 'Enter', run: insertNewlineContinueMarkup },
          { key: 'Backspace', run: deleteMarkupBackward },
          { key: 'Mod-Shift-8', run: () => { prefixLine('ul'); return true } },
          { key: 'Mod-Shift-7', run: () => { prefixLine('ol'); return true } },
          { key: 'Mod-Shift-9', run: () => { prefixLine('quote'); return true } },
          { key: 'Mod-Shift-t', run: () => runTaskAction('insert') },
          { key: 'Mod-Enter', run: () => runTaskAction('toggle') },
          { key: 'Mod-Shift-Enter', run: () => runTaskAction('complete') },
          { key: 'Alt-Mod-Enter', run: () => runTaskAction('incomplete') },
          { key: 'Alt-Mod-ArrowDown', run: () => runTaskAction('sort') },
          { key: 'Mod-Shift-h', run: () => { insertBlock('---'); return true } },
          { key: 'Alt-Mod-1', run: () => { insertBlock(':::note\n要点提示\n:::'); return true } },
          { key: 'Alt-Mod-2', run: () => { insertBlock(':::info\n信息内容\n:::'); return true } },
          { key: 'Alt-Mod-3', run: () => { insertBlock(':::success\n操作成功\n:::'); return true } },
          { key: 'Alt-Mod-4', run: () => { insertBlock(':::warning\n注意事项\n:::'); return true } },
          { key: 'Alt-Mod-5', run: () => { insertBlock(':::question\n待解决的问题\n:::'); return true } },
          { key: 'Alt-Mod-6', run: () => { insertBlock(':::details 点击展开\n隐藏的内容\n:::'); return true } },
          ...defaultKeymap,
          ...historyKeymap,
          indentWithTab,
        ]),
        markdown({ base: markdownLanguage, codeLanguages: CODE_LANGUAGES }), // base=GFM + 围栏代码语言高亮
        wrapSelectionExtension(), // T2: 选中文字按 * ` ~ = 直接包裹
        frontmatterDecoration(), // U3: frontmatter 卡片样式
        mathDecoration(), // 数学公式 $…$ / $$…$$ 高亮
        smartPaste,
        themeCompartment.of(makeEditorTheme(theme.tokens)),
        smartPunctCompartment.of(ui.smartPunctuation ? smartPunctuationExtension() : []),
        slidePagesCompartment.of(ui.mode === 'slide' ? slidePageDecorations() : []),
        focusCompartment.of(ui.focusMode ? focusDimExtension() : []),
        typewriterCompartment.of(ui.typewriter ? typewriterExtension() : []),
        EditorView.lineWrapping,
        EditorView.updateListener.of((u) => {
          if (u.docChanged) doc.setMarkdown(u.state.doc.toString())
          if (u.selectionSet || u.docChanged) {
            const head = u.state.selection.main.head
            sync.setCursorLine(u.state.doc.lineAt(head).number - 1)
            recomputeTable()
            refreshEditorToolbars(u.state)
            refreshCurrentBlockLabel(u.state)
            refreshToolbarFormatState(u.state)
          }
        }),
        EditorView.domEventHandlers({
          focus() {
            refreshEditorToolbars()
            refreshCurrentBlockLabel()
            refreshToolbarFormatState()
            return false
          },
          blur() {
            hideFloatingToolbar()
            return false
          },
        }),
      ],
    }),
  })

  // 编辑器滚动 → 预览滚动同步
  view.scrollDOM.addEventListener('scroll', onEditorScroll, { passive: true })
  window.addEventListener('click', closeInsert)
  window.addEventListener('click', closeEmojiMenu)
  window.addEventListener('click', closeHeadingMenu)
  window.addEventListener('click', closeListMenu)
  window.addEventListener('click', closeTablePickerOnClick)
  window.addEventListener('resize', updateOpenToolbarMenus)
  window.addEventListener('scroll', updateOpenToolbarMenus, true)
  // R0a-1：原生菜单「编辑→查找/替换」经 window 事件打开 CodeMirror 查找面板
  window.addEventListener('morph:editor-find', openFindPanel)
  window.addEventListener('morph:editor-replace', openFindPanel)
  window.addEventListener('morph:preview-editing', onPreviewEditing)
  window.addEventListener('morph:preview-table-active', onPreviewTableActive)
  window.addEventListener('morph:preview-format-state', onPreviewFormatState)
  refreshCurrentBlockLabel()
  refreshToolbarFormatState()
  // 固定模式：进入即常驻显示共用工具条（无需先聚焦源码）
  if (ui.editorToolbarPinned) void showFloatingToolbar()
})

// CodeMirror 查找面板同时含替换输入框，查找/替换共用同一面板入口。
function openFindPanel() {
  if (!view) return
  view.focus()
  floatingToolbarOpen.value = false
  selectionToolbarOpen.value = false
  openSearchPanel(view)
}

function onEditorScroll() {
  if (tableUi.value) recomputeTable() // 让表格浮层跟随滚动
  if (selectionToolbarOpen.value) updateSelectionToolbarPosition()
  else if (floatingToolbarOpen.value) updateFloatingToolbarPosition()
  if (pickerOpen.value) updateTablePickerPosition()
  if (!view || Date.now() < scrollLock) return
  const rect = view.scrollDOM.getBoundingClientRect()
  const pos = view.posAtCoords({ x: rect.left + 4, y: rect.top + 4 })
  if (pos == null) return
  sync.requestScroll(view.state.doc.lineAt(pos).number - 1, 'editor')
}

function gotoLine(line: number, select = false, yAlign: 'center' | 'start' = 'center', column = 0) {
  if (!view) return
  const n = Math.min(Math.max(line, 0), view.state.doc.lines - 1)
  const l = view.state.doc.line(n + 1)
  const pos = l.from + Math.min(Math.max(column, 0), l.length)
  scrollLock = Date.now() + 250
  view.dispatch({
    selection: select ? { anchor: pos } : undefined,
    effects: EditorView.scrollIntoView(pos, { y: yAlign, yMargin: yAlign === 'start' ? 4 : 0 }),
  })
  if (select) view.focus()
}

watch(
  () => doc.markdown,
  (val) => {
    if (!view) return
    const cur = view.state.doc.toString()
    if (val === cur) return
    // 最小化变更：只替换「公共前缀」和「公共后缀」之间真正变动的中段，
    // 而不是整篇 from:0..length 全量替换——后者会把编辑器光标/选区塌缩到行首(0)，
    // 导致预览编辑后源码光标回到顶部 → 同步行算错 → 预览回弹到页首、且两侧内容对不上。
    let from = 0
    const minLen = Math.min(cur.length, val.length)
    while (from < minLen && cur.charCodeAt(from) === val.charCodeAt(from)) from++
    let endOld = cur.length
    let endNew = val.length
    while (endOld > from && endNew > from && cur.charCodeAt(endOld - 1) === val.charCodeAt(endNew - 1)) {
      endOld--
      endNew--
    }
    view.dispatch({ changes: { from, to: endOld, insert: val.slice(from, endNew) } })
  },
)
watch(
  () => theme.effectiveId,
  () => {
    view?.dispatch({ effects: themeCompartment.reconfigure(makeEditorTheme(theme.tokens)) })
  },
)
watch(
  () => ui.mode,
  (mode) => {
    view?.dispatch({
      effects: slidePagesCompartment.reconfigure(mode === 'slide' ? slidePageDecorations() : []),
    })
  },
)
watch(
  () => ui.focusMode,
  (on) => {
    view?.dispatch({ effects: focusCompartment.reconfigure(on ? focusDimExtension() : []) })
  },
)
watch(
  () => ui.typewriter,
  (on) => {
    view?.dispatch({ effects: typewriterCompartment.reconfigure(on ? typewriterExtension() : []) })
  },
)
watch(
  () => ui.smartPunctuation,
  (on) => {
    view?.dispatch({ effects: smartPunctCompartment.reconfigure(on ? smartPunctuationExtension() : []) })
  },
)

// 预览点击 → 编辑器滚动到对应行；不改选区/不抢焦点，避免影响删除等编辑操作
watch(
  () => sync.gotoNonce,
  () => gotoLine(sync.gotoLine, true, 'center', sync.gotoColumn),
)
// 预览滚动 → 编辑器滚动
watch(
  () => sync.scrollNonce,
  () => {
    // 预览滚动 → 编辑器：把同一行对齐到「顶部」（与预览侧 reportPreviewScrollLine 取顶部行一致），
    // 不能用 center，否则两边一个在顶一个在中，永远对不齐。
    if (sync.scrollSource === 'preview') gotoLine(sync.scrollLine, false, 'start')
  },
)
watch(
  () => [ui.editorToolbarPinned, toolbarSpanBoth.value, ui.editorRatio, ui.sidebarWidth, ui.sidebarCollapsed],
  () => {
    // 固定时常驻显示；尺寸/布局变化时重算横跨顶栏的位置与宽度
    if (ui.editorToolbarPinned && !floatingToolbarOpen.value) void showFloatingToolbar()
    else if (floatingToolbarOpen.value) updateFloatingToolbarPosition()
  },
)
watch(currentDiagnostics, () => {
  // 外部索引/资源状态变化时触发一次无内容事务，让诊断装饰重新计算。
  view?.dispatch({})
})

onBeforeUnmount(() => {
  setWorkbenchBarReserve(0)
  cancelAnimationFrame(floatingToolbarFrame)
  cancelAnimationFrame(selectionToolbarFrame)
  view?.scrollDOM.removeEventListener('scroll', onEditorScroll)
  window.removeEventListener('click', closeInsert)
  window.removeEventListener('click', closeEmojiMenu)
  window.removeEventListener('click', closeHeadingMenu)
  window.removeEventListener('click', closeListMenu)
  window.removeEventListener('click', closeTablePickerOnClick)
  window.removeEventListener('resize', updateOpenToolbarMenus)
  window.removeEventListener('scroll', updateOpenToolbarMenus, true)
  window.removeEventListener('morph:preview-editing', onPreviewEditing)
  window.removeEventListener('morph:preview-table-active', onPreviewTableActive)
  window.removeEventListener('morph:preview-format-state', onPreviewFormatState)
  window.removeEventListener('morph:editor-find', openFindPanel)
  window.removeEventListener('morph:editor-replace', openFindPanel)
  view?.destroy()
})
</script>

<template>
  <div class="pane editor">
    <!-- R0b-1：当前文件被外部修改的非阻塞提示，不打断编辑 -->
    <div v-if="doc.externalConflict" class="ext-conflict">
      <span class="ext-dot" aria-hidden="true">!</span>
      <span class="ext-msg">{{ t('editor.externalChanged') }}</span>
      <button class="ext-btn primary" @click="doc.resolveExternalConflict(true)">{{ t('editor.useExternal') }}</button>
      <button class="ext-btn" @click="doc.resolveExternalConflict(false)">{{ t('editor.keepMine') }}</button>
    </div>
    <Teleport to="body">
    <div
      v-if="selectionToolbarOpen"
      ref="selectionToolbarEl"
      class="selection-format-bar"
      :class="`is-${selectionToolbarPlacement}`"
      :style="selectionToolbarStyle"
      @mousedown.prevent
    >
      <button
        v-for="(tool, i) in selectionFormatTools"
        :key="i"
        class="tbtn ic"
        :title="tool.title"
        @click="tool.run()"
      >
        <Icon :name="tool.icon" :size="15" />
      </button>
    </div>
    <div
      v-if="floatingToolbarOpen && !selectionToolbarOpen"
      ref="floatingToolbarEl"
      class="floating-editor-tools"
      :class="{
        [`is-${floatingToolbarPlacement}`]: true,
        'is-pinned': ui.editorToolbarPinned,
        'is-floating': !ui.editorToolbarPinned,
        'is-span': toolbarSpanBoth,
      }"
      :style="floatingToolbarStyle"
      @mousedown.prevent
    >
      <!-- 固定顶部 / 跟随焦点浮动 切换 -->
      <button
        class="tbtn ic pin-btn"
        :class="{ on: ui.editorToolbarPinned }"
        :title="ui.editorToolbarPinned ? t('editor.toolbarUnpin') : t('editor.toolbarPin')"
        @click="ui.toggleEditorToolbarPinned(); nextTick(updateFloatingToolbarPosition)"
        @mouseenter="showTip(ui.editorToolbarPinned ? t('editor.toolbarUnpin') : t('editor.toolbarPin'), $event)"
        @mouseleave="hideTip"
      >
        <Icon :name="ui.editorToolbarPinned ? 'pin' : 'pin-off'" :size="15" />
      </button>
      <span class="sep"></span>
      <!-- 标题级别选择 -->
      <div class="heading-dd" ref="headingEl">
        <button class="tbtn heading-trigger block-type-trigger" :class="{ on: headingMenuOpen || currentBlockLabel !== t('editor.body') }" :disabled="previewEditing" @click="toggleHeadingMenu"
                @mouseenter="showTip(t('editor.headingLevel'), $event)" @mouseleave="hideTip">
          <Icon name="heading" :size="16" />
          <span class="bt-label">{{ currentBlockLabel || t('editor.body') }}</span>
          <Icon name="chevron-down" :size="13" />
        </button>
        <Teleport to="body">
        <div v-if="headingMenuOpen" ref="headingMenuEl" class="heading-menu" :style="headingMenuStyle">
          <button v-for="h in headingItems" :key="h.level" @click="pickHeading(h.level)">
            <span class="hm-label">{{ h.label }}</span>
            <span class="hm-hint">{{ h.hint }}</span>
          </button>
          <span class="hm-sep"></span>
          <button @click="pickHeading(0)">
            <span class="hm-label">{{ t('editor.body') }}</span>
            <span class="hm-hint">{{ t('editor.clearHeading') }}</span>
          </button>
        </div>
        </Teleport>
      </div>
      <div class="heading-dd list-dd" ref="listEl">
        <button class="tbtn heading-trigger" :class="{ on: listMenuOpen || toolbarActiveFormats.has('list') }" :disabled="previewEditing" @click="toggleListMenu"
                @mouseenter="showTip(t('editor.ul'), $event)" @mouseleave="hideTip">
          <Icon name="list" :size="16" /> <Icon name="chevron-down" :size="13" />
        </button>
        <Teleport to="body">
        <div v-if="listMenuOpen" ref="listMenuEl" class="insert-menu" :style="listMenuStyle">
          <button
            v-for="it in listMenuItems"
            :key="it.key"
            :class="{ active: listSubmenu?.key === it.key }"
            :aria-haspopup="it.children ? 'menu' : undefined"
            @mouseenter="openListSubmenu(it, $event)"
            @click="it.children ? openListSubmenu(it, $event) : runListItem(it)"
          >
            <span class="i-left">
              <Icon v-if="it.icon" :name="it.icon" :size="15" />
              <span class="i-label">{{ it.label }}</span>
            </span>
            <span class="i-right">
              <span v-if="it.shortcut" class="i-hint">{{ it.shortcut }}</span>
              <Icon v-if="it.children" name="chevron-right" :size="13" />
            </span>
          </button>
        </div>
        <div
          v-if="listMenuOpen && listSubmenu"
          ref="listSubmenuEl"
          class="insert-menu insert-submenu"
          :style="listSubmenuStyle"
        >
          <button v-for="it in listSubmenu.items" :key="it.key" @click="runListItem(it)">
            <span class="i-left">
              <Icon v-if="it.icon" :name="it.icon" :size="15" />
              <span class="i-label">{{ it.label }}</span>
            </span>
            <span class="i-right"><span class="i-hint">{{ it.shortcut || it.title }}</span></span>
          </button>
        </div>
        </Teleport>
      </div>
      <span class="sep"></span>
      <template v-for="(t, i) in formatTools" :key="i">
        <span v-if="t === 'sep'" class="sep"></span>
        <button
          v-else
          class="tbtn ic"
          :class="{ on: toolbarActiveFormats.has(t.icon) }"
          :data-tool="t.icon"
          :disabled="previewEditing && !PREVIEW_FORMAT_ICONS.has(t.icon)"
          @click="t.run"
          @mouseenter="showTip(t.title, $event)"
          @mouseleave="hideTip"
        >
          <Icon :name="t.icon" :size="16" />
        </button>
      </template>
      <!-- emoji 选择器 -->
      <div class="heading-dd emoji-dd" ref="emojiEl">
        <button class="tbtn ic" :class="{ on: emojiMenuOpen }" @click="toggleEmojiMenu"
                @mouseenter="showTip(t('editor.emoji'), $event)" @mouseleave="hideTip">
          <Icon name="smile" :size="16" />
        </button>
        <Teleport to="body">
          <div v-if="emojiMenuOpen" ref="emojiMenuEl" class="emoji-menu" :style="emojiMenuStyle">
            <button v-for="em in EMOJIS" :key="em" class="emoji-cell" :title="em" @click="pickEmoji(em)">{{ em }}</button>
          </div>
        </Teleport>
      </div>
      <span class="sep"></span>
      <!-- 「插入」拆成分类图标按钮：标注框 / 结构块 / 图示与图表（幻灯片态再加版式） -->
      <button
        v-for="cat in insertCategories"
        :key="cat.key"
        class="tbtn ic cat-trigger"
        :class="{ on: insertSubmenu?.key === cat.key }"
        :disabled="previewEditing"
        @click="toggleCategory(cat, $event)"
        @mouseenter="showTip(cat.label, $event)"
        @mouseleave="hideTip"
      >
        <Icon :name="cat.icon" :size="16" />
      </button>
      <Teleport to="body">
        <div
          v-if="insertSubmenu"
          ref="insertSubmenuEl"
          class="insert-menu"
          :style="insertSubmenuStyle"
        >
          <button
            v-for="it in insertSubmenu.items"
            :key="it.key"
            :title="it.title"
            :class="{ active: catSubmenu?.key === it.key }"
            :aria-haspopup="it.children ? 'menu' : undefined"
            @mouseenter="it.children ? openCatSubmenu(it, $event) : (catSubmenu = null)"
            @click="it.children ? openCatSubmenu(it, $event) : runInsert(it)"
          >
            <span class="i-left">
              <Icon v-if="it.icon" :name="it.icon" :size="15" />
              <span class="i-label">{{ it.label }}</span>
            </span>
            <span class="i-right">
              <span v-if="!it.children && (it.shortcut || it.title)" class="i-hint">{{ it.shortcut || it.title }}</span>
              <Icon v-if="it.children" name="chevron-right" :size="13" />
            </span>
          </button>
        </div>
        <div
          v-if="insertSubmenu && catSubmenu"
          ref="catSubmenuEl"
          class="insert-menu insert-submenu"
          :style="catSubmenuStyle"
        >
          <button v-for="it in catSubmenu.items" :key="it.key" :title="it.title" @click="runInsert(it)">
            <span class="i-left">
              <Icon v-if="it.icon" :name="it.icon" :size="15" />
              <span class="i-label">{{ it.label }}</span>
            </span>
          </button>
        </div>
      </Teleport>
      <!-- 仅源码态（全宽编辑器、无预览栏）：纸张选择放在编辑器工具条右端 -->
      <span v-if="ui.isPreviewHidden && ui.mode === 'document'" class="page-paper-ctl"><span>{{ t('editor.paper') }}</span>
        <SelectMenu :value="ui.paperSize" :options="paperOpts" @update="ui.setPaperSize($event as PaperSize)" />
      </span>
    </div>
    </Teleport>
    <Teleport to="body">
    <div
      v-if="pickerOpen"
      ref="tablePickerEl"
      class="tbl-picker"
      :style="tablePickerStyle"
      @mouseleave="onTablePickerMouseLeave"
    >
      <div class="tbl-picker-grid">
        <template v-for="r in PICK_ROWS" :key="r">
          <span
            v-for="c in PICK_COLS"
            :key="r + '-' + c"
            class="cell"
            :class="{ on: r <= hoverR && c <= hoverC }"
            @mouseover="hoverR = r; hoverC = c"
            @click="pickTable(r, c)"
          ></span>
        </template>
      </div>
      <div class="tbl-picker-label">{{ t('editor.tablePicker', { r: hoverR || 0, c: hoverC || 0 }) }}</div>
      <div class="tbl-picker-num">
        <input type="number" min="1" max="100" v-model.number="numR" :aria-label="t('editor.tableRows')" @keyup.enter="pickTableByNumber" />
        <span class="x">{{ t('editor.tableRows') }} ×</span>
        <input type="number" min="1" max="50" v-model.number="numC" :aria-label="t('editor.tableCols')" @keyup.enter="pickTableByNumber" />
        <span class="x">{{ t('editor.tableCols') }}</span>
        <button class="tbl-num-ok" @click="pickTableByNumber">{{ t('editor.tableInsert') }}</button>
      </div>
    </div>
    </Teleport>
    <div class="cm-host" ref="host" :style="editorPageStyle" @contextmenu="onTableContextMenu"></div>
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
      @close="closeTableMenu"
    />
    <Teleport to="body">
    <TableToolbar
      v-if="tableUi && !pickerOpen && !previewTableActive && !previewEditing"
      class="tbl-float"
      :style="{ top: tableUi.top + 'px', left: tableUi.left + 'px' }"
      :align="tableUi.model.aligns[tableUi.col] ?? 'none'"
      :can-delete-row="tableUi.bodyIndex >= 0"
      @op="onTableOp"
    />
    </Teleport>
    <Teleport to="body">
      <div v-if="tipVisible" class="float-tip" :class="{ below: tipBelow }" :style="{ left: tipX + 'px', top: tipY + 'px' }">{{ tipText }}</div>
    </Teleport>
  </div>
</template>

<style scoped>
.pane.editor { position: relative; display: flex; flex-direction: column; overflow: hidden; min-height: 0; }
/* R0b-1：外部修改非阻塞提示条 */
.ext-conflict {
  flex: 0 0 auto;
  display: flex; align-items: center; gap: 8px;
  padding: 6px 12px;
  font-size: 12px; font-weight: 600;
  color: color-mix(in srgb, #b45309 88%, var(--app-fg));
  background: color-mix(in srgb, #f59e0b 14%, var(--app-elevated));
  border-bottom: 1px solid color-mix(in srgb, #f59e0b 38%, var(--app-hairline));
}
.ext-conflict .ext-dot {
  display: inline-grid; place-items: center;
  width: 16px; height: 16px; border-radius: 50%;
  font-size: 11px; font-weight: 800; color: #fff; background: #f59e0b;
}
.ext-conflict .ext-msg { flex: 1 1 auto; }
.ext-btn {
  flex: 0 0 auto; font: inherit; font-size: 11px; font-weight: 700; cursor: pointer;
  padding: 4px 10px; border-radius: 6px;
  border: 1px solid var(--app-control-border); background: var(--app-control-bg); color: var(--app-fg-soft);
}
.ext-btn:hover { background: var(--app-hover); }
.ext-btn.primary { color: #fff; background: #f59e0b; border-color: #f59e0b; }
.ext-btn.primary:hover { background: color-mix(in srgb, #f59e0b 88%, #000); }
.tbl-float { position: fixed; z-index: calc(var(--z-dropdown) + 1); }
.tbl-picker {
  position: fixed; z-index: calc(var(--z-dropdown) + 2);
  padding: 10px; border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--app-border) 80%, transparent);
  background: color-mix(in srgb, var(--app-panel-bg) 90%, transparent);
  box-shadow: 0 12px 30px rgba(0,0,0,0.2), 0 1px 0 var(--app-edge) inset;
  backdrop-filter: blur(14px) saturate(1.08);
}
.tbl-picker-grid {
  display: grid; grid-template-columns: repeat(8, 1fr); gap: 3px;
}
.tbl-picker .cell {
  width: 16px; height: 16px; border-radius: 3px; cursor: pointer;
  border: 1px solid color-mix(in srgb, var(--app-border) 70%, transparent);
  background: var(--app-bg);
}
.tbl-picker .cell.on {
  background: color-mix(in srgb, var(--app-primary-color) 40%, var(--app-bg));
  border-color: var(--app-primary-color);
}
.tbl-picker-label {
  margin-top: 8px; font-size: 11px; font-weight: 700; color: var(--app-muted); text-align: center;
}
.tbl-picker-num {
  margin-top: 8px; padding-top: 8px; display: flex; align-items: center; gap: 5px;
  border-top: 1px solid color-mix(in srgb, var(--app-border) 55%, transparent);
}
.tbl-picker-num input {
  width: 42px; font: inherit; font-size: 12px; text-align: center;
  padding: 3px 4px; border-radius: 6px;
  border: 1px solid color-mix(in srgb, var(--app-border) 80%, transparent);
  background: var(--app-bg); color: var(--app-fg);
}
.tbl-picker-num .x { font-size: 11px; font-weight: 700; color: var(--app-muted); }
.tbl-num-ok {
  margin-left: auto; font: inherit; font-size: 12px; font-weight: 650;
  padding: 4px 12px; border-radius: 6px; cursor: pointer;
  border: 1px solid var(--app-primary-color);
  background: var(--app-primary-color); color: #fff;
}
.tbl-num-ok:hover { opacity: 0.9; }
.floating-editor-tools {
  position: fixed;
  z-index: var(--z-dropdown);
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 2px;
  /* 关键：工具条容器本身不吃指针事件——其背景/空白（尤其横跨顶栏的留白）绝不拦截下方正文的
     选区拖拽（顶栏定位异常时也不会变成隐形遮罩挡住选中）。只有内部控件恢复 pointer-events。 */
  pointer-events: none;
  width: max-content;
  max-width: calc(100vw - 16px);
  padding: 5px 7px;
  border: 1px solid color-mix(in srgb, var(--app-control-border) 88%, transparent);
  border-radius: 13px;
  background: color-mix(in srgb, var(--app-menu-bg) 94%, transparent);
  box-shadow:
    0 16px 42px color-mix(in srgb, #000 20%, transparent),
    0 2px 8px color-mix(in srgb, #000 10%, transparent),
    0 1px 0 color-mix(in srgb, #fff 42%, transparent) inset;
  backdrop-filter: blur(18px) saturate(1.15);
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  animation: floating-tools-in 120ms ease-out;
  transition: opacity 0.15s ease;
}
/* 内部控件恢复指针事件（mousedown 仍会冒泡到根触发 .prevent 保住编辑器焦点） */
.floating-editor-tools > * { pointer-events: auto; }
.floating-editor-tools.is-pinned {
  opacity: 0.94;
}
/* 横向对照：停靠在源码+预览顶部的整条共用顶栏（宽度由 JS 写入）。
   扁平贴顶、内容左对齐、收紧留白；去掉浮动药丸的圆角/重阴影/指向箭头，并由 workbench 预留等高占位、不遮挡正文。 */
.floating-editor-tools.is-span {
  justify-content: center;
  gap: 1px;
  padding: 4px 8px;
  border-radius: 0;
  border-left: 0;
  border-right: 0;
  border-top: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--app-border) 80%, transparent);
  background: var(--app-shell-bg);
  backdrop-filter: none;
  box-shadow: 0 1px 0 color-mix(in srgb, #000 5%, transparent);
  opacity: 1;
}
.floating-editor-tools.is-span::after {
  display: none;
}
.floating-editor-tools.is-floating {
  opacity: 0.82;
}
.floating-editor-tools .tbtn.on,
.floating-editor-tools .pin-btn.on {
  color: var(--app-primary-color);
  background: color-mix(in srgb, var(--app-primary-color) 10%, transparent);
  border-color: color-mix(in srgb, var(--app-primary-color) 30%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--app-primary-color) 10%, transparent);
}
.floating-editor-tools::-webkit-scrollbar { display: none; }
.floating-editor-tools::after {
  content: '';
  position: absolute;
  width: 10px;
  height: 10px;
  left: 50%;
  background: inherit;
  border: inherit;
  transform: translateX(-50%) rotate(45deg);
  pointer-events: none;
}
.floating-editor-tools.is-top::after {
  bottom: -6px;
  border-left: 0;
  border-top: 0;
}
.selection-format-bar {
  position: fixed;
  z-index: calc(var(--z-dropdown) + 1);
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 6px;
  border: 1px solid color-mix(in srgb, var(--app-control-border) 88%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--app-menu-bg) 86%, transparent);
  opacity: 0.88;
  box-shadow:
    0 12px 32px color-mix(in srgb, #000 18%, transparent),
    0 1px 0 color-mix(in srgb, #fff 40%, transparent) inset;
  backdrop-filter: blur(16px) saturate(1.12);
  animation: floating-tools-in 120ms ease-out;
}
.selection-format-bar::after {
  content: '';
  position: absolute;
  width: 8px;
  height: 8px;
  left: 50%;
  background: inherit;
  border: inherit;
  transform: translateX(-50%) rotate(45deg);
  pointer-events: none;
}
.selection-format-bar.is-top::after { bottom: -5px; border-top: 0; border-left: 0; }
.selection-format-bar.is-bottom::after { top: -5px; border-bottom: 0; border-right: 0; }
.floating-editor-tools.is-bottom::after {
  top: -6px;
  border-right: 0;
  border-bottom: 0;
}
@keyframes floating-tools-in {
  from { opacity: 0; transform: translateY(3px) scale(.985); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
/* 自动保存指示 + 手动保存/历史版本（编辑区右端） */
.ed-autosave {
  display: inline-flex; align-items: center; gap: 6px;
  flex: 0 0 auto; margin-right: 2px;
  font-size: 11px; font-weight: 600; color: var(--app-muted); white-space: nowrap;
}
.ed-autosave .ed-dot { width: 6px; height: 6px; border-radius: 50%; background: color-mix(in srgb, #16a34a 70%, transparent); }
.ed-autosave.busy { color: var(--app-primary-color); }
.ed-autosave.busy .ed-dot { background: var(--app-primary-color); animation: ed-pulse 1s ease-in-out infinite; }
@keyframes ed-pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
.ed-act { flex: 0 0 auto; }
.page-paper-ctl {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: 6px;
  font-size: 11px;
  font-weight: 650;
  color: var(--app-muted);
  white-space: nowrap;
}
.page-width-ctl {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-left: 6px;
  font-size: 11px;
  font-weight: 650;
  color: var(--app-muted);
  white-space: nowrap;
}
.page-width-ctl input {
  width: 128px;
  accent-color: var(--app-primary-color);
}
.page-width-val {
  min-width: 34px;
  color: var(--app-fg);
  font-variant-numeric: tabular-nums;
}
.floating-editor-tools .sep {
  width: 1px;
  height: 18px;
  background: color-mix(in srgb, var(--app-border) 70%, transparent);
  margin: 0 6px;
}
/* 干净的幽灵图标按钮（参考稿风格） */
.tbtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  line-height: 1;
  cursor: pointer;
  border: 0;
  background: none;
  border: 1px solid transparent;
  color: var(--app-fg-soft);
  border-radius: var(--radius-md);
  transition: color var(--transition-fast), background var(--transition-fast);
}
.tbtn.ic {
  width: 30px;
  height: 30px;
  padding: 0;
}
/* emoji 选择面板 */
.emoji-menu {
  position: fixed;
  z-index: var(--z-popover, 3000);
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  gap: 1px;
  width: 260px;
  max-height: 220px;
  overflow-y: auto;
  padding: 6px;
  border: 1px solid var(--app-border);
  border-radius: 10px;
  background: var(--app-menu-bg, var(--app-shell-bg));
  box-shadow: 0 12px 32px rgba(0,0,0,.16);
}
.emoji-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: none;
  font-size: 17px;
  line-height: 1;
  cursor: pointer;
}
.emoji-cell:hover { background: var(--app-hover); }
/* 浮动 tooltip：fixed 定位、Teleport 到 body，避开任意 overflow 裁剪 */
.tbtn:hover {
  color: var(--app-primary-color);
  border-color: color-mix(in srgb, var(--app-primary-color) 22%, transparent);
  background: var(--app-hover);
}
.tbtn:active { background: var(--app-active); }
/* 预览编辑态：结构类工具不适用 → 置灰禁用，仍占位、不跳动 */
.tbtn:disabled {
  opacity: 0.32;
  cursor: not-allowed;
  pointer-events: none;
}
.heading-dd { position: relative; display: inline-flex; }
.heading-trigger { padding: 0 6px; height: 30px; display: inline-flex; align-items: center; gap: 2px; }
/* 块类型触发器：显示当前块类型标签（正文 / 标题 N），参考 Notion 交互 */
.block-type-trigger { width: auto; padding: 0 7px; gap: 4px; }
.block-type-trigger .bt-label { font-size: 12px; font-weight: 600; white-space: nowrap; }
.heading-trigger.on { color: var(--app-primary-color); border-color: color-mix(in srgb, var(--app-primary-color) 24%, transparent); background: var(--app-active); }
.heading-menu {
  position: fixed;
  z-index: var(--z-dropdown);
  width: 160px;
  padding: 6px;
  border: 1px solid var(--app-control-border);
  border-radius: var(--radius-xl);
  background: var(--app-menu-bg);
  box-shadow: var(--shadow-lg);
}
.heading-menu button {
  width: 100%;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 9px;
  border: 0;
  border-radius: var(--radius-sm);
  background: none;
  cursor: pointer;
  text-align: left;
}
.heading-menu button:hover { background: var(--app-hover); }
.hm-label { font-size: 13px; font-weight: 800; color: var(--app-fg); }
.hm-hint { font-size: 11px; color: var(--app-muted); }
.hm-sep { display: block; height: 1px; margin: 3px 6px; background: color-mix(in srgb, var(--app-border) 60%, transparent); }
.insert-dd { position: relative; display: inline-flex; }
.insert-trigger { padding: 6px 10px; height: 30px; }
.insert-trigger.on { color: var(--app-primary-color); border-color: color-mix(in srgb, var(--app-primary-color) 24%, transparent); background: var(--app-active); }
.insert-menu {
  position: fixed;
  z-index: var(--z-dropdown);
  width: 232px;
  max-height: 60vh;
  overflow: auto;
  padding: 6px;
  border: 1px solid var(--app-control-border);
  border-radius: var(--radius-xl);
  background: var(--app-menu-bg);
  box-shadow: var(--shadow-lg);
}
.insert-submenu { z-index: calc(var(--z-dropdown) + 1); width: 244px; }
.insert-menu button {
  width: 100%;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 9px;
  border: 0;
  border-radius: var(--radius-sm);
  background: none;
  cursor: pointer;
  text-align: left;
}
.insert-menu button:hover,
.insert-menu button.active { background: var(--app-hover); }
.insert-menu .i-left { display: inline-flex; align-items: center; gap: 9px; min-width: 0; }
.insert-menu .i-left .ico { color: var(--app-muted); }
.insert-menu .i-label { font-size: 13px; font-weight: 650; color: var(--app-fg); }
.insert-menu .i-hint { font-size: 11px; color: var(--app-muted); font-family: var(--font-family-mono); white-space: nowrap; }
.insert-menu .i-right { display: inline-flex; align-items: center; gap: 6px; color: var(--app-muted); }
.cm-host {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  background: var(--app-bg);
}
.cm-host :deep(.cm-editor) {
  width: min(100%, var(--editor-page-width));
  min-height: 100%;
  margin: 0 auto;
}
/* 源码编辑面留白：上下更舒展，正文与行号之间有呼吸感 */
.cm-host :deep(.cm-content) {
  padding: 14px 0 56px;
}
.cm-host :deep(.cm-line) {
  padding-left: 14px;
  padding-right: 16px;
}
/* 行号 gutter：去掉生硬竖线，数字弱化、留白 */
.cm-host :deep(.cm-gutters) {
  border-right: none;
  background: transparent;
}
.cm-host :deep(.cm-lineNumbers .cm-gutterElement) {
  padding: 0 10px 0 14px;
  color: color-mix(in srgb, var(--app-muted) 55%, transparent);
}

:deep(.cm-slide-page-marker) {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 14px 18px 10px 0;
  color: var(--app-muted);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.02em;
  white-space: nowrap;
  pointer-events: none;
}
:deep(.cm-slide-page-marker::before),
:deep(.cm-slide-page-marker::after) {
  content: '';
  height: 1px;
  flex: 1;
  background: color-mix(in srgb, var(--app-primary-color) 26%, var(--app-border));
}
:deep(.cm-slide-page-marker span) {
  flex: 0 0 auto;
  padding: 3px 8px;
  border: 1px solid color-mix(in srgb, var(--app-primary-color) 24%, var(--app-border));
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-primary-color) 7%, var(--app-bg));
  color: color-mix(in srgb, var(--app-primary-color) 80%, var(--app-fg));
}
:deep(.cm-slide-page-actions) {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  pointer-events: auto;
}
:deep(.cm-slide-page-actions button) {
  height: 24px;
  min-width: 34px;
  padding: 0 8px;
  border: 1px solid color-mix(in srgb, var(--app-border) 84%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-bg) 92%, var(--app-panel-bg));
  color: color-mix(in srgb, var(--app-fg) 80%, var(--app-muted));
  font: inherit;
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
  cursor: pointer;
}
:deep(.cm-slide-page-actions button:hover) {
  color: var(--app-primary-color);
  border-color: color-mix(in srgb, var(--app-primary-color) 46%, var(--app-border));
  background: color-mix(in srgb, var(--app-primary-color) 8%, var(--app-bg));
}
:deep(.cm-slide-page-actions button.danger:hover) {
  color: #b42318;
  border-color: color-mix(in srgb, #f04438 48%, var(--app-border));
  background: color-mix(in srgb, #f04438 8%, var(--app-bg));
}
:deep(.cm-dim-line) {
  opacity: 0.32;
  transition: opacity 0.2s ease;
}
/* U3：frontmatter（--- … ---）卡片样式 */
:deep(.cm-frontmatter) {
  background: color-mix(in srgb, var(--app-primary-color) 5%, var(--app-bg));
  border-left: 1px solid color-mix(in srgb, var(--app-primary-color) 22%, var(--app-border));
  border-right: 1px solid color-mix(in srgb, var(--app-primary-color) 22%, var(--app-border));
}
:deep(.cm-frontmatter-top) {
  border-top: 1px solid color-mix(in srgb, var(--app-primary-color) 22%, var(--app-border));
  border-top-left-radius: 10px;
  border-top-right-radius: 10px;
  margin-top: 6px;
}
:deep(.cm-frontmatter-bottom) {
  border-bottom: 1px solid color-mix(in srgb, var(--app-primary-color) 22%, var(--app-border));
  border-bottom-left-radius: 10px;
  border-bottom-right-radius: 10px;
}
/* 数学公式 $…$ / $$…$$：定界符走 mark 灰，公式体走等宽强调色（与行内代码同档） */
:deep(.cm-math-delim) {
  color: color-mix(in srgb, var(--app-primary-color) 60%, var(--app-muted));
  font-weight: 700;
}
:deep(.cm-math) {
  color: color-mix(in srgb, var(--app-primary-color) 82%, var(--app-fg));
  font-style: italic;
}
:deep(.cm-slide-break-line) {
  color: color-mix(in srgb, var(--app-primary-color) 58%, var(--app-muted));
  background: color-mix(in srgb, var(--app-primary-color) 5%, transparent);
}
:deep(.cm-link-diagnostic) {
  text-decoration-line: underline;
  text-decoration-style: wavy;
  text-decoration-thickness: 1.2px;
  text-underline-offset: 3px;
}
:deep(.cm-link-diagnostic-error) { text-decoration-color: #d92d20; }
:deep(.cm-link-diagnostic-warning) { text-decoration-color: #dc7b0a; }
:deep(.cm-link-diagnostic-info) { text-decoration-color: #1570ef; }

/* 搜索/替换跟随当前编辑行，避免固定占据顶部空间。 */
:deep(.cm-panels) {
  border: 0;
  background: transparent;
}
:deep(.floating-search-panel) {
  position: fixed;
  z-index: calc(var(--z-dropdown) + 3);
  display: grid;
  gap: 5px;
  width: min(520px, calc(100vw - 16px));
  box-sizing: border-box;
  padding: 7px;
  border: 1px solid color-mix(in srgb, var(--app-control-border) 90%, transparent);
  border-radius: 13px;
  background: color-mix(in srgb, var(--app-menu-bg) 96%, transparent);
  color: var(--app-fg);
  box-shadow: 0 18px 46px color-mix(in srgb, #000 22%, transparent), 0 1px 0 color-mix(in srgb, #fff 40%, transparent) inset;
  backdrop-filter: blur(18px) saturate(1.15);
  font: 500 12px/1.2 var(--app-font-family, system-ui, sans-serif);
}
:deep(.floating-search-row) {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}
:deep(.floating-search-input) {
  flex: 1 1 auto;
  min-width: 80px;
  height: 32px;
  box-sizing: border-box;
  padding: 0 10px;
  border: 1px solid var(--app-control-border);
  border-radius: 8px;
  outline: 0;
  background: color-mix(in srgb, var(--app-control-bg) 94%, transparent);
  color: var(--app-fg);
  font: inherit;
}
:deep(.floating-search-input:focus) {
  border-color: var(--app-primary-color);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--app-primary-color) 13%, transparent);
}
:deep(.floating-search-icon),
:deep(.floating-search-action) {
  flex: 0 0 auto;
  height: 30px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--app-fg-soft);
  font: 700 11px/1 var(--app-font-family, system-ui, sans-serif);
  cursor: pointer;
}
:deep(.floating-search-icon) { width: 30px; padding: 0; font-size: 14px; }
:deep(.floating-search-action) {
  padding: 0 10px;
  border-color: color-mix(in srgb, var(--app-primary-color) 26%, var(--app-control-border));
  color: var(--app-primary-color);
  background: color-mix(in srgb, var(--app-primary-color) 7%, transparent);
}
:deep(.floating-search-icon:hover),
:deep(.floating-search-action:hover) {
  color: var(--app-primary-color);
  background: var(--app-hover);
}
:deep(.floating-search-icon.close) { color: var(--app-muted); font-size: 18px; font-weight: 400; }
:deep(.floating-search-options) {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 1px 2px 0;
}
:deep(.floating-search-options[hidden]) { display: none; }
:deep(.floating-search-options label) {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 7px;
  border-radius: 999px;
  color: var(--app-muted);
  font-size: 10.5px;
  font-weight: 650;
  cursor: pointer;
}
:deep(.floating-search-options label:hover) { color: var(--app-fg); background: var(--app-hover); }
:deep(.floating-search-options input) { margin: 0; accent-color: var(--app-primary-color); }
:deep(.cm-searchMatch) {
  border-radius: 3px;
  background: color-mix(in srgb, #f4c430 38%, transparent) !important;
  outline: 1px solid color-mix(in srgb, #d99b00 24%, transparent);
}
:deep(.cm-searchMatch-selected) {
  background: color-mix(in srgb, var(--app-primary-color) 28%, transparent) !important;
  outline-color: color-mix(in srgb, var(--app-primary-color) 55%, transparent);
}
@media (max-width: 620px) {
  .floating-editor-tools {
    top: auto !important;
    bottom: 8px;
    left: 8px !important;
    width: calc(100vw - 16px);
  }
  .floating-editor-tools::after { display: none; }
  :deep(.floating-search-panel) { width: calc(100vw - 16px); }
  :deep(.floating-search-row.replace) { flex-wrap: wrap; }
}
</style>

<style>
/* 全局 tooltip（Teleport 到 body，不能 scoped） */
.float-tip {
  position: fixed;
  transform: translate(-50%, -100%);
  padding: 5px 10px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  color: #fff;
  background: color-mix(in srgb, var(--app-fg) 88%, #000);
  border-radius: 6px;
  pointer-events: none;
  z-index: 9999;
  box-shadow: 0 4px 14px rgba(0,0,0,0.18);
}
.float-tip::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 4px solid transparent;
  border-top-color: color-mix(in srgb, var(--app-fg) 88%, #000);
}
/* 翻到按钮下方时：整体向下偏移，箭头改为指向上方 */
.float-tip.below {
  transform: translate(-50%, 0);
}
.float-tip.below::after {
  top: auto;
  bottom: 100%;
  border-top-color: transparent;
  border-bottom-color: color-mix(in srgb, var(--app-fg) 88%, #000);
}
</style>
