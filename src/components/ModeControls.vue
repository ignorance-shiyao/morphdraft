<script setup lang="ts">
import { computed, nextTick, ref, onMounted, onBeforeUnmount } from 'vue'
import { useUiStore } from '../stores/ui'
import { useDocumentStore } from '../stores/document'
import { useDialog } from '../composables/useDialog'
import { diffLines as computeDiffLines } from '../core/diff'
import { renderMarkdown } from '../core/markdown'
import Icon from './Icon.vue'
import { useI18n } from 'vue-i18n'

const ui = useUiStore()
const doc = useDocumentStore()
const dialog = useDialog()
const { t } = useI18n({ useScope: 'global' })

// 顶栏只保留两种产出模式，降低理解成本；源码/预览/对照由分隔条折叠按钮控制。
const WORKSPACE_MODES = computed(() => [
  { id: 'document' as const, label: t('view.page'), icon: 'columns' },
  { id: 'slide' as const, label: t('view.ppt'), icon: 'play' },
])

function pickWorkspaceView(view: 'document' | 'slide') {
  ui.setMode(view)
}

// 历史版本
const versionsOpen = ref(false)
const versions = ref<{ id: string; versionNo: number; createdAt: string; contentMarkdown: string }[]>([])
const loadingVersions = ref(false)
const versionsEl = ref<HTMLElement | null>(null)
const versionsMenuEl = ref<HTMLElement | null>(null)
const versionsMenuStyle = ref({ left: '0px', top: '0px' })

function updateVersionsMenuPosition() {
  // 触发器移到编辑区工具条「历史版本」按钮，菜单锚定到它
  const anchor = (document.querySelector('.edit-toolbar .ed-history') as HTMLElement | null) ?? versionsEl.value
  const rect = anchor?.getBoundingClientRect()
  if (!rect) return
  const width = versionsMenuEl.value?.offsetWidth || 250
  const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8))
  versionsMenuStyle.value = {
    left: `${left}px`,
    top: `${rect.bottom + 6}px`,
  }
}

async function toggleVersions() {
  versionsOpen.value = !versionsOpen.value
  if (versionsOpen.value) {
    await nextTick()
    updateVersionsMenuPosition()
    loadingVersions.value = true
    try { versions.value = await doc.listVersions() } finally { loadingVersions.value = false }
  }
}
async function restoreVersion(no: number) {
  const ok = await dialog.confirm({
    title: t('modecontrols.restoreTitle', { no }),
    message: t('modecontrols.restoreMessage'),
    confirmText: t('modecontrols.restore'),
    cancelText: t('common.cancel'),
    tone: 'danger',
  })
  if (!ok) return
  await doc.restoreVersion(no)
  versionsOpen.value = false
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleString('zh-CN', { hour12: false })
}
function closeVersions(e: PointerEvent) {
  const target = e.target as Node
  if (versionsEl.value?.contains(target) || versionsMenuEl.value?.contains(target)) return
  versionsOpen.value = false
}
async function manualSave() {
  await doc.snapshot()
  if (versionsOpen.value) versions.value = await doc.listVersions()
}

// —— 版本对比 ——
const diffOpen = ref(false)
const diffOldLabel = ref('')
const diffNewLabel = ref('')
const diffOldMd = ref('')
const diffNewMd = ref('')
const diffMode = ref<'source' | 'preview'>('source')

async function compareWithCurrent(v: { versionNo: number; contentMarkdown: string }) {
  versionsOpen.value = false
  diffOldMd.value = v.contentMarkdown
  diffNewMd.value = doc.markdown
  diffOldLabel.value = `v${v.versionNo}`
  diffNewLabel.value = t('modecontrols.current')
  diffMode.value = 'source'
  diffOpen.value = true
}

// —— diff 计算 ——
const diffOldLines = computed(() => {
  const d = computeDiffLines(diffOldMd.value, diffNewMd.value)
  // 只保留 old 侧的行（same + del）
  return d.filter(l => l.type === 'same' || l.type === 'del')
})
const diffNewLines = computed(() => {
  const d = computeDiffLines(diffOldMd.value, diffNewMd.value)
  // 只保留 new 侧的行（same + add）
  return d.filter(l => l.type === 'same' || l.type === 'add')
})
const diffOldHtml = computed(() => renderMarkdown(diffOldMd.value))
const diffNewHtml = computed(() => renderMarkdown(diffNewMd.value))

