<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, nextTick, watch } from 'vue'
import { useThemeStore } from '../stores/theme'
import { getDarkVariant } from '../core/themes/compose'
import { useUiStore } from '../stores/ui'
import { useDocumentStore } from '../stores/document'
import ThemePicker from './ThemePicker.vue'
import TopSettingsControls from './TopSettingsControls.vue'
import ExportPreview from './ExportPreview.vue'
import ModeControls from './ModeControls.vue'
import Icon from './Icon.vue'
import AppLogo from './AppLogo.vue'
import { useDialog } from '../composables/useDialog'
import { PAPER_SIZES, SLIDE_RATIOS, LINE_HEIGHTS, paperPadding } from '../core/paper'
import { safeFilename } from '../core/export/filename'
import { APP_BRAND } from '../config/brand'
import { useI18n } from 'vue-i18n'
import DocumentSavePopover from './DocumentSavePopover.vue'

const theme = useThemeStore()
const ui = useUiStore()
const doc = useDocumentStore()
const dialog = useDialog()
const { t } = useI18n({ useScope: 'global' })

// ---- 自动保存指示：记录最近一次保存完成的时间，呈现「已自动保存 HH:MM:SS」 ----
const lastSavedAt = ref<string>('')
function stampSaved() {
  lastSavedAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
}
watch(() => doc.saving, (now, prev) => { if (prev && !now) stampSaved() })
const saveIndicator = computed(() => {
  if (doc.saving) return t('editor.saving')
  if (lastSavedAt.value) return t('editor.savedAt', { time: lastSavedAt.value })
  return ui.autoSave ? t('editor.autoOn') : t('editor.autoOff')
})

// ---- 文档保存弹层（O2：Name / Tags / Where，取代标题栏文件切换） ----
const savePopoverOpen = ref(false)
const savePopoverAnchor = ref<DOMRect | null>(null)
function openSavePopover(e: MouseEvent) {
  const el = e.currentTarget as HTMLElement
  savePopoverAnchor.value = el.getBoundingClientRect()
  savePopoverOpen.value = true
}
function closeSavePopover() {
  savePopoverOpen.value = false
  savePopoverAnchor.value = null
}

// ---- 打开文件（命令面板；侧栏列表仍可切换） ----
function openFiles() {
  window.dispatchEvent(new CustomEvent('morph:open-files'))
}

// ---- 演示：切到 PPT、仅预览，并对幻灯片区请求全屏 ----
async function present() {
  ui.setMode('slide')
  ui.setSourceHidden(true)
  await nextTick()
  const el = (document.querySelector('.ppt-wrapper') ?? document.querySelector('.slide-pane')) as HTMLElement | null
  try { await (el ?? document.documentElement).requestFullscreen() } catch { /* 用户取消或不支持，忽略 */ }
}

// ---- 「⋯」更多菜单 ----
const moreOpen = ref(false)
const moreMenu = ref<HTMLElement | null>(null)
function openHelp() {
  window.dispatchEvent(new CustomEvent('morph:open-help'))
}
function openVersions() {
  moreOpen.value = false
  window.dispatchEvent(new CustomEvent('morph:open-versions'))
}
function saveSnapshot() {
  moreOpen.value = false
  window.dispatchEvent(new CustomEvent('morph:save'))
}

// ---- 导出 ----
type ExportKind = 'markdown' | 'html' | 'pdf' | 'pptx' | 'docx' | 'docx2' | 'handout' | 'vector-pdf' | 'wechat' | 'long-image' | 'zhihu' | 'slide-png'
interface ExportOption { kind: ExportKind; label: string; hint: string }
interface ExportGroup { label: string; items: ExportOption[] }
const busy = ref<string | null>(null)
const progress = ref({ current: 0, total: 0 })
const exportOpen = ref(false)
const exportMenu = ref<HTMLElement | null>(null)

