<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDocumentStore } from '../stores/document'
import { useSyncStore } from '../stores/sync'
import { stripFrontmatter, parseFrontmatter } from '../core/markdown'

const doc = useDocumentStore()
const sync = useSyncStore()
const { t } = useI18n({ useScope: 'global' })

const stats = computed(() => {
  const text = stripFrontmatter(doc.markdown)
  const chars = text.length
  const cjk = (text.match(/[一-鿿㐀-䶿]/g) || []).length
  const enWords = (text.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g) || []).length
  const words = cjk + enWords
  const lines = text ? text.split('\n').length : 0
  const minutes = Math.max(1, Math.round(words / 500))
  return { chars, words, lines, minutes }
})

const target = computed(() => {
  const fm = parseFrontmatter(doc.markdown)
  const t = parseInt(fm.target || '', 10)
  return Number.isFinite(t) && t > 0 ? t : null
})

const targetProgress = computed(() => {
  if (!target.value) return null
  return Math.min(100, Math.round((stats.value.words / target.value) * 100))
})

const cursorLine = computed(() => sync.cursorLine + 1)
const wordsLabel = computed(() => stats.value.words.toLocaleString('en-US'))
</script>

<template>
  <footer class="statusbar">
    <div class="left">
      <span v-if="target" class="target">
        <span class="target-bar" :style="{ width: (targetProgress ?? 0) + '%' }" :class="{ done: (targetProgress ?? 0) >= 100 }"></span>
        <span class="target-text">{{ stats.words }}/{{ target }} {{ t('statusbar.wordsUnit') }}</span>
      </span>
      <span v-else>{{ t('statusbar.words', { n: wordsLabel }) }}</span>
      <span class="dot">·</span>
      <span>{{ t('statusbar.chars', { n: stats.chars }) }}</span>
      <span class="dot">·</span>
      <span>{{ t('statusbar.lines', { n: stats.lines }) }}</span>
      <span class="dot">·</span>
      <span>{{ t('statusbar.readTime', { n: stats.minutes }) }}</span>
    </div>
    <div class="right">
      <span>{{ t('statusbar.cursorLine', { n: cursorLine }) }}</span>
      <span class="dot">·</span>
      <span>{{ doc.backendKind === 'vault' ? t('statusbar.localFile') : t('statusbar.local') }}</span>
    </div>
  </footer>
</template>

<style scoped>
.statusbar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 26px;
  padding: 0 12px;
  font-size: 11px;
  color: var(--app-muted);
  border-top: 1px solid var(--app-hairline);
  background: var(--app-shell-bg);
  user-select: none;
}
.left, .right { display: inline-flex; align-items: center; gap: 7px; }
.dot { opacity: 0.45; }
.save.on { color: var(--app-primary-color); }
.target {
  position: relative;
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--app-primary-color) 8%, transparent);
  overflow: hidden;
}
.target-bar {
  position: absolute;
  left: 0; top: 0; bottom: 0;
  background: color-mix(in srgb, var(--app-primary-color) 15%, transparent);
  transition: width 0.3s ease;
}
.target-bar.done {
  background: color-mix(in srgb, #16a34a 18%, transparent);
}
.target-text {
  position: relative;
  font-weight: 650;
  color: var(--app-primary-color);
}
.target-bar.done + .target-text {
  color: #16a34a;
}
</style>
