// LocalProvider（B1/#4）：把本地持久化包成 StorageProvider 契约，统一抽象。
// 充当同步架构里的「本地缓存 Provider」（设计 §4.1），与远端 Provider + 同步引擎组合。
//
// 不触碰现有 DocBackend / localDocuments 的 schema：底层走可注入的 RawKv —— 生产用独立的
// IndexedDB 库（morphdraft-objects），测试用内存 Map。etag 为内容寻址（同字节同 etag），
// If-Match 乐观锁语义与 MemoryProvider 一致（ifMatch=undefined 表示「期望对象不存在」）。
import type { StorageProvider, RemoteRef, StorageCaps } from '../types'
import { ConflictError } from '../types'

// 底层裸键值存储：只管字节，不管 etag/锁（由 Provider 负责）。
export interface RawKv {
  get(path: string): Promise<Uint8Array | null>
  put(path: string, bytes: Uint8Array): Promise<void>
  delete(path: string): Promise<void>
  keys(prefix: string): Promise<string[]>
}

function hashEtag(bytes: Uint8Array): string {
  let h = 2166136261 >>> 0 // FNV-1a
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]
    h = Math.imul(h, 16777619) >>> 0
  }
  return `l${h.toString(16)}-${bytes.length}`
}

export class LocalProvider implements StorageProvider {
  readonly id = 'local'
  readonly caps: StorageCaps = {
    versions: false,
    conditionalWrite: true,
    list: true,
    incremental: false,
    e2eCompatible: true,
  }
  private kv: RawKv

  constructor(kv: RawKv) {
    this.kv = kv
  }

  async list(prefix: string): Promise<RemoteRef[]> {
    const keys = await this.kv.keys(prefix)
    const out: RemoteRef[] = []
    for (const path of keys) {
      const bytes = await this.kv.get(path)
      if (bytes) out.push({ path, etag: hashEtag(bytes), size: bytes.length })
    }
    return out
  }

  async get(path: string): Promise<{ bytes: Uint8Array; ref: RemoteRef } | null> {
    const bytes = await this.kv.get(path)
    if (!bytes) return null
    return { bytes, ref: { path, etag: hashEtag(bytes), size: bytes.length } }
  }

  async put(path: string, bytes: Uint8Array, ifMatch?: string): Promise<RemoteRef> {
    const cur = await this.kv.get(path)
    // 乐观锁：ifMatch=undefined 表示期望对象不存在；否则现状 etag 必须匹配。
    if (ifMatch !== undefined || cur) {
      const curEtag = cur ? hashEtag(cur) : undefined
      if (curEtag !== ifMatch) throw new ConflictError(path, cur ? { path, etag: curEtag! } : undefined)
    }
    await this.kv.put(path, bytes)
    return { path, etag: hashEtag(bytes), size: bytes.length }
  }

  async delete(path: string, ifMatch?: string): Promise<void> {
    const cur = await this.kv.get(path)
    if (ifMatch !== undefined && cur && hashEtag(cur) !== ifMatch) {
      throw new ConflictError(path, { path, etag: hashEtag(cur) })
    }
    await this.kv.delete(path)
  }
}

// —— 内存 RawKv（测试 / 临时会话）——
export function createMemoryRawKv(): RawKv {
  const map = new Map<string, Uint8Array>()
  return {
    async get(path) { return map.get(path) ?? null },
    async put(path, bytes) { map.set(path, bytes) },
    async delete(path) { map.delete(path) },
    async keys(prefix) { return [...map.keys()].filter((k) => k.startsWith(prefix)) },
  }
}

// —— IndexedDB RawKv（生产，浏览器/Tauri webview）——
// 独立库，避免改动现有 morphdraft 库的 schema/版本。
const OBJ_DB = 'morphdraft-objects'
const OBJ_STORE = 'objects'

function openObjDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(OBJ_DB, 1)
    open.onupgradeneeded = () => {
      const db = open.result
      if (!db.objectStoreNames.contains(OBJ_STORE)) {
        db.createObjectStore(OBJ_STORE, { keyPath: 'path' })
      }
    }
    open.onsuccess = () => resolve(open.result)
    open.onerror = () => reject(open.error)
  })
}

function idbReq<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

// 生产 RawKv：仅在有 indexedDB 的环境创建。
export function createIdbRawKv(): RawKv {
  if (typeof indexedDB === 'undefined') throw new Error('createIdbRawKv: indexedDB unavailable')
  return {
    async get(path) {
      const db = await openObjDb()
      const row = await idbReq(db.transaction(OBJ_STORE, 'readonly').objectStore(OBJ_STORE).get(path) as IDBRequest<{ path: string; bytes: Uint8Array } | undefined>)
      return row ? row.bytes : null
    },
    async put(path, bytes) {
      const db = await openObjDb()
      const tx = db.transaction(OBJ_STORE, 'readwrite')
      tx.objectStore(OBJ_STORE).put({ path, bytes })
      await idbReq(tx.objectStore(OBJ_STORE).count()) // 等事务内请求落地
    },
    async delete(path) {
      const db = await openObjDb()
      const tx = db.transaction(OBJ_STORE, 'readwrite')
      tx.objectStore(OBJ_STORE).delete(path)
      await idbReq(tx.objectStore(OBJ_STORE).count())
    },
    async keys(prefix) {
      const db = await openObjDb()
      const all = await idbReq(db.transaction(OBJ_STORE, 'readonly').objectStore(OBJ_STORE).getAllKeys() as IDBRequest<IDBValidKey[]>)
      return all.map(String).filter((k) => k.startsWith(prefix))
    },
  }
}
