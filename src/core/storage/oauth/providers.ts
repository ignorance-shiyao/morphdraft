// 各云 OAuth 端点与 scope 配置（纯数据）。client_id / redirectUri 在运行时由用户配置注入。
// 全部走「授权码 + PKCE」公共客户端流程，scope 仅申请目录级读写（最小权限）。

export type CloudId = 'googledrive' | 'onedrive' | 'dropbox'

export interface OAuthProviderConfig {
  id: CloudId
  label: string
  authEndpoint: string
  tokenEndpoint: string
  // 目录读写最小 scope（+ 离线刷新）。
  scopes: string[]
  // 授权请求附加参数（如 Google 的离线授权、Dropbox 的离线 token）。
  extraAuthParams?: Record<string, string>
}

export const OAUTH_PROVIDERS: Record<CloudId, OAuthProviderConfig> = {
  googledrive: {
    id: 'googledrive',
    label: 'Google Drive',
    authEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    // drive.file：仅访问本应用创建/打开的文件，最小且无需敏感权限审核。
    scopes: ['https://www.googleapis.com/auth/drive.file'],
    extraAuthParams: { access_type: 'offline', prompt: 'consent' },
  },
  onedrive: {
    id: 'onedrive',
    label: 'OneDrive',
    authEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scopes: ['Files.ReadWrite', 'offline_access'],
  },
  dropbox: {
    id: 'dropbox',
    label: 'Dropbox',
    authEndpoint: 'https://www.dropbox.com/oauth2/authorize',
    tokenEndpoint: 'https://api.dropboxapi.com/oauth2/token',
    scopes: ['files.content.write', 'files.content.read'],
    // token_access_type=offline 才会返回 refresh_token。
    extraAuthParams: { token_access_type: 'offline' },
  },
}
