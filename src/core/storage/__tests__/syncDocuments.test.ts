// 文档级同步编排测试：假 DocSyncStore（保留 id 的 upsert）+ 本地缓存/远端 MemoryProvider。
import { describe, it, expect } from 'vitest'
import { MemoryProvider } from '../providers/memoryProvider'
import { createMemorySyncState } from '../syncWorkspace'
import { syncDocuments, type DocSyncStore } from '../syncDocuments'
import { INDEX_PATH, parseIndex, docObjectPath } from '../docObjects'
import type { DocFull, DocMeta } from '../../docTypes'

function makeStore(seed: DocFull[] = []): DocSyncStore & { docs: Map<string, DocFull> } {
  const docs = new Map(seed.map((d) => [d.id, d]))
  return {
    docs,
    async list(): Promise<DocMeta[]> {
      return [...docs.values()].map(({ contentMarkdown: _c, ...meta }) => meta)
    },
    async get(id) {
      const d = docs.get(id)
      if (!d) throw new Error('not found ' + id)
      return d
    },
    async writeBody(id, markdown, meta) {
      const cur = docs.get(id)
      docs.set(id, {
        id,
        title: meta?.title ?? cur?.title ?? id,
        mode: meta?.mode ?? cur?.mode ?? 'document',
        themeId: meta?.themeId ?? cur?.themeId ?? '',
        updatedAt: meta?.updatedAt ?? cur?.updatedAt ?? '',
        tags: meta?.tags ?? cur?.tags ?? [],
        folder: meta?.folder ?? cur?.folder,
        contentMarkdown: markdown,
      })
    },
  }
}

const doc = (id: string, body: string, title = id): DocFull => ({
  id, title, mode: 'document', themeId: 'azure', updatedAt: '2026-06-26', tags: [], contentMarkdown: body,
})

describe('syncDocuments 编排', () => {
  it('本地脏文档 → push 到远端，并推送 index.json', async () => {
    const store = makeStore([doc('a', '# A')])
    const cache = new MemoryProvider()
    const remote = new MemoryProvider()
    const state = createMemorySyncState()

    const res = await syncDocuments(store, cache, remote, state, { dirtyIds: new Set(['a']) })
    expect(res.pushed).toContain(docObjectPath('a'))
    // 远端正文
    const got = await remote.get(docObjectPath('a'))
    expect(new TextDecoder().decode(got!.bytes)).toBe('# A')
    // 远端 index 含标题
    const idx = parseIndex((await remote.get(INDEX_PATH))!.bytes)
    expect(idx.get('a')?.title).toBe('a')
  })

  it('远端有新文档 → pull 并写回文档库（标题取自远端 index）', async () => {
    const store = makeStore([])
    const cache = new MemoryProvider()
    const remote = new MemoryProvider()
    const state = createMemorySyncState()
    // 远端预置一篇文档 + index
    await remote.put(docObjectPath('b'), new TextEncoder().encode('# Remote B'))
    await remote.put(INDEX_PATH, new TextEncoder().encode(JSON.stringify({
      documents: [{ id: 'b', title: '远端标题', mode: 'document', themeId: '', updatedAt: '', tags: [] }],
    })))

    const res = await syncDocuments(store, cache, remote, state)
    expect(res.appliedToStore).toContain('b')
    const applied = store.docs.get('b')!
    expect(applied.contentMarkdown).toBe('# Remote B')
    expect(applied.title).toBe('远端标题')
  })

  it('双改冲突 → 远端胜出写回文档库，本地另存远端冲突副本', async () => {
    const store = makeStore([doc('a', 'local-v3')])
    const cache = new MemoryProvider()
    const remote = new MemoryProvider()
    const state = createMemorySyncState()

    // 建立基线（先 push v1）
    store.docs.set('a', doc('a', 'v1'))
    await syncDocuments(store, cache, remote, state, { dirtyIds: new Set(['a']) })
    // 远端被改 v2
    const rcur = await remote.get(docObjectPath('a'))
    await remote.put(docObjectPath('a'), new TextEncoder().encode('remote-v2'), rcur!.ref.etag)
    // 本地改 v3（脏）
    store.docs.set('a', doc('a', 'local-v3'))

    const res = await syncDocuments(store, cache, remote, state, { dirtyIds: new Set(['a']), device: 'PC' })
    expect(res.conflicts).toHaveLength(1)
    // 文档库主路径变成远端 v2
    expect(store.docs.get('a')!.contentMarkdown).toBe('remote-v2')
    // 远端存在冲突副本，内容是本地 v3
    const copy = res.conflicts[0].copy
    expect(new TextDecoder().decode((await remote.get(copy))!.bytes)).toBe('local-v3')
  })
})
