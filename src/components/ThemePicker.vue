<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { useThemeStore } from '../stores/theme'
import { HUES, composeTheme, LIGHT_MODE, DARK_MODE } from '../core/themes/compose'
import { applyTheme } from '../core/themes/apply'
import Icon from './Icon.vue'

const props = withDefaults(defineProps<{ placement?: 'toolbar' | 'rail' }>(), { placement: 'toolbar' })

const theme = useThemeStore()
const { t } = useI18n({ useScope: 'global' })
const open = ref(false)
const root = ref<HTMLElement | null>(null)

const QUICK_HIDDEN_HUES = new Set(['midnight'])
const hueList = computed(() => Object.values(HUES).filter((h) => !QUICK_HIDDEN_HUES.has(h.id)))

const currentHue = computed(() => HUES[theme.hueId] ?? HUES['azure'])

// M1T-4: 自定义色系
const customizing = ref(false)
const customHue = ref({ name: '', primaryColor: '#6c5ce7', bgTint: '#ffffff', darkBg: '#0b1020' })

function startCustom() {
  // 从当前色系复制
  const h = currentHue.value
  customHue.value = { name: h.name + t('themePicker.copySuffix'), primaryColor: h.primaryColor, bgTint: h.bgTint, darkBg: h.darkBg }
  customizing.value = true
}

function cancelCustom() {
  customizing.value = false
}

function saveCustom() {
  const id = 'custom-' + Date.now()
  const hue = { ...customHue.value, id }
  theme.saveCustomHue(hue)
  customizing.value = false
}
const modeLabel = computed(() => {
  switch (theme.modePreference) {
    case 'light': return t('themePicker.light')
    case 'dark': return t('themePicker.dark')
    case 'system': return t('themePicker.system')
  }
})

function previewHue(hueId: string) {
  const hue = HUES[hueId]
  if (!hue) return
  const isDark = theme.modePreference === 'system' ? theme.systemDark : theme.modePreference === 'dark'
  applyTheme(composeTheme(hue, isDark ? DARK_MODE : LIGHT_MODE))
}

function restore() {
  applyTheme(theme.tokens)
}

function pickHue(hueId: string) {
  open.value = false
  nextTick().then(() => requestAnimationFrame(() => {
    theme.setHue(hueId)
  }))
}

function setMode(mode: 'light' | 'dark' | 'system') {
  theme.setMode(mode)
}

function toggle() {
  open.value = !open.value
}

function closeAndRestore() {
  open.value = false
  restore()
}

// 失焦即收：按 Esc 关闭并恢复（点外已由 .backdrop 处理）
function onKeydown(e: KeyboardEvent) {
  if (open.value && e.key === 'Escape') { e.stopPropagation(); closeAndRestore() }
}
// 失焦即收：全局 pointerdown，点到 trigger+面板之外就关闭并恢复。
// 不用 backdrop——它在顶栏的层叠上下文里盖不住工具栏其他元素/工作区，点别处不生效。
function onOutside(e: PointerEvent) {
  if (open.value && !root.value?.contains(e.target as Node)) closeAndRestore()
}
onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('pointerdown', onOutside, true)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('pointerdown', onOutside, true)
})
</script>

