import {describe, it, expect} from 'vitest'
import {renderMarkdown} from '../index'

describe('状态药丸 / 进度条内联语法', () => {
    it('中性药丸 ((text))', () => {
        const html = renderMarkdown('状态：((进行中))')
        expect(html).toContain('<span class="pill">进行中</span>')
    })

    it('彩色药丸 ((color:text))', () => {
        const html = renderMarkdown('((green:完成)) ((red:风险)) ((primary:重点))')
        expect(html).toContain('<span class="pill pill-green">完成</span>')
        expect(html).toContain('<span class="pill pill-red">风险</span>')
        expect(html).toContain('<span class="pill pill-primary">重点</span>')
    })

    it('未知颜色当作中性药丸（含冒号文本）', () => {
        const html = renderMarkdown('((备注:细节))')
        expect(html).toContain('<span class="pill">备注:细节</span>')
    })

    it('进度条 ((bar:75)) 设置宽度', () => {
        const html = renderMarkdown('((bar:75))')
        expect(html).toContain('class="ui-bar"')
        expect(html).toContain('style="width:75%"')
        expect(html).toContain('>75%</span>')
    })

    it('带标签进度条 ((bar:92:品牌焕新))', () => {
        const html = renderMarkdown('((bar:92:品牌焕新))')
        expect(html).toContain('<span class="ui-bar-label">品牌焕新</span>')
        expect(html).toContain('style="width:92%"')
    })

    it('百分比越界裁剪到 0-100', () => {
        expect(renderMarkdown('((bar:140))')).toContain('style="width:100%"')
    })

    it('药丸可用于表格单元格', () => {
        const html = renderMarkdown('| 项目 | 状态 |\n| --- | --- |\n| A | ((blue:进行中)) |')
        expect(html).toContain('<td><span class="pill pill-blue">进行中</span></td>')
    })

    it('转义药丸内 HTML', () => {
        expect(renderMarkdown('((<x>))')).toContain('<span class="pill">&lt;x&gt;</span>')
    })

    it('不误伤普通括号文本', () => {
        const html = renderMarkdown('这是 (普通) 括号')
        expect(html).not.toContain('class="pill"')
    })

    it('迷你折线 ((spark:1,2,3)) → polyline + 末点', () => {
        const html = renderMarkdown('((spark:3,5,2,8,6))')
        expect(html).toContain('class="ui-spark"')
        expect(html).toContain('<polyline points="')
        expect(html).toContain('class="ui-spark-dot"')
    })

    it('折线数字不足 2 个 → 当作中性药丸', () => {
        expect(renderMarkdown('((spark:5))')).toContain('<span class="pill">spark:5</span>')
    })
})
