// storage store 测试：默认本地、切换后端、密钥仅会话、连通性、完整性。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useStorageStore } from '../storage'

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('storage store', () => {
  it('默认本地后端、无需凭证、完整', () => {
    const s = useStorageStore()
    expect(s.type).toBe('local')
    expect(s.remote).toBe(false)
    expect(s.requiresCredentials).toBe(false)
    expect(s.complete).toBe(true)
  })

  it('切到 webdav：需凭证；缺 baseUrl 不完整', () => {
    const s = useStorageStore()
    s.setBackend({ type: 'webdav', baseUrl: '' })
    expect(s.remote).toBe(true)
    expect(s.requiresCredentials).toBe(true)
    expect(s.complete).toBe(false)
    s.setBackend({ type: 'webdav', baseUrl: 'http://d', username: 'u' })
    expect(s.complete).toBe(true)
  })

  it('密钥进会话、合入 fullConfig 但不入持久化', () => {
    const s = useStorageStore()
    s.setBackend({ type: 'http', baseUrl: 'http://srv' })
    s.setSecret({ token: 'SECRET' })
    expect((s.fullConfig as { token?: string }).token).toBe('SECRET')
    // persisted 不含密钥
    expect(JSON.stringify(s.persisted)).not.toContain('SECRET')
  })

  it('testConnection：memory 后端可达 → ok', async () => {
    const s = useStorageStore()
    s.setBackend({ type: 'memory' })
    const res = await s.testConnection()
    expect(res.ok).toBe(true)
    expect(s.status?.ok).toBe(true)
    expect(s.testing).toBe(false)
  })

  it('testConnection：http 注入失败 fetch → 失败带信息', async () => {
    const s = useStorageStore()
    s.setBackend({ type: 'http', baseUrl: 'http://srv' })
    const failFetch = vi.fn(async () => new Response('', { status: 500 })) as unknown as typeof fetch
    const res = await s.testConnection({ fetch: failFetch })
    expect(res.ok).toBe(false)
    expect(res.error).toBeTruthy()
  })

  it('切换后端重置上次连通状态', async () => {
    const s = useStorageStore()
    s.setBackend({ type: 'memory' })
    await s.testConnection()
    expect(s.status).not.toBeNull()
    s.setBackend({ type: 'local' })
    expect(s.status).toBeNull()
  })
})
