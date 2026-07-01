// syncWorkspace 编排测试：本地缓存 + 远端均用 MemoryProvider，覆盖推/拉/同步/冲突/离线。
import { describe, it, expect } from 'vitest'
import { MemoryProvider } from '../providers/memoryProvider'
import { syncWorkspace, createMemorySyncState } from '../syncWorkspace'

const enc = new TextEncoder()
const dec = new TextDecoder()
const PFX = ['documents/']

async function readText(p: MemoryProvider, path: string): Promise<string | null> {
  const got = await p.get(path)
  return got ? dec.decode(got.bytes) : null
}

describe('syncWorkspace 编排', () => {
  it('本地脏、远端无 → push，并记录基线', async () => {
    const local = new MemoryProvider()
    const remote = new MemoryProvider()
    const state = createMemorySyncState()
    await local.put('documents/a.md', enc.encode('hello'))

    const sum = await syncWorkspace(local, remote, state, { prefixes: PFX, isDirty: () => true })
    expect(sum.pushed).toEqual(['documents/a.md'])
    expect(await readText(remote, 'documents/a.md')).toBe('hello')
    expect(state.getBase('documents/a.md')).toBeTruthy()
  })

  it('远端有、本地无 → pull 到本地缓存', async () => {
    const local = new MemoryProvider()
    const remote = new MemoryProvider()
    const state = createMemorySyncState()
    await remote.put('documents/b.md', enc.encode('remote-body'))

    const sum = await syncWorkspace(local, remote, state, { prefixes: PFX })
    expect(sum.pulled).toEqual(['documents/b.md'])
    expect(await readText(local, 'documents/b.md')).toBe('remote-body')
  })

  it('两端一致、无脏 → in-sync', async () => {
    const local = new MemoryProvider()
    const remote = new MemoryProvider()
    const state = createMemorySyncState()
    await local.put('documents/a.md', enc.encode('same'))
    // 先 push 建立基线
    await syncWorkspace(local, remote, state, { prefixes: PFX, isDirty: () => true })
    // 再同步：无脏
    const sum = await syncWorkspace(local, remote, state, { prefixes: PFX, isDirty: () => false })
    expect(sum.inSync).toEqual(['documents/a.md'])
    expect(sum.pushed).toEqual([])
  })

  it('本地脏 且 远端自基线后已变 → 冲突副本，主路径采用远端', async () => {
    const local = new MemoryProvider()
    const remote = new MemoryProvider()
    const state = createMemorySyncState()
    // 基线：两端都是 v1
    await local.put('documents/a.md', enc.encode('v1'))
    await syncWorkspace(local, remote, state, { prefixes: PFX, isDirty: () => true })
    // 远端被别的设备改成 v2
    const cur = await remote.get('documents/a.md')
    await remote.put('documents/a.md', enc.encode('remote-v2'), cur!.ref.etag)
    // 本地也改成 local-v3（脏）
    const lcur = await local.get('documents/a.md')
    await local.put('documents/a.md', enc.encode('local-v3'), lcur!.ref.etag)

    const sum = await syncWorkspace(local, remote, state, { prefixes: PFX, isDirty: () => true, device: 'PC' })
    expect(sum.conflicts).toHaveLength(1)
    const { path, copy } = sum.conflicts[0]
    expect(path).toBe('documents/a.md')
    // 主路径：本地缓存被远端覆盖
    expect(await readText(local, 'documents/a.md')).toBe('remote-v2')
    // 冲突副本：本地改动另存到远端，未丢
    expect(copy).toMatch(/冲突 PC/)
    expect(await readText(remote, copy)).toBe('local-v3')
  })

  it('远端离线 → deferred，不抛错', async () => {
    const local = new MemoryProvider()
    const remote = new MemoryProvider({ failNext: () => true })
    const state = createMemorySyncState()
    await local.put('documents/a.md', enc.encode('x'))

    const sum = await syncWorkspace(local, remote, state, { prefixes: PFX, isDirty: () => true })
    expect(sum.deferred).toEqual(['documents/a.md'])
    expect(sum.pushed).toEqual([])
  })
})
