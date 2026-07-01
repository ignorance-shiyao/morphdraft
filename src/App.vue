<script setup lang="ts">
import { watch, onMounted, onBeforeUnmount, ref, computed, defineAsyncComponent } from 'vue'
import Toolbar from './components/Toolbar.vue'
import Sidebar from './components/Sidebar.vue'
import AppDialog from './components/AppDialog.vue'
import SettingsDialog from './components/SettingsDialog.vue'
import HelpDialog from './components/HelpDialog.vue'
import StatusBar from './components/StatusBar.vue'
import CommandPalette from './components/CommandPalette.vue'
import GlobalSearch from './components/GlobalSearch.vue'
import EditorPane from './components/EditorPane.vue'
import Icon from './components/Icon.vue'
import ImportProgressPanel from './components/ImportProgressPanel.vue'
import DocumentPreview from './components/preview/DocumentPreview.vue'
// 幻灯片预览（含 reveal.js）按需懒加载，不进首屏包
const SlidePreview = defineAsyncComponent(() => import('./components/preview/SlidePreview.vue'))
import { useDocumentStore } from './stores/document'
import { useThemeStore } from './stores/theme'
import { useUiStore } from './stores/ui'
import { useSettingsStore } from './stores/settings'
import { parseFrontmatter } from './core/markdown'
import { listen } from '@tauri-apps/api/event'
import { exportHtml } from './core/export/html'
import { exportPdf } from './core/export/pdf'
import { exportDocx } from './core/export/docx'
import { exportPptxHiFi } from './core/export/slides-hifi'
import { SLIDE_RATIOS } from './core/paper'
import { appShellClassForSkin } from './core/slides/skins'
import { useI18n } from 'vue-i18n'
import { useFileDropImport } from './composables/useFileDropImport'
import { useImportJobStore } from './stores/importJob'
import { useFileWatcher } from './composables/useFileWatcher'

const doc = useDocumentStore()
const theme = useThemeStore()
const ui = useUiStore()
const settings = useSettingsStore()
const workspace = ref<HTMLElement | null>(null)
const snapKind = ref<'sidebar' | 'source' | 'preview' | null>(null)
const appSkinClass = computed(() => appShellClassForSkin(ui.slideSkin))
const { t } = useI18n({ useScope: 'global' })
const fileDrop = useFileDropImport()
const importJob = useImportJobStore()
const fileWatcher = useFileWatcher()

// 命令面板：Cmd/Ctrl+Shift+P 命令、Cmd/Ctrl+P 文档切换
const paletteOpen = ref(false)
const paletteMode = ref<'commands' | 'files'>('commands')
function openPalette(mode: 'commands' | 'files') {
  paletteMode.value = mode
  paletteOpen.value = true
}
// 顶栏「切换文档」箭头通过 window 事件打开文件面板
function onOpenFiles() { openPalette('files') }
// R0b-2：全文搜索面板（命令面板 / 侧栏无结果出口经 window 事件打开，可带初始关键词）
const globalSearchOpen = ref(false)
const globalSearchQuery = ref('')
function onGlobalSearch(e: Event) {
  const q = (e as CustomEvent).detail
  globalSearchQuery.value = typeof q === 'string' ? q : ''
  globalSearchOpen.value = true
}
// 编辑区 ↔ 预览区 同步滚动由「按源码行」的 sync store 负责（EditorPane.onEditorScroll ↔
// DocumentPreview.reportPreviewScrollLine / scrollPreviewToLine）。此处不再做「按滚动比例」镜像：
// 两套机制并存会互相打架——比例镜像会把预览往回拽（分页预览与编辑器 scrollHeight 差异巨大时尤甚），
// 表现为「整页向下滚动被自动回弹到顶部」。统一交给按行同步，避免冲突。

// frontmatter 的 theme 只作为「没有用户主题偏好」时的文档默认；
// 一旦用户从工具栏/命令面板设置过主题，用户设置就是权威，并持久化跨重启生效。
const lastFmTheme = ref<string | null>(null)
function syncFrontmatterTheme() {
  const fm = parseFrontmatter(doc.markdown)
  const t = fm.theme ?? null
  if (t !== lastFmTheme.value) {
    lastFmTheme.value = t
    if (t && !theme.hasUserPreference) theme.applyDocumentTheme(t)
  }
}

