// 内存 StorageProvider（B1）：纯内存实现，作 StorageProvider 契约的参考实现 + 单测替身。
// 不接网络、不碰真实存储；syncEngine 与未来 SyncedBackend 的测试都用它驱动。
import type { StorageProvider, RemoteRef, StorageCaps } from '../types'
import { ConflictError } from '../types'

interface Entry { bytes: Uint8Array; etag: string }

// 内容寻址 etag：同字节同 etag、改字节换 etag（便于比对与冲突判定）。
function hashEtag(bytes: Uint8Array): string {
  let h = 2166136261 >>> 0 // FNV-1a
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]
    h = Math.imul(h, 16777619) >>> 0
  }
  return `m${h.toString(16)}-${bytes.length}`
}

export interface MemoryProviderOptions {
  // 注入故障：抛错模拟离线/服务端不可用（同步引擎应据此 deferred）。
  failNext?: () => boolean
}

export class MemoryProvider implements StorageProvider {
  readonly id = 'memory'
  readonly caps: StorageCaps = {
    versions: false,
    conditionalWrite: true,
    list: true,
    incremental: false,
    e2eCompatible: true,
  }
  private store = new Map<string, Entry>()
  private fail?: () => boolean

  constructor(opts: MemoryProviderOptions = {}) {
    this.fail = opts.failNext
  }

  private guard() {
    if (this.fail?.()) throw new Error('memory provider offline')
  }

  async list(prefix: string): Promise<RemoteRef[]> {
    this.guard()
    const out: RemoteRef[] = []
    for (const [path, e] of this.store) {
      if (path.startsWith(prefix)) out.push({ path, etag: e.etag, size: e.bytes.length })
    }
    return out
  }

  async get(path: string): Promise<{ bytes: Uint8Array; ref: RemoteRef } | null> {
    this.guard()
    const e = this.store.get(path)
    if (!e) return null
    return { bytes: e.bytes, ref: { path, etag: e.etag, size: e.bytes.length } }
  }

  async put(path: string, bytes: Uint8Array, ifMatch?: string): Promise<RemoteRef> {
    this.guard()
    const cur = this.store.get(path)
    // 乐观锁：带 ifMatch 时远端现状必须匹配（ifMatch 为 undefined 表示「期望对象不存在」）
    if (ifMatch !== undefined || cur) {
      const curEtag = cur?.etag
      if (curEtag !== ifMatch) throw new ConflictError(path, cur ? { path, etag: cur.etag } : undefined)
    }
    const etag = hashEtag(bytes)
    this.store.set(path, { bytes, etag })
    return { path, etag, size: bytes.length }
  }

  async delete(path: string, ifMatch?: string): Promise<void> {
    this.guard()
    const cur = this.store.get(path)
    if (ifMatch !== undefined && cur && cur.etag !== ifMatch) {
      throw new ConflictError(path, { path, etag: cur.etag })
    }
    this.store.delete(path)
  }

  // —— 测试辅助 ——
  _seed(path: string, bytes: Uint8Array): string {
    const etag = hashEtag(bytes)
    this.store.set(path, { bytes, etag })
    return etag
  }
  _has(path: string): boolean { return this.store.has(path) }
}
