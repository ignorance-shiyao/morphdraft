import { describe, it, expect } from 'vitest'
import { normalizeFsEvent, SelfWriteGuard } from '../fileEvents'

describe('normalizeFsEvent 归一化', () => {
  it('字符串 type 映射', () => {
    expect(normalizeFsEvent({ type: 'create', paths: ['/a.md'] })?.kind).toBe('created')
    expect(normalizeFsEvent({ type: 'modify', paths: ['/a.md'] })?.kind).toBe('changed')
    expect(normalizeFsEvent({ type: 'remove', paths: ['/a.md'] })?.kind).toBe('removed')
    expect(normalizeFsEvent({ type: 'rename', paths: ['/a.md'] })?.kind).toBe('renamed')
  })

  it('对象 type 映射（notify 风格）', () => {
    expect(normalizeFsEvent({ type: { create: { kind: 'file' } }, paths: ['/a.md'] })?.kind).toBe('created')
    expect(normalizeFsEvent({ type: { remove: { kind: 'file' } }, paths: ['/a.md'] })?.kind).toBe('removed')
    expect(normalizeFsEvent({ type: { modify: { kind: 'data' } }, paths: ['/a.md'] })?.kind).toBe('changed')
  })

  it('modify.kind=rename → renamed', () => {
    expect(normalizeFsEvent({ type: { modify: { kind: 'rename', mode: 'both' } }, paths: ['/a.md'] })?.kind).toBe('renamed')
  })

  it('保留 paths', () => {
    expect(normalizeFsEvent({ type: 'create', paths: ['/a.md', '/b.md'] })?.paths).toEqual(['/a.md', '/b.md'])
  })

  it('无法识别 / 空路径 / 空输入 → null', () => {
    expect(normalizeFsEvent({ type: 'other', paths: ['/a.md'] })).toBeNull()
    expect(normalizeFsEvent({ type: 'create', paths: [] })).toBeNull()
    expect(normalizeFsEvent(null)).toBeNull()
    expect(normalizeFsEvent({ type: {}, paths: ['/a.md'] })).toBeNull()
  })
})

describe('SelfWriteGuard 自身写入抑制', () => {
  it('窗口内判为自身写入', () => {
    const g = new SelfWriteGuard(1000)
    g.markWrite('/a.md', 1000)
    expect(g.isSelfWrite('/a.md', 1500)).toBe(true)
  })

  it('一次保存的多个事件都被抑制（不在首次命中即清除）', () => {
    const g = new SelfWriteGuard(1000)
    g.markWrite('/a.md', 1000)
    expect(g.isSelfWrite('/a.md', 1100)).toBe(true) // create 事件
    expect(g.isSelfWrite('/a.md', 1200)).toBe(true) // modify 事件
  })

  it('超出窗口 → 不再抑制（并过期清理）', () => {
    const g = new SelfWriteGuard(1000)
    g.markWrite('/a.md', 1000)
    expect(g.isSelfWrite('/a.md', 2500)).toBe(false)
    expect(g.isSelfWrite('/a.md', 2600)).toBe(false)
  })

  it('未标记的路径不抑制（外部改动）', () => {
    const g = new SelfWriteGuard()
    expect(g.isSelfWrite('/other.md')).toBe(false)
  })

  it('clear 移除标记', () => {
    const g = new SelfWriteGuard(1000)
    g.markWrite('/a.md', 1000)
    g.clear('/a.md')
    expect(g.isSelfWrite('/a.md', 1100)).toBe(false)
  })
})
