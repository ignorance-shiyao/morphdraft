<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDocumentStore } from '../stores/document'
import { useSyncStore } from '../stores/sync'
import { useWorkspaceIndex } from '../composables/useWorkspaceIndex'
import { backlinksOf } from '../core/workspace'
import Icon from './Icon.vue'

const { t } = useI18n({ useScope: 'global' })

// R1-2：当前文档的 WikiLink 反链面板。只查询统一工作区索引，不再逐篇读取后端。

const doc = useDocumentStore()
const sync = useSyncStore()
const { workspaceIndex, workspaceIndexLoading } = useWorkspaceIndex()

interface Backlink { id: string; title: string; line: number; snippet: string }

const collapsed = ref(true)

const currentTitle = computed(() => doc.title.trim())
const ambiguous = computed(() => (workspaceIndex.value.titleToIds.get(currentTitle.value)?.length ?? 0) > 1)
const backlinks = computed<Backlink[]>(() =>
  backlinksOf(workspaceIndex.value, currentTitle.value).filter((item) => item.id !== doc.currentId),
)

function toggle() {
  collapsed.value = !collapsed.value
}

async function openSource(b: Backlink) {
  try {
    if (b.id !== doc.currentId) await doc.open(b.id)
    sync.requestGoto(b.line)
  } catch {
    /* 定位失败仍已打开 */
  }
}

</script>

<template>
  <div class="bl">
    <button class="bl-head" @click="toggle">
      <Icon :name="collapsed ? 'chevron-right' : 'chevron-down'" :size="13" />
      <span class="bl-title">{{ t('backlinks.title') }}</span>
      <span v-if="!collapsed && backlinks.length" class="bl-count">{{ backlinks.length }}</span>
    </button>
    <div v-if="!collapsed" class="bl-body">
      <div v-if="ambiguous" class="bl-note">{{ t('backlinks.ambiguous') }}</div>
      <div v-if="!currentTitle" class="bl-empty">{{ t('backlinks.noTitle') }}</div>
      <div v-else-if="workspaceIndexLoading" class="bl-empty">{{ t('backlinks.loading') }}</div>
      <div v-else-if="backlinks.length === 0" class="bl-empty">{{ t('backlinks.empty', { title: currentTitle }) }}</div>
      <ul v-else class="bl-list">
        <li v-for="b in backlinks" :key="b.id">
          <button class="bl-item" @click="openSource(b)">
            <span class="bl-src">{{ b.title }}</span>
            <span class="bl-snippet">{{ b.snippet }}</span>
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.bl { flex: 0 0 auto; border-top: 1px solid var(--app-hairline); }
.bl-head {
  width: 100%; display: flex; align-items: center; gap: 6px;
  padding: 8px 12px 8px 14px; border: 0; background: none; cursor: pointer;
  color: var(--app-fg); font: inherit;
}
.bl-head:hover { background: var(--app-hover); }
.bl-title { font-weight: 800; font-size: 13px; }
.bl-count {
  font-size: 10px; font-weight: 700; color: var(--app-muted);
  background: color-mix(in srgb, var(--app-fg) 6%, transparent);
  padding: 1px 6px; border-radius: 999px;
}
.bl-body { padding: 0 8px 8px; }
.bl-note {
  font-size: 11px; color: #b45309; padding: 4px 6px 6px;
}
.bl-empty { font-size: 12px; color: var(--app-muted); padding: 6px; }
.bl-list { list-style: none; margin: 0; padding: 0; }
.bl-item {
  width: 100%; display: flex; flex-direction: column; gap: 2px; align-items: flex-start;
  padding: 6px 8px; border: 0; border-radius: 7px; background: none; cursor: pointer; text-align: left;
}
.bl-item:hover { background: var(--app-hover); }
.bl-src { font-size: 12.5px; font-weight: 650; color: var(--app-fg); }
.bl-snippet {
  font-size: 11px; color: var(--app-muted);
  max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
</style>
