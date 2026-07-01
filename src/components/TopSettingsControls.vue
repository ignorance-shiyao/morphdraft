<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '../stores/settings'
import { fontOptionsForKind, type FontKind } from '../core/fonts'
import { SUPPORTED_LOCALES, type LocaleMode } from '../i18n/locales'
import Icon from './Icon.vue'

const settings = useSettingsStore()
const { t } = useI18n({ useScope: 'global' })

const fontOpen = ref(false)
const root = ref<HTMLElement | null>(null)

const localeOptions = computed(() => SUPPORTED_LOCALES.map((item) => ({
  value: item.value,
  label: t(item.label),
})))
const currentLocaleLabel = computed(() => localeOptions.value.find((item) => item.value === settings.localeMode)?.label ?? t('language.system'))

const bodyFontOptions = computed(() => fontOptionsForKind('body', settings.systemFonts))
const headingFontOptions = computed(() => fontOptionsForKind('heading', settings.systemFonts))
const codeFontOptions = computed(() => fontOptionsForKind('code', settings.systemFonts))

function setFont(kind: FontKind, event: Event) {
  settings.setFont(kind, (event.target as HTMLSelectElement).value)
}

function onPointerDown(event: PointerEvent) {
  if (!root.value?.contains(event.target as Node)) fontOpen.value = false
}

onMounted(() => window.addEventListener('pointerdown', onPointerDown))
onBeforeUnmount(() => window.removeEventListener('pointerdown', onPointerDown))
</script>

<template>
  <div ref="root" class="top-settings" :aria-label="t('common.settings')">
    <label class="top-select language-select" :title="t('language.title')">
      <Icon name="message" :size="14" />
      <span class="select-label">{{ currentLocaleLabel }}</span>
      <select
        :aria-label="t('language.title')"
        :value="settings.localeMode"
        @change="settings.setLocale(($event.target as HTMLSelectElement).value as LocaleMode)"
      >
        <option v-for="locale in localeOptions" :key="locale.value" :value="locale.value">{{ locale.label }}</option>
      </select>
    </label>

    <div class="font-menu">
      <button
        class="top-button"
        type="button"
        :class="{ on: fontOpen }"
        :title="t('settingsPage.typographyTitle')"
        @click="fontOpen = !fontOpen"
      >
        <Icon name="type" :size="14" />
        <span>{{ t('settings.typography') }}</span>
        <Icon name="chevron-down" :size="12" />
      </button>
      <div v-if="fontOpen" class="font-popover">
        <div class="font-popover-head">
          <strong>{{ t('settingsPage.typographyTitle') }}</strong>
          <small>{{ t('settingsPage.typographyDescription') }}</small>
        </div>
        <label class="font-field">
          <span>{{ t('settingsPage.bodyFont') }}</span>
          <select :value="settings.bodyFont" @change="setFont('body', $event)">
            <option v-for="font in bodyFontOptions" :key="font.value" :value="font.value">{{ font.label }}</option>
          </select>
        </label>
        <label class="font-field">
          <span>{{ t('settingsPage.headingFont') }}</span>
          <select :value="settings.headingFont" @change="setFont('heading', $event)">
            <option v-for="font in headingFontOptions" :key="font.value" :value="font.value">{{ font.label }}</option>
          </select>
        </label>
        <label class="font-field">
          <span>{{ t('settingsPage.codeFont') }}</span>
          <select :value="settings.codeFont" @change="setFont('code', $event)">
            <option v-for="font in codeFontOptions" :key="font.value" :value="font.value">{{ font.label }}</option>
          </select>
        </label>
        <div class="font-actions">
          <button class="font-load" :disabled="settings.fontStatus === 'loading'" @click="settings.loadSystemFonts">
            {{ settings.fontStatus === 'loading' ? t('settingsPage.loadingFonts') : t('settingsPage.loadSystemFonts') }}
          </button>
        </div>
        <p v-if="settings.fontMessage" class="font-message">{{ settings.fontMessage }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.top-settings {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.top-select,
.top-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  max-width: 150px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--app-fg-soft);
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  line-height: 1;
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast);
}
.top-select:hover,
.top-button:hover,
.top-button.on {
  color: var(--app-primary-color);
  background: var(--app-hover);
}
.top-select select {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
.select-label,
.top-button span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.font-menu { position: relative; display: flex; }
.font-popover {
  position: absolute;
  z-index: calc(var(--z-toolbar-menu) + 1);
  top: calc(100% + 8px);
  right: 0;
  width: 330px;
  padding: 12px;
  border: 1px solid var(--app-hairline);
  border-radius: 18px;
  background: var(--app-menu-bg);
  box-shadow: var(--shadow-lg);
}
.font-popover-head {
  display: grid;
  gap: 3px;
  padding: 3px 4px 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--app-border) 55%, transparent);
  margin-bottom: 10px;
}
.font-popover-head strong { font-size: 13px; color: var(--app-fg); }
.font-popover-head small { color: var(--app-muted); line-height: 1.45; }
.font-field {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  margin-top: 8px;
  color: var(--app-muted);
  font-size: 12px;
  font-weight: 700;
}
.font-field select {
  width: 100%;
  min-width: 0;
  border: 1px solid var(--app-control-border);
  border-radius: 10px;
  background: var(--app-control-bg);
  color: var(--app-fg);
  font: inherit;
  font-size: 12px;
  padding: 7px 9px;
  outline: none;
}
.font-field select:focus {
  border-color: var(--app-primary-color);
  box-shadow: 0 0 0 3px var(--app-ring);
}
.font-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
}
.font-load {
  height: 30px;
  padding: 0 11px;
  border: 1px solid var(--app-control-border);
  border-radius: 999px;
  background: var(--app-control-bg);
  color: var(--app-fg-soft);
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.font-load:hover { color: var(--app-primary-color); background: var(--app-hover); }
.font-load:disabled { opacity: .55; cursor: default; }
.font-message {
  margin: 8px 4px 0;
  color: var(--app-muted);
  font-size: 11px;
  line-height: 1.45;
}

@media (max-width: 1180px) {
  .top-select,
  .top-button { max-width: 42px; padding: 0 9px; }
  .select-label,
  .top-button span { display: none; }
}
</style>