// 滚动同步
const diffOldPanel = ref<HTMLElement | null>(null)
const diffNewPanel = ref<HTMLElement | null>(null)
let syncing = false
function syncScroll(source: 'old' | 'new') {
  if (syncing) return
  syncing = true
  const from = source === 'old' ? diffOldPanel.value : diffNewPanel.value
  const to = source === 'old' ? diffNewPanel.value : diffOldPanel.value
  if (from && to) {
    const ratio = from.scrollTop / (from.scrollHeight - from.clientHeight || 1)
    to.scrollTop = ratio * (to.scrollHeight - to.clientHeight)
  }
  requestAnimationFrame(() => { syncing = false })
}
function updateOpenMenus() {
  if (versionsOpen.value) updateVersionsMenuPosition()
}

// 触发器移到顶栏「⋯」更多菜单，经 window 事件驱动
function onOpenVersions() { if (!versionsOpen.value) toggleVersions() }
function onExternalSave() { manualSave() }
onMounted(() => {
  window.addEventListener('pointerdown', closeVersions)
  window.addEventListener('resize', updateOpenMenus)
  window.addEventListener('scroll', updateOpenMenus, true)
  window.addEventListener('morph:open-versions', onOpenVersions)
  window.addEventListener('morph:save', onExternalSave)
})
onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', closeVersions)
  window.removeEventListener('resize', updateOpenMenus)
  window.removeEventListener('scroll', updateOpenMenus, true)
  window.removeEventListener('morph:open-versions', onOpenVersions)
  window.removeEventListener('morph:save', onExternalSave)
})
</script>

