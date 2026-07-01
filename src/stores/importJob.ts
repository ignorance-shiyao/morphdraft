import { defineStore } from 'pinia'
import { importDroppedSources, type DroppedImportResult } from '../core/import/drop'
import type { LocalSource } from '../core/import/local'
import type { ImportProgressStage } from '../core/import/types'
import { useDocumentStore } from './document'
import { translate } from '../i18n'

export type ImportStage = ImportProgressStage

export interface ImportJobSnapshot {
  active: boolean
  current: number
  total: number
  fileName: string
  stage: ImportStage
  detail: string
  minimized: boolean
  result: DroppedImportResult | null
  error: string
}

function idleSnapshot(): ImportJobSnapshot {
  return {
    active: false,
    current: 0,
    total: 0,
    fileName: '',
    stage: 'idle',
    detail: '',
    minimized: false,
    result: null,
    error: '',
  }
}

/** 让出主线程，确保进度 UI 有机会绘制后再跑重转换。 */
export function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

export const useImportJobStore = defineStore('importJob', {
  state: (): ImportJobSnapshot => idleSnapshot(),

  getters: {
    progressPct(state): number {
      if (!state.total) return 0
      const base = Math.max(0, state.current - 1)
      const stageBoost = state.stage === 'converting' ? 0.35
        : state.stage === 'saving' ? 0.7
        : state.stage === 'opening' ? 0.9
        : 0.05
      return Math.min(100, Math.round(((base + stageBoost) / state.total) * 100))
    },
    isVisible(state): boolean {
      return state.active || state.stage === 'done' || state.stage === 'error'
    },
  },

  actions: {
    reset() {
      Object.assign(this, idleSnapshot())
    },

    dismiss() {
      if (this.stage === 'converting' || this.stage === 'reading' || this.stage === 'saving' || this.stage === 'opening') return
      this.reset()
    },

    toggleMinimized() {
      this.minimized = !this.minimized
    },

    patch(partial: Partial<ImportJobSnapshot>) {
      Object.assign(this, partial)
    },

    async runBatch(sources: LocalSource[], options: { openFirst?: boolean } = {}) {
      if (this.active) return null
      const supported = sources.filter((s) => s.name)
      if (!supported.length) return null

      const doc = useDocumentStore()
      const openFirst = options.openFirst !== false

      this.patch({
        ...idleSnapshot(),
        active: true,
        total: supported.length,
        current: 0,
        stage: 'queued',
        detail: '',
      })
      await yieldToUi()

      try {
        const result = await importDroppedSources(supported, {
          onProgress: (info) => {
            this.patch({
              active: true,
              current: info.index,
              total: info.total,
              fileName: info.name,
              stage: info.stage,
              detail: info.detail,
            })
          },
          importOne: async (source) => {
            await yieldToUi()
            const imported = await doc.importLocalDocument(source, {
              open: false,
              onProgress: (p) => {
                this.patch({
                  fileName: source.name,
                  stage: p.stage,
                  detail: p.detail ?? '',
                })
              },
            })
            if (!imported.id) throw new Error(translate('documentStore.missingImportedId'))
            return { id: imported.id, title: imported.title, via: imported.via }
          },
          open: openFirst
            ? async (id) => {
                this.patch({ stage: 'opening', detail: '' })
                await doc.open(id)
              }
            : async () => {},
        })

        this.patch({
          active: false,
          stage: 'done',
          result,
          error: '',
          detail: '',
        })
        return result
      } catch (error) {
        this.patch({
          active: false,
          stage: 'error',
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },
  },
})
