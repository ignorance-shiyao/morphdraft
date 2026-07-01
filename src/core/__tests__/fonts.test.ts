import {describe, expect, it} from 'vitest'
import {fontCssValue, fontOptionsForKind} from '../fonts'

describe('fontCssValue', () => {
    it('主题字体回退到对应主题变量', () => {
        expect(fontCssValue('body', 'theme')).toBe('var(--theme-font-family)')
        expect(fontCssValue('heading', 'theme')).toBe('var(--theme-heading-family)')
        expect(fontCssValue('code', 'theme')).toBe('var(--theme-font-family-mono)')
    })

    it('内置字体返回可直接使用的字体栈', () => {
        expect(fontCssValue('body', 'inter')).toContain('"Inter"')
        expect(fontCssValue('code', 'jetbrains-mono')).toContain('"JetBrains Mono"')
    })
})

describe('fontOptionsForKind', () => {
    it('正文、标题、代码只展示适合各自用途的选项，并可合并系统字体', () => {
        expect(fontOptionsForKind('body', ['Arial']).some((item) => item.value === 'system:Arial')).toBe(true)
        expect(fontOptionsForKind('code', []).some((item) => item.value === 'lora')).toBe(false)
    })
})