<template>
  <div class="mc">
    <div class="mc-section view-section">
      <div class="view-switch" :class="`active-${ui.workspaceView}`" role="tablist" :aria-label="t('modecontrols.editView')">
        <span class="view-switch-thumb"></span>
        <button
          v-for="m in WORKSPACE_MODES"
          :key="m.id"
          type="button"
          :class="{ active: ui.workspaceView === m.id }"
          role="tab"
          :aria-selected="ui.workspaceView === m.id"
          @click="pickWorkspaceView(m.id)"
        >
          <Icon :name="m.icon" :size="12" />
          <span class="vs-label">{{ m.label }}</span>
        </button>
      </div>
    </div>
    <div v-if="!ui.isSourceHidden" class="mc-section preview-section">
      <!-- 隐藏源码已移到编辑区/预览区分隔条上的折叠按钮，此处只留对照方向切换 -->
      <button
        class="mc-btn orient-btn"
        :title="ui.splitOrientation === 'horizontal' ? t('modecontrols.toVertical') : t('modecontrols.toHorizontal')"
        @click="ui.setSplitOrientation(ui.splitOrientation === 'horizontal' ? 'vertical' : 'horizontal')"
      >
        <Icon :name="ui.splitOrientation === 'horizontal' ? 'rows' : 'columns'" :size="12" />
      </button>
    </div>
    <div class="mc-section save-section">
      <label class="auto-save" :class="{ on: ui.autoSave }" :title="t('modecontrols.autoSave')">
        <span>{{ t('modecontrols.auto') }}</span>
        <span class="toggle-track" @click="ui.toggleAutoSave()">
          <span class="toggle-thumb"></span>
        </span>
      </label>
      <button class="mc-btn" :title="t('modecontrols.manualSave')" @click="manualSave"><Icon name="save" :size="13" /></button>
      <!-- 历史版本 -->
      <div class="ver-dd" ref="versionsEl">
        <button class="mc-btn" :class="{ on: versionsOpen }" :title="t('modecontrols.history')" @click="toggleVersions">
          <Icon name="history" :size="13" />
          <Icon class="chev" name="chevron-down" :size="11" />
        </button>
        <Teleport to="body">
        <div v-if="versionsOpen" ref="versionsMenuEl" class="ver-menu" :style="versionsMenuStyle">
          <div v-if="loadingVersions" class="ver-empty">{{ t('modecontrols.loadingVersions') }}</div>
          <div v-else-if="versions.length === 0" class="ver-empty">{{ t('modecontrols.noVersions') }}</div>
          <div v-for="v in versions" :key="v.id" class="ver-item">
            <span class="ver-label">v{{ v.versionNo }} · {{ fmtTime(v.createdAt) }}</span>
            <div class="ver-actions">
              <button class="ver-compare" :title="t('modecontrols.compareWithCurrent')" @click="compareWithCurrent(v)">{{ t('modecontrols.compare') }}</button>
              <button class="ver-restore" @click="restoreVersion(v.versionNo)">{{ t('modecontrols.restore') }}</button>
            </div>
          </div>
        </div>
        </Teleport>
      </div>
    </div>
    <!-- 版本对比弹窗 -->
    <Teleport to="body">
      <div v-if="diffOpen" class="diff-overlay" @click.self="diffOpen = false">
        <div class="diff-modal">
          <div class="diff-header">
            <span class="diff-title">{{ t('modecontrols.versionCompare') }}：{{ diffOldLabel }} → {{ diffNewLabel }}</span>
            <div class="diff-toolbar">
              <div class="diff-mode-switch">
                <button :class="{ active: diffMode === 'source' }" @click="diffMode = 'source'">
                  <Icon name="code" :size="12" /> {{ t('modecontrols.source') }}
                </button>
                <button :class="{ active: diffMode === 'preview' }" @click="diffMode = 'preview'">
                  <Icon name="eye" :size="12" /> {{ t('modecontrols.preview') }}
                </button>
              </div>
              <button class="diff-close" @click="diffOpen = false"><Icon name="close" :size="14" /></button>
            </div>
          </div>
          <div class="diff-body">
            <!-- 源码模式：左右并排，行级 diff -->
            <template v-if="diffMode === 'source'">
              <div class="diff-panels">
                <div class="diff-panel">
                  <div class="diff-panel-header">{{ diffOldLabel }}</div>
                  <div class="diff-panel-content" ref="diffOldPanel" @scroll="syncScroll('old')">
                    <div v-for="(line, i) in diffOldLines" :key="'o'+i"
                      class="diff-src-line"
                      :class="{ del: line.type === 'del' }"
                    ><span class="diff-ln">{{ i + 1 }}</span><span class="diff-text">{{ line.text || ' ' }}</span></div>
                  </div>
                </div>
                <div class="diff-divider"></div>
                <div class="diff-panel">
                  <div class="diff-panel-header">{{ diffNewLabel }}</div>
                  <div class="diff-panel-content" ref="diffNewPanel" @scroll="syncScroll('new')">
                    <div v-for="(line, i) in diffNewLines" :key="'n'+i"
                      class="diff-src-line"
                      :class="{ add: line.type === 'add' }"
                    ><span class="diff-ln">{{ i + 1 }}</span><span class="diff-text">{{ line.text || ' ' }}</span></div>
                  </div>
                </div>
              </div>
            </template>
            <!-- 预览模式：左右并排渲染 -->
            <template v-else>
              <div class="diff-panels">
                <div class="diff-panel">
                  <div class="diff-panel-header">{{ diffOldLabel }}</div>
                  <div class="diff-panel-content diff-preview-pane" ref="diffOldPanel" @scroll="syncScroll('old')" v-html="diffOldHtml"></div>
                </div>
                <div class="diff-divider"></div>
                <div class="diff-panel">
                  <div class="diff-panel-header">{{ diffNewLabel }}</div>
                  <div class="diff-panel-content diff-preview-pane" ref="diffNewPanel" @scroll="syncScroll('new')" v-html="diffNewHtml"></div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.mc {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.mc-section {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 30px;
}
.preview-section,
.save-section {
  padding-left: 5px;
  border-left: 1px solid color-mix(in srgb, var(--app-border) 62%, transparent);
}
/* Kept for older markup in cached HMR states. */
.mc-sep {
  width: 1px;
  height: 16px;
  background: color-mix(in srgb, var(--app-border) 60%, transparent);
  margin: 0 2px;
}
.mc-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font: inherit;
  font-size: 11px;
  font-weight: 650;
  line-height: 1;
  height: 26px;
  min-width: 26px;
  padding: 0 6px;
  cursor: pointer;
  border: 0;
  background: none;
  color: color-mix(in srgb, var(--app-fg) 72%, var(--app-muted));
  border-radius: 7px;
  white-space: nowrap;
  transition: color 0.12s ease, background 0.12s ease;
}
.mc-btn:hover, .mc-btn.on {
  color: var(--app-primary-color);
  background: var(--app-hover);
}
.chev { opacity: 0.5; }

