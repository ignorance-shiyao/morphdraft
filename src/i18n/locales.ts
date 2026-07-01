export const LOCALE_STORAGE_KEY = 'mddoc:locale'

export const SUPPORTED_LOCALES = [
  { value: 'system', label: 'language.system' },
  { value: 'zh-CN', label: 'language.zhCN' },
  { value: 'en-US', label: 'language.enUS' },
  { value: 'ja-JP', label: 'language.jaJP' },
  { value: 'es-ES', label: 'language.esES' },
  { value: 'de-DE', label: 'language.deDE' },
  { value: 'fr-FR', label: 'language.frFR' },
  { value: 'pt-BR', label: 'language.ptBR' },
  { value: 'ko-KR', label: 'language.koKR' },
] as const

export type AppLocale = Exclude<(typeof SUPPORTED_LOCALES)[number]['value'], 'system'>
export type LocaleMode = (typeof SUPPORTED_LOCALES)[number]['value']

const LANGUAGE_MAP: Record<string, AppLocale> = {
  zh: 'zh-CN',
  en: 'en-US',
  ja: 'ja-JP',
  es: 'es-ES',
  de: 'de-DE',
  fr: 'fr-FR',
  pt: 'pt-BR',
  ko: 'ko-KR',
}

export function resolveLocale(languages: readonly string[]): AppLocale {
  for (const raw of languages) {
    const normalized = raw.toLowerCase()
    const exact = SUPPORTED_LOCALES.find((item) => item.value.toLowerCase() === normalized)
    if (exact && exact.value !== 'system') return exact.value
    const base = normalized.split('-')[0]
    if (LANGUAGE_MAP[base]) return LANGUAGE_MAP[base]
  }
  return 'en-US'
}

export function systemLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return ['en-US']
  return navigator.languages?.length ? navigator.languages : [navigator.language]
}

export function effectiveLocale(mode: LocaleMode, languages = systemLanguages()): AppLocale {
  return mode === 'system' ? resolveLocale(languages) : mode
}
