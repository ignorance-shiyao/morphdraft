// OneDriveProvider 测试：内存假 Microsoft Graph（路径寻址 + ETag/If-Match）驱动契约套件 + 报文细节。
import { describe, it, expect, vi } from 'vitest'
import { OneDriveProvider } from '../providers/oneDriveProvider'
import { runProviderContract } from './providerContract'

interface Obj { bytes: Uint8Array; etag: string }

function makeFakeGraph() {
  const store = new Map<string, Obj>()
  let seq = 0
  const nextEtag = () => `etag${++seq}`
  const item = (name: string, o: Obj) => ({ name, size: o.bytes.length, eTag: `"${o.etag}"`, file: { mimeType: 'text/markdown' } })
  const hdr = (h: HeadersInit | undefined, k: string): string | null => {
    if (!h) return null
    const obj = h as Record<string, string>
    const key = Object.keys(obj).find((x) => x.toLowerCase() === k.toLowerCase())
    return key ? obj[key] : null
  }

  const fakeFetch = (async (input: string, init?: RequestInit): Promise<Response> => {
    const url = new URL(input)
    const method = (init?.method ?? 'GET').toUpperCase()
    const pathname = decodeURIComponent(url.pathname)
    const children = pathname.match(/\/me\/drive\/root:\/(.*?):\/children$/)
    const content = pathname.match(/\/me\/drive\/root:\/(.*?):\/content$/)
    const itemOnly = pathname.match(/\/me\/drive\/root:\/(.+)$/)

    if (method === 'GET' && children) {
      const folder = children[1]
      const value = [...store.entries()]
        .filter(([p]) => p.startsWith(folder + '/') && !p.slice(folder.length + 1).includes('/'))
        .map(([p, o]) => item(p.slice(folder.length + 1), o))
      return new Response(JSON.stringify({ value }), { status: 200 })
    }
    if (method === 'GET' && content) {
      const o = store.get(content[1])
      if (!o) return new Response('', { status: 404 })
      return new Response(o.bytes, { status: 200, headers: { ETag: `"${o.etag}"` } })
    }
    if (method === 'PUT' && content) {
      const path = content[1]
      const cur = store.get(path)
      const ifMatch = hdr(init?.headers, 'If-Match')
      const ifNone = hdr(init?.headers, 'If-None-Match')
      if (ifNone === '*' && cur) return new Response('', { status: 412 })
      if (ifMatch !== null && cur?.etag !== ifMatch) return new Response('', { status: 412 })
      const o: Obj = { bytes: new Uint8Array(init!.body as ArrayBuffer), etag: nextEtag() }
      store.set(path, o)
      return new Response(JSON.stringify(item(path.split('/').pop()!, o)), { status: cur ? 200 : 201 })
    }
    if (method === 'DELETE' && itemOnly && !content && !children) {
      const path = itemOnly[1]
      const cur = store.get(path)
      const ifMatch = hdr(init?.headers, 'If-Match')
      if (!cur) return new Response('', { status: 404 })
      if (ifMatch !== null && cur.etag !== ifMatch) return new Response('', { status: 412 })
      store.delete(path)
      return new Response(null, { status: 204 })
    }
    return new Response('', { status: 404 })
  }) as unknown as typeof fetch
  return { fakeFetch, store }
}

runProviderContract('onedrive', () => {
  const { fakeFetch } = makeFakeGraph()
  return new OneDriveProvider({ getToken: () => 'TK', fetch: fakeFetch })
})

describe('OneDriveProvider · 报文细节', () => {
  it('带 Bearer 鉴权', async () => {
    const { fakeFetch } = makeFakeGraph()
    const spy = vi.fn(fakeFetch)
    const p = new OneDriveProvider({ getToken: async () => 'ABC', fetch: spy as unknown as typeof fetch })
    await p.put('documents/a.md', new TextEncoder().encode('x'))
    expect((spy.mock.calls[0][1] as { headers: Record<string, string> }).headers.Authorization).toBe('Bearer ABC')
  })

  it('新建发 If-None-Match:*，条件覆盖发 If-Match', async () => {
    const { fakeFetch } = makeFakeGraph()
    const spy = vi.fn(fakeFetch)
    const p = new OneDriveProvider({ getToken: () => 'TK', fetch: spy as unknown as typeof fetch })
    const r1 = await p.put('documents/a.md', new TextEncoder().encode('v1'))
    expect((spy.mock.calls[0][1] as { headers: Record<string, string> }).headers['If-None-Match']).toBe('*')
    await p.put('documents/a.md', new TextEncoder().encode('v2'), r1.etag)
    expect((spy.mock.calls.at(-1)![1] as { headers: Record<string, string> }).headers['If-Match']).toBe(r1.etag)
  })
})