/* —— 桌面窗口自适应 —— */
/* ≤1180：保存/隐藏源码等开关去文字、留图标与拨杆 */
@media (max-width: 1180px) {
  .source-toggle > span:first-child,
  .auto-save > span:first-child { display: none; }
  .source-toggle, .auto-save { padding: 0 4px; gap: 0; }
}
/* ≤1040：三视图分段控件收为图标，整体更紧凑 */
@media (max-width: 1040px) {
  .view-switch { width: 132px; }
  .vs-label { display: none; }
  .preview-section, .save-section { padding-left: 4px; }
}

.view-switch {
  --switch-index: 0;
  position: relative;
  display: flex;
  align-items: center;
  width: 150px;
  height: 26px;
  padding: 3px;
  border-radius: 999px;
  border: 1px solid var(--app-hairline);
  background: var(--app-shell-bg);
  overflow: hidden;
}
/* 顶栏对齐参考图：对照方向/自动保存/手动保存/历史版本 从顶栏移除，
   功能保留（历史版本与手动保存移入顶栏「⋯」更多菜单，自动保存默认开/设置里可调）。 */
.preview-section,
.save-section { display: none; }
.view-switch.active-document { --switch-index: 0; }
.view-switch.active-slide { --switch-index: 1; }
.view-switch-thumb {
  position: absolute;
  left: 3px;
  top: 3px;
  width: calc((100% - 6px) / 2);
  height: calc(100% - 6px);
  border-radius: 999px;
  background: var(--app-primary-color);
  box-shadow: 0 4px 12px color-mix(in srgb, var(--app-primary-color) 24%, transparent);
  transform: translateX(calc(var(--switch-index) * 100%));
  transition: transform 0.2s ease;
}
.view-switch button {
  position: relative;
  z-index: 1;
  flex: 1;
  min-width: 0;
  height: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font: inherit;
  font-size: 11px;
  font-weight: 750;
  line-height: 1;
  border: 0;
  background: transparent;
  color: var(--app-muted);
  cursor: pointer;
  transition: color 0.16s ease;
}
.view-switch button.active {
  color: #fff;
}
.view-switch button:not(.active):hover {
  color: var(--app-fg);
}
.source-toggle {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 4px 0 7px;
  font-size: 11px;
  font-weight: 650;
  color: var(--app-muted);
  border-radius: 8px;
  border: 0;
  background: transparent;
  white-space: nowrap;
}
.source-toggle.on {
  color: var(--app-primary-color);
}
.orient-btn { padding: 4px 5px; }

/* 自动保存开关 */
.auto-save {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  height: 26px;
  padding: 0 4px 0 7px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 650;
  color: var(--app-muted);
  white-space: nowrap;
}
.auto-save.on {
  color: var(--app-primary-color);
}
.toggle-track {
  position: relative;
  width: 24px;
  height: 14px;
  border-radius: 7px;
  background: color-mix(in srgb, var(--app-fg) 18%, var(--app-bg));
  border: 1px solid color-mix(in srgb, var(--app-border) 80%, transparent);
  transition: background 0.18s ease, border-color 0.18s ease;
  cursor: pointer;
}
.auto-save.on .toggle-track,
.source-toggle.on .toggle-track {
  background: var(--app-primary-color);
  border-color: var(--app-primary-color);
}
.toggle-thumb {
  position: absolute;
  top: 1px;
  left: 1px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0,0,0,0.18);
  transition: transform 0.18s ease;
}
.auto-save.on .toggle-thumb,
.source-toggle.on .toggle-thumb {
  transform: translateX(10px);
}

/* 历史版本 */
.ver-dd { position: relative; }
.ver-menu {
  position: fixed;
  z-index: calc(var(--z-toolbar-menu) + 1);
  width: 250px;
  max-height: 260px;
  overflow: auto;
  padding: 6px;
  border: 1px solid color-mix(in srgb, var(--app-border) 82%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--app-panel-bg) 97%, var(--app-bg));
  box-shadow: 0 12px 36px rgba(0,0,0,0.14);
}
.ver-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 5px 8px;
  border-radius: 6px;
}
.ver-item:hover { background: color-mix(in srgb, var(--app-primary-color) 8%, transparent); }
.ver-label { font-size: 11px; font-weight: 600; color: var(--app-muted); }
.ver-actions { display: inline-flex; gap: 4px; }
.ver-compare, .ver-restore {
  font: inherit;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  cursor: pointer;
  border: 1px solid color-mix(in srgb, var(--app-border) 84%, transparent);
  border-radius: 4px;
  background: var(--app-bg);
  color: var(--app-fg);
  transition: color 0.12s ease, border-color 0.12s ease;
}
.ver-compare:hover { color: var(--app-primary-color); border-color: var(--app-primary-color); }
.ver-restore:hover { color: var(--app-primary-color); border-color: var(--app-primary-color); }
.ver-empty { font-size: 11px; color: var(--app-muted); text-align: center; padding: 10px; }