<template>
  <div class="theme-picker" :class="`place-${props.placement}`" ref="root">
    <button v-if="props.placement === 'rail'" class="rail-trigger" :class="{ on: open }" @click="toggle" :title="t('themePicker.theme')">
      <Icon name="palette" :size="18" />
      <span class="rail-dot" :style="{ background: currentHue.primaryColor }"></span>
    </button>
    <button v-else class="trigger" @click="toggle" :title="t('themePicker.switchTheme')">
      <span class="dot" :style="{ background: currentHue.primaryColor }"></span>
      <span class="name">{{ currentHue.name }}</span>
      <span class="caret">▾</span>
    </button>

    <template v-if="open">
      <div class="panel" @mouseleave="restore">
        <!-- 第一层：色系网格 -->
        <div class="hue-grid">
          <button
            v-for="h in hueList"
            :key="h.id"
            class="hue-swatch"
            :class="{ active: h.id === theme.hueId }"
            :style="{ borderColor: h.id === theme.hueId ? h.primaryColor : 'transparent' }"
            @mouseenter="previewHue(h.id)"
            @click="pickHue(h.id)"
          >
            <span
              class="style-preview"
              :style="{ '--preview-primary': h.primaryColor, '--preview-bg': h.bgTint }"
            >
              <span class="preview-title"></span>
              <span class="preview-line wide"></span>
              <span class="preview-line"></span>
            </span>
            <span class="hue-name">{{ h.name }}</span>
          </button>
          <button
            v-if="!customizing"
            class="hue-swatch custom-swatch"
            @click="startCustom"
          >
            <span class="style-preview custom-preview">
              <span class="custom-plus">+</span>
            </span>
            <span class="hue-name">{{ t('themePicker.custom') }}</span>
          </button>
        </div>

        <!-- 第二层：明暗三态 -->
        <div class="mode-row">
          <button
            :class="{ active: theme.modePreference === 'light' }"
            @click="setMode('light')"
          >{{ t('themePicker.light') }}</button>
          <button
            :class="{ active: theme.modePreference === 'dark' }"
            @click="setMode('dark')"
          >{{ t('themePicker.dark') }}</button>
          <button
            :class="{ active: theme.modePreference === 'system' }"
            @click="setMode('system')"
          >{{ t('themePicker.system') }}</button>
        </div>

        <!-- M1T-4: 自定义色系 -->
        <div v-if="customizing" class="custom-editor">
          <div class="custom-header">
            <span>{{ t('themePicker.customStyle') }}</span>
            <button class="custom-cancel" @click="cancelCustom">{{ t('common.cancel') }}</button>
          </div>
          <div class="custom-field">
            <label>{{ t('themePicker.styleName') }}</label>
            <input v-model="customHue.name" :placeholder="t('themePicker.styleNamePlaceholder')" />
          </div>
          <div class="custom-field">
            <label>{{ t('themePicker.primaryColor') }}</label>
            <div class="color-input">
              <input type="color" v-model="customHue.primaryColor" />
              <input v-model="customHue.primaryColor" placeholder="#6c5ce7" />
            </div>
          </div>
          <div class="custom-field">
            <label>{{ t('themePicker.lightBackground') }}</label>
            <div class="color-input">
              <input type="color" v-model="customHue.bgTint" />
              <input v-model="customHue.bgTint" placeholder="#ffffff" />
            </div>
          </div>
          <div class="custom-field">
            <label>{{ t('themePicker.darkBackground') }}</label>
            <div class="color-input">
              <input type="color" v-model="customHue.darkBg" />
              <input v-model="customHue.darkBg" placeholder="#0b1020" />
            </div>
          </div>
          <button class="custom-save" @click="saveCustom">{{ t('themePicker.saveAndApply') }}</button>
        </div>

        <div class="tip">{{ t('themePicker.tip') }}</div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.theme-picker { position: relative; }
/* 左侧导航条形态：图标按钮，面板朝右弹、底部对齐 */
.rail-trigger {
  position: relative;
  display: grid; place-items: center;
  width: 36px; height: 36px;
  border: 0; border-radius: 10px;
  background: transparent; color: var(--app-muted);
  cursor: pointer;
  transition: color 0.14s ease, background 0.14s ease;
}
.rail-trigger:hover, .rail-trigger.on { color: var(--app-primary-color); background: var(--app-hover); }
.rail-trigger.on { background: var(--app-active); }
.rail-dot {
  position: absolute; right: 6px; bottom: 6px;
  width: 8px; height: 8px; border-radius: 50%;
  box-shadow: 0 0 0 2px var(--app-shell-bg);
}
.place-rail .panel {
  left: calc(100% + 10px); right: auto; bottom: 0; top: auto;
}
.trigger {
  display: inline-flex; align-items: center; gap: 6px;
  font: inherit; font-size: 12px; font-weight: 700; line-height: 1;
  height: 32px;
  padding: 0 10px; cursor: pointer;
  border: 1px solid transparent;
  background: transparent;
  color: var(--app-fg); border-radius: 9px;
  box-shadow: none;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}
.trigger:hover {
  border-color: color-mix(in srgb, var(--app-primary-color) 48%, var(--app-border));
  color: var(--app-primary-color);
  background: color-mix(in srgb, var(--app-primary-color) 8%, transparent);
}
.trigger .dot {
  width: 12px; height: 12px; border-radius: 50%;
  box-shadow: 0 0 0 1px rgba(0,0,0,0.1) inset, 0 0 0 4px color-mix(in srgb, currentColor 8%, transparent);
}
.trigger .caret { color: var(--app-muted); font-size: 10px; }

