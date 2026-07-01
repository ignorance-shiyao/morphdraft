// 文档↔对象映射测试：路径派生、正文往返、index.json 构建/解析、元数据回落。
import { describe, it, expect } from 'vitest'
import {
  INDEX_PATH, docObjectPath, docIdFromObjectPath, assetObjectPath, assetIdFromObjectPath,
  docToBytes, bytesToDoc, buildIndex, parseIndex,
} from '../docObjects'
import type { DocFull } from '../../docTypes'

const sampleDoc: DocFull = {
  id: 'doc-123', title: '我的文档', mode: 'document', themeId: 'azure',
  updatedAt: '2026-06-26T00:00:00Z', tags: ['a', 'b'], folder: '工作',
  contentMarkdown: '# 标题\n\n正文内容。',
}

describe('docObjects 路径派生', () => {
  it('docId ↔ documents/<id>.md', () => {
    expect(docObjectPath('doc-123')).toBe('documents/doc-123.md')
    expect(docIdFromObjectPath('documents/doc-123.md')).toBe('doc-123')
    expect(docIdFromObjectPath('assets/x.png')).toBeNull()
    expect(docIdFromObjectPath('documents/')).toBeNull()
  })
  it('assetId ↔ assets/<id>', () => {
    expect(assetObjectPath('img-1.png')).toBe('assets/img-1.png')
    expect(assetIdFromObjectPath('assets/img-1.png')).toBe('img-1.png')
    expect(assetIdFromObjectPath('documents/a.md')).toBeNull()
  })
})

describe('docObjects 正文往返', () => {
  it('正文编码为裸 Markdown 字节', () => {
    expect(new TextDecoder().decode(docToBytes(sampleDoc))).toBe('# 标题\n\n正文内容。')
  })
  it('字节 + 元数据 → DocFull', () => {
    const bytes = docToBytes(sampleDoc)
    const meta = parseIndex(buildIndex([sampleDoc])).get('doc-123')
    const doc = bytesToDoc('doc-123', bytes, meta)
    expect(doc).toEqual(sampleDoc)
  })
  it('无元数据时标题回落为 id、其它取默认', () => {
    const doc = bytesToDoc('doc-x', new TextEncoder().encode('body'))
    expect(doc.id).toBe('doc-x')
    expect(doc.title).toBe('doc-x')
    expect(doc.mode).toBe('document')
    expect(doc.contentMarkdown).toBe('body')
  })
})

describe('docObjects index.json', () => {
  it('路径常量', () => {
    expect(INDEX_PATH).toBe('.morphdraft/index.json')
  })
  it('build → parse 往返保留元数据（不含正文）', () => {
    const idx = parseIndex(buildIndex([sampleDoc]))
    const m = idx.get('doc-123')!
    expect(m.title).toBe('我的文档')
    expect(m.tags).toEqual(['a', 'b'])
    expect(m.folder).toBe('工作')
    expect((m as { contentMarkdown?: string }).contentMarkdown).toBeUndefined()
  })
  it('损坏 / 空索引 → 空 Map', () => {
    expect(parseIndex(null).size).toBe(0)
    expect(parseIndex(new TextEncoder().encode('{bad')).size).toBe(0)
  })
})
