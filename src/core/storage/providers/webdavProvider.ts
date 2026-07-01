// WebDavProvider（B2，提前实现）：直连 WebDAV 的 StorageProvider。
// Tauri 桌面端主推（无 CORS 困扰），可接 Nextcloud / 坚果云 / 群晖等。
//
// 映射：
//   list   → PROPFIND <base>/<prefix> Depth:1，解析 multistatus 的 href + getetag
//   get    → GET，200 带 ETag；404 → null
//   put    → PUT，If-Match 条件覆盖 / If-None-Match:* 仅创建；412 → 冲突；409（缺父目录）尝试 MKCOL 后重试一次
//   delete → DELETE，If-Match；404 容忍
//
// XML 解析用命名空间容忍的轻量正则（node 测试环境无 DOMParser），只取 href/getetag 两字段。
import type { StorageProvider, RemoteRef, StorageCaps } from '../types'
import { ConflictError } from '../types'

export interface WebDavProviderOptions {
  baseUrl: string
  username?: string
  password?: string
  fetch?: typeof fetch
}

export class WebDavProvider implements StorageProvider {
  readonly id = 'webdav'
  readonly caps: StorageCaps = {
    versions: false,
    conditionalWrite: true,
    list: true,
    incremental: false,
    e2eCompatible: true,
  }
  private base: string
  private basePath: string
  private auth?: string
  private fetchImpl: typeof fetch

  constructor(opts: WebDavProviderOptions) {
    this.base = opts.baseUrl.replace(/\/+$/, '')
    // 记录 base 的 path 部分，用于把 PROPFIND 返回的 href 还原成相对对象路径。
    try {
      this.basePath = new URL(this.base).pathname.replace(/\/+$/, '')
    } catch {
      this.basePath = ''
    }
    if (opts.username !== undefined) {
      const raw = `${opts.username}:${opts.password ?? ''}`
      this.auth = `Basic ${b64(raw)}`
    }
    const f = opts.fetch ?? globalThis.fetch
    if (!f) throw new Error('WebDavProvider: no fetch available')
    this.fetchImpl = f.bind(globalThis)
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    const h: Record<string, string> = { ...extra }
    if (this.auth) h.Authorization = this.auth
    return h
  }

  private urlFor(path: string): string {
    const enc = path.split('/').map(encodeURIComponent).join('/')
    return `${this.base}/${enc}`
  }

  // 把服务端 href（可能是绝对 URL 或服务器根路径，可能 URL 编码）还原为相对对象路径。
  private hrefToPath(href: string): string | null {
    let p = href
    try {
      p = new URL(href, this.base).pathname
    } catch {
      /* href 已是路径 */
    }
    p = decodeURIComponent(p).replace(/\/+$/, '')
    const bp = this.basePath
    if (bp && p.startsWith(bp)) p = p.slice(bp.length)
    p = p.replace(/^\/+/, '')
    return p || null
  }

  async list(prefix: string): Promise<RemoteRef[]> {
    const res = await this.fetchImpl(this.urlFor(prefix), {
      method: 'PROPFIND',
      headers: this.headers({ Depth: '1', 'Content-Type': 'application/xml' }),
      body: PROPFIND_BODY,
    })
    if (res.status === 404) return []
    if (!res.ok && res.status !== 207) throw new Error(`PROPFIND failed: ${res.status}`)
    const xml = await res.text()
    const out: RemoteRef[] = []
    for (const block of splitResponses(xml)) {
      const href = pick(block, 'href')
      if (!href) continue
      const path = this.hrefToPath(href)
      // 跳过集合自身与非该前缀项。
      if (!path || path === prefix.replace(/\/+$/, '') || !path.startsWith(prefix)) continue
      out.push({ path, etag: normalizeEtag(pick(block, 'getetag')) })
    }
    return out
  }

  async get(path: string): Promise<{ bytes: Uint8Array; ref: RemoteRef } | null> {
    const res = await this.fetchImpl(this.urlFor(path), { headers: this.headers() })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`GET failed: ${res.status}`)
    const buf = new Uint8Array(await res.arrayBuffer())
    return { bytes: buf, ref: { path, etag: normalizeEtag(res.headers.get('ETag')), size: buf.length } }
  }

  async put(path: string, bytes: Uint8Array, ifMatch?: string): Promise<RemoteRef> {
    const cond: Record<string, string> = ifMatch !== undefined ? { 'If-Match': ifMatch } : { 'If-None-Match': '*' }
    let res = await this.putOnce(path, bytes, cond)
    // 409 多为父集合缺失：建目录后重试一次。
    if (res.status === 409) {
      await this.ensureParent(path)
      res = await this.putOnce(path, bytes, cond)
    }
    if (res.status === 412) throw new ConflictError(path)
    if (!res.ok) throw new Error(`PUT failed: ${res.status}`)
    const etag = normalizeEtag(res.headers.get('ETag'))
    return { path, etag, size: bytes.length }
  }

  private putOnce(path: string, bytes: Uint8Array, cond: Record<string, string>): Promise<Response> {
    return this.fetchImpl(this.urlFor(path), {
      method: 'PUT',
      headers: this.headers({ 'Content-Type': 'application/octet-stream', ...cond }),
      body: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    })
  }

  // 逐级 MKCOL 建出父集合（已存在的 405/409 忽略）。
  private async ensureParent(path: string): Promise<void> {
    const parts = path.split('/').slice(0, -1)
    let acc = ''
    for (const seg of parts) {
      acc = acc ? `${acc}/${seg}` : seg
      await this.fetchImpl(this.urlFor(acc), { method: 'MKCOL', headers: this.headers() }).catch(() => {})
    }
  }

  async delete(path: string, ifMatch?: string): Promise<void> {
    const cond: Record<string, string> = ifMatch !== undefined ? { 'If-Match': ifMatch } : {}
    const res = await this.fetchImpl(this.urlFor(path), { method: 'DELETE', headers: this.headers(cond) })
    if (res.status === 412) throw new ConflictError(path)
    if (res.status === 404) return
    if (!res.ok && res.status !== 204) throw new Error(`DELETE failed: ${res.status}`)
  }
}

const PROPFIND_BODY =
  '<?xml version="1.0"?><propfind xmlns="DAV:"><prop><getetag/><resourcetype/><getcontentlength/></prop></propfind>'

// 拆 multistatus 为各 <response> 块（命名空间前缀容忍）。
function splitResponses(xml: string): string[] {
  const re = /<(?:[a-zA-Z0-9]+:)?response[\s>][\s\S]*?<\/(?:[a-zA-Z0-9]+:)?response>/g
  return xml.match(re) ?? []
}

// 取某标签的文本内容（命名空间前缀容忍，取首个）。
function pick(block: string, tag: string): string | undefined {
  const re = new RegExp(`<(?:[a-zA-Z0-9]+:)?${tag}[^>]*>([\\s\\S]*?)</(?:[a-zA-Z0-9]+:)?${tag}>`, 'i')
  const m = block.match(re)
  return m ? m[1].trim() : undefined
}

function normalizeEtag(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined
  return raw.replace(/^W\//, '').replace(/^"|"$/g, '')
}

function b64(s: string): string {
  if (typeof btoa === 'function') return btoa(s)
  // node 回退
  return Buffer.from(s, 'utf-8').toString('base64')
}
