// OAuth token 存储抽象：按云 id 存取 TokenSet。
// 生产：Tauri 走系统钥匙串、Web 走 sessionStorage（短期）；测试用内存。这里定义接口 + 内存/会话实现。
import type { TokenSet } from './oauthFlow'
import type { CloudId } from './providers'

export interface TokenStore {
  load(id: CloudId): Promise<TokenSet | null>
  save(id: CloudId, token: TokenSet): Promise<void>
  clear(id: CloudId): Promise<void>
}

// 内存实现（测试 / 临时会话）。
export function createMemoryTokenStore(): TokenStore {
  const map = new Map<CloudId, TokenSet>()
  return {
    async load(id) { return map.get(id) ?? null },
    async save(id, t) { map.set(id, t) },
    async clear(id) { map.delete(id) },
  }
}

// 浏览器 sessionStorage 实现（仅会话内有效，关闭标签即清，符合「浏览器不长期持有」原则）。
const KEY_PREFIX = 'mddoc:oauth:'
export function createSessionTokenStore(): TokenStore {
  const get = (): Storage | null => {
    try { return globalThis.sessionStorage ?? null } catch { return null }
  }
  return {
    async load(id) {
      const s = get(); if (!s) return null
      const raw = s.getItem(KEY_PREFIX + id)
      if (!raw) return null
      try { return JSON.parse(raw) as TokenSet } catch { return null }
    },
    async save(id, t) { get()?.setItem(KEY_PREFIX + id, JSON.stringify(t)) },
    async clear(id) { get()?.removeItem(KEY_PREFIX + id) },
  }
}