// 全局快捷键：Cmd/Ctrl + S 存快照 / N 新建 / 1 文档 / 2 幻灯片 / \ 收起侧栏
function onKeydown(e: KeyboardEvent) {
  const mod = e.metaKey || e.ctrlKey
  if (!mod) return
  const k = e.key.toLowerCase()
  if (k === 'p') {
    e.preventDefault()
    openPalette(e.shiftKey ? 'commands' : 'files')
  } else if (k === 's') {
    e.preventDefault()
    // Cmd/Ctrl+Shift+S：另存为本地 .md（带原生「保存到…」位置选择；浏览器端走下载）
    // 普通 Cmd/Ctrl+S：保存快照
    if (e.shiftKey) {
      void (async () => {
        const { saveFile } = await import('./core/export/save')
        await saveFile(`${doc.title || 'untitled'}.md`, new Blob([doc.markdown], { type: 'text/markdown;charset=utf-8' }))
      })()
    } else {
      doc.snapshot()
    }
  } else if (k === 'n') {
    e.preventDefault()
    doc.newDoc()
  } else if (k === '1') {
    e.preventDefault()
    ui.setWorkspaceView('source')
  } else if (k === '2') {
    e.preventDefault()
    ui.setWorkspaceView('document')
  } else if (k === '3') {
    e.preventDefault()
    ui.setWorkspaceView('slide')
  } else if (k === '\\') {
    e.preventDefault()
    ui.toggleSidebar()
  }
}

