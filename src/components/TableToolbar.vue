<script setup lang="ts">
import type { Align } from '../core/markdown/tableEdit'
import { useI18n } from 'vue-i18n'
import Icon from './Icon.vue'

defineProps<{ align: Align; canDeleteRow: boolean }>()
const emit = defineEmits<{ (e: 'op', id: string): void }>()
const { t } = useI18n({ useScope: 'global' })

function fire(id: string, e: Event) {
  e.preventDefault()
  emit('op', id)
}
</script>

<template>
  <div class="tbl-toolbar" @mousedown.prevent>
    <div class="grp" role="group" :aria-label="t('tableTools.row')">
      <button class="ic-btn" :title="t('tableTools.rowAbove')" @mousedown="fire('row-above', $event)">
        <Icon name="row-above" :size="14" />
      </button>
      <button class="ic-btn" :title="t('tableTools.rowBelow')" @mousedown="fire('row-below', $event)">
        <Icon name="row-below" :size="14" />
      </button>
      <button class="ic-btn danger" :title="t('tableTools.deleteRow')" :disabled="!canDeleteRow" @mousedown="fire('row-del', $event)">
        <Icon name="trash" :size="14" />
      </button>
    </div>
    <span class="sep" aria-hidden="true"></span>
    <div class="grp" role="group" :aria-label="t('tableTools.col')">
      <button class="ic-btn" :title="t('tableTools.colLeft')" @mousedown="fire('col-left', $event)">
        <Icon name="chevrons-left" :size="14" />
      </button>
      <button class="ic-btn" :title="t('tableTools.colRight')" @mousedown="fire('col-right', $event)">
        <Icon name="chevrons-right" :size="14" />
      </button>
      <button class="ic-btn danger" :title="t('tableTools.deleteCol')" @mousedown="fire('col-del', $event)">
        <Icon name="trash" :size="14" />
      </button>
    </div>
    <span class="sep" aria-hidden="true"></span>
    <div class="grp aligns" role="group" :aria-label="t('tableMenu.alignColumn')">
      <button class="ic-btn" :title="t('tableTools.alignLeft')" :class="{ on: align === 'left' }" @mousedown="fire('align-left', $event)">
        <span class="align-glyph">⇤</span>
      </button>
      <button class="ic-btn" :title="t('tableTools.alignCenter')" :class="{ on: align === 'center' }" @mousedown="fire('align-center', $event)">
        <span class="align-glyph">↔</span>
      </button>
      <button class="ic-btn" :title="t('tableTools.alignRight')" :class="{ on: align === 'right' }" @mousedown="fire('align-right', $event)">
        <span class="align-glyph">⇥</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.tbl-toolbar {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  border: 1px solid color-mix(in srgb, var(--app-control-border) 82%, transparent);
  border-radius: 11px;
  background: color-mix(in srgb, var(--app-menu-bg) 88%, transparent);
  box-shadow:
    0 10px 28px color-mix(in srgb, #000 16%, transparent),
    0 1px 0 color-mix(in srgb, #fff 36%, transparent) inset;
  backdrop-filter: blur(14px) saturate(1.1);
}
.grp { display: inline-flex; gap: 2px; }
.ic-btn {
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  font: inherit;
  cursor: pointer;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: color-mix(in srgb, var(--app-fg) 82%, var(--app-muted));
  transition: color 0.12s ease, background 0.12s ease, border-color 0.12s ease;
}
.ic-btn:hover:not(:disabled) {
  color: var(--app-primary-color);
  border-color: color-mix(in srgb, var(--app-primary-color) 30%, transparent);
  background: color-mix(in srgb, var(--app-primary-color) 8%, transparent);
}
.ic-btn.on {
  color: #fff;
  background: var(--app-primary-color);
  border-color: var(--app-primary-color);
}
.ic-btn.danger:hover:not(:disabled) {
  color: #dc2626;
  border-color: color-mix(in srgb, #dc2626 35%, transparent);
  background: color-mix(in srgb, #dc2626 8%, transparent);
}
.ic-btn:disabled { opacity: 0.35; cursor: default; }
.align-glyph { font-size: 13px; font-weight: 700; line-height: 1; }
.sep {
  width: 1px;
  height: 18px;
  margin: 0 2px;
  background: color-mix(in srgb, var(--app-border) 70%, transparent);
}
</style>
