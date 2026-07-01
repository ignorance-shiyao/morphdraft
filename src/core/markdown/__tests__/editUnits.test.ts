import {describe, expect, it} from 'vitest'
import {
    blockEditRange,
    fenceLanguageRange,
    fencedContentRange,
    findInlineEditRange,
    inlineEditRange,
} from '../editUnits'

describe('blockEditRange（最小块级语法单元）', () => {
    it('标题和普通段落只取自身', () => {
        const lines = ['# 标题', '', '第一段', '续行', '', '下一段']
        expect(blockEditRange(lines, 0)).toEqual({start: 0, end: 0})
        expect(blockEditRange(lines, 2)).toEqual({start: 2, end: 3})
    })

    it('列表只编辑当前列表项及其续行，不吞相邻项', () => {
        const lines = ['- 第一项', '  第一项续行', '- 第二项', '  - 子项']
        expect(blockEditRange(lines, 0)).toEqual({start: 0, end: 1})
        expect(blockEditRange(lines, 2)).toEqual({start: 2, end: 2})
        expect(blockEditRange(lines, 3)).toEqual({start: 3, end: 3})
    })

    it('围栏代码和公式块取完整语法块', () => {
        expect(blockEditRange(['```ts', 'const a = 1', '```'], 0)).toEqual({start: 0, end: 2})
        expect(blockEditRange(['$$', 'E=mc^2', '$$'], 0)).toEqual({start: 0, end: 2})
    })

    it('引用块取连续 > 行及懒续行', () => {
        const lines = ['> 第一行', '> 第二行', '懒续行', '', '下一段']
        expect(blockEditRange(lines, 0)).toEqual({start: 0, end: 2})
        expect(blockEditRange(lines, 4)).toEqual({start: 4, end: 4})
    })

    it('代码编辑只取围栏内部源码', () => {
        expect(fencedContentRange(['```ts', 'const a = 1', '```'], {start: 0, end: 2}))
            .toEqual({start: 1, end: 1})
    })

    it('语言快捷编辑只替换围栏语言，不影响高亮行配置', () => {
        expect(fenceLanguageRange('```ts {2,4-5}')).toEqual({
            from: 3,
            to: 5,
            source: 'ts',
        })
    })
})

describe('inlineEditRange（最小行内语法单元）', () => {
    const line = '查看 [官网](https://example.com)，运行 `npm test`，公式 $E=mc^2$。'

    it('定位链接', () => {
        expect(inlineEditRange(line, 'link', '官网')).toEqual({
            from: 3,
            to: 28,
            source: '[官网](https://example.com)',
        })
    })

    it('定位行内代码和公式', () => {
        expect(inlineEditRange(line, 'code', 'npm test')?.source).toBe('`npm test`')
        expect(inlineEditRange(line, 'math', 'E=mc^2')?.source).toBe('$E=mc^2$')
    })

    it('定位强调、删除线、高亮、上下标等语法', () => {
        const source = '这是 **粗体**、*斜体*、~~删除~~、==高亮==、<u>下划线</u>、<kbd>⌘</kbd>、H~2~O 和 X^2^。'
        expect(inlineEditRange(source, 'strong', '粗体')?.source).toBe('**粗体**')
        expect(inlineEditRange(source, 'emphasis', '斜体')?.source).toBe('*斜体*')
        expect(inlineEditRange(source, 'strike', '删除')?.source).toBe('~~删除~~')
        expect(inlineEditRange(source, 'mark', '高亮')?.source).toBe('==高亮==')
        expect(inlineEditRange(source, 'underline', '下划线')?.source).toBe('<u>下划线</u>')
        expect(inlineEditRange(source, 'kbd', '⌘')?.source).toBe('<kbd>⌘</kbd>')
        expect(inlineEditRange(source, 'sub', '2')?.source).toBe('~2~')
        expect(inlineEditRange(source, 'sup', '2')?.source).toBe('^2^')
    })

    it('定位自动链接源码，避免回落整段编辑', () => {
        const source = '自动链接 https://example.com/very/long/path 后面还有文字'
        expect(inlineEditRange(source, 'autoLink', 'https://example.com/very/long/path')?.source)
            .toBe('https://example.com/very/long/path')
    })

    it('在多行段落中定位被点击的重复语法，而不是退化成整段', () => {
        const lines = ['第一行 **相同**', '第二行 **相同** 和 `code`']
        expect(findInlineEditRange(lines, {start: 0, end: 1}, 'strong', '相同', 1)).toEqual({
            line: 1,
            from: 4,
            to: 10,
            source: '**相同**',
        })
    })

    it('粗斜体 ***x*** 作为整体编辑单元（不抢成内层 **x**）', () => {
        const source = '正文 **加粗**、***粗斜体***、~~删除~~'
        // ***粗斜体*** 走 strongEmphasis，取到完整三星号
        expect(inlineEditRange(source, 'strongEmphasis', '粗斜体')?.source).toBe('***粗斜体***')
        // ___x___ 下划线形式
        expect(inlineEditRange('前 ___粗斜___ 后', 'strongEmphasis', '粗斜')?.source).toBe('___粗斜___')
        // 同段里 **加粗** 仍能按 strong 单独定位（occurrence 0）
        expect(findInlineEditRange([source], {start: 0, end: 0}, 'strong', '加粗', 0)?.source).toBe('**加粗**')
    })
})
