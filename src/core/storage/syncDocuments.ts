// 文档级同步编排（B1）：把真实文档库与远端通过「本地缓存 Provider + syncWorkspace」桥接。
// 依赖注入的 DocSyncStore（真实 DocBackend 的子集），纯逻辑可单测；不直接 import DocBackend，
// 避免耦合具体后端、便于用假 store 验证。
//
// 流程：① 文档正文快照进本地缓存 → ② syncWorkspace 推/拉/冲突 → ③ 拉取/冲突结果写回文档库
//      → ④ 最佳努力推送 index.json（元数据，供他设备还原标题/标签）。
import type { DocFull, DocMeta } from '../docTypes'
import type { StorageProvider } from './types'
import { syncWorkspace, type SyncStateStore, type SyncWorkspaceSummary } from './syncWorkspace'
import {
  docObjectPath, docIdFromObjectPath, docToBytes, INDEX_PATH, buildIndex, parseIndex,
} from './docObjects'

// 文档库同步所需的最小能力（真实 DocBackend 的子集）。
export interface DocSyncStore {
  list(): Promise<DocMeta[]>
  get(id: string): Promise<DocFull>
  // 保留 id 的 upsert：存在则更新正文/元数据，不存在则按给定 id 新建。
  writeBody(id: string, markdown: string, meta?: DocMeta): Promise<void>
}

export interface SyncDocumentsOptions {
  // 哪些 docId 自上次同步以来本地有改动。
  dirtyIds?: Set<string>
  device?: string
  now?: Date
}

export interface SyncDocumentsResult extends SyncWorkspaceSummary {
  // 实际写回文档库的 docId（pulled / conflict 主路径采用远端正文）。
  appliedToStore: string[]
}

// 无条件覆盖本地缓存：读当前 etag 作为 If-Match。
async function writeCache(cache: StorageProvider, path: string, bytes: Uint8Array): Promise<void> {
  const cur = await cache.get(path)
  await cache.put(path, bytes, cur?.ref.etag)
}

export async function syncDocuments(
  store: DocSyncStore,
  cache: StorageProvider,
  remote: StorageProvider,
  state: SyncStateStore,
  opts: SyncDocumentsOptions = {},
): Promise<SyncDocumentsResult> {
  const dirty = opts.dirtyIds ?? new Set<string>()

  // ① 文档正文快照 → 本地缓存（cache 作为 syncWorkspace 的本地侧）。
  const metas = await store.list()
  for (const m of metas) {
    const doc = await store.get(m.id)
    await writeCache(cache, docObjectPath(m.id), docToBytes(doc))
  }

  // 远端 index 先拉一份，给「拉取的新文档」补标题/标签。
  const remoteIndex = parseIndex((await safeGet(remote, INDEX_PATH))?.bytes)

  // ② 推/拉/冲突（只同步文档正文前缀）。
  const summary = await syncWorkspace(cache, remote, state, {
    prefixes: ['documents/'],
    isDirty: (path) => {
      const id = docIdFromObjectPath(path)
      return id ? dirty.has(id) : false
    },
    device: opts.device,
    now: opts.now,
  })

  // ③ 把拉取/冲突的远端正文写回文档库（主路径采用远端）。
  const applied: string[] = []
  const toApply = [...summary.pulled, ...summary.conflicts.map((c) => c.path)]
  for (const path of toApply) {
    const id = docIdFromObjectPath(path)
    if (!id) continue
    const got = await cache.get(path)
    if (!got) continue
    await store.writeBody(id, new TextDecoder().decode(got.bytes), remoteIndex.get(id))
    applied.push(id)
  }

  // ④ 最佳努力推送本地元数据索引（last-writer-wins；失败不影响正文同步结果）。
  try {
    const cur = await safeGet(remote, INDEX_PATH)
    await remote.put(INDEX_PATH, buildIndex(metas), cur?.ref.etag)
  } catch {
    /* 索引可重建，推送失败忽略 */
  }

  return { ...summary, appliedToStore: applied }
}

async function safeGet(provider: StorageProvider, path: string) {
  try {
    return await provider.get(path)
  } catch {
    return null
  }
}
