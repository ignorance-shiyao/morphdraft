<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { dialogState, settleDialog } from '../composables/useDialog'

const inputEl = ref<HTMLInputElement | null>(null)

function cancelDialog() {
  settleDialog(dialogState.mode === 'select' || dialogState.mode === 'prompt' ? null : false)
}

function confirmDialog() {
  settleDialog(dialogState.mode === 'prompt' ? (dialogState.inputValue || '').trim() : true)
}

watch(
  () => dialogState.open,
  (open) => {
    if (open && dialogState.mode === 'prompt') {
      nextTick(() => {
        inputEl.value?.focus()
        inputEl.value?.select()
      })
    }
  },
)
</script>

<template>
  <Teleport to="body">
    <div v-if="dialogState.open" class="dialog-backdrop" @click="cancelDialog">
      <section class="dialog" role="dialog" aria-modal="true" @click.stop @keydown.esc="cancelDialog">
        <div class="dialog-mark" :class="{ danger: dialogState.tone === 'danger' }">
          {{ dialogState.tone === 'danger' ? '!' : 'i' }}
        </div>
        <div class="dialog-body">
          <h2>{{ dialogState.title }}</h2>
          <p v-if="dialogState.message">{{ dialogState.message }}</p>
          <input
            v-if="dialogState.mode === 'prompt'"
            ref="inputEl"
            v-model="dialogState.inputValue"
            class="dialog-input"
            :placeholder="dialogState.inputPlaceholder"
            spellcheck="false"
            @keydown.enter.prevent="confirmDialog"
          />
          <!-- select 模式：候选项列表 -->
          <div v-if="dialogState.mode === 'select'" class="dialog-options">
            <button
              v-for="opt in dialogState.options"
              :key="opt.value"
              class="dialog-option"
              @click="settleDialog(opt.value)"
            >
              <span class="opt-label">{{ opt.label }}</span>
              <span v-if="opt.hint" class="opt-hint">{{ opt.hint }}</span>
            </button>
          </div>
        </div>
        <div class="dialog-actions">
          <button
            v-if="dialogState.mode === 'confirm' || dialogState.mode === 'select' || dialogState.mode === 'prompt'"
            class="ghost"
            @click="cancelDialog"
          >
            {{ dialogState.cancelText }}
          </button>
          <button
            v-if="dialogState.mode !== 'select'"
            class="primary"
            :class="{ danger: dialogState.tone === 'danger' }"
            @click="confirmDialog"
          >
            {{ dialogState.confirmText }}
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.34);
  backdrop-filter: blur(8px);
}
.dialog {
  width: min(420px, 100%);
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 14px;
  padding: 18px;
  border: 1px solid var(--app-hairline);
  border-radius: var(--radius-2xl);
  background: var(--app-elevated);
  color: var(--app-fg);
  box-shadow: var(--shadow-lg);
}
.dialog-mark {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 11px;
  color: var(--app-primary-color);
  background: color-mix(in srgb, var(--app-primary-color) 13%, transparent);
  font-weight: 800;
}
.dialog-mark.danger {
  color: #b42318;
  background: color-mix(in srgb, #ef4444 13%, transparent);
}
.dialog-body h2 {
  margin: 1px 0 6px;
  font-size: 16px;
  line-height: 1.35;
}
.dialog-body p {
  margin: 0;
  color: var(--app-muted);
  font-size: 13px;
  line-height: 1.65;
  white-space: pre-wrap;
}
.dialog-input {
  width: 100%;
  box-sizing: border-box;
  margin-top: 12px;
  height: 36px;
  padding: 0 11px;
  border: 1px solid var(--app-control-border);
  border-radius: var(--radius-md);
  background: var(--app-bg);
  color: var(--app-fg);
  font: inherit;
  font-size: 13px;
  outline: none;
}
.dialog-input:focus {
  border-color: color-mix(in srgb, var(--app-primary-color) 52%, var(--app-border));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--app-primary-color) 12%, transparent);
}
.dialog-options {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 12px;
}
.dialog-option {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font: inherit;
  text-align: left;
  padding: 10px 12px;
  border: 1px solid var(--app-hairline);
  border-radius: var(--radius-lg);
  background: var(--app-bg);
  color: var(--app-fg);
  cursor: pointer;
  transition: border-color 0.12s ease, background 0.12s ease;
}
.dialog-option:hover {
  border-color: color-mix(in srgb, var(--app-primary-color) 50%, var(--app-border));
  background: var(--app-hover);
}
.dialog-option .opt-label { font-size: 13px; font-weight: 700; }
.dialog-option .opt-hint { font-size: 12px; color: var(--app-muted); }
.dialog-actions {
  grid-column: 1 / -1;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 8px;
}
.dialog-actions button {
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  min-width: 82px;
  padding: 8px 13px;
  border-radius: 9px;
  cursor: pointer;
}
.ghost {
  border: 1px solid var(--app-border);
  background: var(--app-bg);
  color: var(--app-fg);
}
.primary {
  border: 1px solid var(--app-primary-color);
  background: var(--app-primary-color);
  color: #fff;
}
.primary.danger {
  border-color: #dc2626;
  background: #dc2626;
}
</style>
