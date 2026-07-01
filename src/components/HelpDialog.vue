<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { shortcutGroups } from '../core/appCommands'
import { useI18n } from 'vue-i18n'
import { APP_BRAND } from '../config/brand'
import AppLogo from './AppLogo.vue'

const open = ref(false)
const { t } = useI18n({ useScope: 'global' })

const SHORTCUT_KEYS: Record<string, string> = {
  'doc.new': 'docNew', 'doc.open-local': 'docOpenLocal', 'doc.snapshot': 'docSnapshot',
  'file.save-as': 'saveAs', 'edit.undo': 'undo', 'edit.redo': 'redo', 'edit.find': 'find',
  'edit.replace': 'replace', 'edit.select-all': 'selectAll', 'view.source': 'viewSource',
  'view.page': 'viewPage', 'view.ppt': 'viewPpt', 'view.toggle-sidebar': 'toggleSidebar',
  'palette.files': 'paletteFiles', 'palette.commands': 'paletteCommands', 'help.shortcuts': 'shortcutHelp',
}
const GROUP_KEYS: Record<string, string> = { 文件: 'file', 编辑: 'edit', 视图: 'view' }

// 快捷键区：从 appCommands 单一事实源生成，杜绝与实际键位漂移。
const shortcutSections = computed(() => shortcutGroups().map((g) => ({
  category: t(`help.groups.${GROUP_KEYS[g.group]}`),
  items: g.items.map((it) => [it.shortcut, t(`help.shortcuts.${SHORTCUT_KEYS[it.id]}`)] as [string, string]),
})))

// 语法速查为静态备查表（非命令/快捷键，不进 appCommands）。
const syntaxSections = computed(() => [
  { category: t('help.groups.syntax'), items: [
    ['# Heading', t('help.syntax.headings')],
    ['**bold** *italic*', t('help.syntax.inlineStyle')],
    ['==highlight== ++underline++', t('help.syntax.annotations')],
    ['`code` ```code block```', t('help.syntax.code')],
    ['[link](url) ![image](url)', t('help.syntax.links')],
    ['> quote', t('help.syntax.quote')],
    ['- item / 1. item', t('help.syntax.lists')],
    ['- [ ] task', t('help.syntax.tasks')],
    ['| table |', t('help.syntax.table')],
    ['---', t('help.syntax.divider')],
    ['$$ formula $$ / $inline$', t('help.syntax.math')],
    [':::note / :::tip / :::warning', t('help.syntax.callout')],
    ['<!-- layout: cover -->', t('help.syntax.layout')],
    ['<!-- step -->', t('help.syntax.step')],
    ['```mermaid', t('help.syntax.mermaid')],
    ['```echarts', t('help.syntax.echarts')],
    ['[[Page name]]', t('help.syntax.wikilink')],
    [':::notes', t('help.syntax.notes')],
  ]},
])

function onKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === '/') {
    e.preventDefault()
    open.value = !open.value
  }
  if (e.key === 'Escape' && open.value) {
    open.value = false
  }
}

