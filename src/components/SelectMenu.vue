<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import Icon from './Icon.vue'

interface Opt {
  value: string
  label: string
  preview?: Record<string, string>
}
const props = defineProps<{ value: string; options: Opt[]; width?: number; align?: 'left' | 'right' }>()
const emit = defineEmits<{
  (e: 'update', v: string): void
  (e: 'hover', v: string | null): void
}>()

const open = ref(false)
const root = ref<HTMLElement | null>(null)
const menu = ref<HTMLElement | null>(null)
const menuStyle = ref<Record<string, string>>({})
const current = computed(() => props.options.find((o) => o.value === props.value))

function updateMenuPosition() {
  if (!root.value) return
  const rect = root.value.getBoundingClientRect()
  const viewportGap = 8
  const minWidth = props.width ?? Math.ceil(rect.width)
  const below = window.innerHeight - rect.bottom - viewportGap
  const above = rect.top - viewportGap
  const openAbove = below < 220 && above > below
  const maxHeight = Math.max(140, Math.min(420, openAbove ? above - 5 : below - 5))
  const left = props.align === 'right'
    ? Math.max(viewportGap, Math.round(rect.right - minWidth))
    : Math.min(Math.round(rect.left), Math.max(viewportGap, window.innerWidth - minWidth - viewportGap))
  const style: Record<string, string> = {
    top: `${Math.round(openAbove ? Math.max(viewportGap, rect.top - maxHeight - 5) : rect.bottom + 5)}px`,
    left: `${left}px`,
    minWidth: `${minWidth}px`,
    maxHeight: `${Math.round(maxHeight)}px`,
  }
  menuStyle.value = style
}

async function toggle() {
  open.value = !open.value
  if (open.value) {
    updateMenuPosition()
    await nextTick()
    updateMenuPosition()
  }
}
function close() {
  open.value = false
  emit('hover', null)
}
function pick(v: string) { close(); emit('update', v) }
function onDocClick(e: MouseEvent) {
  const target = e.target as Node
  if (root.value?.contains(target) || menu.value?.contains(target)) return
  close()
}
function onViewportChange() {
  if (open.value) updateMenuPosition()
}
// 失焦即收：点外（pointerdown，比 click 更跟手）或按 Esc 立即关闭，无需选中某项。
function onKeydown(e: KeyboardEvent) {
  if (open.value && e.key === 'Escape') { e.stopPropagation(); close() }
}
onMounted(() => {
  window.addEventListener('pointerdown', onDocClick)
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', onViewportChange)
  window.addEventListener('scroll', onViewportChange, true)
})
onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onDocClick)
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', onViewportChange)
  window.removeEventListener('scroll', onViewportChange, true)
})
</script>

<template>
  <div ref="root" class="sel" :class="{ open }">
    <button type="button" class="sel-trigger" @click.stop="toggle">
      <span class="sel-label">{{ current?.label ?? value }}</span>
      <Icon name="chevron-down" :size="13" class="sel-caret" />
    </button>
    <Teleport to="body">
    <div
      v-if="open"
      ref="menu"
      class="sel-menu"
      :style="menuStyle"
      @mouseleave="emit('hover', null)"
    >
      <button
        v-for="o in options"
        :key="o.value"
        type="button"
        class="sel-opt"
        :class="{ on: o.value === value }"
        @mouseenter="emit('hover', o.value)"
        @click.stop="pick(o.value)"
      >
        <span v-if="o.preview" class="sel-preview" :style="o.preview" aria-hidden="true">
          <span class="sel-preview-title"></span>
          <span class="sel-preview-line"></span>
          <span class="sel-preview-block"></span>
        </span>
        <span class="sel-opt-label">{{ o.label }}</span>
        <Icon v-if="o.value === value" name="check" :size="13" class="sel-check" />
      </button>
    </div>
    </Teleport>
  </div>
</template>

<style scoped>
.sel { position: relative; display: inline-flex; }
.sel-trigger {
  display: inline-flex; align-items: center; gap: 6px;
  font: inherit; font-size: var(--font-size-xs); font-weight: 650; color: var(--app-fg);
  padding: 4px 8px; cursor: pointer;
  border: 1px solid color-mix(in srgb, var(--app-border) 84%, transparent);
  border-radius: var(--radius-sm); background: var(--app-bg);
  transition: border-color var(--transition-fast);
}
.sel-trigger:hover, .sel.open .sel-trigger { border-color: color-mix(in srgb, var(--app-primary-color) 50%, var(--app-border)); }
.sel-caret { color: var(--app-muted); transition: transform var(--transition-fast); }
.sel.open .sel-caret { transform: rotate(180deg); }
.sel-menu {
  position: fixed; z-index: 10000;
  padding: 5px; border-radius: var(--radius-lg);
  border: 1px solid var(--app-hairline);
  background: var(--app-elevated);
  box-shadow: var(--shadow-lg);
  overflow: auto;
  overscroll-behavior: contain;
}
.sel-opt {
  width: 100%; display: flex; align-items: center; gap: 10px;
  font: inherit; font-size: var(--font-size-xs); font-weight: 600; color: var(--app-fg);
  padding: 6px 9px; cursor: pointer; border: 0; border-radius: var(--radius-sm); background: none;
  white-space: nowrap; text-align: left;
}
.sel-opt:hover { background: var(--app-hover); }
.sel-opt.on { color: var(--app-primary-color); background: var(--app-active); }
.sel-opt :deep(.ico) { color: var(--app-primary-color); }
.sel-opt-label { flex: 1 1 auto; min-width: 0; }
.sel-check { flex: 0 0 auto; }
.sel-preview {
  flex: 0 0 auto;
  width: 36px;
  height: 22px;
  border-radius: 5px;
  box-sizing: border-box;
  padding: 4px;
  display: grid;
  grid-template-rows: 4px 3px 1fr;
  gap: 2px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--preview-primary) 18%, transparent), transparent 58%),
    var(--preview-bg);
  border: 1px solid color-mix(in srgb, var(--preview-primary) 34%, var(--app-border));
}
.sel-preview-title {
  width: 42%;
  border-radius: 2px;
  background: var(--preview-primary);
}
.sel-preview-line {
  width: 78%;
  border-radius: 2px;
  background: color-mix(in srgb, var(--preview-fg) 44%, transparent);
}
.sel-preview-block {
  width: 100%;
  border-radius: 2px;
  background: color-mix(in srgb, var(--preview-panel) 74%, transparent);
  border: 1px solid color-mix(in srgb, var(--preview-primary) 20%, transparent);
}
</style>
