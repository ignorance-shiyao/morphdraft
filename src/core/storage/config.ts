// 存储配置（B1）：在「持久化（非密钥）」与「密钥」之间切分，呼应设计 §8 凭证规则——
// 密钥不进 configMirror 明文（Tauri 走钥匙串、浏览器仅会话内存），这里只做纯切分/校验/连通性测试。
import type { StorageProvider } from './types'
import type { StorageConfig, StorageType } from './factory'
import { isRemote } from './factory'

export type { StorageConfig, StorageType }

// 持久化部分：去掉 token/password 等密钥后可安全写入本地配置。
export type PersistedConfig =
  | { type: 'local' }
  | { type: 'memory' }
  | { type: 'http'; baseUrl: string }
  | { type: 'webdav'; baseUrl: string; username?: string }
  | { type: 'dropbox' }
  | { type: 'onedrive' }
  | { type: 'googledrive' }

// 密钥部分：单独保管（钥匙串 / 会话内存），绝不与 PersistedConfig 一起落明文。
export interface Secrets {
  token?: string
  password?: string
}

const VALID_TYPES: Record<StorageType, true> = { local: true, memory: true, http: true, webdav: true, dropbox: true, onedrive: true, googledrive: true }

// 把完整配置切成「可持久化」与「密钥」两半。
export function splitSecrets(cfg: StorageConfig): { persisted: PersistedConfig; secrets: Secrets } {
  switch (cfg.type) {
    case 'http':
      return { persisted: { type: 'http', baseUrl: cfg.baseUrl }, secrets: { token: cfg.token } }
    case 'webdav':
      return {
        persisted: { type: 'webdav', baseUrl: cfg.baseUrl, username: cfg.username },
        secrets: { password: cfg.password },
      }
    default:
      return { persisted: { type: cfg.type }, secrets: {} }
  }
}

// 持久化配置 + 密钥 → 完整配置（构造 Provider 前用）。
export function mergeSecrets(persisted: PersistedConfig, secrets: Secrets = {}): StorageConfig {
  switch (persisted.type) {
    case 'http':
      return { type: 'http', baseUrl: persisted.baseUrl, token: secrets.token }
    case 'webdav':
      return { type: 'webdav', baseUrl: persisted.baseUrl, username: persisted.username, password: secrets.password }
    default:
      return { type: persisted.type }
  }
}

// 序列化持久化配置（写本地配置项）。
export function serializeConfig(persisted: PersistedConfig): string {
  return JSON.stringify(persisted)
}

// 解析+校验持久化配置；非法返回 null（调用方回落默认 local）。
export function parseConfig(raw: string | null | undefined): PersistedConfig | null {
  if (!raw) return null
  let obj: unknown
  try {
    obj = JSON.parse(raw)
  } catch {
    return null
  }
  if (!obj || typeof obj !== 'object') return null
  const o = obj as Record<string, unknown>
  const type = o.type as StorageType
  if (!type || !VALID_TYPES[type]) return null
  if (type === 'http' || type === 'webdav') {
    if (typeof o.baseUrl !== 'string' || !o.baseUrl) return null
    if (type === 'webdav') {
      return { type, baseUrl: o.baseUrl, username: typeof o.username === 'string' ? o.username : undefined }
    }
    return { type, baseUrl: o.baseUrl }
  }
  return { type }
}

// 远端配置在保存前是否填齐必填项（baseUrl 等）。供 UI 校验。
export function isConfigComplete(cfg: StorageConfig): boolean {
  if (!isRemote(cfg.type)) return true
  return typeof (cfg as { baseUrl?: string }).baseUrl === 'string' && (cfg as { baseUrl: string }).baseUrl.length > 0
}

export interface ConnectionStatus {
  ok: boolean
  error?: string
}

// 连通性测试：尝试 list 一个前缀；成功即视为可达。供 UI「测试连接」按钮。
export async function testConnection(provider: StorageProvider, prefix = 'documents/'): Promise<ConnectionStatus> {
  try {
    await provider.list(prefix)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
