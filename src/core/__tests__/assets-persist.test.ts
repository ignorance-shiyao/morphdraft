import { describe, it, expect } from 'vitest'
import { extFromMime, mimeFromId } from '../assets'
import { dataUrlToBlob } from '../localDocuments'

describe('assets mime/ext 推导', () => {
  it('mime → 落盘扩展名', () => {
    expect(extFromMime('image/png')).toBe('png')
    expect(extFromMime('image/jpeg')).toBe('jpg')
    expect(extFromMime('image/svg+xml')).toBe('svg')
    expect(extFromMime('IMAGE/WEBP')).toBe('webp') // 大小写不敏感
    expect(extFromMime('application/octet-stream')).toBe('png') // 未知回落
  })

  it('asset id（带扩展名）→ Blob 类型', () => {
    expect(mimeFromId('asset-abc.png')).toBe('image/png')
    expect(mimeFromId('asset-abc.jpeg')).toBe('image/jpeg')
    expect(mimeFromId('asset-abc.SVG')).toBe('image/svg+xml')
    expect(mimeFromId('asset-no-ext')).toBe('image/png') // 历史无扩展名回落
  })
})

describe('备份反序列化 dataUrlToBlob', () => {
  it('base64 data URL → 正确字节与类型', async () => {
    // "Hi" = 0x48 0x69，base64 "SGk="
    const blob = dataUrlToBlob('data:image/png;base64,SGk=', 'image/png')
    expect(blob.type).toBe('image/png')
    const bytes = new Uint8Array(await blob.arrayBuffer())
    expect(Array.from(bytes)).toEqual([0x48, 0x69])
  })

  it('data URL 自带 mime 优先于 fallback 参数', () => {
    const blob = dataUrlToBlob('data:image/gif;base64,SGk=', 'image/png')
    expect(blob.type).toBe('image/gif')
  })

  it('畸形 data URL（无逗号）→ 空 blob 不抛错', () => {
    const blob = dataUrlToBlob('not-a-data-url', 'image/webp')
    expect(blob.type).toBe('image/webp')
    expect(blob.size).toBe(0)
  })
})
