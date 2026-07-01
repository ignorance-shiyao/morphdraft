import type { DocFull, DocMeta, DocVersion } from './docTypes'

const DB_NAME = 'morphdraft'
const DB_VERSION = 2
const DOC_STORE = 'documents'
const VERSION_STORE = 'versions'
const ASSETS_STORE = 'assets'

interface StoredDoc extends DocFull {
  createdAt: string
}

interface StoredVersion extends DocVersion {
  documentId: string
}

interface StoredAsset {
  id: string
  blob: Blob
  mime: string
  createdAt: string
}

// 备份中的图片附件：blob 以 data: URL 序列化，便于随 JSON 落盘。
interface SerializedAsset {
  id: string
  mime: string
  createdAt: string
  dataUrl: string
}

export interface LocalDocumentsBackup {
  schema: 1 | 2
  exportedAt: string
  documents: StoredDoc[]
  versions: StoredVersion[]
  // schema 2 起新增；schema 1 备份无此字段（导入时跳过图片）
  assets?: SerializedAsset[]
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export function dataUrlToBlob(dataUrl: string, mime: string): Blob {
  const comma = dataUrl.indexOf(',')
  if (comma === -1) return new Blob([], { type: mime })
  const meta = dataUrl.slice(0, comma)
  const data = dataUrl.slice(comma + 1)
  const bin = /;base64/i.test(meta) ? atob(data) : decodeURIComponent(data)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const detected = /^data:([^;,]+)/.exec(meta)?.[1]
  return new Blob([bytes], { type: detected || mime })
}

function id(prefix: string) {
  const raw = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `${prefix}-${raw}`
}

function now() {
  return new Date().toISOString()
}

function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

let dbPromise: Promise<IDBDatabase> | null = null

function db(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION)
    open.onupgradeneeded = () => {
      const database = open.result
      if (!database.objectStoreNames.contains(DOC_STORE)) {
        database.createObjectStore(DOC_STORE, { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains(VERSION_STORE)) {
        database.createObjectStore(VERSION_STORE, { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains(ASSETS_STORE)) {
        database.createObjectStore(ASSETS_STORE, { keyPath: 'id' })
      }
    }
    open.onsuccess = () => resolve(open.result)
    open.onerror = () => reject(open.error)
  })
  return dbPromise
}

async function allDocs(): Promise<StoredDoc[]> {
  const database = await db()
  return req(database.transaction(DOC_STORE, 'readonly').objectStore(DOC_STORE).getAll() as IDBRequest<StoredDoc[]>)
}

async function allVersions(): Promise<StoredVersion[]> {
  const database = await db()
  return req(database.transaction(VERSION_STORE, 'readonly').objectStore(VERSION_STORE).getAll() as IDBRequest<StoredVersion[]>)
}

async function allAssets(): Promise<StoredAsset[]> {
  const database = await db()
  return req(database.transaction(ASSETS_STORE, 'readonly').objectStore(ASSETS_STORE).getAll() as IDBRequest<StoredAsset[]>)
}

function meta(doc: StoredDoc): DocMeta {
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

export const localDocuments = {
  async ensureSeed(initialMarkdown: string, title: string) {
    const docs = await allDocs()
    if (docs.length) return
    await this.create({ title, contentMarkdown: initialMarkdown })
  },

  async list(): Promise<DocMeta[]> {
    return (await allDocs())
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(meta)
  },

  async get(docId: string): Promise<DocFull> {
    const database = await db()
    const doc = await req(database.transaction(DOC_STORE, 'readonly').objectStore(DOC_STORE).get(docId) as IDBRequest<StoredDoc | undefined>)
    if (!doc) throw new Error('document not found')
    return doc
  },

  async create(input: Partial<DocFull>): Promise<DocFull> {
    const at = now()
    const doc: StoredDoc = {
      id: id('doc'),
      title: input.title || '未命名文档',
      mode: input.mode || 'slide',
      themeId: input.themeId || 'azure',
      contentMarkdown: input.contentMarkdown || '# 新文档\n\n',
      tags: input.tags ?? [],
      folder: input.folder || undefined,
      createdAt: at,
      updatedAt: at,
    }
    const database = await db()
    const tx = database.transaction(DOC_STORE, 'readwrite')
    tx.objectStore(DOC_STORE).put(doc)
    await done(tx)
    return doc
  },

  async update(docId: string, input: Partial<DocFull>): Promise<DocFull> {
    const database = await db()
    const tx = database.transaction(DOC_STORE, 'readwrite')
    const store = tx.objectStore(DOC_STORE)
    const existing = await req(store.get(docId) as IDBRequest<StoredDoc | undefined>)
    if (!existing) throw new Error('document not found')
    const next: StoredDoc = { ...existing, ...input, id: docId, updatedAt: now() }
    store.put(next)
    await done(tx)
    return next
  },

  // 重命名：本地后端无文件名概念，等价于改标题（id 不变，与 fsVault 接口对齐）
  async rename(docId: string, title: string, contentMarkdown: string): Promise<DocFull> {
    return this.update(docId, { title, contentMarkdown })
  },

  async remove(docId: string) {
    const database = await db()
    const versions = await allVersions()
    const tx = database.transaction([DOC_STORE, VERSION_STORE], 'readwrite')
    tx.objectStore(DOC_STORE).delete(docId)
    const versionStore = tx.objectStore(VERSION_STORE)
    versions.filter((v) => v.documentId === docId).forEach((v) => versionStore.delete(v.id))
    await done(tx)
  },

  async snapshot(docId: string): Promise<DocVersion> {
    const doc = await this.get(docId)
    const versions = await this.versions(docId)
    const version: StoredVersion = {
      id: id('ver'),
      documentId: docId,
      versionNo: (versions[0]?.versionNo ?? 0) + 1,
      contentMarkdown: doc.contentMarkdown,
      createdAt: now(),
    }
    const database = await db()
    const tx = database.transaction(VERSION_STORE, 'readwrite')
    tx.objectStore(VERSION_STORE).put(version)
    await done(tx)
    return version
  },

  async versions(docId: string): Promise<DocVersion[]> {
    return (await allVersions())
      .filter((v) => v.documentId === docId)
      .sort((a, b) => b.versionNo - a.versionNo)
      .map(({ documentId: _documentId, ...v }) => v)
  },

  async restore(docId: string, versionNo: number): Promise<DocFull> {
    const version = (await allVersions()).find((v) => v.documentId === docId && v.versionNo === versionNo)
    if (!version) throw new Error('version not found')
    return this.update(docId, { contentMarkdown: version.contentMarkdown })
  },

  async exportBackup(): Promise<LocalDocumentsBackup> {
    const assets = await allAssets()
    const serialized: SerializedAsset[] = await Promise.all(
      assets.map(async (a) => ({
        id: a.id,
        mime: a.mime,
        createdAt: a.createdAt,
        dataUrl: await blobToDataUrl(a.blob),
      })),
    )
    return {
      schema: 2,
      exportedAt: now(),
      documents: await allDocs(),
      versions: await allVersions(),
      assets: serialized,
    }
  },

  async importBackup(backup: LocalDocumentsBackup) {
    if ((backup?.schema !== 1 && backup?.schema !== 2) || !Array.isArray(backup.documents) || !Array.isArray(backup.versions)) {
      throw new Error('备份文件格式不正确')
    }
    const database = await db()
    const tx = database.transaction([DOC_STORE, VERSION_STORE, ASSETS_STORE], 'readwrite')
    const docStore = tx.objectStore(DOC_STORE)
    const versionStore = tx.objectStore(VERSION_STORE)
    const assetStore = tx.objectStore(ASSETS_STORE)
    docStore.clear()
    versionStore.clear()
    assetStore.clear()
    backup.documents.forEach((doc) => docStore.put(doc))
    backup.versions.forEach((version) => versionStore.put(version))
    // schema 2 起含图片附件；schema 1 备份无 assets，跳过
    if (Array.isArray(backup.assets)) {
      backup.assets.forEach((a) => {
        const stored: StoredAsset = {
          id: a.id,
          blob: dataUrlToBlob(a.dataUrl, a.mime),
          mime: a.mime,
          createdAt: a.createdAt,
        }
        assetStore.put(stored)
      })
    }
    await done(tx)
  },

  async clearAll() {
    const database = await db()
    const tx = database.transaction([DOC_STORE, VERSION_STORE, ASSETS_STORE], 'readwrite')
    tx.objectStore(DOC_STORE).clear()
    tx.objectStore(VERSION_STORE).clear()
    tx.objectStore(ASSETS_STORE).clear()
    await done(tx)
  },

  // —— 图片附件 ——
  async saveAsset(blob: Blob, mime: string): Promise<string> {
    const assetId = `asset-${crypto.randomUUID()}`
    const database = await db()
    const tx = database.transaction(ASSETS_STORE, 'readwrite')
    tx.objectStore(ASSETS_STORE).put({ id: assetId, blob, mime, createdAt: now() })
    await done(tx)
    return assetId
  },

  async getAsset(assetId: string): Promise<Blob | null> {
    const database = await db()
    const record = await req(
      database.transaction(ASSETS_STORE, 'readonly')
        .objectStore(ASSETS_STORE)
        .get(assetId) as IDBRequest<StoredAsset | undefined>,
    )
    return record?.blob ?? null
  },

  async listAssetIds(): Promise<string[]> {
    const database = await db()
    return req(
      database.transaction(ASSETS_STORE, 'readonly').objectStore(ASSETS_STORE).getAllKeys() as IDBRequest<string[]>,
    )
  },

  async deleteAsset(assetId: string): Promise<void> {
    const database = await db()
    const tx = database.transaction(ASSETS_STORE, 'readwrite')
    tx.objectStore(ASSETS_STORE).delete(assetId)
    await done(tx)
  },
}
