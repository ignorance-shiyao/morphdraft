import { isSupported, type LocalSource } from './local'
import type { ImportProgressStage } from './types'

export interface DroppedImportItem {
  id: string
  title: string
  via: string
}

export interface DroppedImportResult {
  imported: number
  skipped: string[]
  failed: Array<{ name: string; message: string }>
  firstId: string
}

export interface DroppedImportProgress {
  index: number
  total: number
  name: string
  stage: ImportProgressStage
  detail?: string
}

interface DroppedImportActions {
  importOne(source: LocalSource): Promise<DroppedImportItem>
  open(id: string): Promise<void>
  onProgress?(info: DroppedImportProgress): void
}

export async function importDroppedSources(
  sources: LocalSource[],
  actions: DroppedImportActions,
): Promise<DroppedImportResult> {
  const skipped: string[] = []
  const failed: Array<{ name: string; message: string }> = []
  let imported = 0
  let firstId = ''
  const total = sources.length
  let index = 0

  for (const source of sources) {
    index++
    if (!isSupported(source.name)) {
      skipped.push(source.name)
      actions.onProgress?.({ index, total, name: source.name, stage: 'queued', detail: 'skipped' })
      continue
    }
    actions.onProgress?.({ index, total, name: source.name, stage: 'reading' })
    try {
      actions.onProgress?.({ index, total, name: source.name, stage: 'converting' })
      const item = await actions.importOne(source)
      if (!firstId) firstId = item.id
      imported++
      actions.onProgress?.({
        index,
        total,
        name: source.name,
        stage: 'saving',
        detail: item.via,
      })
    } catch (error) {
      failed.push({
        name: source.name,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (firstId) {
    actions.onProgress?.({ index: total, total, name: '', stage: 'opening' })
    await actions.open(firstId)
  }
  return { imported, skipped, failed, firstId }
}
