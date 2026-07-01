import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  saveAsset: vi.fn(async (_blob: Blob, _mime: string) => 'asset://asset-x.png'),
  dataUrlToBlob: vi.fn((_url: string, mime: string) => new Blob(['x'], { type: mime })),
}))
vi.mock('../../assets', () => ({ saveAsset: h.saveAsset }))
vi.mock('../../localDocuments', () => ({ dataUrlToBlob: h.dataUrlToBlob }))

import { externalizeDataImages } from '../externalizeImages'

beforeEach(() => vi.clearAllMocks())

describe('externalizeDataImages', () => {
  it('把 base64 图片改写为 asset://', async () => {
    const md = '前 ![图片](data:image/png;base64,iVBORw0KGgo=) 后'
    const out = await externalizeDataImages(md)
    expect(out).toBe('前 ![图片](asset://asset-x.png) 后')
    expect(h.saveAsset).toHaveBeenCalledTimes(1)
  })

  it('相同 data URL 去重，只转存一次', async () => {
    const url = 'data:image/png;base64,AAAA='
    const md = `![a](${url})\n\n![b](${url})`
    const out = await externalizeDataImages(md)
    expect(out).toBe('![a](asset://asset-x.png)\n\n![b](asset://asset-x.png)')
    expect(h.saveAsset).toHaveBeenCalledTimes(1)
  })

  it('非 base64 图片（普通 URL / asset://）不动', async () => {
    const md = '![x](https://e.com/a.png) ![y](asset://asset-y.png)'
    expect(await externalizeDataImages(md)).toBe(md)
    expect(h.saveAsset).not.toHaveBeenCalled()
  })

  it('无图片 → 原样返回', async () => {
    expect(await externalizeDataImages('纯文本')).toBe('纯文本')
  })

  it('保留 alt 文本', async () => {
    const out = await externalizeDataImages('![说明文字](data:image/jpeg;base64,/9j/4AAQ=)')
    expect(out).toBe('![说明文字](asset://asset-x.png)')
    expect(h.dataUrlToBlob).toHaveBeenCalledWith(expect.stringContaining('data:image/jpeg'), 'image/jpeg')
  })

  it('转存失败则保留原 data URL', async () => {
    h.saveAsset.mockRejectedValueOnce(new Error('quota'))
    const md = '![z](data:image/png;base64,BBBB=)'
    expect(await externalizeDataImages(md)).toBe(md)
  })
})
