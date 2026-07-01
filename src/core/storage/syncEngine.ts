// 对象级同步引擎（B1）：对单个对象执行 push / pull / 冲突副本 / 离线 deferred。
// 纯逻辑，只依赖传入的 StorageProvider；不耦合 DocBackend / localDocuments / UI。
// 上层（未来 SyncedBackend）按文档遍历调用本函数，再把结果落到本地缓存。
import type { StorageProvider, RemoteRef } from './types'
import { ConflictError } from './types'
import { decideSync } from './sync'

export interface LocalObjectState {
  baseEtag?: string // 上次同步记下的远端 etag（基线）；undefined = 从未同步
  dirty: boolean    // 本地自基线以来是否有未推改动
  bytes: Uint8Array // 本地当前内容
}

export type SyncAction = 'pushed' | 'pulled' | 'in-sync' | 'conflict' | 'deferred'

export interface SyncResult {
  action: SyncAction
  ref?: RemoteRef          // push/pull/in-sync 后的新基线
  bytes?: Uint8Array       // pulled / conflict 时远端内容（主路径应采用之）
  conflictPath?: string    // conflict 时写入的本地副本远端路径
  error?: unknown          // deferred 时的原因（离线/不可用）
}

// documents/<id>.md → documents/<id> (冲突 <device> <ts>).md
export function conflictPath(path: string, device: string, when: Date = new Date()): string {
  const ts = when.toISOString().replace(/[:T]/g, '-').slice(0, 19)
  const safeDevice = device.replace(/[\\/:*?"<>|]/g, '_') || '设备'
  const dot = path.lastIndexOf('.')
  const base = dot > path.lastIndexOf('/') ? path.slice(0, dot) : path
  const ext = dot > path.lastIndexOf('/') ? path.slice(dot) : ''
  return `${base} (冲突 ${safeDevice} ${ts})${ext}`
}

export interface SyncObjectOptions {
  device?: string // 冲突副本命名用，默认「本机」
  now?: Date
}

// 同步单个对象。远端不可达 → 不抛错，返回 deferred 供上层入队重试。
export async function syncObject(
  provider: StorageProvider,
  path: string,
  local: LocalObjectState,
  opts: SyncObjectOptions = {},
): Promise<SyncResult> {
  let remote: { bytes: Uint8Array; ref: RemoteRef } | null
  try {
    remote = await provider.get(path)
  } catch (error) {
    return { action: 'deferred', error }
  }

  const remoteEtag = remote?.ref.etag
  const decision = decideSync(local.baseEtag, local.dirty, remoteEtag)

  try {
    switch (decision) {
      case 'in-sync':
        return { action: 'in-sync', ref: remote?.ref }

      case 'pull':
        return { action: 'pulled', bytes: remote!.bytes, ref: remote!.ref }

      case 'push': {
        const ref = await provider.put(path, local.bytes, local.baseEtag)
        return { action: 'pushed', ref }
      }

      case 'conflict': {
        // 远端胜出主路径；本地改动另存为冲突副本，谁都不丢。
        const cpath = conflictPath(path, opts.device ?? '本机', opts.now)
        await provider.put(cpath, local.bytes)
        return { action: 'conflict', conflictPath: cpath, bytes: remote!.bytes, ref: remote!.ref }
      }
    }
  } catch (error) {
    // push 时遇到并发条件写失败（ConflictError）→ 升级为冲突；其余 → deferred
    if (error instanceof ConflictError) {
      const cpath = conflictPath(path, opts.device ?? '本机', opts.now)
      try {
        await provider.put(cpath, local.bytes)
        const latest = await provider.get(path)
        return { action: 'conflict', conflictPath: cpath, bytes: latest?.bytes, ref: latest?.ref }
      } catch (e2) {
        return { action: 'deferred', error: e2 }
      }
    }
    return { action: 'deferred', error }
  }
}