/* 版本对比弹窗 */
.diff-overlay {
  position: fixed; inset: 0; z-index: var(--z-modal);
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.45); backdrop-filter: blur(3px);
}
.diff-modal {
  width: min(94vw, 1100px); height: 80vh;
  display: flex; flex-direction: column;
  background: var(--app-bg); border-radius: 14px;
  box-shadow: 0 24px 64px rgba(0,0,0,0.28);
  overflow: hidden;
}
.diff-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 18px; border-bottom: 1px solid color-mix(in srgb, var(--app-border) 70%, transparent);
  flex-shrink: 0;
}
.diff-title { font-size: 13px; font-weight: 700; color: var(--app-fg); }
.diff-toolbar { display: flex; align-items: center; gap: 10px; }
.diff-mode-switch {
  display: flex; padding: 2px; border-radius: 7px;
  background: color-mix(in srgb, var(--app-fg) 6%, var(--app-bg));
  border: 1px solid color-mix(in srgb, var(--app-border) 55%, transparent);
}
.diff-mode-switch button {
  display: inline-flex; align-items: center; gap: 4px;
  font: inherit; font-size: 11px; font-weight: 650; line-height: 1;
  padding: 5px 10px; border: 0; border-radius: 5px; cursor: pointer;
  background: transparent; color: var(--app-muted);
  transition: background 0.12s ease, color 0.12s ease;
}
.diff-mode-switch button.active {
  background: var(--app-primary-color); color: #fff;
  box-shadow: 0 2px 6px color-mix(in srgb, var(--app-primary-color) 28%, transparent);
}
.diff-mode-switch button:not(.active):hover { color: var(--app-fg); background: color-mix(in srgb, var(--app-fg) 6%, transparent); }
.diff-close {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border: 0; background: none;
  color: var(--app-muted); border-radius: 6px; cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
}
.diff-close:hover { background: color-mix(in srgb, var(--app-fg) 8%, transparent); color: var(--app-fg); }
.diff-body { flex: 1; min-height: 0; overflow: hidden; }
.diff-panels { display: flex; height: 100%; }
.diff-panel { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.diff-panel-header {
  flex-shrink: 0; padding: 8px 14px; font-size: 12px; font-weight: 700;
  color: var(--app-muted); background: color-mix(in srgb, var(--app-panel-bg) 70%, var(--app-bg));
  border-bottom: 1px solid color-mix(in srgb, var(--app-border) 60%, transparent);
}
.diff-panel-content {
  flex: 1; overflow: auto; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px; line-height: 1.65;
}
.diff-divider {
  flex: 0 0 1px; background: color-mix(in srgb, var(--app-border) 70%, transparent);
}
/* 源码模式行 */
.diff-src-line {
  display: flex; padding: 0 12px; white-space: pre-wrap; word-break: break-all;
}
.diff-src-line.del { background: color-mix(in srgb, #dc2626 10%, transparent); }
.diff-src-line.add { background: color-mix(in srgb, #16a34a 10%, transparent); }
.diff-ln {
  flex: 0 0 36px; text-align: right; padding-right: 10px;
  color: var(--app-muted); opacity: 0.5; user-select: none; font-size: 11px;
}
.diff-text { flex: 1; min-width: 0; }
/* 预览模式：继承 .doc-preview 的完整排版 */
.diff-preview-pane {
  padding: 20px 28px; font-family: var(--font-family); font-size: 15px;
  color: var(--fg); line-height: 1.72; background: var(--bg);
}
.diff-preview-pane :deep(h1),
.diff-preview-pane :deep(h2),
.diff-preview-pane :deep(h3),
.diff-preview-pane :deep(h4),
.diff-preview-pane :deep(h5),
.diff-preview-pane :deep(h6) {
  font-weight: var(--heading-weight); font-family: var(--heading-family); margin: 0 0 0.6em;
}
.diff-preview-pane :deep(h1) {
  font-size: 1.6em; color: var(--primary-color);
  border-bottom: 1px solid color-mix(in srgb, var(--primary-color) 44%, var(--border));
  padding-bottom: 8px;
}
.diff-preview-pane :deep(h2) { font-size: 1.3em; }
.diff-preview-pane :deep(h3) { font-size: 1.1em; color: var(--primary-color); }
.diff-preview-pane :deep(p) { margin: 0 0 0.8em; }
.diff-preview-pane :deep(a) { color: var(--primary-color); text-decoration-color: color-mix(in srgb, var(--primary-color) 40%, transparent); text-underline-offset: 3px; }
.diff-preview-pane :deep(strong) { font-weight: 700; color: var(--fg); }
.diff-preview-pane :deep(em) { font-style: italic; }
/* 行内代码 */
.diff-preview-pane :deep(code) {
  background: color-mix(in srgb, var(--primary-color) 10%, var(--code-bg));
  color: color-mix(in srgb, var(--primary-color) 85%, var(--fg));
  padding: 2px 6px; border-radius: 5px; font-size: 0.88em;
  border: 1px solid color-mix(in srgb, var(--primary-color) 18%, transparent);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
/* 代码块 */
.diff-preview-pane :deep(pre) {
  background: var(--code-bg); padding: 14px 16px; border-radius: 10px;
  overflow: auto; margin: 12px 0;
  border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
}
.diff-preview-pane :deep(pre code) {
  background: none; padding: 0; border: 0; color: var(--fg); font-size: 0.88em;
}
/* 引用 */
.diff-preview-pane :deep(blockquote) {
  margin: 14px 0; padding: 8px 16px;
  border-left: 4px solid var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 6%, transparent);
  border-radius: 0 6px 6px 0;
  color: color-mix(in srgb, var(--fg) 88%, var(--muted));
}
.diff-preview-pane :deep(blockquote > :first-child) { margin-top: 0; }
.diff-preview-pane :deep(blockquote > :last-child) { margin-bottom: 0; }
/* 表格 */
.diff-preview-pane :deep(table) { border-collapse: collapse; width: 100%; margin: 14px 0; }
.diff-preview-pane :deep(th),
.diff-preview-pane :deep(td) { border: 1px solid var(--border); padding: 6px 10px; font-size: 0.9em; }
.diff-preview-pane :deep(th) {
  background: color-mix(in srgb, var(--primary-color) 8%, var(--code-bg)); font-weight: 700;
}
.diff-preview-pane :deep(tbody tr:nth-child(even)) {
  background: color-mix(in srgb, var(--primary-color) 4%, transparent);
}
/* 图片 */
.diff-preview-pane :deep(img) { max-width: 100%; border-radius: 10px; border: 1px solid var(--border); }
.diff-preview-pane :deep(figure) { margin: 14px 0; text-align: center; }
.diff-preview-pane :deep(figcaption) { margin-top: 6px; font-size: 0.88em; color: var(--muted); }
/* 高亮 ==text== */
.diff-preview-pane :deep(mark) {
  background: color-mix(in srgb, var(--primary-color) 22%, transparent);
  color: color-mix(in srgb, var(--primary-color) 80%, var(--fg));
  padding: 1px 4px; border-radius: 3px;
}
/* 删除线 */
.diff-preview-pane :deep(del) { color: var(--muted); }
/* 下划线 */
.diff-preview-pane :deep(u) { text-decoration-color: color-mix(in srgb, var(--primary-color) 60%, var(--fg)); text-underline-offset: 3px; }
/* 上下标 */
.diff-preview-pane :deep(sup), .diff-preview-pane :deep(sub) { font-size: 0.72em; color: color-mix(in srgb, var(--primary-color) 70%, var(--fg)); }
/* 任务列表 */
.diff-preview-pane :deep(.task-list) { list-style: none; padding-left: 2px; }
.diff-preview-pane :deep(.task-checkbox) { width: 15px; height: 15px; margin-right: 8px; vertical-align: -2px; accent-color: var(--primary-color); }
.diff-preview-pane :deep(.task-item.done) { color: var(--muted); text-decoration: line-through; }
/* 列表 */
.diff-preview-pane :deep(ul), .diff-preview-pane :deep(ol) { margin: 0 0 0.8em; padding-left: 1.4em; }
.diff-preview-pane :deep(li) { margin: 0.2em 0; }
.diff-preview-pane :deep(ul li::marker) { color: var(--primary-color); }
/* 图表块 */
.diff-preview-pane :deep(.chart-block) { margin: 14px 0; }
.diff-preview-pane :deep(.chart-block svg) { max-width: 100%; height: auto; }
.diff-preview-pane :deep(.chart-block[data-chart-type='echarts']) { height: 300px; }
/* 容器 */
.diff-preview-pane :deep(.callout) { margin: 14px 0; padding: 12px 16px; border-radius: 8px; }
.diff-preview-pane :deep(.callout > :first-child) { margin-top: 0; }
.diff-preview-pane :deep(.callout > :last-child) { margin-bottom: 0; }
.diff-preview-pane :deep(.callout-note) { background: color-mix(in srgb, var(--primary-color) 8%, transparent); border-left: 4px solid var(--primary-color); }
.diff-preview-pane :deep(.callout-card) { background: var(--panel-bg); border: 1px solid var(--border); box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
/* 两栏 */
.diff-preview-pane :deep(.cols) { display: flex; gap: 20px; align-items: flex-start; }
.diff-preview-pane :deep(.cols > .col) { flex: 1 1 0; min-width: 0; }
/* 脚注 */
.diff-preview-pane :deep(.footnotes) { margin-top: 20px; padding-top: 10px; border-top: 1px solid var(--border); font-size: 0.88em; color: var(--muted); }
.diff-preview-pane :deep(.footnote-ref a) { color: var(--primary-color); text-decoration: none; font-weight: 700; }
/* 数学 */
.diff-preview-pane :deep(.math-block) { text-align: center; overflow-x: auto; margin: 14px 0; }
/* 水平线 */
.diff-preview-pane :deep(hr) { border: 0; border-top: 1px solid var(--border); margin: 1.5em 0; }
/* kbd */
.diff-preview-pane :deep(kbd) {
  display: inline-block; padding: 1px 6px; font-size: 0.82em;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--fg); background: var(--panel-bg);
  border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
  border-bottom-width: 2px; border-radius: 4px; vertical-align: middle;
}
/* TOC */
.diff-preview-pane :deep(.toc) { margin: 14px 0; padding: 12px 16px; border: 1px solid var(--border); border-radius: 10px; background: color-mix(in srgb, var(--panel-bg) 60%, transparent); }
.diff-preview-pane :deep(.toc-title) { font-weight: 800; font-size: 0.95em; margin-bottom: 8px; }
.diff-preview-pane :deep(.toc a) { color: var(--primary-color); text-decoration: none; }
.diff-preview-pane :deep(.toc ul) { padding-left: 1.1em; }
.diff-preview-pane :deep(.toc li) { margin: 3px 0; line-height: 1.5; }
/* 时间线/步骤 */
.diff-preview-pane :deep(.timeline) { position: relative; margin: 14px 0; padding-left: 22px; }
.diff-preview-pane :deep(.timeline::before) { content: ''; position: absolute; left: 5px; top: 4px; bottom: 4px; width: 2px; background: color-mix(in srgb, var(--primary-color) 40%, var(--border)); }
.diff-preview-pane :deep(.steps) { counter-reset: step; margin: 14px 0; padding-left: 0; }
.diff-preview-pane :deep(.steps > li) { counter-increment: step; position: relative; padding-left: 40px; margin-bottom: 10px; }
.diff-preview-pane :deep(.steps > li::before) { content: counter(step); position: absolute; left: 0; width: 26px; height: 26px; display: grid; place-items: center; border-radius: 50%; background: var(--primary-color); color: #fff; font-weight: 800; font-size: 0.82em; }
/* 折叠 */
.diff-preview-pane :deep(details.collapsible) { margin: 14px 0; padding: 8px 14px; border: 1px solid var(--border); border-radius: 10px; background: color-mix(in srgb, var(--panel-bg) 60%, transparent); }
.diff-preview-pane :deep(details.collapsible > summary) { cursor: pointer; font-weight: 700; list-style: none; }
.diff-preview-pane :deep(details.collapsible > summary::before) { content: '▸'; display: inline-block; margin-right: 8px; color: var(--primary-color); transition: transform .15s ease; }
.diff-preview-pane :deep(details.collapsible[open] > summary::before) { transform: rotate(90deg); }
/* Alert (GitHub style) */
.diff-preview-pane :deep(.alert) { margin: 14px 0; padding: 12px 16px; border-radius: 8px; border-left: 4px solid; }
.diff-preview-pane :deep(.alert-title) { font-weight: 700; margin-bottom: 4px; }
</style>
