import { defineStore } from 'pinia'
import { PAPER_SIZES, SLIDE_RATIOS, MARGIN_PRESETS, LINE_HEIGHTS, type PaperSize, type PaperMargin, type LineHeightKey, type SlideRatio } from '../core/paper'
import { getString, getBool, getNumber, getEnum, setString, setBool, setNumber } from '../core/localStore'
import { SLIDE_SKINS } from '../core/slides/skins'

export type PreviewMode = 'document' | 'slide'
// 单一窗格状态：对照(编辑+预览) / 仅源码 / 仅预览。取代旧 editorMode。
export type PaneMode = 'split' | 'source' | 'preview'
export type SplitOrientation = 'horizontal' | 'vertical'
export type SidebarTab = 'docs' | 'outline'
export type SlideNavMode = 'thumbs' | 'outline'

const STORAGE_KEY = 'mddoc:mode'
const PANE_MODE_KEY = 'mddoc:pane-mode'
const SPLIT_ORIENT_KEY = 'mddoc:split-orient'
const PAPER_SIZE_KEY = 'mddoc:paper-size'
const PAPER_MARGIN_KEY = 'mddoc:paper-margin'
const LINE_HEIGHT_KEY = 'mddoc:line-height'
const SLIDE_RATIO_KEY = 'mddoc:slide-ratio'
const SIDEBAR_WIDTH_KEY = 'mddoc:sidebar-width'
const EDITOR_RATIO_KEY = 'mddoc:editor-ratio'
const SLIDE_NAV_MODE_KEY = 'mddoc:slide-nav-mode'
const SLIDE_THUMB_HEIGHT_KEY = 'mddoc:slide-thumb-height'
const SLIDE_THUMB_COLLAPSED_KEY = 'mddoc:slide-thumb-collapsed'
const SLIDE_PREVIEW_ZOOM_KEY = 'mddoc:slide-preview-zoom'
const SLIDE_ANIMATION_KEY = 'mddoc:slide-animation'
const EDITOR_TOOLBAR_PINNED_KEY = 'mddoc:editor-toolbar-pinned'
const DOC_PAGE_WIDTH_KEY = 'mddoc:doc-page-width'
const SIDEBAR_WIDTH_DEFAULT = 260
const EDITOR_RATIO_DEFAULT = 0.5

const PANE_MODES: Record<PaneMode, true> = { split: true, source: true, preview: true }
const SPLIT_ORIENTATIONS: Record<SplitOrientation, true> = { horizontal: true, vertical: true }

const PREVIEW_MODES: Record<PreviewMode, true> = { document: true, slide: true }
const SLIDE_NAV_MODES: Record<SlideNavMode, true> = { thumbs: true, outline: true }
const SLIDE_SKIN_IDS = new Set(['none', ...SLIDE_SKINS.map((s) => s.id)])

function loadCollapsed(): boolean {
  // 'mddoc:sidebar'：'0'=折叠，'1'/未设置=展开（与其它布尔反向，单独处理）
  return getString('mddoc:sidebar', '') === '0'
}

function loadSlideSkin(): string {
  const id = getString('mddoc:slide-skin', 'none')
  if (SLIDE_SKIN_IDS.has(id)) return id
  setString('mddoc:slide-skin', 'none')
  return 'none'
}

function normalizeSlideSkin(id: string): string {
  return SLIDE_SKIN_IDS.has(id) ? id : 'none'
}

