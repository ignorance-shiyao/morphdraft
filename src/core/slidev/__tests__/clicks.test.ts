import { describe, it, expect } from 'vitest'
import { parseClicks, renderClickAware, hasClicks } from '../clicks'

const md = (s: string) => {
  // 极简伪渲染：列表行 → <ul><li>，其余 → <p>
  const t = s.trim()
  if (/^[-*] /m.test(t)) {
    const items = t.split('\n').filter((l) => /^[-*] /.test(l.trim())).map((l) => `<li>${l.replace(/^[-*] /, '').trim()}</li>`).join('')
    return `<ul>${items}</ul>`
  }
  return `<p>${t}</p>`
}

describe('parseClicks', () => {
  it('无标记 → 单个 text 节点', () => {
    expect(parseClicks('普通正文')).toEqual([{ type: 'text', md: '普通正文' }])
  })
  it('<v-click> 包块 → click 节点', () => {
    const nodes = parseClicks('前言\n\n<v-click>\n\n秘密\n\n</v-click>')
    expect(nodes.map((n) => n.type)).toEqual(['text', 'click'])
    expect(nodes[1].md).toContain('秘密')
  })
  it('<v-clicks> 包列表 → clicks 节点保留列表 md', () => {
    const nodes = parseClicks('<v-clicks>\n\n- a\n- b\n\n</v-clicks>')
    expect(nodes).toHaveLength(1)
    expect(nodes[0].type).toBe('clicks')
    expect(nodes[0].md).toContain('- a')
  })
  it('未闭合标记容错收尾', () => {
    const nodes = parseClicks('<v-click>\n\n孤儿')
    expect(nodes[0].type).toBe('click')
    expect(nodes[0].md).toContain('孤儿')
  })
})

describe('hasClicks', () => {
  it('识别 v-click / v-clicks', () => {
    expect(hasClicks('x\n<v-click>\ny')).toBe(true)
    expect(hasClicks('<v-clicks depth="2">\n- a')).toBe(true)
    expect(hasClicks('纯文本')).toBe(false)
  })
})

describe('renderClickAware', () => {
  it('无标记时等价于直接渲染', () => {
    expect(renderClickAware('正文', md)).toBe('<p>正文</p>')
  })
  it('<v-click> 组渲染成 .fragment 容器', () => {
    const html = renderClickAware('<v-click>\n\n揭晓\n\n</v-click>', md)
    expect(html).toContain('class="fragment slidev-click"')
    expect(html).toContain('揭晓')
  })
  it('<v-clicks> 包列表 → 每个 li 加 fragment', () => {
    const html = renderClickAware('<v-clicks>\n\n- 一\n- 二\n\n</v-clicks>', md)
    const liFrags = html.match(/<li class="fragment">/g) ?? []
    expect(liFrags.length).toBe(2)
  })
  it('text + click 混合按序拼接', () => {
    const html = renderClickAware('开场\n\n<v-click>\n\n重点\n\n</v-click>', md)
    expect(html.indexOf('开场')).toBeLessThan(html.indexOf('重点'))
    expect(html).toContain('fragment')
  })
})
