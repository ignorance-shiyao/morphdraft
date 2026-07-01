import { defineStore } from 'pinia'
import { getString, setString } from '../core/localStore'
import {
    FONT_STORAGE_KEYS,
    applyFontPreferences,
    discoverSystemFonts,
    type FontKind,
} from '../core/fonts'
import { LOCALE_STORAGE_KEY, type LocaleMode } from '../i18n/locales'
import { setLocaleMode, translate } from '../i18n'

const WORK_DIR_KEY = 'mddoc:work-dir'

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    open: false,
    // 工作目录（桌面端 vault 后端用）
    workDir: getString(WORK_DIR_KEY, ''),
    isTauri: '__TAURI_INTERNALS__' in window,
      bodyFont: getString(FONT_STORAGE_KEYS.body, 'theme'),
      headingFont: getString(FONT_STORAGE_KEYS.heading, 'theme'),
      codeFont: getString(FONT_STORAGE_KEYS.code, 'theme'),
      systemFonts: [] as string[],
      fontStatus: 'idle' as 'idle' | 'loading' | 'ready' | 'error',
      fontMessage: '',
      localeMode: getString(LOCALE_STORAGE_KEY, 'system') as LocaleMode,
  }),
  actions: {
    applyConfig() {
        this.applyFonts()
    },
      fontPreferences() {
          return {body: this.bodyFont, heading: this.headingFont, code: this.codeFont}
      },
      applyFonts() {
          applyFontPreferences(document.documentElement.style, this.fontPreferences())
      },
      setFont(kind: FontKind, value: string) {
          if (kind === 'body') this.bodyFont = value
          else if (kind === 'heading') this.headingFont = value
          else this.codeFont = value
          setString(FONT_STORAGE_KEYS[kind], value)
          this.applyFonts()
      },
      setLocale(mode: LocaleMode) {
          this.localeMode = mode
          setString(LOCALE_STORAGE_KEY, mode)
          setLocaleMode(mode)
      },
      async loadSystemFonts() {
          this.fontStatus = 'loading'
          this.fontMessage = ''
          try {
              this.systemFonts = await discoverSystemFonts()
              this.fontStatus = 'ready'
              this.fontMessage = this.systemFonts.length
                  ? translate('fontStatus.loaded', { count: this.systemFonts.length })
                  : translate('fontStatus.empty')
          } catch (error) {
              this.fontStatus = 'error'
              this.fontMessage = error instanceof Error ? error.message : String(error)
          }
    },
    show() {
      this.open = true
    },
    close() {
      this.open = false
    },
    // 工作目录管理（桌面端）
    setWorkDir(dir: string) {
      this.workDir = dir
      setString(WORK_DIR_KEY, dir)
    },
    async pickWorkDir() {
      if (!this.isTauri) return
      const { open } = await import('@tauri-apps/plugin-dialog')
      const selected = await open({ directory: true, multiple: false })
      if (selected && typeof selected === 'string') {
        this.setWorkDir(selected)
        // B1b: 选定工作目录后立即切换到 vault 后端并重扫，无需重启
        // （Pinia action 内懒取 store，不会造成模块循环）
        const { useDocumentStore } = await import('./document')
        await useDocumentStore().reload()
      }
    },
    async openWorkDirInFinder() {
      if (!this.isTauri || !this.workDir) return
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('plugin:shell|open', { path: this.workDir })
    },
  },
})
