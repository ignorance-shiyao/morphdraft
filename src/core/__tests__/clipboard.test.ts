import { describe, expect, it } from 'vitest'
import { htmlToMarkdown } from '../clipboard'

describe('htmlToMarkdown', () => {
  it('不给 markdown 特殊字符加反斜杠转义（粘贴 markdown 不再变成 \\# \\> \\-）', () => {
    const md = htmlToMarkdown('<div># 标题</div><div>&gt; 引用</div><div>- 列表项</div>')
    expect(md).not.toContain('\\#')
    expect(md).not.toContain('\\>')
    expect(md).not.toContain('\\-')
    expect(md).toContain('# 标题')
    expect(md).toContain('> 引用')
  })

  it('真实富文本仍正常转换（标题/加粗/链接）', () => {
    const md = htmlToMarkdown('<h1>标题</h1><p><strong>粗</strong>和<a href="https://x.com">链接</a></p>')
    expect(md).toContain('# 标题')
    expect(md).toContain('**粗**')
    expect(md).toContain('[链接](https://x.com)')
  })
})
