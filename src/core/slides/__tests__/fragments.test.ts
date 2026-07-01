import { describe, it, expect } from 'vitest'
import { extractSteps } from '../fragments'

describe('extractSteps（<!-- step --> 分步标记）', () => {
  it('抹空标记行、行数守恒、记录行号', () => {
    const r = extractSteps('块A\n<!-- step -->\n块B')
    expect(r.body).toBe('块A\n\n块B')
    expect(r.body.split('\n').length).toBe(3) // 行数与输入一致
    expect(r.stepLines).toEqual([1])
  })

  it('多个标记', () => {
    const r = extractSteps('A\n<!-- step -->\nB\n<!-- step -->\nC')
    expect(r.stepLines).toEqual([1, 3])
    expect(r.body).toBe('A\n\nB\n\nC')
  })

  it('容忍标记内空白', () => {
    expect(extractSteps('<!--  step  -->').stepLines).toEqual([0])
    expect(extractSteps('   <!-- step -->   ').stepLines).toEqual([0])
  })

  it('无标记 → 原样返回、stepLines 空', () => {
    const r = extractSteps('普通\n内容')
    expect(r.stepLines).toEqual([])
    expect(r.body).toBe('普通\n内容')
  })

  it('不误伤含 step 字样的普通行', () => {
    const r = extractSteps('step by step 不是标记\n<!-- not step -->')
    expect(r.stepLines).toEqual([])
  })
})
