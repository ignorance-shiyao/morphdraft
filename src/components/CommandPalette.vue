<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useDocumentStore } from '../stores/document'
import { useThemeStore } from '../stores/theme'
import { useUiStore } from '../stores/ui'
import { useSettingsStore } from '../stores/settings'
import { useDialog } from '../composables/useDialog'
import { useImportJobStore } from '../stores/importJob'
import { PRESET_LIST } from '../core/themes/presets'
import { PAPER_LIST, SLIDE_RATIOS, LINE_HEIGHTS, paperPadding } from '../core/paper'
import { safeFilename } from '../core/export/filename'
import { fuzzyFilter, type Command } from '../core/commands'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ open: boolean; mode: 'commands' | 'files' }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const doc = useDocumentStore()
const theme = useThemeStore()
const ui = useUiStore()
const settings = useSettingsStore()
const dialog = useDialog()
const importJob = useImportJobStore()
const { t } = useI18n({ useScope: 'global' })

const query = ref('')
const active = ref(0)
const inputEl = ref<HTMLInputElement | null>(null)

// 打开本地文档（md 直开 / 其他转 Markdown）
async function openLocalDoc() {
  try {
    const { openLocalDocFile } = await import('../core/export/save')
    const src = await openLocalDocFile()
    if (!src) return
    void importJob.runBatch([src], { openFirst: true })
  } catch (e) {
    await dialog.alert({ title: t('commandPalette.openFailed'), message: e instanceof Error ? e.message : String(e), tone: 'danger' })
  }
}

// 导出（复用 Toolbar 的懒加载逻辑）
async function runExport(kind: 'html' | 'pdf' | 'pptx' | 'docx') {
  try {
    const slideMode = ui.mode === 'slide'
    const dims = SLIDE_RATIOS[ui.slideRatio]
    const htmlOpts = { padding: paperPadding(ui.paperSize, ui.paperMargin), lineHeight: LINE_HEIGHTS[ui.lineHeight].value }
    const fname = safeFilename(doc.title, kind)
    if (kind === 'html') {
      const { exportHtml } = await import('../core/export/html')
      await exportHtml(doc.markdown, theme.tokens, ui.mode, ui.paperSize, slideMode ? { dims } : htmlOpts, fname)
    } else if (kind === 'docx') {
      const { exportDocx } = await import('../core/export/docx')
      await exportDocx(doc.markdown, theme.tokens, ui.mode, dims, fname)
    } else if (kind === 'pdf') {
      if (slideMode) {
        const { exportPdfHiFi } = await import('../core/export/slides-hifi')
        await exportPdfHiFi(doc.markdown, theme.tokens, dims, fname)
      } else {
        const { exportPdf } = await import('../core/export/pdf')
        await exportPdf(doc.markdown, theme.tokens, ui.mode, ui.paperSize, { lineHeight: ui.lineHeight, paperMargin: ui.paperMargin }, fname)
      }
    } else if (slideMode) {
      const { exportPptxHiFi } = await import('../core/export/slides-hifi')
      await exportPptxHiFi(doc.markdown, theme.tokens, dims, fname)
    }
  } catch (e) {
    await dialog.alert({
      title: t('commandPalette.exportFailed'),
      message: e instanceof Error ? e.message : String(e),
      tone: 'danger',
    })
  }
}

