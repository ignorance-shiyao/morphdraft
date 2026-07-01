import {describe, it, expect, vi, beforeEach} from 'vitest'

// mock 掉 converters，避免在测试里加载 4.7MB wasm；只验证 local.ts 的 PDF 回落编排。
const pdfToMarkdownLite = vi.fn()
const pdfToMarkdown = vi.fn()
vi.mock('../converters', () => ({
    pdfToMarkdownLite: (b: Uint8Array) => pdfToMarkdownLite(b),
    pdfToMarkdown: (b: Uint8Array) => pdfToMarkdown(b),
    // local.ts 顶层还 import 了这些，给个空壳即可
    csvToMarkdown: vi.fn(),
    jsonToMarkdown: vi.fn(),
    xlsxToMarkdown: vi.fn(),
    pptxToMarkdown: vi.fn(),
}))

import {convertPdf} from '../local'

const bytes = new Uint8Array([1, 2, 3])

describe('convertPdf 回落编排', () => {
    beforeEach(() => {
        pdfToMarkdownLite.mockReset()
        pdfToMarkdown.mockReset()
    })

    it('liteparse 有结果时用其输出，不调 pdfjs', async () => {
        pdfToMarkdownLite.mockResolvedValue('# 标题\n\n正文')
        expect(await convertPdf(bytes)).toBe('# 标题\n\n正文')
        expect(pdfToMarkdown).not.toHaveBeenCalled()
    })

    it('liteparse 抛错 → 回落 pdfjs', async () => {
        pdfToMarkdownLite.mockRejectedValue(new Error('wasm 挂了'))
        pdfToMarkdown.mockResolvedValue('pdfjs 文本')
        expect(await convertPdf(bytes)).toBe('pdfjs 文本')
        expect(pdfToMarkdown).toHaveBeenCalledWith(bytes)
    })

    it('liteparse 返回空白 → 回落 pdfjs', async () => {
        pdfToMarkdownLite.mockResolvedValue('   \n  ')
        pdfToMarkdown.mockResolvedValue('pdfjs 文本')
        expect(await convertPdf(bytes)).toBe('pdfjs 文本')
        expect(pdfToMarkdown).toHaveBeenCalledWith(bytes)
    })
})
