// OAuth 回跳解析（provider/env 无关）：从回跳 URL 取出 code，并校验 state 防 CSRF。
// Tauri 深链与 Web 弹窗/重定向都把回跳 URL 交给这里解析，纯函数、可单测。

export interface RedirectResult {
  ok: boolean
  code?: string
  error?: string
  errorDescription?: string
}

// 解析回跳 URL；expectedState 为发起授权时暂存的 state。
// 失败情形：provider 报错（?error=）、state 不符、缺 code。
export function parseRedirect(url: string, expectedState: string): RedirectResult {
  let params: URLSearchParams
  try {
    const u = new URL(url)
    // 授权码可能在 query 或 fragment（少数实现）；优先 query。
    params = u.searchParams
    if (!params.get('code') && !params.get('error') && u.hash) {
      params = new URLSearchParams(u.hash.replace(/^#/, ''))
    }
  } catch {
    return { ok: false, error: 'invalid_redirect_url' }
  }

  const err = params.get('error')
  if (err) {
    return { ok: false, error: err, errorDescription: params.get('error_description') ?? undefined }
  }
  const state = params.get('state')
  if (!state || state !== expectedState) {
    return { ok: false, error: 'state_mismatch' }
  }
  const code = params.get('code')
  if (!code) {
    return { ok: false, error: 'missing_code' }
  }
  return { ok: true, code }
}
