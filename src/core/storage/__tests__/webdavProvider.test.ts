// WebDavProvider 测试：内存假 WebDAV 服务端（PROPFIND multistatus + GET/PUT/DELETE/MKCOL），
// 驱动客户端跑通共享契约套件，并校验 Basic 鉴权与 PROPFIND/href 解析。
import { describe, it, expect, vi } from 'vitest'
import { WebDavProvider } from '../providers/webdavProvider'
import { runProviderContract } from './providerContract'

interface Obj { bytes: Uint8Array; etag: string }

function hashEtag(b: Uint8Array): string {
  let h = 2166136261 >>> 0
  for (let i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 16777619) >>> 0 }
  return `${h.toString(16)}-${b.length}`
}

const BASE_PATH = '/dav'

// 假 WebDAV：base = http://dav/dav，对象路径为 pathname 去掉 /dav/ 前缀。
function makeFakeDav() {
  const store = new Map<string, Obj>()
  const hdr = (h: HeadersInit | undefined, k: string): string | null => {
    if (!h) return null
    const obj = h as Record<string, string>
    const key = Object.keys(obj).find((x) => x.toLowerCase() === k.toLowerCase())
    return key ? obj[key] : null
  }
  const toPath = (pathname: string) => decodeURIComponent(pathname).replace(BASE_PATH + '/', '').replace(/\/+$/, '')
  const fakeFetch = (async (input: string, init?: RequestInit): Promise<Response> => {
    const url = new URL(input, 'http://dav')
    const method = (init?.method ?? 'GET').toUpperCase()
    const path = toPath(url.pathname)

    if (method === 'MKCOL') return new Response('', { status: 201 })

    if (method === 'PROPFIND') {
      const prefix = path ? path + '/' : ''
      const children = [...store.entries()].filter(([p]) => p.startsWith(prefix))
      const responses = [
        // 集合自身
        `<d:response><d:href>${BASE_PATH}/${prefix}</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>`,
        ...children.map(([p, o]) =>
          `<d:response><d:href>${BASE_PATH}/${p}</d:href><d:propstat><d:prop><d:getetag>"${o.etag}"</d:getetag></d:prop></d:propstat></d:response>`,
        ),
      ].join('')
      const xml = `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">${responses}</d:multistatus>`
      return new Response(xml, { status: 207, headers: { 'Content-Type': 'application/xml' } })
    }
    if (method === 'GET') {
      const o = store.get(path)
      if (!o) return new Response('', { status: 404 })
      return new Response(o.bytes, { status: 200, headers: { ETag: `"${o.etag}"` } })
    }
    if (method === 'PUT') {
      const cur = store.get(path)
      const ifMatch = hdr(init?.headers, 'If-Match')
      const ifNone = hdr(init?.headers, 'If-None-Match')
      if (ifNone === '*' && cur) return new Response('', { status: 412 })
      if (ifMatch !== null && cur?.etag !== ifMatch) return new Response('', { status: 412 })
      const body = new Uint8Array(init!.body as ArrayBuffer)
      const etag = hashEtag(body)
      store.set(path, { bytes: body, etag })
      return new Response(cur ? null : '', { status: cur ? 204 : 201, headers: { ETag: `"${etag}"` } })
    }
    if (method === 'DELETE') {
      const cur = store.get(path)
      const ifMatch = hdr(init?.headers, 'If-Match')
      if (!cur) return new Response('', { status: 404 })
      if (ifMatch !== null && cur.etag !== ifMatch) return new Response('', { status: 412 })
      store.delete(path)
      return new Response(null, { status: 204 })
    }
    return new Response('', { status: 405 })
  }) as unknown as typeof fetch
  return { fakeFetch, store }
}

runProviderContract('webdav', () => {
  const { fakeFetch } = makeFakeDav()
  return new WebDavProvider({ baseUrl: 'http://dav/dav/', fetch: fakeFetch })
})

describe('WebDavProvider · 报文细节', () => {
  it('带凭证时发送 Basic 鉴权头', async () => {
    const spy = vi.fn(async () => new Response('<d:multistatus xmlns:d="DAV:"></d:multistatus>', { status: 207 }))
    const p = new WebDavProvider({ baseUrl: 'http://dav/dav', username: 'u', password: 'p', fetch: spy as unknown as typeof fetch })
    await p.list('documents/')
    const init = spy.mock.calls[0][1] as RequestInit
    const auth = (init.headers as Record<string, string>).Authorization
    expect(auth).toBe('Basic ' + Buffer.from('u:p').toString('base64'))
    expect(init.method).toBe('PROPFIND')
  })

  it('list 解析 multistatus，剔除集合自身，还原相对路径与 etag', async () => {
    const { fakeFetch, store } = makeFakeDav()
    const enc = new TextEncoder()
    store.set('documents/a.md', { bytes: enc.encode('a'), etag: 'e1' })
    store.set('documents/b.md', { bytes: enc.encode('b'), etag: 'e2' })
    const p = new WebDavProvider({ baseUrl: 'http://dav/dav/', fetch: fakeFetch })
    const refs = await p.list('documents/')
    expect(refs.map((r) => r.path).sort()).toEqual(['documents/a.md', 'documents/b.md'])
    expect(refs.find((r) => r.path === 'documents/a.md')?.etag).toBe('e1')
  })
})
