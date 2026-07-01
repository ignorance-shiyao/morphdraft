import {describe, it, expect} from 'vitest'
import {renderMarkdown} from '../index'

describe('PPT 设计稿组件容器', () => {
    it(':::kpi → .kpi-grid，列表项保留 strong 大数字', () => {
        const html = renderMarkdown(':::kpi\n- **86%** 转化率提升\n- **3.2×** 单位效率\n:::')
        expect(html).toContain('class="kpi-grid"')
        expect(html).toContain('<strong>86%</strong>')
        expect(html).toMatch(/<li[ >]/)
    })

    it(':::panel 标题 → 面板卡 + 标题头', () => {
        const html = renderMarkdown(':::panel 区域表现\n正文内容\n:::')
        expect(html).toContain('class="callout callout-card panel"')
        expect(html).toContain('<div class="panel-head">区域表现</div>')
        expect(html).toContain('正文内容')
    })

    it(':::gallery → .gallery 包多图', () => {
        const html = renderMarkdown(':::gallery\n![](a.jpg)\n![](b.jpg)\n:::')
        expect(html).toContain('class="gallery"')
        expect((html.match(/<img/g) || []).length).toBe(2)
    })

    it(':::gallery 中带 title 的图片保留图注，空段落由样式层移除', () => {
        const html = renderMarkdown(':::gallery\n![沿海公路](a.jpg "沿海公路")\n![山脉清晨](b.jpg "山脉清晨")\n:::')
        expect(html).toContain('class="gallery"')
        expect((html.match(/<figure>/g) || []).length).toBe(2)
        expect(html).toContain('<figcaption>沿海公路</figcaption>')
        expect(html).toContain('<figcaption>山脉清晨</figcaption>')
    })

    it(':::process → .process 横向流程', () => {
        const html = renderMarkdown(':::process\n- 需求分析\n- 方案设计\n- 上线交付\n:::')
        expect(html).toContain('class="process"')
        expect((html.match(/<li[ >]/g) || []).length).toBe(3)
    })

    it('panel-head 对标题做 HTML 转义', () => {
        const html = renderMarkdown(':::panel <危险>\n内容\n:::')
        expect(html).toContain('<div class="panel-head">&lt;危险&gt;</div>')
    })

    it(':::matrix → .matrix 四象限', () => {
        const html = renderMarkdown(':::matrix\n- **高高** 立即处置\n- **高低** 预案\n- **低高** 监控\n- **低低** 接受\n:::')
        expect(html).toContain('class="matrix"')
        expect((html.match(/<li[ >]/g) || []).length).toBe(4)
    })

    it(':::roadmap → .roadmap 横向阶段', () => {
        const html = renderMarkdown(':::roadmap\n- **Q1** 立项\n- **Q2** 研发\n- **Q3** 上线\n:::')
        expect(html).toContain('class="roadmap"')
        expect((html.match(/<li[ >]/g) || []).length).toBe(3)
    })

    it('未知容器不被拦截（回退普通段落）', () => {
        const html = renderMarkdown(':::nonsense\n内容\n:::')
        expect(html).not.toContain('class="kpi-grid"')
        expect(html).toContain(':::nonsense')
    })

    it(':::matrix 可能性 | 影响 → 坐标轴 data-x/data-y', () => {
        const html = renderMarkdown(':::matrix 可能性 | 影响\n- **A** x\n- **B** y\n- **C** z\n- **D** w\n:::')
        expect(html).toContain('data-x="可能性"')
        expect(html).toContain('data-y="影响"')
    })
})
