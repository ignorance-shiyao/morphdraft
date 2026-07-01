// 工作区同步编排（B1）：把「本地缓存 Provider + 远端 Provider + syncObject」串成
// 多对象推/拉/冲突闭环，维护每对象基线 etag。纯逻辑，不接 DocBackend / UI；
// 上层只需提供：本地缓存 Provider、远端 Provider、基线状态存储、脏判定。
import type { StorageProvider } from './types'
import { syncObject, type SyncObjectOptions } from './syncEngine'

// 每对象「上次同步的远端 etag」基线存储（上层可落 IndexedDB / 文件）。
export interface SyncStateStore {
  getBase(path: string): string | undefined
  setBase(path: string, etag: string | undefined): void
  // 曾同步过的全部路径（用于发现「远端已删」一类，本版仅用于并集枚举）。
  knownPaths(): string[]
}

// 内存基线存储（测试 / 临时会话）。
export function createMemorySyncState(): SyncStateStore {
  const map = new Map<string, string | undefined>()
  return {
    getBase: (p) => map.get(p),
    setBase: (p, e) => { map.set(p, e) },
    knownPaths: () => [...map.keys()],
  }
}

export interface SyncWorkspaceOptions extends SyncObjectOptions {
  // 同步哪些前缀（默认文档 + 资产）。
  prefixes?: string[]
  // 某本地路径自基线以来是否有未推改动。
  isDirty?: (path: string) => boolean
}

export interface SyncWorkspaceSummary {
  pushed: string[]
  pulled: string[]
  inSync: string[]
  conflicts: { path: string; copy: string }[]
  deferred: string[]
}

// 无条件覆盖本地缓存：读当前 etag 作为 If-Match（不存在则按「仅创建」语义）。
async function writeLocalCache(local: StorageProvider, path: string, bytes: Uint8Array): Promise<void> {
  const cur = await local.get(path)
  await local.put(path, bytes, cur?.ref.etag)
}

export async function syncWorkspace(
  local: StorageProvider,
  remote: StorageProvider,
  state: SyncStateStore,
  opts: SyncWorkspaceOptions = {},
): Promise<SyncWorkspaceSummary> {
  const prefixes = opts.prefixes ?? ['documents/', 'assets/']
  const isDirty = opts.isDirty ?? (() => false)

  // 枚举需要同步的路径并集：本地缓存 + 远端 + 已知基线。
  const paths = new Set<string>(state.knownPaths())
  for (const prefix of prefixes) {
    for (const r of await safeList(local, prefix)) paths.add(r.path)
    for (const r of await safeList(remote, prefix)) paths.add(r.path)
  }

  const summary: SyncWorkspaceSummary = { pushed: [], pulled: [], inSync: [], conflicts: [], deferred: [] }

  for (const path of paths) {
    const localGot = await local.get(path)
    const res = await syncObject(
      remote,
      path,
      {
        baseEtag: state.getBase(path),
        dirty: localGot ? isDirty(path) : false,
        bytes: localGot?.bytes ?? new Uint8Array(),
      },
      { device: opts.device, now: opts.now },
    )

    switch (res.action) {
      case 'pushed':
        state.setBase(path, res.ref?.etag)
        summary.pushed.push(path)
        break
      case 'pulled':
        if (res.bytes) await writeLocalCache(local, path, res.bytes)
        state.setBase(path, res.ref?.etag)
        summary.pulled.push(path)
        break
      case 'in-sync':
        if (res.ref?.etag) state.setBase(path, res.ref.etag)
        summary.inSync.push(path)
        break
      case 'conflict':
        // 远端胜出主路径：落回本地缓存；本地改动已被 syncObject 另存为远端冲突副本。
        if (res.bytes) await writeLocalCache(local, path, res.bytes)
        state.setBase(path, res.ref?.etag)
        summary.conflicts.push({ path, copy: res.conflictPath ?? '' })
        break
      case 'deferred':
        summary.deferred.push(path)
        break
    }
  }

  return summary
}

// list 失败（远端离线）不应中断整轮：返回空，交由各对象 deferred。
async function safeList(provider: StorageProvider, prefix: string) {
  try {
    return await provider.list(prefix)
  } catch {
    return []
  }
}
