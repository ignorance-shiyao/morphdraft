import { defineStore } from 'pinia'
import { PRESETS, DEFAULT_THEME_ID, type ThemeTokens } from '../core/themes/presets'
import { applyTheme } from '../core/themes/apply'
import { HUES, resolveThemeId, composeTheme, type HueTokens } from '../core/themes/compose'
import { LIGHT_MODE, DARK_MODE } from '../core/themes/compose'
import { getString, setString } from '../core/localStore'

const STORAGE_KEY = 'mddoc:theme'
const HUE_KEY = 'mddoc:theme-hue'
const MODE_KEY = 'mddoc:theme-mode'
const CUSTOM_HUES_KEY = 'mddoc:custom-hues'
type ModePreference = 'light' | 'dark' | 'system'

function hasStoredPreference(): boolean {
  return Boolean(getString(STORAGE_KEY, '') || getString(HUE_KEY, '') || getString(MODE_KEY, ''))
}

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(value)
}

function normalizeHue(value: unknown): HueTokens | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Partial<HueTokens>
  if (
    typeof v.id !== 'string' ||
    !v.id.startsWith('custom-') ||
    typeof v.name !== 'string' ||
    !isHexColor(v.primaryColor) ||
    !isHexColor(v.bgTint) ||
    !isHexColor(v.darkBg)
  ) return null
  return {
    id: v.id,
    name: v.name.trim() || 'Custom',
    primaryColor: v.primaryColor,
    bgTint: v.bgTint,
    darkBg: v.darkBg,
    headingFamily: typeof v.headingFamily === 'string' ? v.headingFamily : undefined,
  }
}

function loadCustomHues(): HueTokens[] {
  const raw = getString(CUSTOM_HUES_KEY, '')
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map(normalizeHue).filter((h): h is HueTokens => Boolean(h))
  } catch {
    return []
  }
}

function saveCustomHues(): void {
  const hues = Object.values(HUES).filter((h) => h.id.startsWith('custom-'))
  setString(CUSTOM_HUES_KEY, JSON.stringify(hues))
}

for (const hue of loadCustomHues()) HUES[hue.id] = hue

function loadId(): string {
  const id = getString(STORAGE_KEY, '')
  if (id && (PRESETS[id] || resolveThemeId(id))) return id
  return DEFAULT_THEME_ID
}

function loadHue(): string {
  const hue = getString(HUE_KEY, '')
  return hue && hue !== 'midnight' && HUES[hue] ? hue : 'azure'
}

function loadMode(): ModePreference {
  const m = getString(MODE_KEY, '')
  if (m === 'light' || m === 'dark' || m === 'system') return m
  return 'light'
}

function resolveHueChoice(id: string): { hueId: string; mode?: Exclude<ModePreference, 'system'> } | null {
  if (HUES[id]) return { hueId: id, mode: id === 'midnight' ? 'dark' : undefined }

  const resolved = resolveThemeId(id)
  if (!resolved) return null

  const hueId = resolved.id.replace(/-(light|dark)$/, '')
  if (!HUES[hueId]) return null
  return { hueId, mode: resolved.dark ? 'dark' : 'light' }
}

export const useThemeStore = defineStore('theme', {
  state: () => ({
    userId: loadId(),
    // M1T: 双维主题
    hueId: loadHue(),
    modePreference: loadMode(),
    systemDark: false,
    hasUserPreference: hasStoredPreference(),
  }),
  getters: {
    effectiveId(state): string {
      return state.userId
    },
    tokens(): ThemeTokens {
      // 优先用新的 compose 系统
      const hue = HUES[this.hueId]
      if (hue) {
        const isDark = this.modePreference === 'system' ? this.systemDark : this.modePreference === 'dark'
        return composeTheme(hue, isDark ? DARK_MODE : LIGHT_MODE)
      }
      // 回退到旧 PRESETS
      return PRESETS[this.userId] ?? PRESETS[DEFAULT_THEME_ID]
    },
    dark(state): boolean {
      if (state.modePreference === 'system') return state.systemDark
      return state.modePreference === 'dark'
    },
  },
  actions: {
    setUserTheme(id: string, options?: { persist?: boolean }) {
      const persist = options?.persist !== false
      // 尝试解析为 hue + mode
      const choice = resolveHueChoice(id)
      if (choice) {
        this.hueId = choice.hueId
        this.userId = choice.hueId
        if (choice.mode) this.modePreference = choice.mode
        if (persist) {
          setString(HUE_KEY, choice.hueId)
          setString(STORAGE_KEY, choice.hueId)
          if (choice.mode) setString(MODE_KEY, choice.mode)
          this.hasUserPreference = true
        }
        this.apply()
        return
      }
      // 旧 PRESETS 兼容
      if (!PRESETS[id] || id === this.userId) {
        if (PRESETS[id]) this.apply()
        return
      }
      this.userId = id
      if (persist) {
        setString(STORAGE_KEY, id)
        this.hasUserPreference = true
      }
      this.apply()
    },
    applyDocumentTheme(id: string) {
      this.setUserTheme(id, { persist: false })
    },
    setHue(hueId: string) {
      if (!HUES[hueId] || hueId === this.hueId) return
      this.hueId = hueId
      this.userId = hueId
      setString(HUE_KEY, hueId)
      setString(STORAGE_KEY, hueId)
      this.hasUserPreference = true
      this.apply()
    },
    setMode(mode: ModePreference) {
      this.modePreference = mode
      setString(MODE_KEY, mode)
      this.hasUserPreference = true
      this.apply()
    },
    saveCustomHue(hue: HueTokens) {
      const normalized = normalizeHue(hue)
      if (!normalized) return
      HUES[normalized.id] = normalized
      saveCustomHues()
      this.setHue(normalized.id)
    },
    setSystemDark(dark: boolean) {
      this.systemDark = dark
      if (this.modePreference === 'system') this.apply()
    },
    apply() {
      applyTheme(this.tokens)
    },
    // M1T-3: 监听系统主题变化
    initSystemTheme() {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      this.systemDark = mq.matches
      const handler = (e: MediaQueryListEvent) => {
        this.systemDark = e.matches
        if (this.modePreference === 'system') this.apply()
      }
      mq.addEventListener('change', handler)
    },
  },
})
