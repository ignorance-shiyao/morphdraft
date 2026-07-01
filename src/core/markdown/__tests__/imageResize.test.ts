import { describe, expect, it } from 'vitest'
import { findImageResizeRange, findImageResizeRangeByIndex, resizeImageSource, readImageAttrs, applyImageAttrs } from '../imageResize'

describe('预览图片尺寸编辑', () => {
  it('按同 src + alt 的 occurrence 定位图片，不误伤同一行其他图片', () => {
    const line = '![A](a.png) ![B](b.png) ![A](a.png "cap")'
    expect(findImageResizeRange([line], 0, 0, 'a.png', 'A', 0)).toMatchObject({
      from: 0,
      source: '![A](a.png)',
    })
    expect(findImageResizeRange([line], 0, 0, 'a.png', 'A', 1)).toMatchObject({
      source: '![A](a.png "cap")',
    })
    expect(findImageResizeRange([line], 0, 0, 'b.png', 'B', 0)).toMatchObject({
      source: '![B](b.png)',
    })
  })

  it('Markdown 图片改写为安全 HTML 图片并写入宽度', () => {
    expect(resizeImageSource('![图](asset://a.png "说明")', 320)).toBe(
      '<img src="asset://a.png" alt="图" title="说明" style="width:320px">',
    )
  })

  it('支持按块内图片顺序兜底定位本地附件图片', () => {
    const line = '前 ![A](asset://a.png) 中 <img src="asset://b.png" alt="B" style="width:90px">'
    expect(findImageResizeRangeByIndex([line], 0, 0, 1)).toMatchObject({
      source: '<img src="asset://b.png" alt="B" style="width:90px">',
    })
  })

  it('已有 HTML 图片重复调整时只替换 style', () => {
    expect(resizeImageSource('<img src="a.png" alt="图" style="width:120px;height:90px">', 240, 160)).toBe(
      '<img src="a.png" alt="图" style="width:240px;height:160px">',
    )
  })
})

describe('图片属性读取 / 应用', () => {
  it('从 Markdown 图片读出默认属性', () => {
    expect(readImageAttrs('![图](a.png)')).toEqual({
      src: 'a.png', alt: '图', title: undefined, width: null, height: null,
      align: 'none', rounded: false, shadow: false,
    })
  })

  it('从 HTML 图片读出对齐 / 圆角 / 阴影 / 尺寸', () => {
    const src = '<img src="a.png" alt="A" style="width:200px;display:block;margin-left:auto;margin-right:auto;border-radius:10px;box-shadow:0 1px 2px rgba(0,0,0,.2)">'
    expect(readImageAttrs(src)).toMatchObject({
      src: 'a.png', alt: 'A', width: 200, align: 'center', rounded: true, shadow: true,
    })
  })

  it('左右对齐由 margin 推断', () => {
    expect(readImageAttrs('<img src="a.png" alt="" style="display:block;margin-left:0;margin-right:auto">').align).toBe('left')
    expect(readImageAttrs('<img src="a.png" alt="" style="display:block;margin-left:auto;margin-right:0">').align).toBe('right')
  })

  it('无额外样式且无标题时回退为干净 Markdown', () => {
    expect(applyImageAttrs('<img src="a.png" alt="图" style="width:120px">', { width: null })).toBe('![图](a.png)')
  })

  it('设置对齐 / 圆角时保留已有宽度', () => {
    const next = applyImageAttrs('<img src="a.png" alt="图" style="width:120px">', { align: 'center', rounded: true })
    expect(next).toContain('width:120px')
    expect(next).toContain('margin-left:auto')
    expect(next).toContain('border-radius:')
  })

  it('从 Markdown 改写路径 / alt 不影响其他属性', () => {
    expect(applyImageAttrs('![旧](old.png)', { src: 'new.png', alt: '新' })).toBe('![新](new.png)')
  })
})
