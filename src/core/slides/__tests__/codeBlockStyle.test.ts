import {readFileSync} from 'node:fs'
import {describe, expect, it} from 'vitest'

const css = readFileSync(new URL('../../../styles/slides.css', import.meta.url), 'utf8')

describe('PPT 代码块样式', () => {
    it('长代码在幻灯片宽度内软换行', () => {
        expect(css).toMatch(
            /\.slide-surface pre code \.code-line\s*\{[^}]*white-space:\s*pre-wrap;[^}]*overflow-wrap:\s*anywhere;[^}]*word-break:\s*break-word;/s,
        )
        expect(css).toMatch(
            /\.slide-surface pre code \.code-text\s*\{[^}]*min-width:\s*0;[^}]*white-space:\s*pre-wrap;[^}]*overflow-wrap:\s*anywhere;/s,
        )
    })

    it('代码块容器隐藏横向溢出并保留语言角标', () => {
        expect(css).toMatch(
            /\.slide-surface pre\s*\{[^}]*position:\s*relative;[^}]*max-width:\s*100%;[^}]*overflow-x:\s*hidden;/s,
        )
        expect(css).toMatch(/\.slide-surface pre \.code-lang\s*\{/)
    })
})
