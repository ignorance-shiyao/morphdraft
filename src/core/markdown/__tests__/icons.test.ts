import {describe, it, expect} from 'vitest'
import {renderMarkdown} from '../index'

describe('内置图标 :name: 内联语法', () => {
    it('白名单图标 → 内联 SVG', () => {
        const html = renderMarkdown('完成 :check: 和 :rocket:')
        expect((html.match(/<svg class="md-icon"/g) || []).length).toBe(2)
    })

    it('非白名单 :word: 不替换', () => {
        const html = renderMarkdown('配置 :tip: 与 :foo:')
        expect(html).not.toContain('md-icon')
        expect(html).toContain(':tip:')
    })

    it('不误伤 URL 与时间', () => {
        const html = renderMarkdown('见 https://a.com 与 12:30:45')
        expect(html).not.toContain('md-icon')
    })

    it('图标可用在卡片标题里', () => {
        const html = renderMarkdown(':::card\n:bolt: **轻盈**\n:::')
        expect(html).toContain('<svg class="md-icon"')
        expect(html).toContain('<strong>轻盈</strong>')
    })
})