// 分组：文档 / 分享 / 幻灯片（仅幻灯片模式显示后者）
const exportGroups = computed<ExportGroup[]>(() => {
  const paper = PAPER_SIZES[ui.paperSize].label
  const groups: ExportGroup[] = [
    {
      label: t('toolbar.groups.document'),
      items: [
        { kind: 'markdown', label: t('toolbar.saveAsMd'), hint: t('toolbar.saveAsMdHint') },
        { kind: 'html', label: t('toolbar.html'), hint: ui.mode === 'slide' ? '16:9' : paper },
        { kind: 'pdf', label: t('toolbar.pdf'), hint: ui.mode === 'slide' ? '16:9' : paper },
        { kind: 'vector-pdf', label: t('toolbar.vectorPdf'), hint: 'SVG / text' },
        { kind: 'docx', label: t('toolbar.word'), hint: ui.mode === 'slide' ? 'Slides' : paper },
        { kind: 'docx2', label: t('toolbar.structuredWord'), hint: 'docx.js' },
      ],
    },
    {
      label: t('toolbar.groups.share'),
      items: [
        { kind: 'wechat', label: t('toolbar.wechat'), hint: 'inline CSS' },
        { kind: 'zhihu', label: t('toolbar.zhihu'), hint: 'HTML' },
        { kind: 'long-image', label: t('toolbar.longImage'), hint: '750px' },
      ],
    },
  ]
  if (ui.mode === 'slide') {
    groups.push({
      label: t('toolbar.groups.slides'),
      items: [
        { kind: 'slide-png', label: t('toolbar.currentPng'), hint: 'PNG' },
        { kind: 'pptx', label: t('toolbar.pptx'), hint: '16:9' },
        { kind: 'handout', label: t('toolbar.handout'), hint: 'Slides + notes' },
      ],
    })
  }
  return groups
})

// Word 模板选择（替代原 window.prompt）。取消返回 null。
const templateOptions = computed(() => [
  { label: t('toolbar.wordTemplates.default'), value: 'default', hint: t('toolbar.wordTemplates.defaultHint') },
  { label: t('toolbar.wordTemplates.official'), value: 'official', hint: t('toolbar.wordTemplates.officialHint') },
  { label: t('toolbar.wordTemplates.academic'), value: 'academic', hint: t('toolbar.wordTemplates.academicHint') },
  { label: t('toolbar.wordTemplates.minimal'), value: 'minimal', hint: t('toolbar.wordTemplates.minimalHint') },
])
async function pickTemplate(): Promise<string | null> {
  return dialog.select({ title: t('toolbar.wordTemplateTitle'), options: templateOptions.value, cancelText: t('common.cancel') })
}

// X1: 导出预览状态。复制类（公众号/知乎）确认按钮为「复制」、不显示文件名。
const COPY_KINDS = new Set<ExportKind>(['wechat', 'zhihu'])
// kind → 真实文件扩展名（safeFilename 第二参即扩展名，不能直接传 kind）
const KIND_EXT: Record<ExportKind, string> = {
  markdown: 'md',
  html: 'html', pdf: 'pdf', 'vector-pdf': 'pdf', docx: 'docx', docx2: 'docx',
  pptx: 'pptx', handout: 'docx', 'long-image': 'png', wechat: 'html', zhihu: 'html', 'slide-png': 'png',
}
const preview = ref<null | {
  kind: ExportKind; label: string; confirmLabel: string; showName: boolean; defaultName: string; summary: string
}>(null)

function findOption(kind: ExportKind): ExportOption | undefined {
  for (const g of exportGroups.value) { const it = g.items.find((i) => i.kind === kind); if (it) return it }
  return undefined
}

// 入口：开了导出预览则先弹预览，否则直接导出（老行为）
function onExportClick(kind: ExportKind) {
  exportOpen.value = false
  if (busy.value) return
  if (kind === 'slide-png' || kind === 'markdown') { void doExport(kind); return }
  if (!ui.exportPreview) { void doExport(kind); return }
  const opt = findOption(kind)
  preview.value = {
    kind,
    label: opt?.label ?? kind,
    confirmLabel: COPY_KINDS.has(kind) ? t('toolbar.copy') : t('toolbar.download'),
    showName: !COPY_KINDS.has(kind),
    defaultName: safeFilename(doc.title, KIND_EXT[kind]),
    summary: opt?.hint ?? '',
  }
}

function onPreviewConfirm(filename: string) {
  const kind = preview.value?.kind
  preview.value = null
  if (kind) void doExport(kind, filename)
}

