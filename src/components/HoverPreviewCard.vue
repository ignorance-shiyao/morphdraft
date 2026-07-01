<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { clampFloatingPoint } from '../core/editor/floatingPosition'

const props = defineProps<{
  anchor: { left: number; top: number; bottom: number }
  title: string
  content: string
  exists: boolean
  notFoundText: string
}>()

const emit = defineEmits<{
  (e: 'mouseenter'): void
  (e: 'mouseleave'): void
}>()

const card = ref<HTMLElement | null>(null)
const style = ref({ left: `${props.anchor.left}px`, top: `${props.anchor.bottom + 8}px` })

onMounted(() => {
  const el = card.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const below = props.anchor.bottom + 8
  const above = props.anchor.top - rect.height - 8
  const y = below + rect.height <= window.innerHeight - 8 ? below : above
  const pos = clampFloatingPoint(
    { x: props.anchor.left, y },
    { width: rect.width, height: rect.height },
    { width: window.innerWidth, height: window.innerHeight },
  )
  style.value = { left: `${pos.left}px`, top: `${pos.top}px` }
})
</script>

<template>
  <div
    ref="card"
    class="hover-preview-card"
    :style="style"
    @mouseenter="emit('mouseenter')"
    @mouseleave="emit('mouseleave')"
  >
    <div class="hpc-title">{{ title }}</div>
    <div v-if="!exists" class="hpc-hint">{{ notFoundText }}</div>
    <div v-else-if="content" class="hpc-content">{{ content }}</div>
  </div>
</template>

<style scoped>
.hover-preview-card {
  position: fixed;
  z-index: 2000;
  min-width: 180px;
  max-width: 300px;
  background: var(--app-popover-bg, var(--app-shell-bg));
  border: 1px solid var(--app-border);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,.14);
  padding: 10px 12px;
  pointer-events: auto;
}
.hpc-title {
  font-size: .85rem;
  font-weight: 600;
  color: var(--app-fg);
  line-height: 1.4;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hpc-hint {
  font-size: .75rem;
  color: var(--app-muted, var(--app-secondary-fg));
  font-style: italic;
}
.hpc-content {
  font-size: .75rem;
  color: var(--app-secondary-fg, var(--app-muted));
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: pre-wrap;
}
</style>