.backdrop { position: fixed; inset: 0; z-index: var(--z-toolbar-menu); }
.panel {
  position: absolute; right: 0; top: calc(100% + 8px); z-index: calc(var(--z-toolbar-menu) + 1);
  width: 348px; padding: 12px; border-radius: var(--radius-xl);
  background: var(--app-elevated);
  border: 1px solid var(--app-hairline);
  box-shadow: var(--shadow-lg);
}
.hue-grid {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px;
  margin-bottom: 10px;
}
.hue-swatch {
  display: flex; flex-direction: column; align-items: stretch; gap: 5px;
  padding: 6px; border-radius: 10px; cursor: pointer;
  border: 2px solid transparent;
  background: var(--app-shell-bg);
  transition: all 0.12s ease;
}
.hue-swatch:hover { background: var(--app-hover); }
.hue-swatch.active { background: var(--app-active); }
.custom-swatch {
  border-style: dashed;
  color: var(--app-muted);
}
.custom-swatch:hover {
  color: var(--app-primary-color);
  border-color: color-mix(in srgb, var(--app-primary-color) 48%, transparent);
}
.style-preview {
  height: 42px;
  border-radius: 7px;
  padding: 8px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 4px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--preview-primary) 16%, transparent), transparent 52%),
    var(--preview-bg);
  border: 1px solid color-mix(in srgb, var(--preview-primary) 24%, transparent);
  box-shadow: 0 1px 4px rgba(0,0,0,0.08);
}
.preview-title {
  width: 42%;
  height: 7px;
  border-radius: 4px;
  background: var(--preview-primary);
}
.preview-line {
  width: 56%;
  height: 4px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--preview-primary) 34%, transparent);
}
.preview-line.wide {
  width: 76%;
}
.custom-preview {
  align-items: center;
  justify-content: center;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--app-primary-color) 10%, transparent), transparent 58%),
    color-mix(in srgb, var(--app-fg) 4%, var(--app-bg));
  border-style: dashed;
}
.custom-plus {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  color: var(--app-primary-color);
  background: color-mix(in srgb, var(--app-primary-color) 10%, transparent);
  font-size: 18px;
  line-height: 1;
}
.hue-name { font-size: 11px; font-weight: 650; color: var(--app-fg); text-align: center; }

.mode-row {
  display: flex; gap: 4px; padding: 3px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--app-fg) 5%, var(--app-bg));
  border: 1px solid color-mix(in srgb, var(--app-border) 55%, transparent);
}
.mode-row button {
  flex: 1; padding: 6px 8px; border-radius: 6px;
  font: inherit; font-size: 11px; font-weight: 650; cursor: pointer;
  border: 0; background: transparent; color: var(--app-muted);
  transition: all 0.12s ease;
}
.mode-row button.active {
  background: var(--app-primary-color); color: #fff;
  box-shadow: 0 2px 6px color-mix(in srgb, var(--app-primary-color) 28%, transparent);
}
.mode-row button:not(.active):hover { color: var(--app-fg); background: color-mix(in srgb, var(--app-fg) 6%, transparent); }

.tip { margin-top: 10px; font-size: 11px; color: var(--app-muted); text-align: center; }

/* M1T-4: 自定义色系编辑器 */
.custom-editor { margin-top: 8px; padding: 10px; border-radius: 10px; background: color-mix(in srgb, var(--app-fg) 4%, var(--app-bg)); }
.custom-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; font-size: 12px; font-weight: 700; color: var(--app-fg); }
.custom-cancel { font: inherit; font-size: 11px; border: 0; background: none; color: var(--app-muted); cursor: pointer; }
.custom-field { margin-bottom: 8px; }
.custom-field label { display: block; font-size: 11px; font-weight: 650; color: var(--app-muted); margin-bottom: 4px; }
.custom-field input[type="text"] {
  width: 100%; box-sizing: border-box; font: inherit; font-size: 12px; padding: 5px 8px;
  border: 1px solid color-mix(in srgb, var(--app-border) 84%, transparent); border-radius: 6px;
  background: var(--app-bg); color: var(--app-fg); outline: none;
}
.color-input { display: flex; gap: 6px; align-items: center; }
.color-input input[type="color"] { width: 28px; height: 28px; border: 0; border-radius: 6px; cursor: pointer; padding: 0; }
.color-input input[type="text"] { flex: 1; }
.custom-save {
  width: 100%; padding: 8px; border-radius: 8px; cursor: pointer;
  font: inherit; font-size: 12px; font-weight: 700;
  border: 0; background: var(--app-primary-color); color: #fff;
  transition: opacity 0.12s ease;
}
.custom-save:hover { opacity: 0.9; }
</style>
