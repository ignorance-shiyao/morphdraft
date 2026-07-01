<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useWorkspaceDiagnostics } from '../composables/useWorkspaceDiagnostics'
import {
  applyDiagnosticReplacement,
  diagnosticMessageKey,
  type WorkspaceDiagnostic,
} from '../core/workspace/diagnostics'
import { useDocumentStore } from '../stores/document'
import { useSyncStore } from '../stores/sync'
import Icon from './Icon.vue'

const { t } = useI18n({ useScope: 'global' })
const doc = useDocumentStore()
const sync = useSyncStore()
const { diagnostics, assetIdsLoading, refreshAssetIds } = useWorkspaceDiagnostics()
const collapsed = ref(true)

const sorted = computed(() => [...diagnostics.value].sort((a, b) => {
  const severity = { error: 0, warning: 1, info: 2 }
  return severity[a.severity] - severity[b.severity]
    || a.docTitle.localeCompare(b.docTitle, 'zh-Hans-CN')
    || a.line - b.line
}))

async function openSource(item: WorkspaceDiagnostic) {
  if (item.docId !== doc.currentId) await doc.open(item.docId)
  sync.requestGoto(item.line)
}

async function applyFix(item: WorkspaceDiagnostic) {
  if (!item.replacement) return
  if (item.docId !== doc.currentId) await doc.open(item.docId)
  const next = applyDiagnosticReplacement(doc.markdown, item)
  if (next !== doc.markdown) doc.setMarkdown(next)
  sync.requestGoto(item.line)
}

function diagnosticMessage(item: WorkspaceDiagnostic) {
  return t(diagnosticMessageKey(item.code), item.messageParams)
}
</script>

<template>
  <div class="problems">
    <div class="problems-head">
      <button class="problems-toggle" @click="collapsed = !collapsed">
        <Icon :name="collapsed ? 'chevron-right' : 'chevron-down'" :size="13" />
        <span class="problems-title">{{ t('problems.title') }}</span>
        <span v-if="diagnostics.length" class="problems-count">{{ diagnostics.length }}</span>
      </button>
      <button class="problems-refresh" :title="t('problems.recheck')" @click.stop="refreshAssetIds">
        {{ assetIdsLoading ? t('problems.checking') : t('problems.refresh') }}
      </button>
    </div>
    <div v-if="!collapsed" class="problems-body">
      <div v-if="!diagnostics.length" class="problems-empty">{{ t('problems.empty') }}</div>
      <div
        v-for="item in sorted"
        v-else
        :key="`${item.docId}:${item.line}:${item.code}:${item.target}`"
        class="problem-item"
      >
        <span class="problem-dot" :class="item.severity"></span>
        <button class="problem-main" @click="openSource(item)">
          <span class="problem-message">{{ diagnosticMessage(item) }}</span>
          <span class="problem-source">{{ t('problems.source', { title: item.docTitle, line: item.line + 1 }) }}</span>
        </button>
        <button
          v-if="item.replacement"
          class="problem-fix"
          @click.stop="applyFix(item)"
        >{{ t('problems.fix') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.problems { flex: 0 0 auto; border-top: 1px solid var(--app-hairline); }
.problems-head {
  width: 100%; display: flex; align-items: center; gap: 6px;
  padding: 0 8px 0 0;
}
.problems-head:hover { background: var(--app-hover); }
.problems-toggle {
  display: flex; align-items: center; gap: 6px; flex: 1;
  padding: 8px 6px 8px 14px; border: 0; background: none; cursor: pointer;
  color: var(--app-fg); font: inherit; text-align: left;
}
.problems-title { font-weight: 800; font-size: 13px; white-space: nowrap; }
.problems-count {
  min-width: 17px; padding: 1px 5px; border-radius: 999px;
  color: #b42318; background: color-mix(in srgb, #b42318 10%, transparent);
  font-size: 10px; font-weight: 800;
}
.problems-refresh, .problem-fix {
  border: 0; border-radius: 6px; background: transparent; cursor: pointer;
  color: var(--app-primary-color); font: inherit; font-size: 10px; font-weight: 750;
}
.problems-refresh { padding: 2px 4px; }
.problems-body { padding: 0 8px 8px; }
.problems-empty { padding: 6px; color: var(--app-muted); font-size: 12px; }
.problem-item {
  width: 100%; display: flex; align-items: flex-start; gap: 7px;
  padding: 7px 8px; border: 0; border-radius: 7px; background: none;
  color: var(--app-fg); cursor: pointer; text-align: left;
}
.problem-item:hover { background: var(--app-hover); }
.problem-dot { width: 7px; height: 7px; margin-top: 5px; border-radius: 50%; flex: 0 0 auto; }
.problem-dot.error { background: #d92d20; }
.problem-dot.warning { background: #dc7b0a; }
.problem-dot.info { background: #1570ef; }
.problem-main { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 2px; }
.problem-main {
  padding: 0; border: 0; background: none; color: inherit; cursor: pointer;
  text-align: left; font: inherit;
}
.problem-message { font-size: 11.5px; line-height: 1.4; }
.problem-source {
  color: var(--app-muted); font-size: 10px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.problem-fix { flex: 0 0 auto; padding: 3px 5px; }
.problem-fix:hover { background: var(--app-active); }
</style>
