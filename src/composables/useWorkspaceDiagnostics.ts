import { computed, shallowRef } from 'vue'
import { listAllAssetIds } from '../core/assets'
import { diagnoseWorkspace } from '../core/workspace/diagnostics'
import { useDocumentStore } from '../stores/document'
import { useWorkspaceIndex } from './useWorkspaceIndex'

const availableAssetIds = shallowRef<ReadonlySet<string>>(new Set())
const assetIdsLoading = shallowRef(false)
let initialized = false

export function useWorkspaceDiagnostics() {
  const doc = useDocumentStore()
  const { workspaceIndex } = useWorkspaceIndex()

  async function refreshAssetIds() {
    assetIdsLoading.value = true
    try {
      availableAssetIds.value = new Set(await listAllAssetIds())
    } finally {
      assetIdsLoading.value = false
    }
  }

  if (!initialized) {
    initialized = true
    void refreshAssetIds()
  }

  const diagnostics = computed(() => diagnoseWorkspace(workspaceIndex.value, availableAssetIds.value))
  const currentDiagnostics = computed(() =>
    diagnostics.value.filter((item) => item.docId === doc.currentId),
  )

  return { diagnostics, currentDiagnostics, assetIdsLoading, refreshAssetIds }
}
