import {describe, expect, it} from 'vitest'
import {renderWithSource} from '..'

describe('数学公式源码定位', () => {
    it('行内与块级公式保留可编辑源码元数据', () => {
        const {html} = renderWithSource('公式 $E=mc^2$。\n\n$$\na^2+b^2=c^2\n$$')
        expect(html).toContain('class="math-inline" data-math-source="E=mc^2"')
        expect(html).toContain('class="math-block" data-source-line="2" data-math-source="a^2+b^2=c^2"')
    })
})
