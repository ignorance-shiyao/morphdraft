import { createI18n } from 'vue-i18n'
import { getString, setString } from '../core/localStore'
import { effectiveLocale, LOCALE_STORAGE_KEY, type LocaleMode } from './locales'
import { messages } from './messages'

const initialMode = getString(LOCALE_STORAGE_KEY, 'system') as LocaleMode

export const i18n = createI18n({
  legacy: false,
  locale: effectiveLocale(initialMode),
  fallbackLocale: 'en-US',
  messages,
})

export function setLocaleMode(mode: LocaleMode): void {
  setString(LOCALE_STORAGE_KEY, mode)
  const locale = effectiveLocale(mode)
  i18n.global.locale.value = locale
  document.documentElement.lang = locale
}

export function applyStoredLocale(): void {
  setLocaleMode(getString(LOCALE_STORAGE_KEY, 'system') as LocaleMode)
}

export function startSystemLocaleSync(): void {
  window.addEventListener('languagechange', () => {
    const mode = getString(LOCALE_STORAGE_KEY, 'system') as LocaleMode
    if (mode === 'system') setLocaleMode(mode)
  })
}

export function translate(key: string, params?: Record<string, unknown>): string {
  return i18n.global.t(key, params ?? {}) as string
}
