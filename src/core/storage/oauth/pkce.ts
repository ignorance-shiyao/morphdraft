// PKCE 原语（RFC 7636）：为「授权码 + PKCE」OAuth 流程生成 code_verifier / code_challenge / state。
// 公共客户端（浏览器 / Tauri）据此安全地走授权码流，无需 client secret。
// 依赖 WebCrypto（浏览器、Tauri webview、Node 18+ 均内置 globalThis.crypto）。

const UNRESERVED = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'

function getCrypto(): Crypto {
  const c = globalThis.crypto
  if (!c || !c.subtle) throw new Error('WebCrypto unavailable (need crypto.subtle)')
  return c
}

// base64url（无填充）编码字节。
function base64UrlEncode(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  const b64 = typeof btoa === 'function' ? btoa(bin) : Buffer.from(bytes).toString('base64')
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// 生成 code_verifier：43–128 个 unreserved 字符的高熵随机串。
export function generateVerifier(length = 64): string {
  const len = Math.min(128, Math.max(43, length))
  const rnd = new Uint8Array(len)
  getCrypto().getRandomValues(rnd)
  let out = ''
  for (let i = 0; i < len; i++) out += UNRESERVED[rnd[i] % UNRESERVED.length]
  return out
}

// 由 verifier 计算 S256 challenge：BASE64URL(SHA-256(verifier))。
export async function challengeFromVerifier(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier)
  const digest = await getCrypto().subtle.digest('SHA-256', data)
  return base64UrlEncode(new Uint8Array(digest))
}

// 防 CSRF 的随机 state（回跳时比对）。
export function randomState(): string {
  const rnd = new Uint8Array(16)
  getCrypto().getRandomValues(rnd)
  return base64UrlEncode(rnd)
}

export { base64UrlEncode }
