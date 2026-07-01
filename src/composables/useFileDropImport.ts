import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { LocalSource } from '../core/import/local'
import { useImportJobStore } from '../stores/importJob'

export function useFileDropImport() {
  const active = ref(false)
  const job = useImportJobStore()
  let dragDepth = 0
  let unlistenTauri: (() => void) | undefined

  function containsFiles(event: DragEvent): boolean {
    return Array.from(event.dataTransfer?.types ?? []).includes('Files')
  }

  function isEditorImageDrag(event: DragEvent): boolean {
    const target = event.target as HTMLElement | null
    if (!target?.closest('.cm-editor')) return false
    const items = Array.from(event.dataTransfer?.items ?? [])
    return items.length > 0 && items.every((item) => item.kind === 'file' && item.type.startsWith('image/'))
  }

  async function importSources(sources: LocalSource[]) {
    if (!sources.length) return
    active.value = false
    void job.runBatch(sources)
  }

  function onDragEnter(event: DragEvent) {
    if (!containsFiles(event) || isEditorImageDrag(event)) return
    event.preventDefault()
    dragDepth++
    active.value = true
  }

  function onDragOver(event: DragEvent) {
    if (!containsFiles(event) || isEditorImageDrag(event)) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    active.value = true
  }

  function onDragLeave(event: DragEvent) {
    if (!containsFiles(event)) return
    dragDepth = Math.max(0, dragDepth - 1)
    if (!dragDepth) active.value = false
  }

  function onDrop(event: DragEvent) {
    if (!containsFiles(event) || isEditorImageDrag(event)) return
    event.preventDefault()
    event.stopPropagation()
    dragDepth = 0
    active.value = false
    const files = Array.from(event.dataTransfer?.files ?? [])
    void importSources(files.map((file) => ({ name: file.name, file })))
  }

  onMounted(async () => {
    window.addEventListener('dragenter', onDragEnter, true)
    window.addEventListener('dragover', onDragOver, true)
    window.addEventListener('dragleave', onDragLeave, true)
    window.addEventListener('drop', onDrop, true)

    if ('__TAURI_INTERNALS__' in window) {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      unlistenTauri = await getCurrentWindow().onDragDropEvent((event) => {
        if (event.payload.type === 'enter' || event.payload.type === 'over') active.value = true
        else if (event.payload.type === 'leave') active.value = false
        else if (event.payload.type === 'drop') {
          active.value = false
          const sources = event.payload.paths.map((path) => ({
            name: path.split(/[/\\]/).pop() || path,
            path,
          }))
          void importSources(sources)
        }
      })
    }
  })

  onBeforeUnmount(() => {
    window.removeEventListener('dragenter', onDragEnter, true)
    window.removeEventListener('dragover', onDragOver, true)
    window.removeEventListener('dragleave', onDragLeave, true)
    window.removeEventListener('drop', onDrop, true)
    unlistenTauri?.()
  })

  return { active }
}
