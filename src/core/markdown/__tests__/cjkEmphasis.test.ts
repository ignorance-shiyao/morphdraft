import { describe, it, expect } from 'vitest'
import { renderMarkdown } from '../index'

describe('CJK 旁的强调识别', () => {
  it('下划线 ___ 紧贴中文 → 粗斜体', () => {
    const html = renderMarkdown('中文___粗斜体___中文')
    expect(html).toMatch(/<em><strong>粗斜体<\/strong><\/em>/)
  })

  it('下划线 __ 紧贴中文 → 粗体', () => {
    expect(renderMarkdown('前__粗体__后')).toMatch(/<strong>粗体<\/strong>/)
  })

  it('下划线 _ 紧贴中文 → 斜体', () => {
    expect(renderMarkdown('前_斜体_后')).toMatch(/<em>斜体<\/em>/)
  })

  it('星号 *** 紧贴中文仍正常（未回归）', () => {
    expect(renderMarkdown('中文***粗斜体***中文')).toMatch(/<em><strong>粗斜体<\/strong><\/em>/)
  })

  it('英文 *** 仍正常', () => {
    expect(renderMarkdown('a ***bi*** b')).toMatch(/<em><strong>bi<\/strong><\/em>/)
  })

  it('ASCII snake_case 不被误判为强调', () => {
    const html = renderMarkdown('foo_bar_baz')
    expect(html).not.toMatch(/<em>/)
    expect(html).toContain('foo_bar_baz')
  })

  it('行内代码内的下划线不受影响', () => {
    const html = renderMarkdown('`中文_不强调_中文`')
    expect(html).toMatch(/<code>中文_不强调_中文<\/code>/)
  })
})
