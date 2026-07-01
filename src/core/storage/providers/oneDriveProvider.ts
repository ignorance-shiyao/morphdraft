// OneDriveProvider（B2/云）：把 StorageProvider 契约映射到 Microsoft Graph。
// Graph 是路径寻址 + 原生 ETag/If-Match（最接近我们的对象模型，类似 WebDAV）。
// etag = item 的 eTag；条件写用 If-Match / If-None-Match:*（仅创建）。access token 上层注入。
//
//   GET    /me/drive/root:/{path}:/content   取字节（响应带 ETag）
//   PUT    /me/drive/root:/{path}:/content   写（If-Match / If-None-Match:*；412 冲突）
//   DELETE /me/drive/root:/{path}            删（If-Match；404 容忍）
//   GET    /me/drive/root:/{prefix}:/children 列子项
import type { StorageProvider, RemoteRef, StorageCaps } from '../types'
import { ConflictError } from '../types'

const GRAPH = 'https://graph.microsoft.com/v1.0'

export interface OneDriveProviderOptions {
  getToken: () => Promise<string> | string
  fetch?: typeof fetch
}

export class OneDriveProvider implements StorageProvider {
  readonly id = 'onedrive'
  readonly caps: StorageCaps = {
    versions: true,
    conditionalWrite: true,
    list: true,
    incremental: false,
    e2eCompatible: true,
  }
  private getToken: () => Promise<string> | string
  private fetchImpl: typeof fetch

  constructor(opts: OneDriveProviderOptions) {
    this.getToken = opts.getToken
    const f = opts.fetch ?? globalThis.fetch
    if (!f) throw new Error('OneDriveProvider: no fetch available')
    this.fetchImpl = f.bind(globalThis)
  }

  private async headers(extra?: Record<string, string>): Promise<Record<string, string>> {
    return { Authorization: `Bearer ${await this.getToken()}`, ...extra }
  }

  private encodePath(path: string): string {
    return path.split('/').map(encodeURIComponent).join('/')
  }

  async list(prefix: string): Promise<RemoteRef[]> {
    const p = prefix.replace(/\/+$/, '')
    const res = await this.fetchImpl(`${GRAPH}/me/drive/root:/${this.encodePath(p)}:/children`, {
      headers: await this.headers(),
    })
    if (res.status === 404) return []
    if (!res.ok) throw new Error(`list failed: ${res.status}`)
    const data = (await res.json()) as { value: GraphItem[] }
    return data.value
      .filter((it) => it.file) // 仅文件
      .map((it) => ({ path: `${prefix}${it.name}`, etag: normalizeEtag(it.eTag), size: it.size }))
  }

  async get(path: string): Promise<{ bytes: Uint8Array; ref: RemoteRef } | null> {
    const res = await this.fetchImpl(`${GRAPH}/me/drive/root:/${this.encodePath(path)}:/content`, {
      headers: await this.headers(),
    })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`get failed: ${res.status}`)
    const bytes = new Uint8Array(await res.arrayBuffer())
    return { bytes, ref: { path, etag: normalizeEtag(res.headers.get('ETag')), size: bytes.length } }
  }

  async put(path: string, bytes: Uint8Array, ifMatch?: string): Promise<RemoteRef> {
    const cond: Record<string, string> = ifMatch !== undefined ? { 'If-Match': ifMatch } : { 'If-None-Match': '*' }
    const res = await this.fetchImpl(`${GRAPH}/me/drive/root:/${this.encodePath(path)}:/content`, {
      method: 'PUT',
      headers: await this.headers({ 'Content-Type': 'application/octet-stream', ...cond }),
      body: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    })
    if (res.status === 412) throw new ConflictError(path)
    if (!res.ok) throw new Error(`put failed: ${res.status}`)
    const item = (await res.json()) as GraphItem
    return { path, etag: normalizeEtag(item.eTag), size: bytes.length }
  }

  async delete(path: string, ifMatch?: string): Promise<void> {
    const cond: Record<string, string> = ifMatch !== undefined ? { 'If-Match': ifMatch } : {}
    const res = await this.fetchImpl(`${GRAPH}/me/drive/root:/${this.encodePath(path)}`, {
      method: 'DELETE',
      headers: await this.headers(cond),
    })
    if (res.status === 412) throw new ConflictError(path)
    if (res.status === 404) return
    if (!res.ok && res.status !== 204) throw new Error(`delete failed: ${res.status}`)
  }
}

interface GraphItem {
  name: string
  size: number
  eTag?: string
  file?: { mimeType?: string }
  folder?: unknown
}

function normalizeEtag(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined
  return raw.replace(/^W\//, '').replace(/^"|"$/g, '')
}
