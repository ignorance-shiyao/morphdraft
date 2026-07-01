// M1W-5: IndexedDB → 工作目录迁移
// 桌面端首次升级时检测 IndexedDB 旧文档→引导一键迁移。
// 迁移可重入（中断后再跑不重复）；IndexedDB 保留只读备份 30 天。

import { localDocuments, type LocalDocumentsBackup } from './localDocuments'
import { getString, setString } from './localStore'

const MIGRATION_KEY = 'mddoc:migration-done'
const MIGRATION_BACKUP_KEY = 'mddoc:migration-backup-date'

export interface MigrationResult {
  migrated: number
  skipped: number
  errors: string[]
}

// 检查是否需要迁移
export async function needsMigration(): Promise<boolean> {
  try {
    // 已迁移过
    if (getString(MIGRATION_KEY, '')) return false
    // IndexedDB 有文档
    const docs = await localDocuments.list()
    return docs.length > 0
  } catch {
    return false
  }
}

// 执行迁移：IndexedDB → 文件系统
export async function migrateToWorkDir(workDir: string): Promise<MigrationResult> {
  const result: MigrationResult = { migrated: 0, skipped: 0, errors: [] }

  try {
    // 1. 导出 IndexedDB 完整备份
    const backup = await localDocuments.exportBackup()

    // 2. 写入每篇文档为 .md 文件
    const { writeFile, mkdir } = await import('@tauri-apps/plugin-fs')

    for (const doc of backup.documents) {
      try {
        const filename = safeFilename(doc.title || '未命名文档') + '.md'
        const path = `${workDir}/${filename}`
        const encoder = new TextEncoder()
        await writeFile(path, encoder.encode(doc.contentMarkdown))
        result.migrated++
      } catch (e) {
        result.errors.push(`Failed to migrate doc ${doc.id}: ${e}`)
      }
    }

    // 3. 写入版本快照
    const versionsDir = `${workDir}/.morphdraft/versions`
    await mkdir(versionsDir, { recursive: true }).catch(() => {})

    for (const ver of backup.versions) {
      try {
        const filename = `${ver.documentId}.v${ver.versionNo}.md`
        const path = `${versionsDir}/${filename}`
        const encoder = new TextEncoder()
        await writeFile(path, encoder.encode(ver.contentMarkdown))
      } catch (e) {
        result.errors.push(`Failed to migrate version ${ver.id}: ${e}`)
      }
    }

    // 4. 标记迁移完成
    setString(MIGRATION_KEY, '1')
    setString(MIGRATION_BACKUP_KEY, new Date().toISOString())

  } catch (e) {
    result.errors.push(`Migration failed: ${e}`)
  }

  return result
}

// 检查备份是否过期（30 天）
export function isBackupExpired(): boolean {
  const dateStr = getString(MIGRATION_BACKUP_KEY, '')
  if (!dateStr) return false
  const date = new Date(dateStr)
  const now = new Date()
  const days = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
  return days > 30
}

function safeFilename(title: string): string {
  return title
    .replace(/[\/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 80)
    || 'untitled'
}
