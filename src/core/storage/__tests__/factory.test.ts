// Provider 工厂测试：配置 → 正确的 Provider 类型；注入依赖；非法配置报错。
import { describe, it, expect, vi } from 'vitest'
import { createProvider, needsCredentials, isRemote } from '../factory'
import { MemoryProvider } from '../providers/memoryProvider'
import { HttpServerProvider } from '../providers/httpServerProvider'
import { WebDavProvider } from '../providers/webdavProvider'
import { LocalProvider, createMemoryRawKv } from '../providers/localProvider'

describe('storage 工厂 createProvider', () => {
  it('memory → MemoryProvider', () => {
    expect(createProvider({ type: 'memory' })).toBeInstanceOf(MemoryProvider)
  })

  it('local 用注入的 RawKv → LocalProvider（不触 IndexedDB）', () => {
    const p = createProvider({ type: 'local' }, { rawKv: createMemoryRawKv() })
    expect(p).toBeInstanceOf(LocalProvider)
    expect(p.id).toBe('local')
  })

  it('http → HttpServerProvider，透传 baseUrl/token/fetch', async () => {
    const spy = vi.fn(async () => new Response(JSON.stringify({ objects: [] }), { status: 200 }))
    const p = createProvider({ type: 'http', baseUrl: 'http://srv', token: 't' }, { fetch: spy as unknown as typeof fetch })
    expect(p).toBeInstanceOf(HttpServerProvider)
    await p.list('documents/')
    const init = spy.mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer t')
  })

  it('webdav → WebDavProvider', () => {
    const p = createProvider({ type: 'webdav', baseUrl: 'http://dav', username: 'u', password: 'p' })
    expect(p).toBeInstanceOf(WebDavProvider)
  })

  it('http 缺 baseUrl → 报错', () => {
    expect(() => createProvider({ type: 'http', baseUrl: '' })).toThrow(/baseUrl/)
  })

  it('能力判断：远端/凭证', () => {
    expect(isRemote('http')).toBe(true)
    expect(isRemote('webdav')).toBe(true)
    expect(isRemote('dropbox')).toBe(true)
    expect(isRemote('local')).toBe(false)
    expect(isRemote('memory')).toBe(false)
    expect(needsCredentials('webdav')).toBe(true)
    expect(needsCredentials('local')).toBe(false)
    expect(needsCredentials('dropbox')).toBe(false) // 云盘走 OAuth，不填凭证
  })

  it('云盘后端用注入的 cloudToken 构造 Provider', async () => {
    const spy = vi.fn(async () => new Response(JSON.stringify({ entries: [] }), { status: 200 }))
    const p = createProvider({ type: 'dropbox' }, {
      fetch: spy as unknown as typeof fetch,
      cloudToken: () => () => 'CLOUD_TOKEN',
    })
    expect(p.id).toBe('dropbox')
    await p.list('documents/')
    const init = spy.mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer CLOUD_TOKEN')
  })

  it('云盘缺 cloudToken → 构造即报错（未授权）', () => {
    expect(() => createProvider({ type: 'onedrive' })).toThrow(/OAuth/)
  })
})
