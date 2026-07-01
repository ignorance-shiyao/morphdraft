// DropboxProvider（B2/云）：把 StorageProvider 契约映射到 Dropbox API。
// etag = Dropbox `rev`（版本号）；条件写用 upload mode=update:{rev} / add（仅创建）。
// access token 由上层注入（getToken，可含刷新逻辑），Provider 不管 OAuth 续期。
//
// 对象路径（documents/a.md）→ Dropbox 路径（/documents/a.md，app-folder 模式下即应用根）。
import type { StorageProvider, RemoteRef, StorageCaps } from '../types'
import { ConflictError } from '../types'

const RPC = 'https://api.dropboxapi.com'
const CONTENT = 'https://content.dropboxapi.com'

export interface DropboxProviderOptions {
  getToken: () => Promise<string> | string
  fetch?: typeof fetch
}

export class DropboxProvider implements StorageProvider {
  readonly id = 'dropbox'
  readonly caps: StorageCaps = {
    versions: true,
    conditionalWrite: true,
    list: true,
    incremental: false,
    e2eCompatible: true,
  }
  private getToken: () => Promise<string> | string
  private fetchImpl: typeof fetch

  constructor(opts: DropboxProviderOptions) {
    this.getToken = opts.getToken
    const f = opts.fetch ?? globalThis.fetch
    if (!f) throw new Error('DropboxProvider: no fetch available')
    this.fetchImpl = f.bind(globalThis)
  }

  private async auth(): Promise<string> {
    return `Bearer ${await this.getToken()}`
  }

  private async rpc(path: string, arg: unknown): Promise<Response> {
    return this.fetchImpl(`${RPC}${path}`, {
      method: 'POST',
      headers: { Authorization: await this.auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify(arg),
    })
  }

  async list(prefix: string): Promise<RemoteRef[]> {
    const folder = toDbxPath(prefix.replace(/\/+$/, ''))
    const res = await this.rpc('/2/files/list_folder', { path: folder, recursive: true })
    if (res.status === 409) return [] // path/not_found
    if (!res.ok) throw new Error(`list failed: ${res.status}`)
    const data = (await res.json()) as { entries: DbxEntry[] }
    return data.entries
      .filter((e) => e['.tag'] === 'file')
      .map((e) => ({ path: fromDbxPath(e.path_lower ?? e.path_display ?? ''), etag: e.rev, size: e.size }))
      .filter((r) => r.path.startsWith(prefix))
  }

  async get(path: string): Promise<{ bytes: Uint8Array; ref: RemoteRef } | null> {
    const res = await this.fetchImpl(`${CONTENT}/2/files/download`, {
      method: 'POST',
      headers: { Authorization: await this.auth(), 'Dropbox-API-Arg': apiArg({ path: toDbxPath(path) }) },
    })
    if (res.status === 409) return null // not_found
    if (!res.ok) throw new Error(`download failed: ${res.status}`)
    const meta = parseResult(res.headers.get('Dropbox-API-Result'))
    const bytes = new Uint8Array(await res.arrayBuffer())
    return { bytes, ref: { path, etag: meta?.rev, size: bytes.length } }
  }

  async put(path: string, bytes: Uint8Array, ifMatch?: string): Promise<RemoteRef> {
    // ifMatch → 条件更新指定 rev；否则仅创建（add + autorename:false）。
    const mode = ifMatch !== undefined ? { '.tag': 'update', update: ifMatch } : { '.tag': 'add' }
    const res = await this.fetchImpl(`${CONTENT}/2/files/upload`, {
      method: 'POST',
      headers: {
        Authorization: await this.auth(),
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': apiArg({ path: toDbxPath(path), mode, autorename: false, mute: true }),
      },
      body: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    })
    if (res.status === 409) throw new ConflictError(path) // 冲突（rev 不符 / 已存在）
    if (!res.ok) throw new Error(`upload failed: ${res.status}`)
    const meta = (await res.json()) as DbxEntry
    return { path, etag: meta.rev, size: bytes.length }
  }

  async delete(path: string, ifMatch?: string): Promise<void> {
    // Dropbox 删除无 rev 前置：带 ifMatch 时先查 rev 比对。
    if (ifMatch !== undefined) {
      const meta = await this.rpc('/2/files/get_metadata', { path: toDbxPath(path) })
      if (meta.ok) {
        const cur = (await meta.json()) as DbxEntry
        if (cur.rev !== ifMatch) throw new ConflictError(path, { path, etag: cur.rev })
      }
    }
    const res = await this.rpc('/2/files/delete_v2', { path: toDbxPath(path) })
    if (res.status === 409) return // already gone
    if (!res.ok) throw new Error(`delete failed: ${res.status}`)
  }
}

interface DbxEntry {
  '.tag'?: string
  rev: string
  size: number
  path_lower?: string
  path_display?: string
}

function toDbxPath(objPath: string): string {
  return '/' + objPath.replace(/^\/+/, '')
}
function fromDbxPath(dbx: string): string {
  return dbx.replace(/^\/+/, '')
}
// Dropbox-API-Arg 头要求 JSON 且仅 ASCII（非 ASCII 转 \uXXXX）。
function apiArg(obj: unknown): string {
  return JSON.stringify(obj).replace(/[\u0080-\uffff]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))
}
function parseResult(raw: string | null): DbxEntry | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as DbxEntry
  } catch {
    return null
  }
}
