import { shallowRef, watch } from 'vue'
import { buildIndex, updateDocInIndex, type DocInput, type WorkspaceIndex } from '../core/workspace'
import { useDocumentStore } from '../stores/document'
import { translate } from '../i18n'

const workspaceIndex = shallowRef<WorkspaceIndex>(buildIndex([]))
const workspaceIndexLoading = shallowRef(false)
let initialized = false
let refreshRun = 0
let updateTimer: number | undefined

export function useWorkspaceIndex() {
  const doc = useDocumentStore()

  async function refreshWorkspaceIndex() {
    const run = ++refreshRun
    if (!doc.backendOn) {
      workspaceIndex.value = buildIndex([])
      return
    }
    workspaceIndexLoading.value = true
    const inputs: DocInput[] = []
    try {
      for (const meta of doc.list) {
        try {
          const contentMarkdown = meta.id === doc.currentId
            ? doc.markdown
            : (await doc.backend.get(meta.id)).contentMarkdown
          inputs.push({ id: meta.id, title: meta.title || translate('documentStore.untitled'), contentMarkdown })
        } catch {
          // 单篇读取失败不阻塞其余索引。
        }
      }
      if (run === refreshRun) workspaceIndex.value = buildIndex(inputs)
    } finally {
      if (run === refreshRun) workspaceIndexLoading.value = false
    }
  }

  function updateCurrentDoc() {
    if (!doc.currentId) return
    workspaceIndex.value = updateDocInIndex(workspaceIndex.value, {
      id: doc.currentId,
      title: doc.title,
      contentMarkdown: doc.markdown,
    })
  }

  if (!initialized) {
    initialized = true
    watch(
      () => `${doc.backendOn}:${doc.list.map((item) => `${item.id}:${item.title}`).join('|')}`,
      () => void refreshWorkspaceIndex(),
      { immediate: true },
    )
    watch(
      () => [doc.currentId, doc.title, doc.markdown],
      () => {
        window.clearTimeout(updateTimer)
        updateTimer = window.setTimeout(updateCurrentDoc, 120)
      },
    )
  }

  return { workspaceIndex, workspaceIndexLoading, refreshWorkspaceIndex, updateCurrentDoc }
}
