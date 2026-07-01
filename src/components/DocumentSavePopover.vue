<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDocumentStore } from '../stores/document'
import { useSettingsStore } from '../stores/settings'
import { useSafeRename } from '../composables/useSafeRename'
import { clampFloatingPoint } from '../core/editor/floatingPosition'
import Icon from './Icon.vue'
import SelectMenu from './SelectMenu.vue'

const props = defineProps<{
  anchor: DOMRect
}>()
const emit = defineEmits<{ (e: 'close'): void }>()
const { t } = useI18n({ useScope: 'global' })
const doc = useDocumentStore()
const settings = useSettingsStore()
const { renameDocumentSafely } = useSafeRename()

const panel = ref<HTMLElement | null>(null)
const style = ref({ left: '0px', top: '0px' })
const name = ref('')
const tagsText = ref('')
const folder = ref('')
const saving = ref(false)

const currentMeta = computed(() => doc.list.find((d) => d.id === doc.currentId))
const folderOpts = computed(() => {
  const opts = [{ value: '', label: t('savePopover.uncategorized') }]
  const seen = new Set<string>()
  for (const f of doc.folders) {
    if (!f || seen.has(f)) continue
    seen.add(f)
    opts.push({ value: f, label: f })
  }
  const cur = currentMeta.value?.folder
  if (cur && !seen.has(cur)) opts.push({ value: cur, label: cur })
  return opts
})

const storageLabel = computed(() => {
  if (!settings.isTauri) return t('savePopover.storageBuiltin')
  return doc.backendKind === 'vault' ? t('savePopover.storageLocal') : t('savePopover.storageBuiltin')
})

function syncFields() {
  name.value = doc.title || t('documentStore.untitled')
  tagsText.value = (currentMeta.value?.tags ?? []).join(', ')
  folder.value = currentMeta.value?.folder ?? ''
}

function updatePosition() {
  const rect = panel.value?.getBoundingClientRect()
  if (!rect) return
  const below = props.anchor.bottom + 8
  const above = props.anchor.top - rect.height - 8
  const y = below + rect.height <= window.innerHeight - 8 ? below : above
  const pos = clampFloatingPoint(
    { x: props.anchor.left, y },
    { width: rect.width, height: rect.height },
    { width: window.innerWidth, height: window.innerHeight },
  )
  style.value = { left: `${pos.left}px`, top: `${pos.top}px` }
}

async function pickLocalFolder() {
  await settings.pickWorkDir()
  emit('close')
}

async function useBuiltinStorage() {
  if (!settings.isTauri) return
  settings.setWorkDir('')
  await doc.reload()
  emit('close')
}

async function save() {
  if (saving.value || !doc.currentId) return
  saving.value = true
  try {
    const id = doc.currentId
    const nextTitle = name.value.trim() || t('documentStore.untitled')
    if (nextTitle !== doc.title) await renameDocumentSafely(nextTitle)
    const tags = tagsText.value.split(/[,，]/).map((t) => t.trim()).filter(Boolean)
    await doc.setDocTags(id, tags)
    const nextFolder = folder.value.trim() || undefined
    if ((currentMeta.value?.folder ?? '') !== (nextFolder ?? '')) {
      await doc.setDocFolder(id, nextFolder)
    }
    emit('close')
  } finally {
    saving.value = false
  }
}

function onDocClick(e: MouseEvent) {
  if (panel.value?.contains(e.target as Node)) return
  emit('close')
}

watch(() => doc.currentId, syncFields, { immediate: true })

onMounted(() => {
  syncFields()
  void nextTick(updatePosition)
  window.addEventListener('resize', updatePosition)
  window.addEventListener('click', onDocClick, true)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', updatePosition)
  window.removeEventListener('click', onDocClick, true)
})
</script>

<template>
  <Teleport to="body">
    <div class="dsp-overlay" @pointerdown.self="emit('close')">
      <form ref="panel" class="dsp" :style="style" @submit.prevent="save">
        <label>
          <span>{{ t('savePopover.name') }}</span>
          <input v-model="name" autofocus spellcheck="false" />
        </label>
        <label>
          <span>{{ t('savePopover.tags') }}</span>
          <input v-model="tagsText" :placeholder="t('savePopover.tagsHint')" spellcheck="false" />
        </label>
        <label>
          <span>{{ t('savePopover.where') }}</span>
          <SelectMenu :value="folder" :options="folderOpts" @update="folder = $event" />
        </label>
        <div class="dsp-storage">
          <span class="dsp-storage-label">{{ t('savePopover.storage') }}</span>
          <span class="dsp-storage-val">
            <Icon name="folder" :size="14" />
            {{ storageLabel }}
          </span>
          <div v-if="settings.isTauri" class="dsp-storage-actions">
            <button type="button" class="linkish" @click="useBuiltinStorage">{{ t('savePopover.useBuiltin') }}</button>
            <button type="button" class="linkish" @click="pickLocalFolder">{{ t('savePopover.pickLocal') }}</button>
          </div>
        </div>
        <div class="dsp-actions">
          <button type="button" @click="emit('close')">{{ t('linkEditor.cancel') }}</button>
          <button class="primary" type="submit" :disabled="saving">{{ t('savePopover.save') }}</button>
        </div>
      </form>
    </div>
  </Teleport>
</template>

<style scoped>
.dsp-overlay { position: fixed; inset: 0; z-index: 10015; }
.dsp {
  position: fixed;
  width: min(340px, calc(100vw - 16px));
  box-sizing: border-box;
  padding: 14px;
  border: 1px solid var(--app-control-border);
  border-radius: 14px;
  background: color-mix(in srgb, var(--app-menu-bg) 96%, transparent);
  box-shadow: 0 20px 54px rgba(0,0,0,.22), 0 1px 0 var(--app-edge) inset;
  backdrop-filter: blur(18px) saturate(1.12);
}
.dsp > label {
  display: grid;
  grid-template-columns: 72px 1fr;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}
.dsp > label:first-of-type { margin-top: 0; }
.dsp label > span { color: var(--app-muted); font-size: 11px; font-weight: 650; }
.dsp input {
  min-width: 0; height: 32px; box-sizing: border-box; padding: 0 9px;
  border: 1px solid var(--app-control-border); border-radius: 8px; outline: 0;
  background: var(--app-control-bg); color: var(--app-fg); font: inherit; font-size: 12px;
}
.dsp-storage {
  margin-top: 10px; padding-top: 10px;
  border-top: 1px solid color-mix(in srgb, var(--app-border) 55%, transparent);
  display: grid; gap: 6px;
}
.dsp-storage-label { font-size: 11px; font-weight: 650; color: var(--app-muted); }
.dsp-storage-val {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 12px; font-weight: 650; color: var(--app-fg);
}
.dsp-storage-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.linkish {
  font: inherit; font-size: 11px; font-weight: 650; padding: 0; border: 0; background: none;
  color: var(--app-primary-color); cursor: pointer;
}
.dsp-actions {
  display: flex; justify-content: flex-end; gap: 7px; margin-top: 12px;
}
.dsp-actions button {
  min-width: 68px; height: 30px; border: 1px solid var(--app-control-border); border-radius: 8px;
  background: var(--app-control-bg); color: var(--app-fg); font: inherit; font-size: 12px; font-weight: 700; cursor: pointer;
}
.dsp-actions button.primary { border-color: var(--app-primary-color); background: var(--app-primary-color); color: #fff; }
</style>
