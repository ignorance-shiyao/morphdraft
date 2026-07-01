import { describe, it, expect } from 'vitest'
import { parseSlideLayout } from '../layout'
import { extractSteps } from '../fragments'
import {absoluteSlideSourceLine} from '../sourcemap'

// 锁定 PPT 卡片点选编辑（M4-1）的行号映射不变量。
// 绝对行号 = 页起始行(startLine) + layout 注释偏移(directiveOffset) + 页内局部行号(localLine)。
// 这套断言一旦通过，directiveOffset / step 两类 off-by-N 永不回归。

describe('parseSlideLayout.directiveOffset（layout 注释行数补偿）', () => {
  it('无 layout 注释 → offset 0，body 不变', () => {
    const md = '# 标题\n副标题'
    const r = parseSlideLayout(md)
    expect(r.directiveOffset).toBe(0)
    expect(r.body).toBe(md)
  })

  it('单行 layout 注释 + 尾换行 → offset 1（不是 split 长度的 2）', () => {
    const md = '<!-- layout: cover -->\n# 标题\n副标题'
    const r = parseSlideLayout(md)
    expect(r.directiveOffset).toBe(1)
    expect(r.body).toBe('# 标题\n副标题')
  })

  it('layout 注释后跟空行 → offset 2（注释行 + 空行都被吞）', () => {
    const md = '<!-- layout: section -->\n\n# 章节'
    const r = parseSlideLayout(md)
    expect(r.directiveOffset).toBe(2)
    expect(r.body).toBe('# 章节')
  })

  it('端到端：带 layout 注释的页，点击 body 第 0 行得到正确绝对行', () => {
    const startLine = 10
    const pageMd = '<!-- layout: cover -->\n# 标题\n副标题'
    const { directiveOffset } = parseSlideLayout(pageMd)
    const localLine = 0
    const absolute = startLine + directiveOffset + localLine
    expect(absolute).toBe(11) // # 标题 在文档第 11 行
  })
})

describe('absoluteSlideSourceLine（自动续页编辑映射）', () => {
    it('普通页面累加页起始、布局偏移和局部行', () => {
        expect(absoluteSlideSourceLine(10, 2, 3)).toBe(15)
    })

    it('自动续页以当前页首块为基准，避免重复累加原页局部行', () => {
        expect(absoluteSlideSourceLine(981, 0, 264, 262)).toBe(983)
    })
})

describe('extractSteps（步进动画：抹空标记行 + 记录行号，行数守恒）', () => {
  it('单个 step：body 行数不变，记录行号，标记行被抹空', () => {
    const body = '# 标题\n<!-- step -->\n- 项1\n- 项2'
    const r = extractSteps(body)
    expect(r.body.split('\n').length).toBe(body.split('\n').length)
    expect(r.stepLines).toEqual([1]) // step 在第 1 行（0 基）
    expect(r.body.split('\n')[1]).toBe('') // 标记行抹空
    expect(r.body).not.toContain('step')
  })

  it('多个 step：行数不变，行号全部记录', () => {
    const body = '<!-- step -->\nA\n<!-- step -->\nB\n<!-- step -->\nC'
    const r = extractSteps(body)
    expect(r.body.split('\n').length).toBe(body.split('\n').length)
    expect(r.stepLines).toEqual([0, 2, 4])
  })

  it('保留缩进的 step（嵌套场景）也被识别并抹空', () => {
    const body = '- 外层\n  <!-- step -->\n  - 内层'
    const r = extractSteps(body)
    expect(r.stepLines).toEqual([1])
    expect(r.body.split('\n').length).toBe(body.split('\n').length)
    expect(r.body.split('\n')[1]).toBe('')
  })

  it('无 step：body 原样，stepLines 为空', () => {
    const body = '# 标题\n正文'
    const r = extractSteps(body)
    expect(r.body).toBe(body)
    expect(r.stepLines).toEqual([])
  })

  it('端到端：step 标记行号 < 后续块行号（注入 fragment 的依据）', () => {
    // 抹空后行号守恒，stepLine 应小于「下一个内容块」的行号
    const body = '# 标题\n<!-- step -->\n- 项1'
    const r = extractSteps(body)
    expect(r.stepLines).toEqual([1])
    // 项1 在第 2 行，> stepLine(1) → reveal.ts 会给它加 fragment
    expect(r.body.split('\n')[2]).toBe('- 项1')
  })
})
