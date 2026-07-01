// 可复用的 StorageProvider 契约测试套件（设计 §14）。
// 任一 Provider（memory / http / webdav / local）传入工厂即跑同一组语义断言，
// 保证 put/get/list/delete + If-Match 乐观锁行为一致。
import { describe, it, expect } from 'vitest'
import type { StorageProvider } from '../types'
import { ConflictError } from '../types'

const enc = new TextEncoder()
const dec = new TextDecoder()
const bytes = (s: string) => enc.encode(s)
const text = (b: Uint8Array) => dec.decode(b)

// provider 工厂：每个用例拿一个干净实例（隔离副作用）。
export function runProviderContract(name: string, makeProvider: () => StorageProvider | Promise<StorageProvider>) {
  describe(`StorageProvider 契约 · ${name}`, () => {
    it('put 新对象返回 etag，get 取回同字节', async () => {
      const p = await makeProvider()
      const ref = await p.put('documents/a.md', bytes('hello'))
      expect(ref.path).toBe('documents/a.md')
      expect(ref.etag).toBeTruthy()
      const got = await p.get('documents/a.md')
      expect(got).not.toBeNull()
      expect(text(got!.bytes)).toBe('hello')
      expect(got!.ref.etag).toBe(ref.etag)
    })

    it('get 不存在的对象返回 null', async () => {
      const p = await makeProvider()
      expect(await p.get('documents/missing.md')).toBeNull()
    })

    it('list 按前缀过滤并带 etag', async () => {
      const p = await makeProvider()
      await p.put('documents/a.md', bytes('a'))
      await p.put('documents/b.md', bytes('b'))
      await p.put('assets/x.png', bytes('x'))
      const docs = await p.list('documents/')
      expect(docs.map((r) => r.path).sort()).toEqual(['documents/a.md', 'documents/b.md'])
      expect(docs.every((r) => !!r.etag)).toBe(true)
      const assets = await p.list('assets/')
      expect(assets.map((r) => r.path)).toEqual(['assets/x.png'])
    })

    it('put 带正确 ifMatch 覆盖成功并换 etag', async () => {
      const p = await makeProvider()
      const r1 = await p.put('documents/a.md', bytes('v1'))
      const r2 = await p.put('documents/a.md', bytes('v2'), r1.etag)
      expect(r2.etag).not.toBe(r1.etag)
      expect(text((await p.get('documents/a.md'))!.bytes)).toBe('v2')
    })

    it('put 带过期 ifMatch 抛 ConflictError（412）', async () => {
      const p = await makeProvider()
      await p.put('documents/a.md', bytes('v1'))
      await expect(p.put('documents/a.md', bytes('v2'), 'stale-etag')).rejects.toBeInstanceOf(ConflictError)
    })

    it('put 期望对象不存在（ifMatch=undefined）但已存在 → ConflictError', async () => {
      const p = await makeProvider()
      await p.put('documents/a.md', bytes('v1'))
      // 不传 ifMatch 但对象已在：视为「期望首次创建」冲突
      await expect(p.put('documents/a.md', bytes('v2'))).rejects.toBeInstanceOf(ConflictError)
    })

    it('delete 移除对象；带过期 ifMatch 抛冲突', async () => {
      const p = await makeProvider()
      const r = await p.put('documents/a.md', bytes('v1'))
      await expect(p.delete('documents/a.md', 'stale')).rejects.toBeInstanceOf(ConflictError)
      await p.delete('documents/a.md', r.etag)
      expect(await p.get('documents/a.md')).toBeNull()
    })
  })
}
