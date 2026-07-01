// M8-3: 文件夹批量导入/导出
import { localDocuments } from '../localDocuments'

// 批量导入：从 File 对象数组导入 .md 文件
export async function batchImportMd(files: File[]): Promise<{ imported: number; skipped: number }> {
  let imported = 0
  let skipped = 0
  for (const file of files) {
    if (!file.name.endsWith('.md')) { skipped++; continue }
    try {
      const content = await file.text()
      const title = file.name.replace(/\.md$/i, '')
      await localDocuments.create({ title, contentMarkdown: content })
      imported++
    } catch {
      skipped++
    }
  }
  return { imported, skipped }
}

// 批量导出：把所有文档导出为 .md 文件（下载 zip）
export async function batchExportMd(): Promise<void> {
  const docs = await localDocuments.list()
  if (!docs.length) return

  // 动态导入 JSZip
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()

  for (const doc of docs) {
    const full = await localDocuments.get(doc.id)
    zip.file(`${doc.title}.md`, full.contentMarkdown)
  }

  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `morphdraft-export-${new Date().toISOString().slice(0, 10)}.zip`
  a.click()
  URL.revokeObjectURL(url)
}
