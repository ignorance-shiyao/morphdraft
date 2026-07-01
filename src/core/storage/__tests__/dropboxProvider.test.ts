// DropboxProvider 测试：内存假 Dropbox API（rev 语义）驱动共享契约套件 + 报文细节。
import { describe, it, expect, vi } from 'vitest'
import { DropboxProvider } from '../providers/dropboxProvider'
import { runProviderContract } from './providerContract'

interface Obj { bytes: Uint8Array; rev: string }

function makeFakeDropbox() {
  const store = new Map<string, Obj>()
  let revSeq = 0
  const nextRev = () => `rev${++revSeq}`
  const entry = (path: string, o: Obj) => ({ '.tag': 'file', rev: o.rev, size: o.bytes.length, path_lower: path, path_display: path })

  const fakeFetch = (async (input: string, init?: RequestInit): Promise<Response> => {
    const url = new URL(input)
    const h = (init?.headers ?? {}) as Record<string, string>
    const arg = h['Dropbox-API-Arg'] ? JSON.parse(h['Dropbox-API-Arg']) : null
    const json = async () => (init?.body ? JSON.parse(init.body as string) : {})

    if (url.pathname === '/2/files/list_folder') {
      const { path } = await json()
      const entries = [...store.entries()].filter(([p]) => p.startsWith(path)).map(([p, o]) => entry(p, o))
      return new Response(JSON.stringify({ entries, has_more: false }), { status: 200 })
    }
    if (url.pathname === '/2/files/download') {
      const o = store.get(arg.path)
      if (!o) return new Response('not_found', { status: 409 })
      return new Response(o.bytes, { status: 200, headers: { 'Dropbox-API-Result': JSON.stringify(entry(arg.path, o)) } })
    }
    if (url.pathname === '/2/files/upload') {
      const cur = store.get(arg.path)
      const mode = arg.mode
      if (mode['.tag'] === 'add' && cur) return new Response('conflict', { status: 409 })
      if (mode['.tag'] === 'update' && cur?.rev !== mode.update) return new Response('conflict', { status: 409 })
      const o: Obj = { bytes: new Uint8Array(init!.body as ArrayBuffer), rev: nextRev() }
      store.set(arg.path, o)
      return new Response(JSON.stringify(entry(arg.path, o)), { status: 200 })
    }
    if (url.pathname === '/2/files/get_metadata') {
      const { path } = await json()
      const o = store.get(path)
      if (!o) return new Response('not_found', { status: 409 })
      return new Response(JSON.stringify(entry(path, o)), { status: 200 })
    }
    if (url.pathname === '/2/files/delete_v2') {
      const { path } = await json()
      if (!store.has(path)) return new Response('not_found', { status: 409 })
      store.delete(path)
      return new Response(JSON.stringify({ metadata: {} }), { status: 200 })
    }
    return new Response('', { status: 404 })
  }) as unknown as typeof fetch
  return { fakeFetch, store }
}

runProviderContract('dropbox', () => {
  const { fakeFetch } = makeFakeDropbox()
  return new DropboxProvider({ getToken: () => 'TOKEN', fetch: fakeFetch })
})

describe('DropboxProvider · 报文细节', () => {
  it('每次请求带 Bearer 鉴权', async () => {
    const { fakeFetch } = makeFakeDropbox()
    const spy = vi.fn(fakeFetch)
    const p = new DropboxProvider({ getToken: async () => 'TK', fetch: spy as unknown as typeof fetch })
    await p.put('documents/a.md', new TextEncoder().encode('x'))
    const init = spy.mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer TK')
  })

  it('新建用 mode add、条件覆盖用 mode update', async () => {
    const { fakeFetch } = makeFakeDropbox()
    const spy = vi.fn(fakeFetch)
    const p = new DropboxProvider({ getToken: () => 'TK', fetch: spy as unknown as typeof fetch })
    const r1 = await p.put('documents/a.md', new TextEncoder().encode('v1'))
    let arg = JSON.parse((spy.mock.calls[0][1] as { headers: Record<string, string> }).headers['Dropbox-API-Arg'])
    expect(arg.mode['.tag']).toBe('add')
    await p.put('documents/a.md', new TextEncoder().encode('v2'), r1.etag)
    arg = JSON.parse((spy.mock.calls.at(-1)![1] as { headers: Record<string, string> }).headers['Dropbox-API-Arg'])
    expect(arg.mode['.tag']).toBe('update')
    expect(arg.mode.update).toBe(r1.etag)
  })
})
