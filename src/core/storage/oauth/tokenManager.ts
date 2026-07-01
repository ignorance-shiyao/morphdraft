// Token 管理：为云 Provider 提供「始终有效的 access token」——过期则用 refresh_token 自动续期并落存。
// 把这个的 getValidToken 作为 DropboxProvider/OneDriveProvider/GoogleDriveProvider 的 getToken 注入。
import type { OAuthClient, OAuthDeps, TokenSet } from './oauthFlow'
import { isExpired, refreshToken } from './oauthFlow'
import { OAUTH_PROVIDERS, type CloudId } from './providers'
import type { TokenStore } from './tokenStore'

export class TokenManager {
  constructor(
    private id: CloudId,
    private client: OAuthClient,
    private store: TokenStore,
    private deps: OAuthDeps = {},
  ) {}

  // 写入新获得的 token（授权码交换后调用）。
  async set(token: TokenSet): Promise<void> {
    await this.store.save(this.id, token)
  }

  async clear(): Promise<void> {
    await this.store.clear(this.id)
  }

  async current(): Promise<TokenSet | null> {
    return this.store.load(this.id)
  }

  // 返回有效 access token；过期且有 refresh_token → 续期并落存；无 token → 抛错（需重新授权）。
  async getValidToken(): Promise<string> {
    let token = await this.store.load(this.id)
    if (!token) throw new Error(`未连接 ${this.id}，需先授权`)
    const now = (this.deps.now ?? Date.now)()
    if (isExpired(token, now)) {
      if (!token.refreshToken) throw new Error(`${this.id} token 已过期且无 refresh_token，需重新授权`)
      token = await refreshToken(OAUTH_PROVIDERS[this.id], this.client, token.refreshToken, this.deps)
      await this.store.save(this.id, token)
    }
    return token.accessToken
  }

  // 绑定后可直接作为 Provider 的 getToken 注入。
  getTokenFn(): () => Promise<string> {
    return () => this.getValidToken()
  }
}
