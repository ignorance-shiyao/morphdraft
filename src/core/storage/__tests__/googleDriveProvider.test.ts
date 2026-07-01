// GoogleDriveProvider 测试：内存假 Drive v3（q 解析 + 元数据建文件 + media 上传 + headRevisionId）
// 驱动共享契约套件。文件名=对象路径、单 app 文件夹、乐观锁。
import { describe, it, expect, vi } from 'vitest'
import { GoogleDriveProvider } from '../providers/googleDriveProvider'
import { runProviderContract } from './providerContract'

interface DFile { id: string; name: string; mimeType?: string; parents?: string[]; bytes?: Uint8Array; rev?: string }
const FOLDER_MIME = 'application/vnd.google-apps.folder'

function makeFakeDrive() {
  const files = new Map<string, DFile>()
  let seq = 0
  const nid = () => `id${++seq}`
  const nrev = () => `rev${++seq}`
  const out = (f: DFile) => ({ id: f.id, name: f.name, headRevisionId: f.rev, size: f.bytes ? String(f.bytes.length) : undefined })

  const fakeFetch = (async (input: string, init?: RequestInit): Promise<Response> => {
    const url = new URL(input)
    const method = (init?.method ?? 'GET').toUpperCase()
    const pn = url.pathname

    // media 上传：PATCH /upload/drive/v3/files/{id}
    const up = pn.match(/\/upload\/drive\/v3\/files\/([^/]+)$/)
    if (up && method === 'PATCH') {
      const f = files.get(up[1])!
      f.bytes = new Uint8Array(init!.body as ArrayBuffer)
      f.rev = nrev()
      return new Response(JSON.stringify(out(f)), { status: 200 })
    }
    // 查询：GET /drive/v3/files?q=
    if (pn === '/drive/v3/files' && method === 'GET') {
      const q = url.searchParams.get('q') ?? ''
      const name = q.match(/name='((?:[^'\\]|\\.)*)'/)?.[1]?.replace(/\\(.)/g, '$1')
      const parent = q.match(/'([^']+)' in parents/)?.[1]
      const wantFolder = q.includes(FOLDER_MIME)
      let res: DFile[]
      if (wantFolder) res = [...files.values()].filter((f) => f.mimeType === FOLDER_MIME && f.name === name)
      else if (parent && name) res = [...files.values()].filter((f) => f.parents?.includes(parent) && f.name === name)
      else if (parent) res = [...files.values()].filter((f) => f.parents?.includes(parent) && f.mimeType !== FOLDER_MIME)
      else res = []
      return new Response(JSON.stringify({ files: res.map(out) }), { status: 200 })
    }
    // 建元数据：POST /drive/v3/files
    if (pn === '/drive/v3/files' && method === 'POST') {
      const body = JSON.parse(init!.body as string) as { name: string; mimeType?: string; parents?: string[] }
      const f: DFile = { id: nid(), name: body.name, mimeType: body.mimeType, parents: body.parents }
      files.set(f.id, f)
      return new Response(JSON.stringify({ id: f.id }), { status: 200 })
    }
    // 下载：GET /drive/v3/files/{id}?alt=media
    const item = pn.match(/\/drive\/v3\/files\/([^/]+)$/)
    if (item && method === 'GET' && url.searchParams.get('alt') === 'media') {
      const f = files.get(item[1])
      if (!f || !f.bytes) return new Response('', { status: 404 })
      return new Response(f.bytes, { status: 200 })
    }
    if (item && method === 'DELETE') {
      files.delete(item[1])
      return new Response(null, { status: 204 })
    }
    return new Response('', { status: 404 })
  }) as unknown as typeof fetch
  return { fakeFetch, files }
}

runProviderContract('googledrive', () => {
  const { fakeFetch } = makeFakeDrive()
  return new GoogleDriveProvider({ getToken: () => 'TK', fetch: fakeFetch })
})

describe('GoogleDriveProvider · 细节', () => {
  it('首次使用自动创建 app 文件夹并复用', async () => {
    const { fakeFetch, files } = makeFakeDrive()
    const p = new GoogleDriveProvider({ getToken: () => 'TK', fetch: fakeFetch })
    await p.put('documents/a.md', new TextEncoder().encode('x'))
    await p.put('documents/b.md', new TextEncoder().encode('y'))
    const folders = [...files.values()].filter((f) => f.mimeType === FOLDER_MIME)
    expect(folders).toHaveLength(1)
    expect(folders[0].name).toBe('MorphDraft')
  })

  it('文件以「完整路径」为文件名存储', async () => {
    const { fakeFetch, files } = makeFakeDrive()
    const p = new GoogleDriveProvider({ getToken: () => 'TK', fetch: fakeFetch })
    await p.put('assets/img 1.png', new TextEncoder().encode('z'))
    expect([...files.values()].some((f) => f.name === 'assets/img 1.png')).toBe(true)
  })
})
