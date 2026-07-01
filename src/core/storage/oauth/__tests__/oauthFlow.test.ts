// OAuth 流程测试：授权 URL 参数、code 换 token、refresh 续期、过期判定。fetch 全注入。
import { describe, it, expect, vi } from 'vitest'
import { buildAuthRequest, exchangeCode, refreshToken, isExpired } from '../oauthFlow'
import { OAUTH_PROVIDERS } from '../providers'

const client = { clientId: 'cid-123', redirectUri: 'morphdraft://oauth' }

describe('OAuth 授权请求', () => {
  it('buildAuthRequest 携带 PKCE / scope / state / 附加参数', async () => {
    const req = await buildAuthRequest(OAUTH_PROVIDERS.dropbox, client)
    const u = new URL(req.url)
    expect(u.origin + u.pathname).toBe('https://www.dropbox.com/oauth2/authorize')
    expect(u.searchParams.get('response_type')).toBe('code')
    expect(u.searchParams.get('client_id')).toBe('cid-123')
    expect(u.searchParams.get('redirect_uri')).toBe('morphdraft://oauth')
    expect(u.searchParams.get('code_challenge_method')).toBe('S256')
    expect(u.searchParams.get('code_challenge')).toBeTruthy()
    expect(u.searchParams.get('state')).toBe(req.state)
    // Dropbox 离线刷新参数
    expect(u.searchParams.get('token_access_type')).toBe('offline')
    expect(req.verifier).toMatch(/^[A-Za-z0-9\-._~]{43,128}$/)
  })

  it('Google 授权请求含 access_type=offline & drive.file scope', async () => {
    const req = await buildAuthRequest(OAUTH_PROVIDERS.googledrive, client)
    const u = new URL(req.url)
    expect(u.searchParams.get('access_type')).toBe('offline')
    expect(u.searchParams.get('scope')).toContain('drive.file')
  })
})

describe('OAuth token 交换', () => {
  it('exchangeCode POST 正确报文并解析 TokenSet（含 expiresAt）', async () => {
    const spy = vi.fn(async () => new Response(JSON.stringify({
      access_token: 'AT', refresh_token: 'RT', token_type: 'Bearer', expires_in: 3600, scope: 'files',
    }), { status: 200 }))
    const tok = await exchangeCode(OAUTH_PROVIDERS.dropbox, client, 'AUTHCODE', 'VERIFIER',
      { fetch: spy as unknown as typeof fetch, now: () => 1_000_000 })
    expect(tok.accessToken).toBe('AT')
    expect(tok.refreshToken).toBe('RT')
    expect(tok.expiresAt).toBe(1_000_000 + 3600 * 1000)
    // 报文体
    const body = (spy.mock.calls[0][1] as RequestInit).body as string
    const p = new URLSearchParams(body)
    expect(p.get('grant_type')).toBe('authorization_code')
    expect(p.get('code')).toBe('AUTHCODE')
    expect(p.get('code_verifier')).toBe('VERIFIER')
    expect(p.get('client_id')).toBe('cid-123')
  })

  it('token 端点报错 → 抛出带状态', async () => {
    const spy = vi.fn(async () => new Response('bad', { status: 400 }))
    await expect(exchangeCode(OAUTH_PROVIDERS.dropbox, client, 'c', 'v', { fetch: spy as unknown as typeof fetch }))
      .rejects.toThrow(/400/)
  })

  it('refreshToken 沿用旧 refresh_token（当云不回传时）', async () => {
    const spy = vi.fn(async () => new Response(JSON.stringify({
      access_token: 'AT2', token_type: 'Bearer', expires_in: 3600,
    }), { status: 200 }))
    const tok = await refreshToken(OAUTH_PROVIDERS.googledrive, client, 'OLD_RT', { fetch: spy as unknown as typeof fetch })
    expect(tok.accessToken).toBe('AT2')
    expect(tok.refreshToken).toBe('OLD_RT')
    const p = new URLSearchParams((spy.mock.calls[0][1] as RequestInit).body as string)
    expect(p.get('grant_type')).toBe('refresh_token')
    expect(p.get('refresh_token')).toBe('OLD_RT')
  })
})

describe('OAuth 过期判定', () => {
  it('isExpired 留 60s 余量（阈值 = expiresAt - 60000）', () => {
    const tok = { accessToken: 'a', tokenType: 'Bearer', expiresAt: 100_000 }
    expect(isExpired(tok, 30_000)).toBe(false)  // 30k < 40k 阈值
    expect(isExpired(tok, 39_999)).toBe(false)
    expect(isExpired(tok, 40_000)).toBe(true)   // 到达余量阈值即视为过期
    expect(isExpired(tok, 99_950)).toBe(true)
    // 无 expiresAt（不知道）→ 视为未过期
    expect(isExpired({ accessToken: 'a', tokenType: 'Bearer' }, 999_999)).toBe(false)
  })
})