// 全部命令（随 store 状态派生）
const commands = computed<Command[]>(() => {
  const list: Command[] = [
    { id: 'doc.new', title: t('commandPalette.commands.docNew'), keywords: 'new create xinjian', group: t('commandPalette.groups.document'), run: () => doc.newDoc() },
    { id: 'doc.open-local', title: t('commandPalette.commands.docOpenLocal'), keywords: 'open local file import docx pdf xlsx pptx csv markdown dakai daoru', group: t('commandPalette.groups.document'), run: () => openLocalDoc() },
    { id: 'doc.snapshot', title: t('commandPalette.commands.docSnapshot'), keywords: 'snapshot save version', group: t('commandPalette.groups.document'), run: () => doc.snapshot() },
    { id: 'mode.document', title: t('commandPalette.commands.modeDocument'), keywords: 'document mode wendang', group: t('commandPalette.groups.view'), run: () => ui.setMode('document') },
    { id: 'mode.slide', title: t('commandPalette.commands.modeSlide'), keywords: 'slide ppt huandeng', group: t('commandPalette.groups.view'), run: () => ui.setMode('slide') },
    { id: 'ui.sidebar', title: t(ui.sidebarCollapsed ? 'commandPalette.commands.sidebarExpand' : 'commandPalette.commands.sidebarCollapse'), keywords: 'sidebar toggle cebian', group: t('commandPalette.groups.view'), run: () => ui.toggleSidebar() },
    { id: 'ui.focus', title: t(ui.focusMode ? 'commandPalette.commands.focusDisable' : 'commandPalette.commands.focusEnable'), keywords: 'focus zhuanzhu dim', group: t('commandPalette.groups.view'), run: () => ui.toggleFocusMode() },
    { id: 'ui.typewriter', title: t(ui.typewriter ? 'commandPalette.commands.typewriterDisable' : 'commandPalette.commands.typewriterEnable'), keywords: 'typewriter dazhiji center', group: t('commandPalette.groups.view'), run: () => ui.toggleTypewriter() },
    { id: 'tab.docs', title: t('commandPalette.commands.tabDocs'), keywords: 'documents library', group: t('commandPalette.groups.view'), run: () => { ui.setSidebarTab('docs'); if (ui.sidebarCollapsed) ui.toggleSidebar() } },
    { id: 'tab.outline', title: t('commandPalette.commands.tabOutline'), keywords: 'outline dailan', group: t('commandPalette.groups.view'), run: () => { ui.setSidebarTab('outline'); if (ui.sidebarCollapsed) ui.toggleSidebar() } },
    { id: 'search.global', title: t('commandPalette.commands.globalSearch'), keywords: 'search fulltext quanwen sousuo find', group: t('commandPalette.groups.view'), run: () => window.dispatchEvent(new CustomEvent('morph:global-search')) },
    { id: 'settings', title: t('commandPalette.commands.settings'), keywords: 'settings preferences shezhi', group: t('commandPalette.groups.app'), run: () => settings.show() },
  ]
  // 导出命令（按当前模式）
  list.push({ id: 'export.html', title: t('commandPalette.commands.exportHtml'), keywords: 'export html daochu', group: t('commandPalette.groups.export'), run: () => runExport('html') })
  list.push({ id: 'export.pdf', title: t('commandPalette.commands.exportPdf'), keywords: 'export pdf daochu', group: t('commandPalette.groups.export'), run: () => runExport('pdf') })
  list.push({ id: 'export.docx', title: t('commandPalette.commands.exportWord'), keywords: 'export docx word daochu', group: t('commandPalette.groups.export'), run: () => runExport('docx') })
  if (ui.mode === 'slide') {
    list.push({ id: 'export.pptx', title: t('commandPalette.commands.exportPptx'), keywords: 'export pptx powerpoint', group: t('commandPalette.groups.export'), run: () => runExport('pptx') })
  }
  // 纸张（文档模式）
  if (ui.mode === 'document') {
    for (const p of PAPER_LIST) {
      list.push({ id: `paper.${p.id}`, title: t('commandPalette.commands.paper', { name: p.label }), keywords: `paper ${p.id} zhizhang`, group: t('commandPalette.groups.layout'), run: () => ui.setPaperSize(p.id) })
    }
  }
  // 样式
  for (const preset of PRESET_LIST) {
    list.push({ id: `theme.${preset.id}`, title: t('commandPalette.commands.style', { name: preset.name }), subtitle: preset.dark ? t('commandPalette.commands.dark') : t('commandPalette.commands.light'), keywords: `theme style ${preset.id} ${preset.name} yangshi`, group: t('commandPalette.groups.style'), run: () => theme.setUserTheme(preset.id) })
  }
  return list
})

// 文件命令（快速切换文档）
const files = computed<Command[]>(() =>
  doc.list.map((d) => ({
    id: `file.${d.id}`,
    title: d.title || t('commandPalette.commands.untitled'),
    subtitle: d.id === doc.currentId ? t('commandPalette.commands.current') : undefined,
    group: t('commandPalette.groups.document'),
    run: () => doc.open(d.id),
  })),
)

