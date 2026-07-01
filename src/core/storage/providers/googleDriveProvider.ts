// GoogleDriveProvider（B2/云）：把 StorageProvider 契约映射到 Google Drive v3（drive.file scope）。
//
// Drive 是 id 寻址、无原生 HTTP 条件写。两点设计让它贴合我们的对象模型：
//  1) 每个对象存为「文件名 = 完整对象路径」（documents/a.md）的文件，挂在单个 app 文件夹下，
//     绕开层级文件夹解析（Drive 文件名是不透明字符串，允许 '/')。
//  2) etag = headRevisionId（每次内容变更即变）；条件写用「读 rev 比对再写」的乐观锁——
//     非原子，但单用户多设备场景竞态窗口极小；真冲突仍由同步引擎的冲突副本兜底。
// access token 上层注入。
import type { StorageProvider, RemoteRef, StorageCaps } from '../types'
import { ConflictError } from '../types'

const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
const FOLDER_MIME = 'application/vnd.google-apps.folder'
const APP_FOLDER = 'MorphDraft'

export interface GoogleDriveProviderOptions {
  getToken: () => Promise<string> | string
  fetch?: typeof fetch
  appFolderName?: string
}

interface DriveFile {
  id: string
  name: string
  headRevisionId?: string
  size?: string
}

export class GoogleDriveProvider implements StorageProvider {
  readonly id = 'googledrive'
  readonly caps: StorageCaps = {
    versions: true,
    conditionalWrite: true, // 乐观锁（读-比对-写），非原子
    list: true,
    incremental: false,
    e2eCompatible: true,
  }
  private getToken: () => Promise<string> | string
  private fetchImpl: typeof fetch
  private appFolderName: string
  private folderIdPromise?: Promise<string>

  constructor(opts: GoogleDriveProviderOptions) {
    this.getToken = opts.getToken
    this.appFolderName = opts.appFolderName ?? APP_FOLDER
    const f = opts.fetch ?? globalThis.fetch
    if (!f) throw new Error('GoogleDriveProvider: no fetch available')
    this.fetchImpl = f.bind(globalThis)
  }

  private async auth(extra?: Record<string, string>): Promise<Record<string, string>> {
    return { Authorization: `Bearer ${await this.getToken()}`, ...extra }
  }

  // 解析（必要时创建）app 根文件夹，memoize。
  private appFolderId(): Promise<string> {
    if (!this.folderIdPromise) this.folderIdPromise = this.resolveAppFolder()
    return this.folderIdPromise
  }

  private async resolveAppFolder(): Promise<string> {
    const q = `name='${this.appFolderName}' and mimeType='${FOLDER_MIME}' and trashed=false`
    const res = await this.fetchImpl(`${API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)`, {
      headers: await this.auth(),
    })
    if (!res.ok) throw new Error(`drive folder query failed: ${res.status}`)
    const data = (await res.json()) as { files: DriveFile[] }
    if (data.files[0]) return data.files[0].id
    // 创建
    const create = await this.fetchImpl(`${API}/files?fields=id`, {
      method: 'POST',
      headers: await this.auth({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ name: this.appFolderName, mimeType: FOLDER_MIME }),
    })
    if (!create.ok) throw new Error(`drive folder create failed: ${create.status}`)
    return ((await create.json()) as DriveFile).id
  }

  // 按对象路径（=文件名）找文件。
  private async findByPath(path: string): Promise<DriveFile | null> {
    const folder = await this.appFolderId()
    const q = `name='${escapeQ(path)}' and '${folder}' in parents and trashed=false`
    const res = await this.fetchImpl(`${API}/files?q=${encodeURIComponent(q)}&fields=files(id,name,headRevisionId,size)`, {
      headers: await this.auth(),
    })
    if (!res.ok) throw new Error(`drive find failed: ${res.status}`)
    return ((await res.json()) as { files: DriveFile[] }).files[0] ?? null
  }

  async list(prefix: string): Promise<RemoteRef[]> {
    const folder = await this.appFolderId()
    const q = `'${folder}' in parents and trashed=false`
    const res = await this.fetchImpl(`${API}/files?q=${encodeURIComponent(q)}&fields=files(id,name,headRevisionId,size)&pageSize=1000`, {
      headers: await this.auth(),
    })
    if (!res.ok) throw new Error(`drive list failed: ${res.status}`)
    const data = (await res.json()) as { files: DriveFile[] }
    return data.files
      .filter((f) => f.name.startsWith(prefix))
      .map((f) => ({ path: f.name, etag: f.headRevisionId, size: f.size ? Number(f.size) : undefined }))
  }

  async get(path: string): Promise<{ bytes: Uint8Array; ref: RemoteRef } | null> {
    const file = await this.findByPath(path)
    if (!file) return null
    const res = await this.fetchImpl(`${API}/files/${file.id}?alt=media`, { headers: await this.auth() })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`drive get failed: ${res.status}`)
    const bytes = new Uint8Array(await res.arrayBuffer())
    return { bytes, ref: { path, etag: file.headRevisionId, size: bytes.length } }
  }

  async put(path: string, bytes: Uint8Array, ifMatch?: string): Promise<RemoteRef> {
    const existing = await this.findByPath(path)
    if (ifMatch === undefined) {
      if (existing) throw new ConflictError(path, { path, etag: existing.headRevisionId }) // 仅创建但已存在
      return this.createFile(path, bytes)
    }
    // 条件覆盖：乐观锁比对 rev
    if (!existing || existing.headRevisionId !== ifMatch) {
      throw new ConflictError(path, existing ? { path, etag: existing.headRevisionId } : undefined)
    }
    return this.updateMedia(existing.id, path, bytes)
  }

  private async createFile(path: string, bytes: Uint8Array): Promise<RemoteRef> {
    const folder = await this.appFolderId()
    // 先建元数据（含父目录与文件名=路径），再上传内容。
    const meta = await this.fetchImpl(`${API}/files?fields=id`, {
      method: 'POST',
      headers: await this.auth({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ name: path, parents: [folder] }),
    })
    if (!meta.ok) throw new Error(`drive create failed: ${meta.status}`)
    const id = ((await meta.json()) as DriveFile).id
    return this.updateMedia(id, path, bytes)
  }

  private async updateMedia(id: string, path: string, bytes: Uint8Array): Promise<RemoteRef> {
    const res = await this.fetchImpl(`${UPLOAD}/files/${id}?uploadType=media&fields=headRevisionId,size`, {
      method: 'PATCH',
      headers: await this.auth({ 'Content-Type': 'application/octet-stream' }),
      body: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    })
    if (!res.ok) throw new Error(`drive upload failed: ${res.status}`)
    const file = (await res.json()) as DriveFile
    return { path, etag: file.headRevisionId, size: bytes.length }
  }

  async delete(path: string, ifMatch?: string): Promise<void> {
    const existing = await this.findByPath(path)
    if (!existing) return // 已不存在
    if (ifMatch !== undefined && existing.headRevisionId !== ifMatch) {
      throw new ConflictError(path, { path, etag: existing.headRevisionId })
    }
    const res = await this.fetchImpl(`${API}/files/${existing.id}`, { method: 'DELETE', headers: await this.auth() })
    if (res.status === 404) return
    if (!res.ok && res.status !== 204) throw new Error(`drive delete failed: ${res.status}`)
  }
}

// Drive 查询字符串里的单引号需转义。
function escapeQ(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}
