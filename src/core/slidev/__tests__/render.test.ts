import { describe, it, expect } from 'vitest'
import { parseSlidevDeck } from '../parse'
import { renderSlidevDeck, renderSlidevSlide } from '../render'

// 注入一个可预测的「markdown 渲染器」，避免依赖真实 markdown-it 输出细节
const fakeMd = (s: string) => `<md>${s.trim()}</md>`

const DECK = `---
theme: default
---

# 封面

副标题

---
layout: two-cols
---

左栏内容

::right::

右栏内容

---
layout: image-right
image: /a/b.png
---

# 图文页

正文
`

describe('renderSlidevDeck', () => {
  it('每页产出 section.slide-surface + .slide-inner + layout class', () => {
    const out = renderSlidevDeck(parseSlidevDeck(DECK), fakeMd)
    expect(out.length).toBe(3)
    expect(out[0].html).toContain('class="slide-surface slidev-layout-cover slidev-has-title"')
    expect(out[0].html).toContain('data-slidev-layout="cover"')
    expect(out[0].html).toContain('<div class="slide-inner">')
    expect(out[1].html).toContain('slidev-layout-two-cols')
    expect(out[2].html).toContain('slidev-layout-image-right')
  })

  it('two-cols 切出左右两栏，右栏来自 ::right:: 槽', () => {
    const out = renderSlidevDeck(parseSlidevDeck(DECK), fakeMd)
    const h = out[1].html
    expect(h).toContain('slidev-col-left')
    expect(h).toContain('slidev-col-right')
    expect(h).toContain('左栏内容')
    expect(h).toContain('右栏内容')
  })

  it('image-right 用 frontmatter.image 作为背景图，文字在前图在后', () => {
    const out = renderSlidevDeck(parseSlidevDeck(DECK), fakeMd)
    const h = out[2].html
    expect(h).toContain('slidev-image-split image-right')
    expect(h).toContain('/a/b.png')
    expect(h.indexOf('slidev-col-text')).toBeLessThan(h.indexOf('slidev-col-image'))
  })

  it('image 整幅图用 frontmatter.image 作背景', () => {
    const deck = parseSlidevDeck(`---\nlayout: image\nimage: /pic.jpg\n---\n\n图注文字`)
    const out = renderSlidevSlide(deck.slides[0], fakeMd)
    expect(out.layout).toBe('image')
    expect(out.html).toContain('slidev-image-full')
    expect(out.html).toContain('/pic.jpg')
    expect(out.html).toContain('slidev-image-caption')
  })

  it('iframe-right 用 frontmatter.url，文字在前 iframe 在后', () => {
    const deck = parseSlidevDeck(`---\nlayout: iframe-right\nurl: https://example.com\n---\n\n说明`)
    const out = renderSlidevSlide(deck.slides[0], fakeMd)
    expect(out.html).toContain('slidev-iframe-split iframe-right')
    expect(out.html).toContain('src="https://example.com"')
    expect(out.html.indexOf('slidev-col-text')).toBeLessThan(out.html.indexOf('<iframe'))
  })

  it('未知 layout 回落 default', () => {
    const deck = parseSlidevDeck(`---\nlayout: nope\n---\n\n内容`)
    const out = renderSlidevSlide(deck.slides[0], fakeMd)
    expect(out.layout).toBe('default')
    expect(out.html).toContain('slidev-layout-default')
  })

  it('frontmatter class 透传到 section', () => {
    const deck = parseSlidevDeck(`---\nlayout: center\nclass: text-center big\n---\n\n标题`)
    const out = renderSlidevSlide(deck.slides[0], fakeMd)
    expect(out.html).toContain('slidev-layout-center')
    expect(out.html).toContain('text-center')
    expect(out.html).toContain('big')
  })
})