const source = computed(() => (props.mode === 'files' ? files.value : commands.value))
const results = computed(() => fuzzyFilter(source.value, query.value).slice(0, 50))

watch(results, () => { active.value = 0 })
watch(
  () => props.open,
  (v) => {
    if (v) {
      query.value = ''
      active.value = 0
      nextTick(() => inputEl.value?.focus())
    }
  },
)

function highlight(title: string, matches: number[]): { ch: string; hit: boolean }[] {
  const set = new Set(matches)
  return [...title].map((ch, i) => ({ ch, hit: set.has(i) }))
}

async function choose(i: number) {
  const r = results.value[i]
  if (!r) return
  emit('close')
  await r.item.run()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') { e.preventDefault(); active.value = Math.min(active.value + 1, results.value.length - 1) }
  else if (e.key === 'ArrowUp') { e.preventDefault(); active.value = Math.max(active.value - 1, 0) }
  else if (e.key === 'Enter') { e.preventDefault(); void choose(active.value) }
  else if (e.key === 'Escape') { e.preventDefault(); emit('close') }
}
</script>

<template>
  <div v-if="open" class="cmdp-overlay" @pointerdown.self="emit('close')">
    <div class="cmdp" role="dialog" aria-modal="true">
      <input
        ref="inputEl"
        v-model="query"
        class="cmdp-input"
        :placeholder="mode === 'files' ? t('commandPalette.placeholderFiles') : t('commandPalette.placeholderCommands')"
        @keydown="onKeydown"
      />
      <ul class="cmdp-list">
        <li
          v-for="(r, i) in results"
          :key="r.item.id"
          :class="{ active: i === active }"
          @pointerenter="active = i"
          @pointerdown.prevent="choose(i)"
        >
          <span class="title">
            <template v-for="(c, ci) in highlight(r.item.title, r.matches)" :key="ci">
              <b v-if="c.hit">{{ c.ch }}</b><template v-else>{{ c.ch }}</template>
            </template>
          </span>
          <span v-if="r.item.subtitle" class="subtitle">{{ r.item.subtitle }}</span>
          <span class="group">{{ r.item.group }}</span>
        </li>
        <li v-if="results.length === 0" class="empty">{{ t('commandPalette.noResults') }}</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.cmdp-overlay {
  position: fixed; inset: 0; z-index: 80;
  display: flex; align-items: flex-start; justify-content: center;
  padding-top: 12vh;
  background: rgba(15, 23, 42, 0.34);
  backdrop-filter: blur(8px);
}
.cmdp {
  width: min(620px, 92vw);
  max-height: 64vh;
  display: flex; flex-direction: column;
  border: 1px solid var(--app-hairline);
  border-radius: var(--radius-xl);
  background: var(--app-elevated);
  box-shadow: var(--shadow-lg), 0 1px 0 var(--app-edge) inset;
  overflow: hidden;
}
.cmdp-input {
  font: inherit; font-size: 16px;
  padding: 16px 18px;
  border: 0; border-bottom: 1px solid var(--app-hairline);
  background: transparent; color: var(--app-fg); outline: none;
}
.cmdp-list { list-style: none; margin: 0; padding: 6px; overflow: auto; }
.cmdp-list li {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 12px; border-radius: 8px; cursor: pointer;
  color: var(--app-fg); font-size: 13.5px;
}
.cmdp-list li:hover { background: var(--app-hover); }
.cmdp-list li.active { background: var(--app-active); }
.cmdp-list li .title { flex: 1 1 auto; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cmdp-list li .title b { color: var(--app-primary-color); font-weight: 800; }
.cmdp-list li .subtitle {
  flex: 0 0 auto; font-size: 11px; font-weight: 700; color: var(--app-muted);
  padding: 2px 7px; border-radius: 999px;
  background: color-mix(in srgb, var(--app-primary-color) 10%, transparent);
}
.cmdp-list li .group { flex: 0 0 auto; font-size: 11px; color: var(--app-muted); font-weight: 600; }
.cmdp-list li.empty { justify-content: center; color: var(--app-muted); cursor: default; }
.cmdp-list li.empty:hover { background: none; }
</style>
