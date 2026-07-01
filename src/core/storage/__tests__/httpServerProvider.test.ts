// HttpServerProvider 测试：内存假服务端实现 §9.2 契约，驱动客户端跑通共享契约套件，
// 并校验鉴权头与条件写（If-Match / If-None-Match:*）的报文行为。
import { describe, it, expect, vi } from 'vitest'
import { HttpServerProvider } from '../providers/httpServerProvider'
import { runProviderContract } from './providerContract'

interface Obj { bytes: Uint8Array; etag: string }

function hashEtag(b: Uint8Array): string {
  let h = 2166136261 >>> 0
  for (let i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 16777619) >>> 0 }
  return `${h.toString(16)}-${b.length}`
}

// 构造一个实现 §9.2 的内存假服务端，返回 (fetch, store) 供断言。
function makeFakeServer() {
  const store = new Map<string, Obj>()
  const hdr = (h: HeadersInit | undefined, k: string): string | null => {
    if (!h) return null
    const obj = h as Record<string, string>
    const key = Object.keys(obj).find((x) => x.toLowerCase() === k.toLowerCase())
    return key ? obj[key] : null
  }
  const fakeFetch = (async (input: string, init?: RequestInit): Promise<Response> => {
    const url = new URL(input, 'http://srv')
    const method = (init?.method ?? 'GET').toUpperCase()
    const m = url.pathname.match(/^\/v1\/objects\/?(.*)$/)
    if (!m) return new Response('not found', { status: 404 })
    const path = decodeURIComponent(m[1])

    if (method === 'GET' && path === '') {
      const prefix = url.searchParams.get('prefix') ?? ''
      const objects = [...store.entries()]
        .filter(([p]) => p.startsWith(prefix))
        .map(([p, o]) => ({ path: p, etag: o.etag, size: o.bytes.length }))
      return new Response(JSON.stringify({ objects }), { status: 200, headers: { 'Content-Type': 'application/json' } })
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
      if (ifNone === '*' && cur) return new Response('', { status: 412, headers: cur ? { ETag: `"${cur.etag}"` } : {} })
      if (ifMatch !== null && cur?.etag !== ifMatch) return new Response('', { status: 412, headers: cur ? { ETag: `"${cur.etag}"` } : {} })
      const body = new Uint8Array(init!.body as ArrayBuffer)
      const etag = hashEtag(body)
      store.set(path, { bytes: body, etag })
      return new Response('', { status: 200, headers: { ETag: `"${etag}"` } })
    }
    if (method === 'DELETE') {
      const cur = store.get(path)
      const ifMatch = hdr(init?.headers, 'If-Match')
      if (!cur) return new Response('', { status: 404 })
      if (ifMatch !== null && cur.etag !== ifMatch) return new Response('', { status: 412, headers: { ETag: `"${cur.etag}"` } })
      store.delete(path)
      return new Response(null, { status: 204 })
    }
    return new Response('', { status: 405 })
  }) as unknown as typeof fetch
  return { fakeFetch, store }
}

runProviderContract('http', () => {
  const { fakeFetch } = makeFakeServer()
  return new HttpServerProvider({ baseUrl: 'http://srv/', fetch: fakeFetch })
})

describe('HttpServerProvider · 报文细节', () => {
  it('带 token 时发送 Bearer 鉴权头', async () => {
    const spy = vi.fn(async () => new Response(JSON.stringify({ objects: [] }), { status: 200 }))
    const p = new HttpServerProvider({ baseUrl: 'http://srv', token: 'secret', fetch: spy as unknown as typeof fetch })
    await p.list('documents/')
    const init = spy.mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret')
  })

  it('put 新对象发送 If-None-Match:*（仅创建语义）', async () => {
    const spy = vi.fn(async () => new Response('', { status: 200, headers: { ETag: '"abc"' } }))
    const p = new HttpServerProvider({ baseUrl: 'http://srv', fetch: spy as unknown as typeof fetch })
    await p.put('documents/a.md', new TextEncoder().encode('x'))
    const init = spy.mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>)['If-None-Match']).toBe('*')
  })

  it('put 带 ifMatch 发送 If-Match 条件头', async () => {
    const spy = vi.fn(async () => new Response('', { status: 200, headers: { ETag: '"def"' } }))
    const p = new HttpServerProvider({ baseUrl: 'http://srv', fetch: spy as unknown as typeof fetch })
    await p.put('documents/a.md', new TextEncoder().encode('x'), 'prev-etag')
    const init = spy.mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>)['If-Match']).toBe('prev-etag')
  })

  it('路径分段编码但保留斜杠', async () => {
    const spy = vi.fn(async () => new Response('', { status: 404 }))
    const p = new HttpServerProvider({ baseUrl: 'http://srv', fetch: spy as unknown as typeof fetch })
    await p.get('documents/a b.md')
    expect(spy.mock.calls[0][0]).toBe('http://srv/v1/objects/documents/a%20b.md')
  })
})
