// 文档 ↔ 存储对象映射（B1）：把 DocFull/DocMeta 与远端对象布局（设计 §7）互转。纯函数、可单测。
//
//   documents/<id>.md      正文（裸 Markdown，可被他人直接用）
//   assets/<assetId>       图片附件（assetId 自带扩展名）
//   .morphdraft/index.json 文档元数据（title/tags/mode/theme/updatedAt/folder），可重建
//
// docId 走路径派生（documents/<id>.md），与正文解耦——正文保持纯 Markdown 的可移植性。
import type { DocFull, DocMeta } from '../docTypes'

export const INDEX_PATH = '.morphdraft/index.json'
const DOC_PREFIX = 'documents/'
const ASSET_PREFIX = 'assets/'

const enc = new TextEncoder()
const dec = new TextDecoder()

// docId → 对象路径
export function docObjectPath(docId: string): string {
  return `${DOC_PREFIX}${docId}.md`
}

// 对象路径 → docId（非 documents/*.md 返回 null）
export function docIdFromObjectPath(path: string): string | null {
  if (!path.startsWith(DOC_PREFIX) || !path.endsWith('.md')) return null
  const id = path.slice(DOC_PREFIX.length, -'.md'.length)
  return id || null
}

// assetId（含扩展名）→ 对象路径
export function assetObjectPath(assetId: string): string {
  return `${ASSET_PREFIX}${assetId}`
}

export function assetIdFromObjectPath(path: string): string | null {
  if (!path.startsWith(ASSET_PREFIX)) return null
  return path.slice(ASSET_PREFIX.length) || null
}

// 文档正文 → 对象字节（纯 Markdown）
export function docToBytes(doc: DocFull): Uint8Array {
  return enc.encode(doc.contentMarkdown)
}

// 对象字节 + 元数据 → DocFull（元数据缺失时回落：标题用 id、其它取默认）
export function bytesToDoc(docId: string, bytes: Uint8Array, meta?: DocMeta): DocFull {
  const contentMarkdown = dec.decode(bytes)
  return {
    id: docId,
    title: meta?.title ?? docId,
    mode: meta?.mode ?? 'document',
    themeId: meta?.themeId ?? '',
    updatedAt: meta?.updatedAt ?? '',
    tags: meta?.tags ?? [],
    folder: meta?.folder,
    contentMarkdown,
  }
}

// DocFull → 索引元数据条目（不含正文）
export function toIndexMeta(doc: DocMeta): DocMeta {
  return {
    id: doc.id,
    title: doc.title,
    mode: doc.mode,
    themeId: doc.themeId,
    updatedAt: doc.updatedAt,
    tags: doc.tags ?? [],
    folder: doc.folder,
  }
}

// 文档元数据数组 → index.json 字节
export function buildIndex(metas: DocMeta[]): Uint8Array {
  return enc.encode(JSON.stringify({ version: 1, documents: metas.map(toIndexMeta) }, null, 2))
}

// index.json 字节 → 元数据 Map（按 id）。损坏/缺失返回空 Map。
export function parseIndex(bytes: Uint8Array | null | undefined): Map<string, DocMeta> {
  const out = new Map<string, DocMeta>()
  if (!bytes) return out
  try {
    const obj = JSON.parse(dec.decode(bytes)) as { documents?: DocMeta[] }
    for (const m of obj.documents ?? []) {
      if (m && typeof m.id === 'string') out.set(m.id, toIndexMeta(m))
    }
  } catch {
    /* 损坏索引：交由调用方按正文回落 */
  }
  return out
}
