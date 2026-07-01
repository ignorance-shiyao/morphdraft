import { extractAssetIds } from '../assets'

export interface PortableDocInput {
  id: string
  title: string
  contentMarkdown: string
}

export interface PortableDocument {
  id: string
  title: string
  path: string
  contentMarkdown: string
}

export interface PortableAsset {
  id: string
  path: string
  blob: Blob
}

export interface PortableManifest {
  schema: 1
  exportedAt: string
  documents: { id: string; title: string; path: string }[]
  assets: { id: string; path: string; size: number; mime: string }[]
  missingAssets: string[]
}

export interface PortablePackage {
  documents: PortableDocument[]
  assets: PortableAsset[]
  manifest: PortableManifest
}

export type PortableFileWriter = (path: string, data: string | Blob) => Promise<void>

function portableReadme(pack: PortablePackage): string {
  const missing = pack.manifest.missingAssets.length
    ? `\n## 缺失资源\n\n${pack.manifest.missingAssets.map((id) => `- asset://${id}`).join('\n')}\n`
    : ''
  return [
    '# MorphDraft 便携包',
    '',
    '- `documents/`：Markdown 文档',
    '- `assets/`：文档引用的本地资源',
    '- `manifest.json`：文档与资源清单',
    '',
    '文档中的 `asset://` 引用已改写为相对路径，可复制整个目录后继续使用。',
    missing,
  ].join('\n')
}

function safePathPart(value: string): string {
  return value
    .trim()
    .replace(/[\/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 100) || '未命名文档'
}

export function portableDocumentFilename(title: string, used: Set<string>): string {
  const base = safePathPart(title)
  let filename = `${base}.md`
  let suffix = 2
  while (used.has(filename.toLocaleLowerCase())) {
    filename = `${base}-${suffix}.md`
    suffix++
  }
  used.add(filename.toLocaleLowerCase())
  return filename
}

function rewriteLineAssets(line: string, available: ReadonlySet<string>): string {
  const parts = line.split('`')
  return parts.map((part, index) => {
    if (index % 2 === 1) return part
    return part.replace(/asset:\/\/([a-zA-Z0-9._-]+)/g, (full, id: string) =>
      available.has(id) ? `../assets/${id}` : full,
    )
  }).join('`')
}

export function rewritePortableAssets(markdown: string, available: ReadonlySet<string>): string {
  let inFence = false
  return markdown.split('\n').map((line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence
      return line
    }
    return inFence ? line : rewriteLineAssets(line, available)
  }).join('\n')
}

export async function buildPortablePackage(
  docs: readonly PortableDocInput[],
  loadAsset: (id: string) => Promise<Blob | null>,
): Promise<PortablePackage> {
  const referenced = [...new Set(docs.flatMap((doc) => extractAssetIds(doc.contentMarkdown)))]
  const assets: PortableAsset[] = []
  const missingAssets: string[] = []

  for (const id of referenced) {
    const blob = await loadAsset(id)
    if (blob) assets.push({ id, path: `assets/${id}`, blob })
    else missingAssets.push(id)
  }

  const available = new Set(assets.map((asset) => asset.id))
  const usedNames = new Set<string>()
  const documents = docs.map((doc) => ({
    id: doc.id,
    title: doc.title,
    path: `documents/${portableDocumentFilename(doc.title, usedNames)}`,
    contentMarkdown: rewritePortableAssets(doc.contentMarkdown, available),
  }))

  return {
    documents,
    assets,
    manifest: {
      schema: 1,
      exportedAt: new Date().toISOString(),
      documents: documents.map(({ id, title, path }) => ({ id, title, path })),
      assets: assets.map(({ id, path, blob }) => ({
        id,
        path,
        size: blob.size,
        mime: blob.type || 'application/octet-stream',
      })),
      missingAssets,
    },
  }
}

export async function writePortableDirectory(
  pack: PortablePackage,
  write: PortableFileWriter,
): Promise<void> {
  for (const doc of pack.documents) await write(doc.path, doc.contentMarkdown)
  for (const asset of pack.assets) await write(asset.path, asset.blob)
  await write('manifest.json', JSON.stringify(pack.manifest, null, 2))
  await write('README.md', portableReadme(pack))
}

export async function createPortableZip(pack: PortablePackage): Promise<Blob> {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  await writePortableDirectory(pack, async (path, data) => {
    zip.file(path, data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : data)
  })
  return zip.generateAsync({ type: 'blob' })
}

export async function savePortableDirectory(
  pack: PortablePackage,
  folderName: string,
): Promise<string | null> {
  const { open } = await import('@tauri-apps/plugin-dialog')
  const fs = await import('@tauri-apps/plugin-fs')
  const selected = await open({ directory: true, multiple: false })
  if (!selected || typeof selected !== 'string') return null
  const root = `${selected}/${safePathPart(folderName)}`
  await fs.mkdir(`${root}/documents`, { recursive: true })
  if (pack.assets.length) await fs.mkdir(`${root}/assets`, { recursive: true })
  await writePortableDirectory(pack, async (path, data) => {
    const target = `${root}/${path}`
    if (typeof data === 'string') await fs.writeTextFile(target, data)
    else await fs.writeFile(target, new Uint8Array(await data.arrayBuffer()))
  })
  return root
}
