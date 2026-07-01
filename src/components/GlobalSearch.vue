<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useDocumentStore } from '../stores/document'
import { useSyncStore } from '../stores/sync'
import { groupSearchHits, searchState, type SearchHit } from '../core/globalSearch'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ open: boolean; initialQuery?: string }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const doc = useDocumentStore()
const sync = useSyncStore()
const { t } = useI18n({ useScope: 'global' })

const query = ref('')
const hits = ref<SearchHit[] | null>(null)
const errored = ref(false)
const loading = ref(false)
const active = ref(0)
const inputEl = ref<HTMLInputElement | null>(null)
let debounce: number | undefined
let runId = 0

const groups = computed(() => groupSearchHits(hits.value ?? []))
const flat = computed(() => groups.value.flatMap((g) => g.hits))
const state = computed(() => searchState(query.value, hits.value, errored.value))

async function runSearch() {
  const id = ++runId
  const q = query.value.trim()
  if (!q) { hits.value = null; errored.value = false; loading.value = false; return }
  loading.value = true
  errored.value = false
  try {
    const result = await doc.searchAll(q)
    if (id !== runId) return // 已有更新的查询，丢弃过期结果
    hits.value = result
  } catch {
    if (id !== runId) return
    errored.value = true
    hits.value = null
  } finally {
    if (id === runId) loading.value = false
  }
}

watch(query, () => {
  active.value = 0
  window.clearTimeout(debounce)
  debounce = window.setTimeout(runSearch, 180)
})

watch(
  () => props.open,
  (v) => {
    if (v) {
      query.value = props.initialQuery?.trim() || ''
      hits.value = null
      errored.value = false
      active.value = 0
      nextTick(() => inputEl.value?.focus())
      if (query.value) runSearch()
    }
  },
)

async function choose(h: SearchHit | undefined) {
  if (!h) return
  emit('close')
  try {
    if (h.docId !== doc.currentId) await doc.open(h.docId)
    sync.requestGoto(h.line) // 编辑器选中并滚动到命中行
  } catch {
    // 定位失败仍已打开文档；忽略
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') { e.preventDefault(); active.value = Math.min(active.value + 1, flat.value.length - 1) }
  else if (e.key === 'ArrowUp') { e.preventDefault(); active.value = Math.max(active.value - 1, 0) }
  else if (e.key === 'Enter') { e.preventDefault(); void choose(flat.value[active.value]) }
  else if (e.key === 'Escape') { e.preventDefault(); emit('close') }
}

function indexOf(h: SearchHit): number {
  return flat.value.indexOf(h)
}
</script>

<template>
  <div v-if="open" class="gs-overlay" @pointerdown.self="emit('close')">
    <div class="gs" role="dialog" aria-modal="true">
      <input
        ref="inputEl"
        v-model="query"
        class="gs-input"
        :placeholder="t('globalSearch.placeholder')"
        @keydown="onKeydown"
      />
      <div class="gs-body">
        <div v-if="state === 'empty'" class="gs-tip">{{ t('globalSearch.empty') }}</div>
        <div v-else-if="loading" class="gs-tip">{{ t('globalSearch.loading') }}</div>
        <div v-else-if="state === 'error'" class="gs-tip gs-err">{{ t('globalSearch.error') }}</div>
        <div v-else-if="state === 'no-results'" class="gs-tip">{{ t('globalSearch.noResults', { query: query.trim() }) }}</div>
        <template v-else>
          <div v-for="g in groups" :key="g.docId" class="gs-group">
            <div class="gs-doc">{{ g.title || t('globalSearch.untitled') }}</div>
            <button
              v-for="h in g.hits"
              :key="h.docId + ':' + h.line"
              class="gs-hit"
              :class="{ active: indexOf(h) === active }"
              @pointerenter="active = indexOf(h)"
              @pointerdown.prevent="choose(h)"
            >
              <span class="gs-line">{{ h.line + 1 }}</span>
              <span class="gs-snippet">{{ h.snippet }}</span>
            </button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gs-overlay {
  position: fixed; inset: 0; z-index: 80;
  display: flex; align-items: flex-start; justify-content: center;
  padding-top: 12vh;
  background: rgba(15, 23, 42, 0.34);
  backdrop-filter: blur(8px);
}
.gs {
  width: min(640px, 92vw);
  max-height: 66vh;
  display: flex; flex-direction: column;
  border: 1px solid var(--app-hairline);
  border-radius: var(--radius-xl);
  background: var(--app-elevated);
  box-shadow: var(--shadow-lg), 0 1px 0 var(--app-edge) inset;
  overflow: hidden;
}
.gs-input {
  font: inherit; font-size: 16px;
  padding: 16px 18px;
  border: 0; border-bottom: 1px solid var(--app-hairline);
  background: transparent; color: var(--app-fg); outline: none;
}
.gs-body { overflow: auto; padding: 6px; }
.gs-tip { padding: 18px; text-align: center; color: var(--app-muted); font-size: 13px; }
.gs-tip.gs-err { color: #b42318; }
.gs-group { margin-bottom: 6px; }
.gs-doc {
  padding: 6px 10px 3px; font-size: 11px; font-weight: 800; color: var(--app-muted);
  letter-spacing: 0.02em;
}
.gs-hit {
  width: 100%; display: flex; align-items: baseline; gap: 10px;
  padding: 7px 10px; border: 0; border-radius: 8px; cursor: pointer;
  background: none; text-align: left; color: var(--app-fg); font: inherit; font-size: 13px;
}
.gs-hit:hover, .gs-hit.active { background: var(--app-active); }
.gs-line {
  flex: 0 0 auto; min-width: 30px; font-size: 11px; font-weight: 700;
  color: var(--app-muted); font-variant-numeric: tabular-nums;
}
.gs-snippet { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