export const useUiStore = defineStore('ui', {
  state: () => ({
    mode: getEnum<PreviewMode>(STORAGE_KEY, PREVIEW_MODES, 'document'),
    paneMode: getEnum<PaneMode>(PANE_MODE_KEY, PANE_MODES, 'split'),
    splitOrientation: getEnum<SplitOrientation>(SPLIT_ORIENT_KEY, SPLIT_ORIENTATIONS, 'horizontal'),
    paperSize: getEnum<PaperSize>(PAPER_SIZE_KEY, PAPER_SIZES, 'a4'),
    paperMargin: getEnum<PaperMargin>(PAPER_MARGIN_KEY, MARGIN_PRESETS, 'normal'),
    lineHeight: getEnum<LineHeightKey>(LINE_HEIGHT_KEY, LINE_HEIGHTS, 'normal'),
    slideRatio: getEnum<SlideRatio>(SLIDE_RATIO_KEY, SLIDE_RATIOS, '16:9'),
    previewZoom: getNumber('mddoc:preview-zoom', 1, 0.25, 3),
    // 适应宽度模式：开启后预览随可用宽度（含拖拽分栏）自动重算缩放，避免纸张被裁切遮挡。
    previewFit: getBool('mddoc:preview-fit', false),
    slidePreviewZoom: getNumber(SLIDE_PREVIEW_ZOOM_KEY, 1, 0.5, 2.5),
    docPageWidth: getNumber(DOC_PAGE_WIDTH_KEY, 860, 520, 1280),
    slideThumbHeight: getNumber(SLIDE_THUMB_HEIGHT_KEY, 88, 56, 180),
    slideThumbCollapsed: getBool(SLIDE_THUMB_COLLAPSED_KEY, false),
    paginate: getBool('mddoc:paginate', true),
    sidebarCollapsed: loadCollapsed(),
    sidebarWidth: getNumber(SIDEBAR_WIDTH_KEY, SIDEBAR_WIDTH_DEFAULT, 200, 420),
    editorRatio: getNumber(EDITOR_RATIO_KEY, EDITOR_RATIO_DEFAULT, 0.25, 0.75),
    sidebarTab: 'docs' as SidebarTab,
    slideNavMode: getEnum<SlideNavMode>(SLIDE_NAV_MODE_KEY, SLIDE_NAV_MODES, 'thumbs'),
    focusMode: getBool('mddoc:focus-mode', false),
    typewriter: getBool('mddoc:typewriter', false),
    // T5: 智能标点（--→— ...→…），默认关，中文输入不受干扰；英文写作可开
    smartPunctuation: getBool('mddoc:smart-punctuation', false),
    autoSave: getBool('mddoc:auto-save', true),
    // 编辑区 ↔ 预览区 同步滚动（页面模式对照态）
    syncScroll: getBool('mddoc:sync-scroll', true),
    // X1: 导出前预览（默认开），关闭则点导出直接落盘/复制（老行为）
    exportPreview: getBool('mddoc:export-preview', true),
    // 幻灯片视觉皮肤（POC）：'none'=跟随主题，或 SLIDE_SKINS 中的皮肤 id
    slideSkin: loadSlideSkin(),
    slideAnimation: getString(SLIDE_ANIMATION_KEY, 'none'),
    // 幻灯片引擎：'classic'=现有 reveal 皮肤；'slidev'=Slidev 应用内移植引擎。frontmatter `engine:` 优先。
    slideEngine: getString('mddoc:slide-engine', 'classic'),
    // Slidev 引擎的主题（default/seriph/apple-basic），仅 slidev 引擎生效
    slidevTheme: getString('mddoc:slidev-theme', 'default'),
    // 全局唯一工具条（源码 + 预览编辑共用）：固定在顶部 / 跟随焦点浮动在编辑处上方，两种模式
    editorToolbarPinned: getBool(EDITOR_TOOLBAR_PINNED_KEY, true),
    // 阅读/沉浸模式（不持久化）
    readingMode: false,
    _readingModeSavedPane: null as PaneMode | null,
    _readingModeSavedSidebar: null as boolean | null,
  }),
  getters: {
    // 顶栏只剩「页面/PPT」两态，等于 mode；源码/预览/对照由 paneMode + 分隔条折叠控制。
    workspaceView(): PreviewMode {
      return this.mode
    },
    isSourceHidden(): boolean {
      return this.paneMode === 'preview'
    },
    isPreviewHidden(): boolean {
      return this.paneMode === 'source'
    },
  },
  actions: {
    setSidebarTab(tab: SidebarTab) {
      this.sidebarTab = tab
    },
    setSlideNavMode(mode: SlideNavMode) {
      this.slideNavMode = mode
      setString(SLIDE_NAV_MODE_KEY, mode)
    },
    toggleFocusMode() {
      this.focusMode = !this.focusMode
      setBool('mddoc:focus-mode', this.focusMode)
    },
    toggleTypewriter() {
      this.typewriter = !this.typewriter
      setBool('mddoc:typewriter', this.typewriter)
    },
    toggleSmartPunctuation() {
      this.smartPunctuation = !this.smartPunctuation
      setBool('mddoc:smart-punctuation', this.smartPunctuation)
    },
    toggleExportPreview() {
      this.exportPreview = !this.exportPreview
      setBool('mddoc:export-preview', this.exportPreview)
    },
    setSlideSkin(id: string) {
      const normalized = normalizeSlideSkin(id)
      this.slideSkin = normalized
      setString('mddoc:slide-skin', normalized)
    },
    setSlideEngine(id: string) {
      this.slideEngine = id
      setString('mddoc:slide-engine', id)
    },
    setSlidevTheme(id: string) {
      this.slidevTheme = id
      setString('mddoc:slidev-theme', id)
    },
    setSlideAnimation(id: string) {
      this.slideAnimation = id
      setString(SLIDE_ANIMATION_KEY, id)
    },
    toggleAutoSave() {
      this.autoSave = !this.autoSave
      setBool('mddoc:auto-save', this.autoSave)
    },
    toggleSyncScroll() {
      this.syncScroll = !this.syncScroll
      setBool('mddoc:sync-scroll', this.syncScroll)
    },
    toggleEditorToolbarPinned() {
      this.editorToolbarPinned = !this.editorToolbarPinned
      setBool(EDITOR_TOOLBAR_PINNED_KEY, this.editorToolbarPinned)
    },
    setEditorToolbarPinned(pinned: boolean) {
      this.editorToolbarPinned = pinned
      setBool(EDITOR_TOOLBAR_PINNED_KEY, pinned)
    },
    setMode(m: PreviewMode) {
      this.mode = m
      setString(STORAGE_KEY, m)
    },
    setPaneMode(p: PaneMode) {
      this.paneMode = p
      setString(PANE_MODE_KEY, p)
    },
    setWorkspaceView(view: 'source' | 'document' | 'slide') {
      // 兼容旧入口（菜单/快捷键）：source=仅源码；document/slide=切顶栏模式并回到对照
      if (view === 'source') { this.setPaneMode('source'); return }
      this.setMode(view === 'slide' ? 'slide' : 'document')
    },
    setSourceHidden(hidden: boolean) {
      this.setPaneMode(hidden ? 'preview' : 'split')
    },
    setPreviewHidden(hidden: boolean) {
      this.setPaneMode(hidden ? 'source' : 'split')
    },
    setSplitOrientation(o: SplitOrientation) {
      this.splitOrientation = o
      setString(SPLIT_ORIENT_KEY, o)
    },
    setPaperSize(size: PaperSize) {
      this.paperSize = size
      this.docPageWidth = PAPER_SIZES[size].widthPx
      setString(PAPER_SIZE_KEY, size)
      setNumber(DOC_PAGE_WIDTH_KEY, this.docPageWidth)
    },
    setPaperMargin(m: PaperMargin) {
      this.paperMargin = m
      setString(PAPER_MARGIN_KEY, m)
    },
    setLineHeight(l: LineHeightKey) {
      this.lineHeight = l
      setString(LINE_HEIGHT_KEY, l)
    },
    setSlideRatio(r: SlideRatio) {
      this.slideRatio = r
      setString(SLIDE_RATIO_KEY, r)
    },
    setPreviewZoom(z: number, fromFit = false) {
      this.previewZoom = Math.min(3, Math.max(0.25, Math.round(z * 200) / 200))
      setNumber('mddoc:preview-zoom', this.previewZoom)
      // 手动改缩放即退出适应宽度模式；适应模式自身重算时传 fromFit 保留开关。
      if (!fromFit && this.previewFit) this.setPreviewFit(false)
    },
    setPreviewFit(on: boolean) {
      this.previewFit = on
      setBool('mddoc:preview-fit', on)
    },
    setSlidePreviewZoom(z: number) {
      this.slidePreviewZoom = Math.min(2.5, Math.max(0.5, Math.round(z * 200) / 200))
      setNumber(SLIDE_PREVIEW_ZOOM_KEY, this.slidePreviewZoom)
    },
    setDocPageWidth(width: number) {
      this.docPageWidth = Math.min(1280, Math.max(520, Math.round(width)))
      setNumber(DOC_PAGE_WIDTH_KEY, this.docPageWidth)
    },
    setSlideThumbHeight(height: number) {
      this.slideThumbHeight = Math.min(180, Math.max(56, Math.round(height)))
      setNumber(SLIDE_THUMB_HEIGHT_KEY, this.slideThumbHeight)
    },
    setSlideThumbCollapsed(collapsed: boolean) {
      this.slideThumbCollapsed = collapsed
      setBool(SLIDE_THUMB_COLLAPSED_KEY, collapsed)
    },
    setPaginate(on: boolean) {
      this.paginate = on
      setBool('mddoc:paginate', on)
    },
    toggleSidebar() {
      this.sidebarCollapsed = !this.sidebarCollapsed
      // 'mddoc:sidebar' 反向：'0'=折叠，'1'=展开
      setString('mddoc:sidebar', this.sidebarCollapsed ? '0' : '1')
    },
    setSidebarCollapsed(collapsed: boolean) {
      this.sidebarCollapsed = collapsed
      setString('mddoc:sidebar', collapsed ? '0' : '1')
    },
    setSidebarWidth(width: number) {
      this.sidebarWidth = Math.min(420, Math.max(200, Math.round(width)))
      setNumber(SIDEBAR_WIDTH_KEY, this.sidebarWidth)
    },
    enterReadingMode() {
      if (this.readingMode) return
      this._readingModeSavedPane = this.paneMode
      this._readingModeSavedSidebar = this.sidebarCollapsed
      this.readingMode = true
      this.setSidebarCollapsed(true)
      this.setPaneMode('preview')
    },
    exitReadingMode() {
      if (!this.readingMode) return
      this.readingMode = false
      if (this._readingModeSavedPane !== null) this.setPaneMode(this._readingModeSavedPane)
      if (this._readingModeSavedSidebar !== null) this.setSidebarCollapsed(this._readingModeSavedSidebar)
      this._readingModeSavedPane = null
      this._readingModeSavedSidebar = null
    },
    toggleReadingMode() {
      if (this.readingMode) this.exitReadingMode()
      else this.enterReadingMode()
    },
    setEditorRatio(ratio: number) {
      this.editorRatio = Math.min(0.75, Math.max(0.25, ratio))
      setNumber(EDITOR_RATIO_KEY, this.editorRatio)
    },
    resetLayout() {
      this.sidebarCollapsed = false
      this.slideThumbCollapsed = false
      this.sidebarWidth = SIDEBAR_WIDTH_DEFAULT
      this.editorRatio = EDITOR_RATIO_DEFAULT
      setString('mddoc:sidebar', '1')
      setBool(SLIDE_THUMB_COLLAPSED_KEY, false)
      setNumber(SIDEBAR_WIDTH_KEY, this.sidebarWidth)
      setNumber(EDITOR_RATIO_KEY, this.editorRatio)
    },
  },
})
