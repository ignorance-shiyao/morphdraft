import { describe, expect, it } from 'vitest'
import { importDroppedSources } from '../drop'
import type { LocalSource } from '../local'

describe('拖放批量导入', () => {
  it('按顺序导入全部支持文件并打开第一个成功项', async () => {
    const sources: LocalSource[] = [
      { name: 'a.md', file: new File(['# A'], 'a.md') },
      { name: 'skip.exe', file: new File(['x'], 'skip.exe') },
      { name: 'b.md', file: new File(['# B'], 'b.md') },
    ]
    const imported: string[] = []
    let opened = ''

    const result = await importDroppedSources(sources, {
      importOne: async (source) => {
        imported.push(source.name)
        return { id: source.name, title: source.name, via: 'direct' }
      },
      open: async (id) => { opened = id },
    })

    expect(imported).toEqual(['a.md', 'b.md'])
    expect(opened).toBe('a.md')
    expect(result).toEqual({
      imported: 2,
      skipped: ['skip.exe'],
      failed: [],
      firstId: 'a.md',
    })
  })

  it('单项失败不阻断后续文件', async () => {
    const sources: LocalSource[] = [
      { name: 'bad.pdf', file: new File(['bad'], 'bad.pdf') },
      { name: 'ok.md', file: new File(['# OK'], 'ok.md') },
    ]
    let opened = ''

    const result = await importDroppedSources(sources, {
      importOne: async (source) => {
        if (source.name === 'bad.pdf') throw new Error('转换失败')
        return { id: 'ok', title: 'OK', via: 'direct' }
      },
      open: async (id) => { opened = id },
    })

    expect(opened).toBe('ok')
    expect(result.imported).toBe(1)
    expect(result.failed).toEqual([{ name: 'bad.pdf', message: '转换失败' }])
  })
})
