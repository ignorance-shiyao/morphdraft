// Provider 工厂（B1）：把「存储配置」统一构造成 StorageProvider。
// 这是设置 UI ↔ 同步引擎之间的唯一桥：UI 选后端 + 填地址/凭证 → createProvider → 拿到 Provider。
// 纯函数、依赖可注入（fetch / RawKv），便于单测与 Tauri 自定义网络客户端。
import type { StorageProvider } from './types'
import { MemoryProvider } from './providers/memoryProvider'
import { HttpServerProvider } from './providers/httpServerProvider'
import { WebDavProvider } from './providers/webdavProvider'
import { LocalProvider, createIdbRawKv, type RawKv } from './providers/localProvider'
import { DropboxProvider } from './providers/dropboxProvider'
import { OneDriveProvider } from './providers/oneDriveProvider'
import { GoogleDriveProvider } from './providers/googleDriveProvider'
import type { CloudId } from './oauth/providers'

export type StorageConfig =
  | { type: 'local' }
  | { type: 'memory' }
  | { type: 'http'; baseUrl: string; token?: string }
  | { type: 'webdav'; baseUrl: string; username?: string; password?: string }
  | { type: 'dropbox' }
  | { type: 'onedrive' }
  | { type: 'googledrive' }

export type StorageType = StorageConfig['type']

const CLOUD_TYPES: Record<string, CloudId> = { dropbox: 'dropbox', onedrive: 'onedrive', googledrive: 'googledrive' }

export interface CreateProviderDeps {
  // 注入 fetch（Tauri 自定义客户端 / 测试替身）；默认 globalThis.fetch。
  fetch?: typeof fetch
  // 注入本地裸存储（测试用内存替身）；默认 IndexedDB。
  rawKv?: RawKv
  // 云盘后端的 access token 取得器（通常来自 TokenManager.getTokenFn()，含自动续期）。
  cloudToken?: (id: CloudId) => () => Promise<string> | string
}

// 是否为 OAuth 云盘后端。
export function isCloud(type: StorageType): type is CloudId {
  return type in CLOUD_TYPES
}

// 远端后端是否需要「填写凭证」（云盘走 OAuth 授权，不在此列）。
export function needsCredentials(type: StorageType): boolean {
  return type === 'http' || type === 'webdav'
}

// 是否需 OAuth 授权（云盘）。
export function needsOAuth(type: StorageType): boolean {
  return isCloud(type)
}

// 是否为远端（需联网/同步）后端。
export function isRemote(type: StorageType): boolean {
  return type === 'http' || type === 'webdav' || isCloud(type)
}

export function createProvider(cfg: StorageConfig, deps: CreateProviderDeps = {}): StorageProvider {
  switch (cfg.type) {
    case 'memory':
      return new MemoryProvider()
    case 'local':
      return new LocalProvider(deps.rawKv ?? createIdbRawKv())
    case 'http':
      if (!cfg.baseUrl) throw new Error('http 后端需要 baseUrl')
      return new HttpServerProvider({ baseUrl: cfg.baseUrl, token: cfg.token, fetch: deps.fetch })
    case 'webdav':
      if (!cfg.baseUrl) throw new Error('webdav 后端需要 baseUrl')
      return new WebDavProvider({
        baseUrl: cfg.baseUrl,
        username: cfg.username,
        password: cfg.password,
        fetch: deps.fetch,
      })
    case 'dropbox':
    case 'onedrive':
    case 'googledrive': {
      const getToken = cloudGetToken(cfg.type, deps)
      if (cfg.type === 'dropbox') return new DropboxProvider({ getToken, fetch: deps.fetch })
      if (cfg.type === 'onedrive') return new OneDriveProvider({ getToken, fetch: deps.fetch })
      return new GoogleDriveProvider({ getToken, fetch: deps.fetch })
    }
    default: {
      // 穷尽检查：新增后端类型时此处会编译报错提醒补齐。
      const _exhaustive: never = cfg
      throw new Error(`未知存储后端：${JSON.stringify(_exhaustive)}`)
    }
  }
}

// 取云盘的 token 取得器；未注入则说明尚未授权连接。
function cloudGetToken(id: CloudId, deps: CreateProviderDeps): () => Promise<string> | string {
  if (!deps.cloudToken) throw new Error(`${id} 需先完成 OAuth 授权（缺 token 取得器）`)
  return deps.cloudToken(id)
}
