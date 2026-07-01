import { useDialog } from './useDialog'
import { useDocumentStore } from '../stores/document'
import { translate } from '../i18n'

export function useSafeRename() {
  const doc = useDocumentStore()
  const dialog = useDialog()

  async function renameDocumentSafely(title: string): Promise<boolean> {
    const nextTitle = title.trim()
    if (!nextTitle || nextTitle === doc.title) return false
    try {
      const plan = await doc.prepareSafeRename(nextTitle)
      const affected = plan.referenceChanges.length
      const details = plan.referenceChanges
        .slice(0, 6)
        .map((change) => translate('safeRename.referenceLine', {
          title: change.title,
          lines: change.lines.map((line) => line + 1).join(translate('safeRename.lineJoiner')),
        }))
        .join('\n')
      const ok = await dialog.confirm({
        title: translate('safeRename.title', { oldTitle: plan.oldTitle, newTitle: plan.newTitle }),
        message: affected
          ? translate('safeRename.affectedMessage', {
            count: affected,
            details,
            more: affected > 6 ? translate('safeRename.moreDocs', { count: affected - 6 }) : '',
          })
          : translate('safeRename.noReferences'),
        confirmText: translate('safeRename.confirm'),
        cancelText: translate('common.cancel'),
      })
      if (!ok) return false
      await doc.executeSafeRename(plan)
      return true
    } catch (error) {
      await dialog.alert({
        title: translate('safeRename.failed'),
        message: error instanceof Error ? error.message : String(error),
        tone: 'danger',
      })
      return false
    }
  }

  return { renameDocumentSafely }
}