async function doExport(kind: ExportKind, fnameOverride?: string) {
  if (busy.value) return
  exportOpen.value = false
  busy.value = kind
  try {
    const slideMode = ui.mode === 'slide'
    const dims = SLIDE_RATIOS[ui.slideRatio]
    const htmlOpts = { padding: paperPadding(ui.paperSize, ui.paperMargin), lineHeight: LINE_HEIGHTS[ui.lineHeight].value }
    const onProgress = (current: number, total: number) => { progress.value = { current, total } }
    const pdfOpts = { lineHeight: ui.lineHeight, paperMargin: ui.paperMargin, onProgress }
    const fname = fnameOverride || safeFilename(doc.title, kind)
    if (kind === 'markdown') {
      // O2：另存为本地 .md（saveFile 内部已处理 Tauri 原生「另存为…」与浏览器下载两条路径）
      const { saveFile } = await import('../core/export/save')
      await saveFile(fname, new Blob([doc.markdown], { type: 'text/markdown;charset=utf-8' }))
    } else if (kind === 'html') {
      const { exportHtml } = await import('../core/export/html')
      const darkTheme = getDarkVariant(theme.tokens)
      await exportHtml(doc.markdown, theme.tokens, ui.mode, ui.paperSize, { ...(slideMode ? { dims } : htmlOpts), darkTheme: darkTheme ?? undefined }, fname)
    } else if (kind === 'docx') {
      const template = await pickTemplate()
      if (template === null) return // 用户取消
      const { exportDocx } = await import('../core/export/docx')
      await exportDocx(doc.markdown, theme.tokens, ui.mode, dims, fname, template as any)
    } else if (kind === 'docx2') {
      const template = await pickTemplate()
      if (template === null) return
      const { exportDocxStructured } = await import('../core/export/docx2')
      await exportDocxStructured(doc.markdown, theme.tokens, fname, template as any)
    } else if (kind === 'pdf') {
      if (slideMode) {
        const { exportPdfHiFi } = await import('../core/export/slides-hifi')
        await exportPdfHiFi(doc.markdown, theme.tokens, dims, fname)
      } else {
        const { exportPdf } = await import('../core/export/pdf')
        await exportPdf(doc.markdown, theme.tokens, ui.mode, ui.paperSize, pdfOpts, fname)
      }
    } else if (kind === 'handout') {
      const { exportHandout } = await import('../core/export/handout')
      await exportHandout(doc.markdown, theme.tokens, dims, fname.replace(/\.\w+$/, '.docx'))
    } else if (kind === 'vector-pdf') {
      const { exportVectorPdf } = await import('../core/export/vector-pdf')
      await exportVectorPdf(doc.markdown, theme.tokens, ui.paperSize, { paperMargin: ui.paperMargin, lineHeight: ui.lineHeight })
    } else if (kind === 'wechat') {
      const { copyForWechat } = await import('../core/export/wechat')
      const ok = await copyForWechat(doc.markdown, theme.tokens)
      if (ok) await dialog.alert({ title: t('toolbar.copied'), message: t('toolbar.wechatCopied') })
    } else if (kind === 'long-image') {
      const { exportLongImage } = await import('../core/export/long-image')
      await exportLongImage(doc.markdown, theme.tokens, fnameOverride || safeFilename(doc.title, 'png'))
    } else if (kind === 'zhihu') {
      const { copyForZhihu } = await import('../core/export/zhihu')
      const ok = await copyForZhihu(doc.markdown, theme.tokens)
      if (ok) await dialog.alert({ title: t('toolbar.copied'), message: t('toolbar.zhihuCopied') })
    } else if (kind === 'slide-png') {
      await new Promise<void>((resolve, reject) => {
        window.dispatchEvent(new CustomEvent('morph:export-slide-png', { detail: { resolve, reject } }))
      })
    } else {
      if (slideMode) {
        const { exportPptxHiFi } = await import('../core/export/slides-hifi')
        await exportPptxHiFi(doc.markdown, theme.tokens, dims, fname, onProgress)
      } else {
        await dialog.alert({
          title: t('toolbar.pptxUnsupportedTitle'),
          message: t('toolbar.pptxUnsupportedMessage'),
        })
      }
    }
  } catch (e) {
    const { handleError } = await import('../core/errors')
    const err = handleError(e)
    await dialog.alert({
      title: err.title,
      message: err.suggestion ? `${err.message}\n\n${t('toolbar.errorSuggestion', { suggestion: err.suggestion })}` : err.message,
      tone: 'danger',
    })
  } finally {
    busy.value = null
    progress.value = { current: 0, total: 0 }
  }
}

