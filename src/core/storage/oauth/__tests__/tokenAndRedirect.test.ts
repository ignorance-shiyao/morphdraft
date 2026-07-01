// OAuth 回跳解析 + token 存储 + 自动续期管理 的测试。
import { describe, it, expect, vi } from 'vitest'
import { parseRedirect } from '../redirect'
import { createMemoryTokenStore } from '../tokenStore'
import { TokenManager } from '../tokenManager'
import type { TokenSet } from '../oauthFlow'

const client = { clientId: 'cid', redirectUri: 'morphdraft://oauth' }

describe('parseRedirect', () => {
  it('合法 code + 匹配 state → ok', () => {
    expect(parseRedirect('morphdraft://oauth?code=ABC&state=S1', 'S1')).toEqual({ ok: true, code: 'ABC' })
  })
  it('state 不符 → 失败', () => {
    expect(parseRedirect('x://cb?code=ABC&state=BAD', 'S1').ok).toBe(false)
    expect(parseRedirect('x://cb?code=ABC&state=BAD', 'S1').error).toBe('state_mismatch')
  })
  it('provider 报错 → 透出 error', () => {
    const r = parseRedirect('x://cb?error=access_denied&error_description=nope&state=S1', 'S1')
    expect(r.ok).toBe(false)
    expect(r.error).toBe('access_denied')
    expect(r.errorDescription).toBe('nope')
  })
  it('缺 code → 失败', () => {
    expect(parseRedirect('x://cb?state=S1', 'S1').error).toBe('missing_code')
  })
  it('code 在 fragment 里也能取', () => {
    expect(parseRedirect('x://cb#code=FRAG&state=S1', 'S1')).toEqual({ ok: true, code: 'FRAG' })
  })
  it('非法 URL → 失败', () => {
    expect(parseRedirect('not a url', 'S1').error).toBe('invalid_redirect_url')
  })
})

describe('TokenManager 自动续期', () => {
  const valid = (over: Partial<TokenSet> = {}): TokenSet => ({ accessToken: 'AT', tokenType: 'Bearer', expiresAt: 10_000_000, ...over })

  it('无 token → 抛错（需授权）', async () => {
    const tm = new TokenManager('dropbox', client, createMemoryTokenStore())
    await expect(tm.getValidToken()).rejects.toThrow(/需先授权/)
  })

  it('有效未过期 → 直接返回，不刷新', async () => {
    const store = createMemoryTokenStore()
    await store.save('dropbox', valid())
    const spy = vi.fn()
    const tm = new TokenManager('dropbox', client, store, { fetch: spy as unknown as typeof fetch, now: () => 1000 })
    expect(await tm.getValidToken()).toBe('AT')
    expect(spy).not.toHaveBeenCalled()
  })

  it('过期 + 有 refresh_token → 续期、落存、返回新 token', async () => {
    const store = createMemoryTokenStore()
    await store.save('googledrive', valid({ accessToken: 'OLD', refreshToken: 'RT', expiresAt: 5000 }))
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ access_token: 'NEW', token_type: 'Bearer', expires_in: 3600 }), { status: 200 }))
    const tm = new TokenManager('googledrive', client, store, { fetch: fetchSpy as unknown as typeof fetch, now: () => 999_999 })
    expect(await tm.getValidToken()).toBe('NEW')
    // 落存的新 token 沿用旧 refresh_token
    const saved = await store.load('googledrive')
    expect(saved?.accessToken).toBe('NEW')
    expect(saved?.refreshToken).toBe('RT')
  })

  it('过期 + 无 refresh_token → 抛错（需重新授权）', async () => {
    const store = createMemoryTokenStore()
    await store.save('onedrive', valid({ expiresAt: 5000 }))
    const tm = new TokenManager('onedrive', client, store, { now: () => 999_999 })
    await expect(tm.getValidToken()).rejects.toThrow(/重新授权/)
  })

  it('getTokenFn 可作为 Provider 的 getToken 注入', async () => {
    const store = createMemoryTokenStore()
    await store.save('dropbox', valid())
    const tm = new TokenManager('dropbox', client, store, { now: () => 1000 })
    const fn = tm.getTokenFn()
    expect(await fn()).toBe('AT')
  })
})
