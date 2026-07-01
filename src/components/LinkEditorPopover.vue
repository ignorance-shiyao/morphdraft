<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { clampFloatingPoint } from '../core/editor/floatingPosition'
import type { MarkdownLinkFields } from '../core/markdown/linkEdit'

const props = defineProps<{
  anchor: { left: number; top: number; bottom: number }
  fields: MarkdownLinkFields
}>()
const emit = defineEmits<{
  (e: 'cancel'): void
  (e: 'done', fields: MarkdownLinkFields): void
  (e: 'unlink'): void
}>()
const { t } = useI18n({ useScope: 'global' })
const panel = ref<HTMLElement | null>(null)
const text = ref(props.fields.text)
const url = ref(props.fields.url)
const title = ref(props.fields.title)
const showAdvanced = ref(Boolean(props.fields.title)) // 有标题则默认展开「更多」
const copied = ref(false)
const style = ref({ left: `${props.anchor.left}px`, top: `${props.anchor.bottom + 8}px` })

function updatePosition() {
  const rect = panel.value?.getBoundingClientRect()
  if (!rect) return
  const below = props.anchor.bottom + 8
  const above = props.anchor.top - rect.height - 8
  const y = below + rect.height <= window.innerHeight - 8 ? below : above
  const position = clampFloatingPoint(
    { x: props.anchor.left, y },
    { width: rect.width, height: rect.height },
    { width: window.innerWidth, height: window.innerHeight },
  )
  style.value = { left: `${position.left}px`, top: `${position.top}px` }
}

function done() {
  if (!url.value.trim()) return
  emit('done', { text: text.value, url: url.value.trim(), title: title.value })
}
function openUrl() {
  const u = url.value.trim()
  if (u) window.open(u, '_blank', 'noopener,noreferrer')
}
async function copyUrl() {
  const u = url.value.trim()
  if (!u) return
  try {
    await navigator.clipboard.writeText(u)
    copied.value = true
    window.setTimeout(() => { copied.value = false }, 1200)
  } catch { /* 剪贴板不可用时静默 */ }
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') { e.preventDefault(); emit('cancel') }
  else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); done() }
}

function toggleAdvanced() {
  showAdvanced.value = !showAdvanced.value
  void nextTick(updatePosition)
}

onMounted(() => {
  void nextTick(updatePosition)
  window.addEventListener('resize', updatePosition)
})
onBeforeUnmount(() => window.removeEventListener('resize', updatePosition))
</script>

<template>
  <Teleport to="body">
    <div class="lep-overlay" @pointerdown.self="emit('cancel')">
      <form ref="panel" class="lep" :style="style" @submit.prevent="done" @keydown="onKeydown">
        <div class="lep-title">{{ t('linkEditor.title') }}</div>
        <label>
          <span>{{ t('linkEditor.text') }}</span>
          <input v-model="text" autofocus />
        </label>
        <label>
          <span>{{ t('linkEditor.url') }}</span>
          <input v-model="url" inputmode="url" />
        </label>

        <!-- 快捷动作：打开 / 复制 / 去链接 / 更多 -->
        <div class="lep-quick">
          <button type="button" :disabled="!url.trim()" @click="openUrl">↗ {{ t('linkEditor.open') }}</button>
          <button type="button" :disabled="!url.trim()" @click="copyUrl">{{ copied ? t('linkEditor.copied') : t('linkEditor.copy') }}</button>
          <button type="button" class="danger" @click="emit('unlink')">{{ t('linkEditor.unlink') }}</button>
          <span class="lep-spacer"></span>
          <button type="button" class="lep-more" @click="toggleAdvanced">
            {{ showAdvanced ? t('linkEditor.less') : t('linkEditor.more') }}
          </button>
        </div>

        <template v-if="showAdvanced">
          <label>
            <span>{{ t('linkEditor.linkTitle') }}</span>
            <input v-model="title" />
          </label>
          <div class="lep-preview">
            <span>{{ t('linkEditor.preview') }}</span>
            <a :href="url || undefined" target="_blank" rel="noopener noreferrer">{{ text || url }}</a>
          </div>
        </template>

        <div class="lep-actions">
          <button type="button" @click="emit('cancel')">{{ t('linkEditor.cancel') }}</button>
          <button class="primary" type="submit" :disabled="!url.trim()">{{ t('linkEditor.done') }}</button>
        </div>
      </form>
    </div>
  </Teleport>
</template>

<style scoped>
.lep-overlay { position: fixed; inset: 0; z-index: 10020; }
.lep {
  position: fixed;
  width: min(360px, calc(100vw - 16px));
  box-sizing: border-box;
  padding: 14px;
  border: 1px solid var(--app-control-border);
  border-radius: 14px;
  background: color-mix(in srgb, var(--app-menu-bg) 96%, transparent);
  box-shadow: 0 20px 54px rgba(0,0,0,.24), 0 1px 0 var(--app-edge) inset;
  backdrop-filter: blur(18px) saturate(1.15);
}
.lep-title { margin-bottom: 12px; color: var(--app-fg); font-size: 14px; font-weight: 800; }
.lep > label { display: grid; grid-template-columns: 92px 1fr; align-items: center; gap: 8px; margin-top: 8px; }
.lep label > span { color: var(--app-muted); font-size: 11px; font-weight: 650; }
.lep input {
  min-width: 0; height: 32px; box-sizing: border-box; padding: 0 9px;
  border: 1px solid var(--app-control-border); border-radius: 8px; outline: 0;
  background: var(--app-control-bg); color: var(--app-fg); font: inherit; font-size: 12px;
}
.lep input:focus {
  border-color: var(--app-primary-color);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--app-primary-color) 13%, transparent);
}
.lep-quick { display: flex; align-items: center; gap: 6px; margin-top: 11px; }
.lep-spacer { flex: 1 1 auto; }
.lep-quick button {
  height: 26px; padding: 0 10px; border: 1px solid var(--app-control-border); border-radius: 7px;
  background: var(--app-control-bg); color: var(--app-fg); font: inherit; font-size: 11px; font-weight: 650; cursor: pointer;
  transition: border-color .12s ease, background .12s ease;
}
.lep-quick button:hover:not(:disabled) { border-color: color-mix(in srgb, var(--app-primary-color) 40%, var(--app-border)); }
.lep-quick button:disabled { opacity: .42; cursor: default; }
.lep-quick button.danger { color: #dc2626; border-color: color-mix(in srgb, #dc2626 26%, var(--app-border)); }
.lep-quick button.danger:hover { background: color-mix(in srgb, #dc2626 8%, transparent); }
.lep-quick .lep-more { color: var(--app-muted); }
.lep-preview {
  display: flex; align-items: baseline; gap: 8px; margin-top: 9px; padding: 9px 10px;
  border: 1px solid var(--app-hairline); border-radius: 8px; background: var(--app-control-bg);
}
.lep-preview > span { flex: 0 0 auto; color: var(--app-muted); font-size: 10px; font-weight: 750; }
.lep-preview a { min-width: 0; overflow: hidden; color: var(--app-primary-color); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.lep-actions { display: flex; justify-content: flex-end; gap: 7px; margin-top: 13px; }
.lep-actions button {
  min-width: 68px; height: 30px; border: 1px solid var(--app-control-border); border-radius: 8px;
  background: var(--app-control-bg); color: var(--app-fg); font: inherit; font-size: 12px; font-weight: 700; cursor: pointer;
}
.lep-actions button.primary { border-color: var(--app-primary-color); background: var(--app-primary-color); color: #fff; }
.lep-actions button:disabled { opacity: .45; cursor: default; }
</style>
