// M8-2: Notion zip 导入（解析导出 zip → md 文件清洗 + csv 表格转 md）
import JSZip from 'jszip'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'

interface NotionImportResult {
  files: { name: string; content: string }[]
  totalCount: number
}

function createTurndown(): TurndownService {
  const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' })
  td.use(gfm)
  return td
}

// 清洗 Notion 导出的文件名（去掉 hash 后缀）
function cleanFileName(name: string): string {
  // Notion 导出格式: "Page Name abc123def456.md" 或 "Page Name abc123def456/"
  return name
    .replace(/\s+[a-f0-9]{20,}\.\w+$/, (ext) => {
      const dotIdx = ext.lastIndexOf('.')
      return ext.slice(dotIdx)
    })
    .replace(/\s+[a-f0-9]{20,}$/, '')
}

// 修复 Notion 内链（%20 → 空格，hash 后缀清理）
function fixLinks(content: string): string {
  return content
    .replace(/%20/g, ' ')
    .replace(/\]\(([^)]*?)(?:\s+[a-f0-9]{20,})?(#[^)]*)?\)/g, (match, path, hash) => {
      const cleanPath = path.replace(/\s+[a-f0-9]{20,}/g, '')
      return `](${cleanPath}${hash || ''})`
    })
}

// CSV 表格转 markdown 表格
function csvToMdTable(csv: string): string {
  const lines = csv.trim().split('\n')
  if (lines.length < 2) return csv
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
  const rows = lines.slice(1).map(l => l.split(',').map(c => c.trim().replace(/^"|"$/g, '')))
  const headerRow = '| ' + headers.join(' | ') + ' |'
  const separator = '| ' + headers.map(() => '---').join(' | ') + ' |'
  const dataRows = rows.map(r => '| ' + r.join(' | ') + ' |').join('\n')
  return headerRow + '\n' + separator + '\n' + dataRows
}

export async function importNotionZip(file: File): Promise<NotionImportResult> {
  const zip = await JSZip.loadAsync(file)
  const files: { name: string; content: string }[] = []
  const td = createTurndown()

  for (const [path, zipEntry] of Object.entries(zip.files)) {
    if (zipEntry.dir) continue

    const cleanPath = cleanFileName(path)
    const ext = cleanPath.split('.').pop()?.toLowerCase()

    // 处理 md 文件
    if (ext === 'md') {
      let content = await zipEntry.async('string')
      content = fixLinks(content)
      // 去掉 Notion 的 YAML frontmatter（通常只有 empty 属性）
      content = content.replace(/^---\s*\n[\s\S]*?---\s*\n/, '')
      files.push({ name: cleanPath.replace(/\.md$/i, ''), content })
    }

    // 处理 csv → 转为 md 表格
    if (ext === 'csv') {
      const csv = await zipEntry.async('string')
      const mdTable = csvToMdTable(csv)
      files.push({ name: cleanPath.replace(/\.csv$/i, ''), content: mdTable })
    }

    // 处理图片：直接存入附件库，引用 asset://（不再内联 base64 撑爆源码）
    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext || '')) {
      const blob = await zipEntry.async('blob')
      const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`
      const { saveAsset } = await import('../assets')
      const asset = await saveAsset(blob, mime)
      files.push({ name: cleanPath, content: `![${cleanPath}](${asset})` })
    }
  }

  return { files, totalCount: files.length }
}