function onGlobalPointerDown(e: PointerEvent) {
  const t = e.target as Node
  if (!exportMenu.value?.contains(t)) exportOpen.value = false
  if (!moreMenu.value?.contains(t)) moreOpen.value = false
}
onMounted(() => window.addEventListener('pointerdown', onGlobalPointerDown))
onBeforeUnmount(() => window.removeEventListener('pointerdown', onGlobalPointerDown))
</script>

<template>
  <header class="toolbar">
    <div v-if="busy && progress.total > 0" class="export-progress">
      <div class="export-progress-bar" :style="{ width: (progress.current / progress.total * 100) + '%' }"></div>
      <span class="export-progress-text">{{ progress.current }} / {{ progress.total }}</span>
    </div>
    <div class="toolbar-identity">
      <span class="brand">
        <AppLogo :size="30" />
        <span class="brand-name">
          <span class="cn">{{ APP_BRAND.shortName }} <span class="en">{{ APP_BRAND.englishName }}</span></span>
          <span class="tagline">{{ APP_BRAND.tagline }}</span>
        </span>
      </span>
      <span class="title-sep"></span>
      <button class="doc-title-btn" type="button" :title="t('savePopover.save')" @click="openSavePopover">
        <Icon name="file" :size="14" />
        <span class="doc-title-text">{{ doc.title || t('documentStore.untitled') }}</span>
        <Icon name="chevron-down" :size="12" class="doc-title-chevron" />
      </button>
    </div>
    <!-- identity 弹性占满左侧，标题尽量显示完整；模式组与动作组固定在右侧 -->
    <div class="view-controls">
      <ModeControls />
    </div>
    <div class="toolbar-actions">
      <ThemePicker />
      <TopSettingsControls />
      <button class="tb tb-icon" :title="t('common.help')" @click="openHelp"><Icon name="help" :size="15" /></button>
      <div class="exports" ref="exportMenu">
        <button
          class="tb"
          :class="{ on: exportOpen }"
          :disabled="!!busy"
          :title="busy ? t('toolbar.exporting') : t('toolbar.export')"
          @click="exportOpen = !exportOpen"
        >
          <Icon name="download" :size="14" />
          <span class="tb-label">{{ busy ? t('toolbar.exporting') : t('toolbar.export') }}</span>
          <Icon class="chevron" name="chevron-down" :size="12" />
        </button>
        <div v-if="exportOpen" class="export-menu">
          <div v-for="group in exportGroups" :key="group.label" class="export-group">
            <div class="export-group-label">{{ group.label }}</div>
            <button
              v-for="item in group.items"
              :key="item.kind"
              :disabled="!!busy"
              @click="onExportClick(item.kind)"
            >
              <strong>{{ item.label }}</strong>
              <span>{{ item.hint }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
    <ExportPreview
      v-if="preview"
      :kind="preview.kind"
      :label="preview.label"
      :confirm-label="preview.confirmLabel"
      :show-name="preview.showName"
      :markdown="doc.markdown"
      :tokens="theme.tokens"
      :slide-mode="ui.mode === 'slide'"
      :default-name="preview.defaultName"
      :summary="preview.summary"
      @confirm="onPreviewConfirm"
      @cancel="preview = null"
    />
    <DocumentSavePopover
      v-if="savePopoverOpen && savePopoverAnchor"
      :anchor="savePopoverAnchor"
      @close="closeSavePopover"
    />
  </header>
</template>

<style scoped>
.export-progress {
  position: absolute; top: 0; left: 0; right: 0; height: 3px;
  background: color-mix(in srgb, var(--app-primary-color) 15%, transparent);
  z-index: 10;
}
.export-progress-bar {
  height: 100%; background: var(--app-primary-color);
  transition: width 0.2s ease;
}
.export-progress-text {
  position: absolute; top: 4px; right: 8px;
  font-size: 11px; color: var(--app-muted); font-weight: 600;
}
.toolbar-identity {
  display: flex;
  align-items: center;
  gap: 12px;
  /* 弹性占满品牌与右侧控件之间的空间，让标题尽量完整显示 */
  flex: 1 1 auto;
  min-width: 0;
  padding: 3px 6px 3px 3px;
  border-radius: 12px;
}
.brand {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  min-width: max-content;
}
.brand-name {
  display: flex;
  flex-direction: column;
  justify-content: center;
  height: 34px;
  line-height: 1.15;
  gap: 2px;
}
.brand-name .cn {
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 0.01em;
  color: var(--app-fg);
}
.brand-name .cn .en {
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.01em;
  color: var(--app-fg);
}
.brand-name .tagline {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--app-muted);
  white-space: nowrap;
}
.title-sep {
  width: 1px;
  height: 20px;
  background: color-mix(in srgb, var(--app-border) 70%, transparent);
}
.doc-title-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 1 1 auto;
  min-width: 0;
  padding: 4px 8px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: none;
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  color: var(--app-fg);
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease;
}
.doc-title-btn:hover {
  background: var(--app-hover);
  border-color: color-mix(in srgb, var(--app-border) 70%, transparent);
}
.doc-title-chevron { color: var(--app-muted); flex: 0 0 auto; }
.doc-title-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.title-edit-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: 0;
  background: none;
  color: var(--app-muted);
  cursor: pointer;
  border-radius: 4px;
  opacity: 0;
  transition: opacity 0.12s ease, color 0.12s ease;
}
.doc-title:hover .title-edit-btn { opacity: 1; }
.title-edit-btn:hover { color: var(--app-primary-color); }
.title-input {
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  padding: 3px 8px;
  border: 1px solid var(--app-primary-color);
  border-radius: 6px;
  background: var(--app-bg);
  color: var(--app-fg);
  outline: none;
  width: 180px;
}
.spacer { flex: 1; }
.view-controls {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  flex: 0 1 auto;
}
.toolbar-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
  padding: 4px;
  border-radius: var(--radius-full);
  border: 1px solid var(--app-control-border);
  background: var(--app-control-bg);
  box-shadow: var(--shadow-sm), 0 1px 0 var(--app-edge) inset;
}
.tb {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  line-height: 1;
  height: 32px;
  padding: 0 11px;
  cursor: pointer;
  border: 1px solid transparent;
  background: transparent;
  color: var(--app-fg-soft);
  border-radius: var(--radius-full);
  box-shadow: none;
  transition: background var(--transition-fast), color var(--transition-fast), box-shadow var(--transition-fast);
}
.tb:hover, .tb.on {
  color: var(--app-primary-color);
  background: var(--app-hover);
}
.tb:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--app-ring);
}
/* 导出＝主操作：实心主色按钮，做视觉锚点 */
.tb-primary {
  color: #fff;
  background: var(--app-primary-color);
  box-shadow: 0 1px 2px color-mix(in srgb, var(--app-primary-color) 40%, transparent);
}
.tb-primary .chevron { color: color-mix(in srgb, #fff 75%, transparent); }
.tb-primary:hover, .tb-primary.on {
  color: #fff;
  background: color-mix(in srgb, var(--app-primary-color) 88%, #000);
}
.tb:disabled { opacity: 0.55; cursor: default; }
.chevron { color: color-mix(in srgb, var(--app-muted) 82%, var(--app-fg)); }
.exports {
  position: relative;
  display: flex;
}
.export-menu {
  position: absolute;
  z-index: calc(var(--z-toolbar-menu) + 1);
  right: 0;
  top: calc(100% + 8px);
  width: 210px;
  max-height: 70vh;
  overflow-y: auto;
  padding: 6px;
  border: 1px solid var(--app-hairline);
  border-radius: var(--radius-xl);
  background: var(--app-menu-bg);
  box-shadow: var(--shadow-lg);
}
.export-group + .export-group {
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px solid color-mix(in srgb, var(--app-border) 55%, transparent);
}
.export-group-label {
  padding: 5px 10px 3px;
  font-size: 11px;
  font-weight: 750;
  color: var(--app-muted);
  letter-spacing: 0.03em;
}
.export-menu button {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 10px;
  border-radius: 8px;
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  line-height: 1;
  cursor: pointer;
  border: 1px solid transparent;
  background: transparent;
  color: var(--app-fg);
  text-align: left;
  box-shadow: none;
  transition: background 0.12s ease, color 0.12s ease;
}
.export-menu button + button { margin-top: 2px; }
.export-menu button:hover {
  background: var(--app-hover);
  color: var(--app-primary-color);
}
.export-menu strong { font-size: 12px; }
.export-menu span {
  min-width: 0;
  color: var(--app-muted);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
.export-menu button:disabled { opacity: 0.5; cursor: default; }
.field {
  font-size: 12px;
  font-weight: 650;
  color: var(--app-muted);
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: max-content;
  padding-left: 5px;
}
.field-label {
  color: var(--app-muted);
  font-size: 11px;
  font-weight: 750;
}

.tb-label { white-space: nowrap; }

/* 文档名右侧的「切换文档」下拉箭头 */
.title-switch-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: 0;
  background: none;
  color: var(--app-muted);
  cursor: pointer;
  border-radius: 5px;
  transition: color 0.12s ease, background 0.12s ease;
}
.title-switch-btn:hover {
  color: var(--app-primary-color);
  background: var(--app-hover);
}

/* 自动保存指示：弱化的圆点 + 文案 */
.save-indicator {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  margin-left: 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--app-muted);
  white-space: nowrap;
}
.save-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: color-mix(in srgb, #16a34a 70%, transparent);
}
.save-indicator.busy { color: var(--app-primary-color); }
.save-indicator.busy .save-dot {
  background: var(--app-primary-color);
  animation: save-pulse 1s ease-in-out infinite;
}
@keyframes save-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}

/* 纯图标按钮（⋯ 更多） */
.tb-icon { padding: 0; width: 32px; justify-content: center; }

/* 「⋯」更多菜单 */
.more { position: relative; display: flex; }
.more-menu {
  position: absolute;
  z-index: calc(var(--z-toolbar-menu) + 1);
  right: 0;
  top: calc(100% + 8px);
  min-width: 168px;
  padding: 6px;
  border: 1px solid var(--app-hairline);
  border-radius: var(--radius-xl);
  background: var(--app-menu-bg);
  box-shadow: var(--shadow-lg);
}
.more-menu button {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 8px;
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  line-height: 1;
  cursor: pointer;
  border: 1px solid transparent;
  background: transparent;
  color: var(--app-fg);
  text-align: left;
  transition: background 0.12s ease, color 0.12s ease;
}
.more-menu button + button { margin-top: 2px; }
.more-menu button:hover {
  background: var(--app-hover);
  color: var(--app-primary-color);
}
.more-menu button span { flex: 1 1 auto; }
.more-menu kbd {
  flex: 0 0 auto;
  font: inherit; font-size: 10px; font-weight: 700;
  color: var(--app-muted);
  padding: 1px 5px; border-radius: 4px;
  background: color-mix(in srgb, var(--app-fg) 7%, transparent);
}
.more-sep {
  height: 1px; margin: 5px 4px;
  background: color-mix(in srgb, var(--app-border) 60%, transparent);
}

/* —— 桌面窗口自适应：从宽到窄逐档收纳，任何宽度都不溢出 —— */
/* ≤1180：动作按钮收为图标（导出/设置去文字），样式标签去掉 */
@media (max-width: 1180px) {
  .toolbar { gap: 10px; }
  .tb-label { display: none; }
  .tb { padding: 0 9px; }
  .field-label { display: none; }
  .field { padding-left: 2px; }
}
/* ≤1040：文档标题、品牌英文名、分隔线退场，给视图切换器让空间 */
@media (max-width: 1040px) {
  /* 标题保留并省略，而不是隐藏——尽量显示文档名 */
  .brand-name .en,
  .brand-name .tagline,
  .title-sep,
  .save-indicator { display: none; }
  .toolbar-identity { gap: 8px; }
}
/* ≤860：品牌只留 logo，进一步压缩 */
@media (max-width: 860px) {
  .toolbar { padding: 9px 12px; gap: 8px; }
  .brand-name { display: none; }
}
</style>
