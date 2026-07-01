<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { clampFloatingPoint } from '../core/editor/floatingPosition'

const props = defineProps<{
  x: number
  y: number
  canDeleteRow: boolean
  canMoveRowUp: boolean
  canMoveRowDown: boolean
  canMoveColLeft: boolean
  canMoveColRight: boolean
  canDeleteCol: boolean
}>()
const emit = defineEmits<{ (e: 'op', id: string): void; (e: 'close'): void }>()
const { t } = useI18n({ useScope: 'global' })
const menuEl = ref<HTMLElement | null>(null)
const menuStyle = ref({ left: `${props.x}px`, top: `${props.y}px` })

function updatePosition() {
  const rect = menuEl.value?.getBoundingClientRect()
  if (!rect) return
  const position = clampFloatingPoint(
    { x: props.x, y: props.y },
    { width: rect.width, height: rect.height },
    { width: window.innerWidth, height: window.innerHeight },
  )
  menuStyle.value = { left: `${position.left}px`, top: `${position.top}px` }
}

onMounted(() => {
  void nextTick(updatePosition)
  window.addEventListener('resize', updatePosition)
})
onBeforeUnmount(() => window.removeEventListener('resize', updatePosition))

function go(id: string, ev: Event) {
  ev.preventDefault()
  ev.stopPropagation()
  emit('op', id)
  emit('close')
}

// O3：模仿 macOS Numbers/截图里那一档右键菜单
interface Item { id: string; label: string; shortcut?: string; disabled?: boolean }
interface Sub { kind: 'sub'; label: string; items: Item[]; defaultId?: string }
type Entry = Item | Sub | { kind: 'sep' }

const sections = computed<Entry[]>(() => [
  {
    kind: 'sub',
    label: t('tableMenu.copyAsMarkdown'),
    defaultId: 'copy-md',
    items: [
      { id: 'copy-tsv', label: t('tableMenu.tsv') },
      { id: 'copy-csv', label: t('tableMenu.csv') },
      { id: 'copy-md', label: t('tableMenu.markdown') },
    ],
  },
  { kind: 'sep' },
  { kind: 'sub', label: t('tableMenu.alignColumn'), items: [
    { id: 'align-left', label: t('tableMenu.alignLeft') },
    { id: 'align-center', label: t('tableMenu.alignCenter') },
    { id: 'align-right', label: t('tableMenu.alignRight') },
  ]},
  { kind: 'sep' },
  { id: 'row-below', label: t('tableMenu.addRow') },
  { id: 'row-above', label: t('tableMenu.addRowAbove'), shortcut: '⌃⌘↑' },
  { id: 'col-right', label: t('tableMenu.addCol') },
  { id: 'col-left', label: t('tableMenu.addColBefore'), shortcut: '⌃⌘←' },
  { kind: 'sep' },
])

function isSub(e: Entry): e is Sub { return (e as Sub).kind === 'sub' }
function isSep(e: Entry): boolean { return (e as { kind?: string }).kind === 'sep' }
function isItem(e: Entry): e is Item { return !isSub(e) && !isSep(e) }
</script>

