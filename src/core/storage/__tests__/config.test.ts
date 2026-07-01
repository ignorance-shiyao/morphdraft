// 存储配置测试：密钥切分、序列化/解析校验、连通性测试。
import { describe, it, expect } from 'vitest'
import {
  splitSecrets, mergeSecrets, serializeConfig, parseConfig,
  isConfigComplete, testConnection,
} from '../config'
import { MemoryProvider } from '../providers/memoryProvider'

describe('存储配置 · 密钥切分', () => {
  it('http 切出 token，持久化部分不含密钥', () => {
    const { persisted, secrets } = splitSecrets({ type: 'http', baseUrl: 'http://s', token: 'T' })
    expect(persisted).toEqual({ type: 'http', baseUrl: 'http://s' })
    expect(secrets).toEqual({ token: 'T' })
    expect(JSON.stringify(persisted)).not.toContain('T')
  })

  it('webdav 切出 password，保留 username 于持久化', () => {
    const { persisted, secrets } = splitSecrets({ type: 'webdav', baseUrl: 'http://d', username: 'u', password: 'p' })
    expect(persisted).toEqual({ type: 'webdav', baseUrl: 'http://d', username: 'u' })
    expect(secrets).toEqual({ password: 'p' })
  })

  it('merge 还原完整配置', () => {
    const full = mergeSecrets({ type: 'webdav', baseUrl: 'http://d', username: 'u' }, { password: 'p' })
    expect(full).toEqual({ type: 'webdav', baseUrl: 'http://d', username: 'u', password: 'p' })
  })

  it('round-trip：split → serialize → parse → merge', () => {
    const { persisted, secrets } = splitSecrets({ type: 'http', baseUrl: 'http://s', token: 'T' })
    const back = parseConfig(serializeConfig(persisted))
    expect(back).toEqual(persisted)
    expect(mergeSecrets(back!, secrets)).toEqual({ type: 'http', baseUrl: 'http://s', token: 'T' })
  })
})

describe('存储配置 · 解析校验', () => {
  it('非法 JSON / 空 → null', () => {
    expect(parseConfig(null)).toBeNull()
    expect(parseConfig('')).toBeNull()
    expect(parseConfig('{bad')).toBeNull()
  })
  it('未知 type → null', () => {
    expect(parseConfig('{"type":"ftp"}')).toBeNull()
  })
  it('http 缺 baseUrl → null', () => {
    expect(parseConfig('{"type":"http"}')).toBeNull()
  })
  it('合法 local / webdav → 解析', () => {
    expect(parseConfig('{"type":"local"}')).toEqual({ type: 'local' })
    expect(parseConfig('{"type":"webdav","baseUrl":"http://d","username":"u"}'))
      .toEqual({ type: 'webdav', baseUrl: 'http://d', username: 'u' })
  })
})

describe('存储配置 · 完整性与连通性', () => {
  it('本地后端无需 baseUrl 即完整；远端缺 baseUrl 不完整', () => {
    expect(isConfigComplete({ type: 'local' })).toBe(true)
    expect(isConfigComplete({ type: 'http', baseUrl: '' })).toBe(false)
    expect(isConfigComplete({ type: 'http', baseUrl: 'http://s' })).toBe(true)
  })

  it('testConnection：可达返回 ok，list 抛错返回失败信息', async () => {
    const good = new MemoryProvider()
    expect(await testConnection(good)).toEqual({ ok: true })

    const bad = new MemoryProvider({ failNext: () => true })
    const res = await testConnection(bad)
    expect(res.ok).toBe(false)
    expect(res.error).toBeTruthy()
  })
})
