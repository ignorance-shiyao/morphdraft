// HttpServerProvider（B1）：按设计 §9.2 HTTP 契约实现的客户端 StorageProvider。
//
//   GET    /v1/objects?prefix=<p>   列对象（JSON：{ objects: RemoteRef[] } 或裸数组）
//   GET    /v1/objects/<path>       取对象（200 带 ETag 头；404 → null）
//   PUT    /v1/objects/<path>       写对象（If-Match 乐观锁；ifMatch=undefined 用 If-None-Match:* 仅创建；412 → 冲突）
//   DELETE /v1/objects/<path>       删对象（If-Match；404 容忍）
//
// fetch 经构造注入，便于单测（默认取 globalThis.fetch）。鉴权用 Bearer token。
import type { StorageProvider, RemoteRef, StorageCaps } from '../types'
import { ConflictError } from '../types'

export interface HttpProviderOptions {
  baseUrl: string
  token?: string
  // 注入 fetch（测试替身 / Tauri 自定义客户端）；默认 globalThis.fetch。
  fetch?: typeof fetch
}

type RawRef = { path: string; etag?: string; size?: number; mtime?: string }

export class HttpServerProvider implements StorageProvider {
  readonly id = 'http'
  readonly caps: StorageCaps = {
    versions: false,
    conditionalWrite: true,
    list: true,
    incremental: false,
    e2eCompatible: true,
  }
  private base: string
  private token?: string
  private fetchImpl: typeof fetch

  constructor(opts: HttpProviderOptions) {
    // 去掉末尾斜杠，统一拼接。
    this.base = opts.baseUrl.replace(/\/+$/, '')
    this.token = opts.token
    const f = opts.fetch ?? globalThis.fetch
    if (!f) throw new Error('HttpServerProvider: no fetch available')
    this.fetchImpl = f.bind(globalThis)
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    const h: Record<string, string> = { ...extra }
    if (this.token) h.Authorization = `Bearer ${this.token}`
    return h
  }

  // 编码对象路径：逐段 encodeURIComponent 但保留分隔斜杠。
  private objectUrl(path: string): string {
    const enc = path.split('/').map(encodeURIComponent).join('/')
    return `${this.base}/v1/objects/${enc}`
  }

  async list(prefix: string): Promise<RemoteRef[]> {
    const url = `${this.base}/v1/objects?prefix=${encodeURIComponent(prefix)}`
    const res = await this.fetchImpl(url, { headers: this.headers() })
    if (!res.ok) throw new Error(`list failed: ${res.status}`)
    const data = (await res.json()) as { objects?: RawRef[] } | RawRef[]
    const arr = Array.isArray(data) ? data : (data.objects ?? [])
    return arr.map((r) => ({ path: r.path, etag: r.etag, size: r.size, mtime: r.mtime }))
  }

  async get(path: string): Promise<{ bytes: Uint8Array; ref: RemoteRef } | null> {
    const res = await this.fetchImpl(this.objectUrl(path), { headers: this.headers() })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`get failed: ${res.status}`)
    const buf = new Uint8Array(await res.arrayBuffer())
    const etag = normalizeEtag(res.headers.get('ETag'))
    return { bytes: buf, ref: { path, etag, size: buf.length } }
  }

  async put(path: string, bytes: Uint8Array, ifMatch?: string): Promise<RemoteRef> {
    // ifMatch 提供 → If-Match 条件覆盖；否则 If-None-Match:* 仅在不存在时创建。
    const cond: Record<string, string> = ifMatch !== undefined ? { 'If-Match': ifMatch } : { 'If-None-Match': '*' }
    const res = await this.fetchImpl(this.objectUrl(path), {
      method: 'PUT',
      headers: this.headers({ 'Content-Type': 'application/octet-stream', ...cond }),
      body: toBody(bytes),
    })
    if (res.status === 412) throw new ConflictError(path, await safeRef(res, path))
    if (!res.ok) throw new Error(`put failed: ${res.status}`)
    const etag = normalizeEtag(res.headers.get('ETag'))
    return { path, etag, size: bytes.length }
  }

  async delete(path: string, ifMatch?: string): Promise<void> {
    const cond: Record<string, string> = ifMatch !== undefined ? { 'If-Match': ifMatch } : {}
    const res = await this.fetchImpl(this.objectUrl(path), {
      method: 'DELETE',
      headers: this.headers(cond),
    })
    if (res.status === 412) throw new ConflictError(path, await safeRef(res, path))
    if (res.status === 404) return // 已不存在视为删除成功
    if (!res.ok) throw new Error(`delete failed: ${res.status}`)
  }
}

// ETag 头常带引号（W/"..." 或 "..."），统一去掉弱标记与引号。
function normalizeEtag(raw: string | null): string | undefined {
  if (!raw) return undefined
  return raw.replace(/^W\//, '').replace(/^"|"$/g, '')
}

// 412 响应体可选携带当前远端 ref（用于冲突副本命名）。
async function safeRef(res: Response, path: string): Promise<RemoteRef | undefined> {
  const etag = normalizeEtag(res.headers.get('ETag'))
  if (etag) return { path, etag }
  return undefined
}

// Uint8Array 直接作为 body；某些 fetch 实现需要 ArrayBuffer 视图，统一传 buffer 切片。
function toBody(bytes: Uint8Array): BodyInit {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}