onMounted(async () => {
  syncFrontmatterTheme()
  theme.apply()
  theme.initSystemTheme()
  settings.applyConfig()
  await doc.init()
  // R0b-1：vault 模式启动外部文件监听（init 后 backendKind 才确定）
  void fileWatcher.startWatching()
  if (ui.autoSave) doc.startAutoSnapshot()
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('morph:open-files', onOpenFiles)
  window.addEventListener('morph:global-search', onGlobalSearch)

  // M3-3: 原生菜单事件监听（仅 Tauri 桌面端）
  if ('__TAURI_INTERNALS__' in window) {
    listen<string>('menu-event', async (e) => {
      const id = e.payload
      switch (id) {
        case 'file_new': doc.newDoc(); break
        case 'file_open': {
          const { openLocalDocFile } = await import('./core/export/save')
          const src = await openLocalDocFile()
          if (src) void importJob.runBatch([src], { openFirst: true })
          break
        }
        case 'file_import_word': {
          const { openWordFile } = await import('./core/export/save')
          const file = await openWordFile()
          if (file) {
            const result = await doc.importWordFile(file)
            alert(t('app.importedWord', { title: result.title, count: result.imageCount }))
          }
          break
        }
        case 'file_import_notion': {
          const input = document.createElement('input')
          input.type = 'file'
          input.accept = '.zip'
          input.onchange = async () => {
            const file = input.files?.[0]
            if (file) {
              const result = await doc.importNotionZip(file)
              alert(t('app.importedNotion', { imported: result.imported, total: result.total }))
            }
          }
          input.click()
          break
        }
        case 'file_batch_export': {
          const { batchExportMd } = await import('./core/import/batch')
          await batchExportMd()
          break
        }
        case 'file_save': doc.snapshot(); break
        case 'file_save_as': {
          const { saveFile } = await import('./core/export/save')
          await saveFile(`${doc.title || 'untitled'}.md`, new Blob([doc.markdown], { type: 'text/markdown;charset=utf-8' }))
          break
        }
        case 'export_html': {
          const { exportHtml } = await import('./core/export/html')
          const dims = SLIDE_RATIOS[ui.slideRatio]
          const fname = `${doc.title || 'document'}.html`
          await exportHtml(doc.markdown, theme.tokens, ui.mode, ui.paperSize, ui.mode === 'slide' ? { dims } : {}, fname)
          break
        }
        case 'export_pdf': {
          const { exportPdf } = await import('./core/export/pdf')
          const fname = `${doc.title || 'document'}.pdf`
          await exportPdf(doc.markdown, theme.tokens, ui.mode, ui.paperSize, {}, fname)
          break
        }
        case 'export_vector_pdf': {
          const { exportVectorPdf } = await import('./core/export/vector-pdf')
          await exportVectorPdf(doc.markdown, theme.tokens, ui.paperSize)
          break
        }
        case 'export_wechat': {
          const { copyForWechat } = await import('./core/export/wechat')
          await copyForWechat(doc.markdown, theme.tokens)
          break
        }
        case 'export_long_image': {
          const { exportLongImage } = await import('./core/export/long-image')
          await exportLongImage(doc.markdown, theme.tokens)
          break
        }
        case 'export_zhihu': {
          const { copyForZhihu } = await import('./core/export/zhihu')
          await copyForZhihu(doc.markdown, theme.tokens)
          break
        }
        case 'export_word': {
          const { exportDocx } = await import('./core/export/docx')
          const dims = SLIDE_RATIOS[ui.slideRatio]
          const fname = `${doc.title || 'document'}.docx`
          await exportDocx(doc.markdown, theme.tokens, ui.mode, dims, fname)
          break
        }
        case 'export_pptx': {
          const { exportPptxHiFi } = await import('./core/export/slides-hifi')
          const dims = SLIDE_RATIOS[ui.slideRatio]
          const fname = `${doc.title || 'document'}.pptx`
          await exportPptxHiFi(doc.markdown, theme.tokens, dims, fname)
          break
        }
        case 'export_handout': {
          const { exportHandout } = await import('./core/export/handout')
          const dims = SLIDE_RATIOS[ui.slideRatio]
          const fname = `${doc.title || 'document'}.docx`
          await exportHandout(doc.markdown, theme.tokens, dims, fname)
          break
        }
        case 'edit_find': window.dispatchEvent(new CustomEvent('morph:editor-find')); break
        case 'edit_replace': window.dispatchEvent(new CustomEvent('morph:editor-replace')); break
        case 'view_source': ui.setWorkspaceView('source'); break
        case 'view_page': ui.setWorkspaceView('document'); break
        case 'view_split': ui.setWorkspaceView('document'); ui.setSourceHidden(false); break
        case 'view_ppt': ui.setWorkspaceView('slide'); ui.setSourceHidden(true); break
        case 'view_toggle_sidebar': ui.toggleSidebar(); break
        case 'help_shortcuts': window.dispatchEvent(new CustomEvent('morph:open-help')); break
        default: alert(t('app.unimplementedMenuCommand', { id }))
      }
    })
  }
})
// R0b-1：工作目录/后端变化 → 先停旧监听再按新条件启新，避免旧目录事件串台
watch(() => [settings.workDir, doc.backendKind], () => {
  fileWatcher.stopWatching()
  void fileWatcher.startWatching()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('morph:open-files', onOpenFiles)
  window.removeEventListener('morph:global-search', onGlobalSearch)
  doc.stopAutoSnapshot()
  fileWatcher.stopWatching()
})
watch(() => doc.markdown, syncFrontmatterTheme)
watch(() => ui.autoSave, (on) => {
  if (on) doc.startAutoSnapshot()
  else doc.stopAutoSnapshot()
})

const sidebarStyle = computed(() => {
  const width = ui.sidebarCollapsed ? 32 : ui.sidebarWidth
  return { width: `${width}px`, flexBasis: `${width}px`, minWidth: `${width}px` }
})
const editorStyle = computed(() => ({
  flexBasis: `${ui.editorRatio * 100}%`,
}))
const previewStyle = computed(() => ({
  flexBasis: `${(1 - ui.editorRatio) * 100}%`,
}))

const SIDEBAR_COLLAPSE_THRESHOLD = 28
const EDITOR_COLLAPSE_THRESHOLD = 0.04
const SNAP_MS = 220

const resizeIndicator = ref<{ active: boolean; fading: boolean; label: string }>({
  active: false,
  fading: false,
  label: '',
})
let resizeFadeTimer: number | undefined

