import { describe, it, expect } from 'vitest'
import { MemoryProvider } from '../providers/memoryProvider'
import { syncObject, conflictPath } from '../syncEngine'
import { ConflictError } from '../types'

const enc = (s: string) => new TextEncoder().encode(s)
const dec = (b?: Uint8Array) => (b ? new TextDecoder().decode(b) : undefined)
const P = 'documents/a.md'

describe('MemoryProvider 乐观锁', () => {
  it('首次写（ifMatch 缺省、对象不存在）成功', async () => {
    const p = new MemoryProvider()
    const ref = await p.put(P, enc('v1'))
    expect(ref.etag).toBeTruthy()
    expect(p._has(P)).toBe(true)
  })
  it('ifMatch 与远端不符 → ConflictError', async () => {
    const p = new MemoryProvider()
    await p.put(P, enc('v1'))
    await expect(p.put(P, enc('v2'), 'stale-etag')).rejects.toBeInstanceOf(ConflictError)
  })
  it('同字节同 etag、改字节换 etag', async () => {
    const p = new MemoryProvider()
    const a = await p.put(P, enc('x'))
    const p2 = new MemoryProvider()
    const b = await p2.put('documents/b.md', enc('x'))
    expect(a.etag).toBe(b.etag)
    expect((await new MemoryProvider().put(P, enc('y'))).etag).not.toBe(a.etag)
  })
})

describe('syncObject 决策', () => {
  it('远端为空 + 本地脏 → pushed', async () => {
    const p = new MemoryProvider()
    const r = await syncObject(p, P, { baseEtag: undefined, dirty: true, bytes: enc('v1') })
    expect(r.action).toBe('pushed')
    expect(p._has(P)).toBe(true)
    expect(r.ref?.etag).toBeTruthy()
  })

  it('不脏 + 远端 etag===base → in-sync', async () => {
    const p = new MemoryProvider()
    const etag = p._seed(P, enc('v1'))
    const r = await syncObject(p, P, { baseEtag: etag, dirty: false, bytes: enc('v1') })
    expect(r.action).toBe('in-sync')
  })

  it('不脏 + 远端 etag!==base → pulled，返回远端内容', async () => {
    const p = new MemoryProvider()
    p._seed(P, enc('远端新版'))
    const r = await syncObject(p, P, { baseEtag: 'old', dirty: false, bytes: enc('本地旧版') })
    expect(r.action).toBe('pulled')
    expect(dec(r.bytes)).toBe('远端新版')
  })

  it('脏 + 远端 etag===base → pushed（带 ifMatch 通过）', async () => {
    const p = new MemoryProvider()
    const base = p._seed(P, enc('v1'))
    const r = await syncObject(p, P, { baseEtag: base, dirty: true, bytes: enc('v2') })
    expect(r.action).toBe('pushed')
    expect(dec((await p.get(P))!.bytes)).toBe('v2')
  })

  it('脏 + 远端已变 → conflict：远端胜主路径，本地另存冲突副本', async () => {
    const p = new MemoryProvider()
    p._seed(P, enc('远端改动'))
    const r = await syncObject(p, P, { baseEtag: 'old', dirty: true, bytes: enc('本地改动') }, { device: 'Mac' })
    expect(r.action).toBe('conflict')
    expect(dec(r.bytes)).toBe('远端改动') // 主路径采用远端
    expect(r.conflictPath).toBeTruthy()
    expect(dec((await p.get(r.conflictPath!))!.bytes)).toBe('本地改动') // 本地不丢
    expect(dec((await p.get(P))!.bytes)).toBe('远端改动') // 主路径未被覆盖
  })

  it('远端不可达 → deferred，不抛错', async () => {
    const p = new MemoryProvider({ failNext: () => true })
    const r = await syncObject(p, P, { baseEtag: undefined, dirty: true, bytes: enc('v1') })
    expect(r.action).toBe('deferred')
    expect(r.error).toBeInstanceOf(Error)
  })
})

describe('conflictPath 命名', () => {
  it('在扩展名前插入「(冲突 设备 时间)」', () => {
    const cp = conflictPath('documents/abc.md', 'MacBook', new Date('2026-06-24T10:20:30Z'))
    expect(cp).toBe('documents/abc (冲突 MacBook 2026-06-24-10-20-30).md')
  })
  it('无扩展名也能处理；非法设备字符替换', () => {
    expect(conflictPath('documents/x', 'a/b:c', new Date('2026-06-24T00:00:00Z')))
      .toBe('documents/x (冲突 a_b_c 2026-06-24-00-00-00)')
  })
})