<template>
  <Teleport to="body">
    <div class="tcm-overlay" @pointerdown.self="emit('close')" @contextmenu.prevent="emit('close')">
      <div ref="menuEl" class="tcm" :style="menuStyle" role="menu" @contextmenu.prevent>
        <template v-for="(e, i) in sections" :key="i">
          <div v-if="isSep(e)" class="tcm-sep"></div>
          <button v-else-if="isItem(e)" class="tcm-item" :disabled="(e as any).disabled" @click="go((e as any).id, $event)">
            <span class="tcm-label">{{ (e as any).label }}</span>
            <span v-if="(e as any).shortcut" class="tcm-sc">{{ (e as any).shortcut }}</span>
          </button>
          <div v-else class="tcm-sub">
            <template v-if="(e as Sub).defaultId">
              <div class="tcm-split">
                <button class="tcm-item tcm-split-main" @click="go((e as Sub).defaultId!, $event)">
                  <span class="tcm-label">{{ (e as Sub).label }}</span>
                </button>
                <div class="tcm-split-caret">
                  <span class="tcm-arrow" aria-hidden="true">›</span>
                  <div class="tcm-submenu">
                    <button v-for="it in (e as Sub).items" :key="it.id" class="tcm-item" :disabled="it.disabled" @click="go(it.id, $event)">
                      <span class="tcm-label">{{ it.label }}</span>
                    </button>
                  </div>
                </div>
              </div>
            </template>
            <template v-else>
              <button class="tcm-item tcm-sub-trigger" type="button">
                <span class="tcm-label">{{ (e as Sub).label }}</span>
                <span class="tcm-arrow">›</span>
              </button>
              <div class="tcm-submenu">
                <button v-for="it in (e as Sub).items" :key="it.id" class="tcm-item" :disabled="it.disabled" @click="go(it.id, $event)">
                  <span class="tcm-label">{{ it.label }}</span>
                </button>
              </div>
            </template>
          </div>
        </template>
        <div class="tcm-sep"></div>
        <button class="tcm-item" :disabled="!canMoveRowUp" @click="go('row-up', $event)">
          <span class="tcm-label">{{ t('tableMenu.moveRowUp') }}</span>
          <span class="tcm-sc">⌥⌘↑</span>
        </button>
        <button class="tcm-item" :disabled="!canMoveRowDown" @click="go('row-down', $event)">
          <span class="tcm-label">{{ t('tableMenu.moveRowDown') }}</span>
          <span class="tcm-sc">⌥⌘↓</span>
        </button>
        <button class="tcm-item" :disabled="!canMoveColLeft" @click="go('col-move-left', $event)">
          <span class="tcm-label">{{ t('tableMenu.moveColLeft') }}</span>
          <span class="tcm-sc">⌥⌘←</span>
        </button>
        <button class="tcm-item" :disabled="!canMoveColRight" @click="go('col-move-right', $event)">
          <span class="tcm-label">{{ t('tableMenu.moveColRight') }}</span>
          <span class="tcm-sc">⌥⌘→</span>
        </button>
        <div class="tcm-sep"></div>
        <button class="tcm-item danger" :disabled="!canDeleteRow" @click="go('row-del', $event)">
          <span class="tcm-label">{{ t('tableMenu.deleteRow') }}</span>
          <span class="tcm-sc">⌃⌘⌫</span>
        </button>
        <button class="tcm-item danger" :disabled="!canDeleteCol" @click="go('col-del', $event)">
          <span class="tcm-label">{{ t('tableMenu.deleteCol') }}</span>
          <span class="tcm-sc">⌃⇧⌘⌫</span>
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.tcm-overlay { position: fixed; inset: 0; z-index: 9999; }
.tcm {
  position: fixed;
  min-width: 286px;
  padding: 8px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--app-menu-bg, var(--app-elevated)) 96%, white), var(--app-menu-bg, var(--app-elevated)));
  border: 1px solid color-mix(in srgb, var(--app-control-border, var(--app-hairline)) 76%, transparent);
  border-radius: 16px;
  box-shadow:
    0 22px 54px rgba(15, 23, 42, 0.22),
    0 4px 14px rgba(15, 23, 42, 0.10),
    inset 0 1px 0 rgba(255, 255, 255, 0.42);
  backdrop-filter: blur(18px) saturate(1.25);
  -webkit-backdrop-filter: blur(18px) saturate(1.25);
  font-size: 14px;
  user-select: none;
}
.tcm-item {
  position: relative; width: 100%;
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  min-height: 30px;
  padding: 6px 12px;
  border: 0; background: none; cursor: pointer; color: var(--app-fg);
  border-radius: 9px; font: inherit;
  letter-spacing: -0.01em;
}
.tcm-item:hover:not(:disabled) {
  background: color-mix(in srgb, var(--primary-color, #3478f6) 10%, transparent);
  color: color-mix(in srgb, var(--primary-color, #3478f6) 72%, var(--app-fg));
}
.tcm-item:disabled { color: var(--app-muted); cursor: default; opacity: 0.55; }
.tcm-item.danger:hover:not(:disabled) { color: #e5484d; background: color-mix(in srgb, #e5484d 9%, transparent); }
.tcm-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tcm-sc {
  flex: 0 0 auto;
  min-width: 44px;
  text-align: right;
  color: color-mix(in srgb, var(--app-muted) 78%, transparent);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  letter-spacing: -0.04em;
}
.tcm-item:hover:not(:disabled) .tcm-sc {
  color: color-mix(in srgb, var(--primary-color, #3478f6) 52%, var(--app-muted));
}
.tcm-sep { height: 1px; margin: 5px 8px; background: color-mix(in srgb, var(--app-border) 58%, transparent); }
.tcm-arrow { color: var(--app-muted); }
.tcm-sub { position: relative; }
.tcm-split {
  display: flex;
  align-items: stretch;
  width: 100%;
  border-radius: 9px;
}
.tcm-split:hover { background: color-mix(in srgb, var(--primary-color, #3478f6) 10%, transparent); }
.tcm-split-main {
  flex: 1 1 auto;
  min-width: 0;
  border-radius: 9px 0 0 9px;
}
.tcm-split-main:hover { background: transparent; }
.tcm-split-caret {
  position: relative;
  display: flex;
  align-items: center;
  padding: 0 8px 0 2px;
  cursor: default;
}
.tcm-submenu {
  position: absolute; left: 100%; top: -8px; margin-left: 8px;
  min-width: 188px; padding: 8px;
  background: var(--app-menu-bg, var(--app-elevated));
  border: 1px solid color-mix(in srgb, var(--app-control-border, var(--app-hairline)) 76%, transparent);
  border-radius: 14px;
  box-shadow:
    0 18px 44px rgba(15, 23, 42, 0.20),
    0 3px 12px rgba(15, 23, 42, 0.10);
  backdrop-filter: blur(18px) saturate(1.2);
  -webkit-backdrop-filter: blur(18px) saturate(1.2);
  display: none;
}
.tcm-split-caret:hover > .tcm-submenu,
.tcm-sub:focus-within > .tcm-submenu { display: block; }
.tcm-sub:not(:has(.tcm-split)):hover > .tcm-submenu { display: block; }
</style>