function showResizeIndicator(label: string) {
  if (resizeFadeTimer) window.clearTimeout(resizeFadeTimer)
  resizeIndicator.value = { active: true, fading: false, label }
}

function hideResizeIndicator(delay = 300) {
  if (resizeFadeTimer) window.clearTimeout(resizeFadeTimer)
  resizeIndicator.value.fading = true
  resizeFadeTimer = window.setTimeout(() => {
    resizeIndicator.value = { active: false, fading: false, label: '' }
    resizeFadeTimer = undefined
  }, delay)
}

function formatSplitLabel(ratio: number) {
  const editorPct = Math.round(ratio * 100)
  const previewPct = 100 - editorPct
  return t('layout.splitRatio', { editor: editorPct, preview: previewPct })
}

function playSnap(kind: 'sidebar' | 'source' | 'preview', action: () => void) {
  snapKind.value = null
  requestAnimationFrame(() => {
    snapKind.value = kind
    action()
    window.setTimeout(() => {
      if (snapKind.value === kind) snapKind.value = null
    }, SNAP_MS)
  })
}

function dragResize(kind: 'sidebar' | 'editor', e: PointerEvent) {
  if (!workspace.value) return
  e.preventDefault()
  const startX = e.clientX
  const startY = e.clientY
  const startSidebar = ui.sidebarWidth
  const startRatio = ui.editorRatio
  const isVertical = !ui.isSourceHidden && !ui.isPreviewHidden && ui.splitOrientation === 'vertical'
  const workbench = workspace.value.querySelector<HTMLElement>('.workbench')
  const workbenchRect = () => workbench?.getBoundingClientRect()
  const resizeCls = kind === 'editor' && isVertical ? 'resizing-rows' : 'resizing-columns'
  let shouldCollapseSidebar = false
  let shouldCollapseSource = false
  let shouldCollapsePreview = false
  let lastEditorRatio = startRatio

  function move(ev: PointerEvent) {
    if (kind === 'sidebar') {
      const next = startSidebar + ev.clientX - startX
      shouldCollapseSidebar = next < 200 - SIDEBAR_COLLAPSE_THRESHOLD
      ui.setSidebarWidth(shouldCollapseSidebar ? 200 : next)
      return
    }
    const rect = workbenchRect()
    if (!rect) return
    if (isVertical) {
      if (rect.height <= 0) return
      const next = startRatio + (ev.clientY - startY) / rect.height
      shouldCollapseSource = next < 0.25 - EDITOR_COLLAPSE_THRESHOLD
      shouldCollapsePreview = next > 0.75 + EDITOR_COLLAPSE_THRESHOLD
      lastEditorRatio = shouldCollapseSource ? 0.25 : shouldCollapsePreview ? 0.75 : next
      ui.setEditorRatio(lastEditorRatio)
      showResizeIndicator(formatSplitLabel(lastEditorRatio))
    } else {
      if (rect.width <= 0) return
      const next = startRatio + (ev.clientX - startX) / rect.width
      shouldCollapseSource = next < 0.25 - EDITOR_COLLAPSE_THRESHOLD
      shouldCollapsePreview = next > 0.75 + EDITOR_COLLAPSE_THRESHOLD
      lastEditorRatio = shouldCollapseSource ? 0.25 : shouldCollapsePreview ? 0.75 : next
      ui.setEditorRatio(lastEditorRatio)
      showResizeIndicator(formatSplitLabel(lastEditorRatio))
    }
  }

  function done() {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', done)
    document.body.classList.remove(resizeCls)
    if (kind === 'editor') hideResizeIndicator()
    if (kind === 'sidebar' && shouldCollapseSidebar) {
      playSnap('sidebar', () => ui.setSidebarCollapsed(true))
    }
    if (kind === 'editor') {
      if (shouldCollapseSource) {
        playSnap('source', () => {
          ui.setEditorRatio(0.25)
          window.setTimeout(() => ui.setSourceHidden(true), 120)
        })
      } else if (shouldCollapsePreview) {
        playSnap('preview', () => {
          ui.setEditorRatio(0.75)
          window.setTimeout(() => ui.setPreviewHidden(true), 120)
        })
      } else {
        ui.setEditorRatio(lastEditorRatio)
      }
    }
  }

  document.body.classList.add(resizeCls)
  if (kind === 'editor') showResizeIndicator(formatSplitLabel(startRatio))
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', done, { once: true })
}
</script>

