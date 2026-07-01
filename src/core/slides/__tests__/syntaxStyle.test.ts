import {readFileSync} from 'node:fs'
import {describe, expect, it} from 'vitest'

const css = readFileSync(new URL('../../../styles/slides.css', import.meta.url), 'utf8')
const editor = readFileSync(
    new URL('../../../components/preview/SlidePreview.vue', import.meta.url),
    'utf8',
)
const reveal = readFileSync(new URL('../reveal.ts', import.meta.url), 'utf8')
const skins = readFileSync(new URL('../../../styles/slideSkins.css', import.meta.url), 'utf8')

function rule(source: string, selector: string) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return source.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`, 's'))?.[1] ?? ''
}

describe('PPT 语法组件与布局样式', () => {
    it('表格使用可裁切的主题表面并允许长文本换行', () => {
        expect(rule(css, '.slide-surface table')).toContain('border-radius: 11px')
        expect(rule(css, '.slide-surface table')).toContain('overflow: hidden')
        expect(rule(css, '.slide-surface table')).toContain('background: var(--panel-bg)')
        expect(rule(css, '.slide-surface th, .slide-surface td')).toContain('overflow-wrap: anywhere')
        expect(rule(css, '.slide-surface th, .slide-surface td')).toContain('word-break: break-word')
    })

    it('引用和块公式使用主题派生面板', () => {
        expect(rule(css, '.slide-surface blockquote')).toContain('var(--panel-bg)')
        expect(rule(css, '.slide-surface blockquote')).toContain('border-radius:')
        expect(rule(css, '.slide-surface blockquote blockquote')).toContain('box-shadow: none')
        expect(rule(css, '.slide-surface .math-block')).toContain('max-width:')
        expect(rule(css, '.slide-surface .math-block')).toContain('var(--panel-bg)')
    })

    it('次级标题、分隔线和脚注保持清晰但克制', () => {
        expect(rule(css, '.slide-surface h5, .slide-surface h6')).toContain('font-family: var(--heading-family)')
        expect(rule(css, '.slide-surface h5')).toContain('font-size:')
        expect(css).toMatch(/\.slide-surface h6\s*\{[^}]*text-transform:\s*uppercase/s)
        expect(rule(css, '.slide-surface hr')).toContain('color-mix')
        expect(rule(css, '.slide-surface .footnotes')).toContain('border-top:')
    })

    it('图表标题和图表在 PPT 中组成不可拆分卡片', () => {
        expect(reveal).toContain('composeChartCards(inner)')
        expect(rule(css, '.slide-surface .chart-card')).toContain('flex: 0 0 auto')
        expect(rule(css, '.slide-surface .chart-card')).toContain('break-inside: avoid')
        expect(rule(css, '.slide-surface .chart-card')).toContain('border-radius:')
        expect(rule(css, '.slide-surface .chart-card-title')).toContain('border-bottom:')
        expect(rule(css, '.slide-surface .chart-card-body')).toContain('min-height: 0')
        expect(skins).toContain('.reveal.skin-glass .slide-surface .chart-card')
        expect(skins).toContain('.reveal.skin-brutalism .slide-surface .chart-card')
        expect(skins).toContain('.reveal.skin-business-blue .slide-surface .chart-card')
    })

    it('双栏与栅格直接子块可以收缩且栅格呈现卡片表面', () => {
        expect(rule(css, '.slide-surface.slide-layout-split .slide-body > *')).toContain('min-width: 0')
        expect(rule(css, '.slide-surface.slide-layout-split .slide-body > *')).toContain('break-inside: avoid')
        expect(rule(css, '.slide-surface.slide-layout-grid .slide-body > *')).toContain('min-width: 0')
        expect(rule(css, '.slide-surface.slide-layout-grid .slide-body > *')).toContain('background: var(--panel-bg)')
        expect(rule(css, '.slide-surface.slide-layout-grid .slide-body > *')).toContain('border-radius:')
    })

    it('密集页面顶部对齐，避免内容垂直居中后被裁切', () => {
        expect(rule(css, ".slide-surface.slide-layout-default[data-density='dense'] .slide-body"))
            .toContain('justify-content: flex-start')
    })

    it('富文本与代码编辑态共享主题表面和焦点环', () => {
        expect(editor).toContain('@click.capture="onSlideClick"')
        expect(rule(editor, '.ise-body')).toContain('border-radius: 12px')
        expect(rule(editor, '.ise-body')).toContain('var(--app-primary-color)')
        expect(rule(editor, '.ise-rich')).toContain('border: 1px solid')
        expect(rule(editor, '.ise-rich')).toContain('border-radius: 10px')
        expect(rule(editor, '.ise-rich')).toContain('var(--bg)')
    })

    it('表格和代码编辑器提供足够的自然编辑宽度', () => {
        expect(editor).toContain("target.matches('table') ? 520")
        expect(editor).toContain("target.matches('pre, .chart-block') ? 480")
        expect(editor).toContain('Math.min(640, Math.max(rect.width, preferredWidth), frameRect.width)')
        expect(editor).toContain('Math.min(rect.left, frameRect.right - width)')
    })
})
