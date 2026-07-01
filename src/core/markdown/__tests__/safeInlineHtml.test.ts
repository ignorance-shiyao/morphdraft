import {describe, expect, it} from 'vitest'
import {renderMarkdown} from '..'

describe('安全行内 HTML 语法', () => {
    it('渲染下划线与快捷键标签', () => {
        const html = renderMarkdown('使用 <u>下划线</u>，按 <kbd>⌘</kbd> + <kbd>S</kbd>。')
        expect(html).toContain('<u>下划线</u>')
        expect(html).toContain('<kbd>⌘</kbd> + <kbd>S</kbd>')
    })

    it('不放行任意 HTML 标签', () => {
        const html = renderMarkdown('<script>alert(1)</script> <iframe src="x"></iframe>')
        expect(html).toContain('&lt;script&gt;')
        expect(html).toContain('&lt;iframe src=&quot;x&quot;&gt;')
    })

    it('安全渲染带尺寸的 HTML 图片', () => {
        const html = renderMarkdown('<img src="asset://a.png" alt="图" title="说明" style="width:320px;height:180px;color:red" onclick="x">')
        expect(html).toContain('<img src="asset://a.png" alt="图" title="说明" style="width:320px;height:180px">')
        expect(html).not.toContain('onclick')
        expect(html).not.toContain('color:red')
    })

    it('放行图片对齐 / 圆角 / 阴影样式，拒绝其它', () => {
        const html = renderMarkdown('<img src="a.png" alt="" style="width:200px;display:block;margin-left:auto;margin-right:auto;border-radius:10px;box-shadow:0 6px 24px rgba(15, 23, 42, 0.18);position:absolute">')
        expect(html).toContain('display:block')
        expect(html).toContain('margin-left:auto')
        expect(html).toContain('margin-right:auto')
        expect(html).toContain('border-radius:10px')
        expect(html).toContain('box-shadow:0 6px 24px rgba(15, 23, 42, 0.18)')
        expect(html).not.toContain('position')
    })

    it('HTML 图片拒绝危险 src', () => {
        const html = renderMarkdown('<img src="javascript:alert(1)" alt="x" style="width:320px">')
        expect(html).toContain('&lt;img src=&quot;javascript:alert(1)&quot;')
    })

    it('安全渲染 HTML 表格块，用于高级表格编辑持久化', () => {
        const html = renderMarkdown(`<table>
<thead>
  <tr><th style="width:120px;text-align:left">字段</th><th>说明</th></tr>
</thead>
<tbody>
  <tr><td rowspan="2">title</td><td colspan="2" style="height:44px;text-align:center">标题</td></tr>
  <tr><td><code>id</code></td><td><strong>重要</strong></td></tr>
</tbody>
</table>`)
        expect(html).toContain('<table data-source-line="0">')
        expect(html).toContain('<th style="width:120px;text-align:left">字段</th>')
        expect(html).toContain('<td rowspan="2">title</td>')
        expect(html).toContain('<td colspan="2" style="height:44px;text-align:center">标题</td>')
        expect(html).toContain('<code>id</code>')
        expect(html).toContain('<strong>重要</strong>')
    })

    it('合并单元格的水平/垂直居中样式被保留', () => {
        const html = renderMarkdown(`<table>
<tbody>
  <tr><td rowspan="2" colspan="2" style="text-align:center;vertical-align:middle">合并</td><td>c1</td></tr>
  <tr><td>c2</td></tr>
</tbody>
</table>`)
        expect(html).toContain('text-align:center')
        expect(html).toContain('vertical-align:middle')
        expect(html).toContain('rowspan="2"')
        expect(html).toContain('colspan="2"')
    })

    it('HTML 表格块只保留白名单标签、属性和样式', () => {
        const html = renderMarkdown(`<table class="x">
<tbody>
  <tr><td style="width:120px;color:red" data-x="1"><span>值</span></td></tr>
</tbody>
</table>`)
        expect(html).toContain('<table data-source-line="0">')
        expect(html).toContain('<td style="width:120px">&lt;span&gt;值&lt;/span&gt;</td>')
        expect(html).not.toContain('class=')
        expect(html).not.toContain('color:red')
        expect(html).not.toContain('data-x=')
    })

    it('HTML 表格块遇到事件属性时回退为转义文本', () => {
        const html = renderMarkdown(`<table>
<tbody>
  <tr><td onclick="alert(1)">x</td></tr>
</tbody>
</table>`)
        expect(html).toContain('&lt;table&gt;')
        expect(html).toContain('onclick=&quot;alert(1)&quot;')
        expect(html).not.toContain('<td onclick=')
    })
})