function onOpenHelp() { open.value = true }
onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('morph:open-help', onOpenHelp)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('morph:open-help', onOpenHelp)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="help-overlay" @click.self="open = false">
      <div class="help-panel">
        <div class="help-header">
          <div>
            <span class="help-title">{{ t('help.title') }}</span>
            <span class="help-subtitle">{{ t('settingsPage.aboutTitle') }} · {{ APP_BRAND.displayName }}</span>
          </div>
          <button class="help-close" :title="t('help.close')" :aria-label="t('help.close')" @click="open = false">&times;</button>
        </div>
        <div class="help-body">
          <section class="help-hero">
            <div class="help-logo"><AppLogo :size="54" /></div>
            <div class="help-about">
              <div class="help-brand">{{ APP_BRAND.displayName }}</div>
              <p>{{ APP_BRAND.description }}</p>
              <div class="help-meta">
                <span>{{ t('settingsPage.versionLine') }}</span>
                <span>{{ t('settingsPage.offlineLine') }}</span>
              </div>
            </div>
          </section>

          <section class="help-section shortcuts">
            <div class="help-section-title">{{ t('slidePreview.shortcuts') }}</div>
            <div class="shortcut-layout">
              <article v-for="section in shortcutSections" :key="section.category" class="help-card">
                <div class="help-card-title">{{ section.category }}</div>
                <div class="help-list">
                  <div v-for="([key, desc], i) in section.items" :key="i" class="help-row">
                    <kbd class="md-kbd help-key">{{ key }}</kbd>
                    <span class="help-desc">{{ desc }}</span>
                  </div>
                </div>
              </article>
            </div>
          </section>

          <section v-for="section in syntaxSections" :key="section.category" class="help-section syntax">
            <div class="help-section-title">{{ section.category }}</div>
            <div class="syntax-grid">
              <div v-for="([key, desc], i) in section.items" :key="i" class="help-row syntax-row">
                <kbd class="md-kbd help-key syntax-key">{{ key }}</kbd>
                <span class="help-desc">{{ desc }}</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.help-overlay {
  position: fixed; inset: 0; background: rgba(15, 23, 42, 0.34); backdrop-filter: blur(10px);
  display: flex; align-items: center; justify-content: center; z-index: 9999;
}
.help-panel {
  width: min(920px, calc(100vw - 48px));
  max-height: min(860px, calc(100vh - 56px));
  background:
    radial-gradient(circle at 16% 0%, color-mix(in srgb, var(--app-primary-color) 12%, transparent), transparent 28%),
    var(--app-elevated, #fff);
  border: 1px solid var(--app-hairline);
  border-radius: 24px;
  box-shadow: 0 28px 80px rgba(15, 23, 42, 0.22);
  display: flex; flex-direction: column;
  overflow: hidden;
}
.help-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 22px 28px 18px;
  border-bottom: 1px solid var(--app-hairline);
}
.help-title { display: block; font-weight: 850; font-size: 23px; letter-spacing: -0.03em; color: var(--app-fg); }
.help-subtitle { display: block; margin-top: 5px; color: var(--app-muted); font-size: 12px; font-weight: 650; }
.help-close {
  display: grid; place-items: center;
  width: 38px; height: 38px;
  background: var(--app-control-bg); border: 1px solid var(--app-control-border);
  border-radius: 12px;
  font-size: 24px; cursor: pointer; color: var(--app-muted, #888);
  transition: color .14s ease, background .14s ease, transform .14s ease;
}
.help-close:hover { color: var(--app-fg); background: var(--app-hover); transform: translateY(-1px); }
.help-body { padding: 22px 28px 28px; overflow-y: auto; }
.help-hero {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 18px;
  align-items: center;
  margin-bottom: 20px;
  padding: 20px;
  border: 1px solid color-mix(in srgb, var(--app-primary-color) 18%, var(--app-hairline));
  border-radius: 20px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--app-primary-color) 8%, transparent), transparent 58%),
    color-mix(in srgb, var(--app-shell-bg) 86%, var(--app-elevated));
}
.help-logo {
  display: grid; place-items: center;
  width: 76px; height: 76px;
  border-radius: 20px;
  background: color-mix(in srgb, var(--app-primary-color) 8%, var(--app-bg));
  box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 70%, transparent);
}
.help-brand { font-size: 22px; font-weight: 850; letter-spacing: -0.025em; color: var(--app-fg); }
.help-about p { margin: 5px 0 10px; color: var(--app-muted); font-size: 13px; }
.help-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.help-meta span {
  padding: 5px 9px;
  border: 1px solid var(--app-hairline);
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-elevated) 80%, transparent);
  color: color-mix(in srgb, var(--app-fg) 72%, var(--app-muted));
  font-size: 12px;
}
.help-section { margin-top: 18px; }
.help-section-title {
  font-weight: 850; font-size: 13px;
  color: var(--app-primary-color, #0ea5e9);
  margin-bottom: 10px;
  text-transform: uppercase; letter-spacing: 0.06em;
}
.shortcut-layout {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.help-card {
  padding: 14px;
  border: 1px solid var(--app-hairline);
  border-radius: 16px;
  background: color-mix(in srgb, var(--app-shell-bg) 88%, var(--app-elevated));
}
.help-card-title { margin-bottom: 10px; font-size: 13px; font-weight: 850; color: var(--app-fg); }
.help-list { display: grid; gap: 7px; }
.syntax-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 12px;
}
.help-row {
  display: grid;
  grid-template-columns: minmax(120px, max-content) minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.syntax-row {
  grid-template-columns: minmax(160px, 0.66fr) minmax(0, 1fr);
  padding: 9px 10px;
  border: 1px solid var(--app-hairline);
  border-radius: 13px;
  background: color-mix(in srgb, var(--app-shell-bg) 82%, transparent);
}
.help-key {
  min-width: 0;
  width: fit-content;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.syntax-key { width: 100%; }
.help-desc { min-width: 0; font-size: 13px; color: var(--app-fg, #333); line-height: 1.38; }

@media (max-width: 780px) {
  .help-panel { width: calc(100vw - 24px); max-height: calc(100vh - 24px); border-radius: 18px; }
  .help-header, .help-body { padding-left: 18px; padding-right: 18px; }
  .shortcut-layout, .syntax-grid { grid-template-columns: 1fr; }
  .help-hero { grid-template-columns: 1fr; }
}
</style>
