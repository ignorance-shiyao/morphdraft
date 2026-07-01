import {describe, expect, it} from 'vitest'
import {renderMarkdown} from '..'

describe('代码块紧凑渲染', () => {
    it('不在代码行之间插入额外换行节点，也不渲染 fenced token 的尾空行', () => {
        const html = renderMarkdown('```ts\nconst a = 1\nconst b = 2\n```')
        expect(html.match(/class="code-line"/g)).toHaveLength(2)
        expect(html).toContain('</span></span><span class="code-line"')
        expect(html).not.toContain('</span></span>\n<span class="code-line"')
    })
})
