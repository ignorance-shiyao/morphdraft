import {describe, it, expect} from 'vitest'
import {parseSlideLayout} from '../layout'

describe('parseSlideLayout 显式指令', () => {
    it('识别新版式指令 split/grid/image-full', () => {
        expect(parseSlideLayout('<!-- layout: split -->\n正文').layout).toBe('split')
        expect(parseSlideLayout('<!-- layout: grid -->\n正文').layout).toBe('grid')
        expect(parseSlideLayout('<!-- layout: image-full -->\n![](a.jpg)').layout).toBe('image-full')
    })
    it('未知版式回退 default', () => {
        expect(parseSlideLayout('<!-- layout: bogus -->\nx').layout).toBe('default')
    })
    it('指令行数补偿（含吞掉的空行）', () => {
        const r = parseSlideLayout('<!-- layout: grid -->\n\n# 标题')
        expect(r.directiveOffset).toBe(2)
        expect(r.body).toBe('# 标题')
    })
})

describe('autoLayout 自动推断', () => {
    const auto = (md: string) => parseSlideLayout(md).layout
    it('单标题 → cover', () => {
        expect(auto('# 只有标题')).toBe('cover')
    })
    it('短引用 → center', () => {
        expect(auto('> 一句金句')).toBe('center')
    })
    it('两图 → grid', () => {
        expect(auto('## 图\n![](a.jpg)\n![](b.jpg)')).toBe('grid')
    })
    it('三图且文字少 → image-full', () => {
        expect(auto('![](a.jpg)\n![](b.jpg)\n![](c.jpg)')).toBe('image-full')
    })
    it('单图配文 → image-right', () => {
        expect(auto('## 标题\n![](a.jpg)\n一句说明')).toBe('image-right')
    })
    it('厚重多块无图 → split', () => {
        const md = '## 标题\n' + Array.from({length: 13}, (_, i) => `- 第 ${i} 条要点内容`).join('\n')
        expect(auto(md)).toBe('split')
    })
    it('普通内容 → default', () => {
        expect(auto('## 标题\n一段正文\n另一段正文')).toBe('default')
    })
})

describe('版式指令携带分类标签', () => {
    it('<!-- layout: default | 市场分析 --> 解析出 tag，单行不增行偏移', () => {
        const r = parseSlideLayout('<!-- layout: default | 市场分析 -->\n# 标题')
        expect(r.layout).toBe('default')
        expect(r.tag).toBe('市场分析')
        expect(r.directiveOffset).toBe(1)
        expect(r.body).toBe('# 标题')
    })
    it('无标签时 tag 为 undefined', () => {
        expect(parseSlideLayout('<!-- layout: grid -->\nx').tag).toBeUndefined()
    })
})
