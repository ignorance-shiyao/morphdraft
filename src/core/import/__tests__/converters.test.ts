import { describe, it, expect } from 'vitest'
import { parseDelimited, csvToMarkdown, jsonToMarkdown, rowsToTable } from '../converters'
import { extOf, isDirectOpen, isSupported } from '../local'

describe('parseDelimited', () => {
  it('基本逗号分隔', () => {
    expect(parseDelimited('a,b\n1,2', ',')).toEqual([['a', 'b'], ['1', '2']])
  })
  it('引号包裹含逗号与换行', () => {
    expect(parseDelimited('a,"b,c"\n"x\ny",z', ',')).toEqual([['a', 'b,c'], ['x\ny', 'z']])
  })
  it('"" 转义为单引号', () => {
    expect(parseDelimited('"he said ""hi"""', ',')).toEqual([['he said "hi"']])
  })
  it('TSV', () => {
    expect(parseDelimited('a\tb\n1\t2', '\t')).toEqual([['a', 'b'], ['1', '2']])
  })
})

describe('rowsToTable / csvToMarkdown', () => {
  it('生成 GFM 表格，列对齐补齐', () => {
    const md = csvToMarkdown('name,age\nAlice,30\nBob', ',')
    expect(md).toBe('| name | age |\n| --- | --- |\n| Alice | 30 |\n| Bob |  |')
  })
  it('转义单元格内竖线', () => {
    expect(rowsToTable([['a|b'], ['c']])).toContain('a\\|b')
  })
  it('空数据返回空串', () => {
    expect(rowsToTable([['', ''], ['', '']])).toBe('')
  })
})

describe('jsonToMarkdown', () => {
  it('扁平对象数组 → 表格', () => {
    const md = jsonToMarkdown('[{"a":1,"b":2},{"a":3,"b":4}]')
    expect(md).toBe('| a | b |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |')
  })
  it('嵌套对象 → json 代码块', () => {
    const md = jsonToMarkdown('{"a":{"x":1}}')
    expect(md.startsWith('```json')).toBe(true)
  })
  it('非法 JSON → 原文代码块', () => {
    expect(jsonToMarkdown('not json')).toBe('```\nnot json\n```')
  })
})

describe('extOf / isDirectOpen / isSupported', () => {
  it('扩展名小写', () => {
    expect(extOf('A.PDF')).toBe('pdf')
    expect(extOf('noext')).toBe('')
  })
  it('md/markdown/txt 直接打开', () => {
    expect(isDirectOpen('md')).toBe(true)
    expect(isDirectOpen('markdown')).toBe(true)
    expect(isDirectOpen('txt')).toBe(true)
    expect(isDirectOpen('pdf')).toBe(false)
  })
  it('支持的格式', () => {
    expect(isSupported('a.docx')).toBe(true)
    expect(isSupported('a.xyz')).toBe(false)
  })
})
