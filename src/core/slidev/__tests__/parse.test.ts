import { describe, it, expect } from 'vitest'
import { parseSlidevDeck } from '../parse'

const DECK = `---
theme: seriph
title: 演示文稿
engine: slidev
---

# 封面标题

引言段落

---
layout: two-cols
class: gap-4
---

# 左栏

左侧内容

::right::

# 右栏

右侧内容

<!-- 这是演讲备注 -->

---
layout: center
class: text-center
---

## 居中标题
`

describe('parseSlidevDeck', () => {
  it('按顶层 --- 分页，页数正确', () => {
    const deck = parseSlidevDeck(DECK)
    expect(deck.slides.length).toBe(3)
  })

  it('读取整套 headmatter：theme / engine / title', () => {
    const deck = parseSlidevDeck(DECK)
    expect(deck.theme).toBe('seriph')
    expect(deck.engine).toBe('slidev')
    expect(deck.title).toBe('演示文稿')
  })

  it('无 layout 的页落 default；显式 layout 透传', () => {
    const deck = parseSlidevDeck(DECK)
    expect(deck.slides[0].layout).toBe('default')
    expect(deck.slides[1].layout).toBe('two-cols')
    expect(deck.slides[2].layout).toBe('center')
  })

  it('class 归一化为数组', () => {
    const deck = parseSlidevDeck(DECK)
    expect(deck.slides[1].classes).toEqual(['gap-4'])
    expect(deck.slides[2].classes).toEqual(['text-center'])
    expect(deck.slides[0].classes).toEqual([])
  })

  it('two-cols 的 ::right:: 切分到 slots.right，default 槽只含右栏之前内容', () => {
    const deck = parseSlidevDeck(DECK)
    const s = deck.slides[1]
    expect(s.slots.default).toContain('左栏')
    expect(s.slots.default).not.toContain('右栏')
    expect(s.slots.right).toContain('右栏')
  })

  it('HTML 注释进 note', () => {
    const deck = parseSlidevDeck(DECK)
    expect(deck.slides[1].note?.trim()).toBe('这是演讲备注')
  })

  it('没有 ::slot:: 的页 slots.default 即全文', () => {
    const deck = parseSlidevDeck(DECK)
    expect(deck.slides[0].slots.default).toContain('封面标题')
    expect(deck.slides[0].slots.default).toContain('引言段落')
  })

  it('空文档不炸：返回至少一页或空页数组', () => {
    const deck = parseSlidevDeck('')
    expect(Array.isArray(deck.slides)).toBe(true)
  })
})
