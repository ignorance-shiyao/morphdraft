// OAuth「授权码 + PKCE」流程（provider-agnostic）：构造授权 URL、用 code 换 token、刷新 token。
// fetch 可注入（测试 / Tauri 自定义客户端）。不持有任何密钥，仅短期 token + refresh token。
import type { OAuthProviderConfig } from './providers'
import { generateVerifier, challengeFromVerifier, randomState } from './pkce'

export interface OAuthClient {
  clientId: string
  redirectUri: string
}

// 待回跳状态：发起授权后需暂存 verifier/state，回跳时取出校验并换码。
export interface PendingAuth {
  url: string
  verifier: string
  state: string
}

export interface TokenSet {
  accessToken: string
  refreshToken?: string
  tokenType: string
  scope?: string
  // 绝对过期时间（ms）；据此判断是否需要刷新。
  expiresAt?: number
}

export interface OAuthDeps {
  fetch?: typeof fetch
  now?: () => number
}

// 构造授权请求：返回跳转 URL + 需暂存的 verifier/state。
export async function buildAuthRequest(
  provider: OAuthProviderConfig,
  client: OAuthClient,
): Promise<PendingAuth> {
  const verifier = generateVerifier()
  const challenge = await challengeFromVerifier(verifier)
  const state = randomState()
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: client.clientId,
    redirect_uri: client.redirectUri,
    scope: provider.scopes.join(' '),
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    ...provider.extraAuthParams,
  })
  return { url: `${provider.authEndpoint}?${params.toString()}`, verifier, state }
}

// 回跳后用授权码换取 token。
export async function exchangeCode(
  provider: OAuthProviderConfig,
  client: OAuthClient,
  code: string,
  verifier: string,
  deps: OAuthDeps = {},
): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: client.redirectUri,
    client_id: client.clientId,
    code_verifier: verifier,
  })
  return postToken(provider, body, deps)
}

// 用 refresh_token 续期。
export async function refreshToken(
  provider: OAuthProviderConfig,
  client: OAuthClient,
  refreshTokenValue: string,
  deps: OAuthDeps = {},
): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshTokenValue,
    client_id: client.clientId,
  })
  const set = await postToken(provider, body, deps)
  // 部分云刷新时不回传 refresh_token，沿用旧的。
  if (!set.refreshToken) set.refreshToken = refreshTokenValue
  return set
}

// token 是否已过期（留 60s 余量）。
export function isExpired(token: TokenSet, now = Date.now()): boolean {
  return token.expiresAt !== undefined && now >= token.expiresAt - 60_000
}

async function postToken(provider: OAuthProviderConfig, body: URLSearchParams, deps: OAuthDeps): Promise<TokenSet> {
  const f = deps.fetch ?? globalThis.fetch
  if (!f) throw new Error('oauth: no fetch available')
  const res = await f(provider.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`oauth token endpoint ${res.status}: ${text.slice(0, 200)}`)
  }
  const json = (await res.json()) as {
    access_token: string
    refresh_token?: string
    token_type?: string
    scope?: string
    expires_in?: number
  }
  const now = (deps.now ?? Date.now)()
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    tokenType: json.token_type ?? 'Bearer',
    scope: json.scope,
    expiresAt: json.expires_in ? now + json.expires_in * 1000 : undefined,
  }
}