<template>
  <div class="app-root" :class="appSkinClass">
    <Toolbar />
    <main class="workspace" :class="snapKind ? `snap-${snapKind}` : ''" ref="workspace">
      <Sidebar :style="sidebarStyle" />
      <button
        v-if="!ui.sidebarCollapsed"
        class="resize-handle sidebar-handle"
        :title="t('app.resizeSidebar')"
        @pointerdown="dragResize('sidebar', $event)"
      ></button>
      <section class="workbench" :class="[`view-${ui.mode}`, ui.isSourceHidden ? 'source-hidden' : '', ui.isPreviewHidden ? 'preview-hidden' : '', (!ui.isSourceHidden && !ui.isPreviewHidden && ui.splitOrientation === 'vertical') ? 'orient-vertical' : '']">
        <!-- 编辑区：仅预览态隐藏 -->
        <EditorPane v-if="!ui.isSourceHidden" :style="ui.isPreviewHidden ? { flex: '1 1 100%' } : editorStyle" />
        <!-- 分隔条 + 折叠按钮（对照态才有）：← 折预览只留源码 / → 折源码只看预览 -->
        <div
          v-if="!ui.isSourceHidden && !ui.isPreviewHidden"
          class="resize-handle editor-handle"
          :class="{ active: resizeIndicator.active }"
          :title="ui.splitOrientation === 'vertical' ? t('layout.resizeVertical') : t('layout.resizeHorizontal')"
          @pointerdown="dragResize('editor', $event)"
        ></div>
        <!-- 折叠后统一「边缘把手」：停靠到被折叠面板原来的边（上下布局→上/下缘，左右布局→左/右缘） -->
        <button
          v-if="ui.isSourceHidden"
          class="edge-rail"
          :class="ui.splitOrientation === 'vertical' ? 'dock-top' : 'dock-left'"
          :title="t('layout.expandSource')"
          @click="ui.setSourceHidden(false)"
        ><span class="rail-label">{{ t('layout.source') }}</span></button>
        <button
          v-if="ui.isPreviewHidden"
          class="edge-rail"
          :class="ui.splitOrientation === 'vertical' ? 'dock-bottom' : 'dock-right'"
          :title="t('layout.expandPreview')"
          @click="ui.setPreviewHidden(false)"
        ><span class="rail-label">{{ t('layout.preview') }}</span></button>
        <!-- 预览区：仅源码态隐藏 -->
        <template v-if="!ui.isPreviewHidden">
          <div v-if="ui.mode === 'slide' && ui.isSourceHidden" class="ppt-wrapper">
            <SlidePreview style="flex: 1 1 auto; min-height: 0" />
          </div>
          <SlidePreview v-else-if="ui.mode === 'slide'" :style="ui.isSourceHidden ? { flex: '1 1 100%' } : previewStyle" />
          <DocumentPreview v-else :style="ui.isSourceHidden ? { flex: '1 1 100%' } : previewStyle" />
        </template>
      </section>
    </main>
    <StatusBar />
    <CommandPalette :open="paletteOpen" :mode="paletteMode" @close="paletteOpen = false" />
    <GlobalSearch :open="globalSearchOpen" :initial-query="globalSearchQuery" @close="globalSearchOpen = false" />
    <AppDialog />
    <SettingsDialog />
    <HelpDialog />
    <Teleport to="body">
      <div
        v-if="resizeIndicator.active"
        class="pane-resize-indicator"
        :class="{ fading: resizeIndicator.fading }"
      >
        {{ resizeIndicator.label }}
      </div>
      <div v-if="fileDrop.active.value" class="file-drop-overlay">
        <div class="file-drop-card">
          <Icon name="download" :size="34" />
          <strong>{{ t('drop.title') }}</strong>
          <span>{{ t('drop.hint') }}</span>
        </div>
      </div>
      <ImportProgressPanel />
    </Teleport>
  </div>
</template>
