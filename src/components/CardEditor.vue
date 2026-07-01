<script setup lang="ts">
import { ref, nextTick, watch } from 'vue'
import { renderMarkdown } from '../core/markdown'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  line: number
  initialText: string
  canMoveUp?: boolean
  canMoveDown?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save', text: string): void
  (e: 'moveUp'): void
  (e: 'moveDown'): void
}>()
const { t } = useI18n({ useScope: 'global' })

const editText = ref(props.initialText)
const textarea = ref<HTMLTextAreaElement | null>(null)

function save() {
  emit('save', editText.value)
  emit('close')
}

function cancel() {
  emit('close')
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') cancel()
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save()
}

watch(
  () => props.initialText,
  (value) => { editText.value = value },
)

nextTick(() => {
  textarea.value?.focus()
  textarea.value?.select()
})
</script>

<template>
  <div class="card-editor" @keydown="onKeydown">
    <div class="ce-header">
      <span class="ce-line">{{ t('cardEditor.line', { line: line + 1 }) }}</span>
      <div class="ce-actions">
        <button class="ce-btn ce-move" :disabled="!canMoveUp" @click="emit('moveUp')" :title="t('cardEditor.moveUp')">↑</button>
        <button class="ce-btn ce-move" :disabled="!canMoveDown" @click="emit('moveDown')" :title="t('cardEditor.moveDown')">↓</button>
        <button class="ce-btn ce-cancel" @click="cancel">{{ t('cardEditor.cancel') }}</button>
        <button class="ce-btn ce-save" @click="save">{{ t('cardEditor.save') }}</button>
      </div>
    </div>
    <textarea
      ref="textarea"
      v-model="editText"
      class="ce-textarea"
      spellcheck="false"
    />
    <div class="ce-preview" v-html="renderMarkdown(editText)"></div>
  </div>
</template>

<style scoped>
.card-editor {
  position: fixed;
  z-index: 1000;
  width: 400px;
  max-height: 500px;
  background: var(--app-bg, #fff);
  border: 1px solid var(--app-border, #e2e8f0);
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.ce-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--app-border, #e2e8f0) 60%, transparent);
  background: color-mix(in srgb, var(--app-panel-bg, #f8fafc) 80%, var(--app-bg, #fff));
}
.ce-line {
  font-size: 11px;
  font-weight: 700;
  color: var(--app-muted, #64748b);
}
.ce-actions {
  display: flex;
  gap: 6px;
}
.ce-btn {
  font: inherit;
  font-size: 11px;
  font-weight: 650;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, var(--app-border, #e2e8f0) 80%, transparent);
  background: var(--app-bg, #fff);
  color: var(--app-fg, #0f172a);
  cursor: pointer;
  transition: all 0.12s ease;
}
.ce-btn:hover {
  border-color: color-mix(in srgb, var(--app-primary-color, #6c5ce7) 50%, var(--app-border, #e2e8f0));
  color: var(--app-primary-color, #6c5ce7);
}
.ce-save {
  background: var(--app-primary-color, #6c5ce7);
  color: #fff;
  border-color: var(--app-primary-color, #6c5ce7);
}
.ce-save:hover {
  opacity: 0.9;
}
.ce-textarea {
  flex: 1;
  min-height: 80px;
  padding: 10px 12px;
  border: none;
  outline: none;
  font: inherit;
  font-size: 13px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  line-height: 1.6;
  resize: vertical;
  background: var(--app-bg, #fff);
  color: var(--app-fg, #0f172a);
}
.ce-preview {
  max-height: 200px;
  overflow: auto;
  padding: 10px 12px;
  border-top: 1px solid color-mix(in srgb, var(--app-border, #e2e8f0) 60%, transparent);
  font-size: 13px;
  line-height: 1.6;
  color: var(--fg, #1f2328);
  background: color-mix(in srgb, var(--app-bg, #fff) 96%, var(--app-panel-bg, #f8fafc));
}
</style>
