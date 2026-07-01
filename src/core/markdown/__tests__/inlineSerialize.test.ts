// 行内序列化测试：用假节点树覆盖各行内语法的 DOM→Markdown 还原。
import { describe, it, expect } from 'vitest'
import { serializeInline, type SNode } from '../inlineSerialize'

// 假节点构造器（匹配 SNode 最小接口）。
function text(s: string): SNode {
  return { nodeType: 3, nodeName: '#text', textContent: s, childNodes: [] }
}
function el(name: string, kids: SNode[] = [], attrs: Record<string, string> = {}, data: Record<string, string> = {}): SNode {
  return {
    nodeType: 1,
    nodeName: name.toUpperCase(),
    childNodes: kids,
    textContent: kids.map((k) => k.textContent ?? collect(k)).join(''),
    getAttribute: (n: string) => attrs[n] ?? null,
    dataset: data,
  }
}
function collect(n: SNode): string {
  if (n.nodeType === 3) return n.textContent ?? ''
  return Array.from(n.childNodes).map(collect).join('')
}
// 根：把若干子节点挂到一个容器里序列化。
const root = (...kids: SNode[]): SNode => el('p', kids)

describe('inlineSerialize DOM→Markdown', () => {
  it('纯文本透传', () => {
    expect(serializeInline(root(text('hello 世界')))).toBe('hello 世界')
  })
  it('粗体 / 斜体 / 粗斜体', () => {
    expect(serializeInline(root(el('strong', [text('b')])))).toBe('**b**')
    expect(serializeInline(root(el('em', [text('i')])))).toBe('*i*')
    expect(serializeInline(root(el('strong', [el('em', [text('x')])])))).toBe('***x***')
    expect(serializeInline(root(el('em', [el('strong', [text('y')])])))).toBe('***y***')
  })
  it('行内代码（含反引号自动加长围栏）', () => {
    expect(serializeInline(root(el('code', [text('a')])))).toBe('`a`')
    const withTick = el('code', [text('a`b')])
    expect(serializeInline(root(withTick))).toBe('`` a`b ``')
  })
  it('高亮 / 删除线 / 下划线 / kbd / 上下标', () => {
    expect(serializeInline(root(el('mark', [text('h')])))).toBe('==h==')
    expect(serializeInline(root(el('del', [text('d')])))).toBe('~~d~~')
    expect(serializeInline(root(el('strike', [text('s')])))).toBe('~~s~~') // execCommand 产物
    expect(serializeInline(root(el('u', [text('u')])))).toBe('<u>u</u>')
    expect(serializeInline(root(el('kbd', [text('⌘')])))).toBe('<kbd>⌘</kbd>')
    expect(serializeInline(root(el('sub', [text('2')])))).toBe('~2~')
    expect(serializeInline(root(el('sup', [text('2')])))).toBe('^2^')
  })
  it('链接 / 自动链接 / 带标题 / 图片', () => {
    expect(serializeInline(root(el('a', [text('t')], { href: 'http://x' })))).toBe('[t](http://x)')
    expect(serializeInline(root(el('a', [text('http://x')], { href: 'http://x' })))).toBe('http://x')
    expect(serializeInline(root(el('a', [text('t')], { href: 'http://x', title: 'T' })))).toBe('[t](http://x "T")')
    expect(serializeInline(root(el('img', [], { alt: 'a', src: 's' })))).toBe('![a](s)')
  })
  it('行内数学（data-math-source）', () => {
    expect(serializeInline(root(el('span', [text('E=mc²')], { class: 'math-inline' }, { mathSource: 'E=mc^2' })))).toBe('$E=mc^2$')
  })
  it('混排往返：文字 + 粗体 + 代码 + 链接', () => {
    const tree = root(
      text('see '),
      el('strong', [text('bold')]),
      text(' and '),
      el('code', [text('x()')]),
      text(' at '),
      el('a', [text('site')], { href: 'http://s' }),
    )
    expect(serializeInline(tree)).toBe('see **bold** and `x()` at [site](http://s)')
  })
  it('硬换行 <br> → 换行符', () => {
    expect(serializeInline(root(text('a'), el('br'), text('b')))).toBe('a\nb')
  })
  it('未知包裹（.md-syntax-token 等）透传子内容', () => {
    expect(serializeInline(root(el('span', [text('raw')], { class: 'md-syntax-token' })))).toBe('raw')
  })
  it('忽略预览动态操作控件', () => {
    expect(serializeInline(root(
      el('button', [text('⌄')], { class: 'md-heading-toggle' }),
      text('标题'),
      el('span', [text('x')], { class: 'md-image-resize' }),
    ))).toBe('标题')
  })
})
