// 统一存储抽象的类型与错误（B0）。
//
// 设计意图（上游 §4/§5.2）：用一套对象级 StorageProvider 接本地 / 自托管服务 /
// WebDAV / S3 / 云盘；资产用 AssetStore 与文档后端解耦。B0 只落地「类型 + 资产抽象 +
// 同步骨架」，不接任何远端、不改现有 local/vault 行为。

// 远端对象引用（路径 + 可选版本/大小/时间元数据）。
export interface RemoteRef {
  path: string
  etag?: string
  size?: number
  mtime?: string
}

// 条件写失败（If-Match 不符）→ 调用方据此走「冲突副本」。
export class ConflictError extends Error {
  constructor(public path: string, public remote?: RemoteRef) {
    super('conflict')
    this.name = 'ConflictError'
  }
}

// 对象不存在。
export class NotFoundError extends Error {
  constructor(public path: string) {
    super('not found')
    this.name = 'NotFoundError'
  }
}

// 后端能力声明：同步引擎据此决定可否条件写/列举/增量/E2E。
export interface StorageCaps {
  versions: boolean
  conditionalWrite: boolean
  list: boolean
  incremental: boolean
  e2eCompatible: boolean
}

// 对象级存储 Provider（B1 起接远端；B0 仅定义契约）。
export interface StorageProvider {
  readonly id: string
  readonly caps: StorageCaps
  list(prefix: string): Promise<RemoteRef[]>
  get(path: string): Promise<{ bytes: Uint8Array; ref: RemoteRef } | null>
  // 写入；带 ifMatch 时若远端 etag 不符抛 ConflictError。
  put(path: string, bytes: Uint8Array, ifMatch?: string): Promise<RemoteRef>
  delete(path: string, ifMatch?: string): Promise<void>
}

// 资产（图片附件）存储能力，与文档后端解耦。
// saveAsset 返回 asset://<id> 引用；其余方法接收裸 id（不含 asset:// 前缀）。
export interface AssetStore {
  saveAsset(blob: Blob, mime: string): Promise<string>
  getAssetBlob(id: string): Promise<Blob | null>
  listAssetIds(): Promise<string[]>
  deleteAsset(id: string): Promise<void>
}
