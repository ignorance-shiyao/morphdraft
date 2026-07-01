import { describe, expect, it } from 'vitest'
import {
  buildPortablePackage,
  createPortableZip,
  portableDocumentFilename,
  rewritePortableAssets,
  writePortableDirectory,
} from '../portable'
import JSZip from 'jszip'

describe('便携包路径与 Markdown 改写', () => {
  it('生成安全且去重的文档文件名', () => {
    const used = new Set<string>()
    expect(portableDocumentFilename('产品/路线图', used)).toBe('产品-路线图.md')
    expect(portableDocumentFilename('产品/路线图', used)).toBe('产品-路线图-2.md')
  })

  it('只改写 asset 协议引用', () => {
    const markdown = '![图](asset://a.png)\n`asset://code.png`\nhttps://example.com/a.png'
    expect(rewritePortableAssets(markdown, new Set(['a.png']))).toBe(
      '![图](../assets/a.png)\n`asset://code.png`\nhttps://example.com/a.png',
    )
  })
})

describe('构建便携包', () => {
  it('收集文档、去重资源并记录缺失资源', async () => {
    const result = await buildPortablePackage(
      [
        { id: 'a', title: 'A', contentMarkdown: '![一](asset://one.png)\n![缺](asset://missing.png)' },
        { id: 'b', title: 'B', contentMarkdown: '![重复](asset://one.png)' },
      ],
      async (id) => id === 'one.png' ? new Blob(['one'], { type: 'image/png' }) : null,
    )

    expect(result.documents.map((item) => item.path)).toEqual(['documents/A.md', 'documents/B.md'])
    expect(result.documents[0].contentMarkdown).toContain('../assets/one.png')
    expect(result.documents[0].contentMarkdown).toContain('asset://missing.png')
    expect(result.assets.map((item) => item.path)).toEqual(['assets/one.png'])
    expect(result.manifest.missingAssets).toEqual(['missing.png'])
    expect(result.manifest.documents).toHaveLength(2)
  })

  it('ZIP 包含文档、资源、清单和说明', async () => {
    const pack = await buildPortablePackage(
      [{ id: 'a', title: 'A', contentMarkdown: '![图](asset://one.png)' }],
      async () => new Blob(['one'], { type: 'image/png' }),
    )
    const blob = await createPortableZip(pack)
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    expect(Object.keys(zip.files).sort()).toEqual([
      'README.md',
      'assets/',
      'assets/one.png',
      'documents/',
      'documents/A.md',
      'manifest.json',
    ])
    expect(await zip.file('documents/A.md')?.async('string')).toContain('../assets/one.png')
  })

  it('目录导出逐个写入相同结构', async () => {
    const pack = await buildPortablePackage(
      [{ id: 'a', title: 'A', contentMarkdown: '# A' }],
      async () => null,
    )
    const writes: string[] = []
    await writePortableDirectory(pack, async (path) => { writes.push(path) })
    expect(writes.sort()).toEqual(['README.md', 'documents/A.md', 'manifest.json'])
  })
})
