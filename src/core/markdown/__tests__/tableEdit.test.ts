import { describe, it, expect } from 'vitest'
import {
  detectTable,
  moveRow,
  moveCol,
  resolveTableContext,
  setCellText,
  tableToHtml,
  tableToTsv,
  tableToCsv,
  tableToMarkdown,
} from '../tableEdit'

const sample = ['| A | B | C |', '|---|:-:|--:|', '| a1 | b1 | c1 |', '| a2 | b2 | c2 |', '| a3 | b3 | c3 |']

function model() {
  const m = detectTable(sample, 0)!
  expect(m).toBeTruthy()
  return m
}

describe('resolveTableContext', () => {
  it('按鼠标命中的行列解析表格上下文，不依赖编辑器当前选区', () => {
    const context = resolveTableContext(sample, 3, sample[3].indexOf('b2') + 1)
    expect(context).toMatchObject({
      col: 1,
      bodyIndex: 1,
      model: { fromLine: 0, toLine: 4 },
    })
  })

  it('鼠标不在表格行时不弹出菜单', () => {
    expect(resolveTableContext(['正文', ...sample], 0, 1)).toBeNull()
  })
})

describe('moveRow', () => {
  it('向下移动正文行 0 → 与行 1 互换', () => {
    const next = moveRow(model(), 0, 1)
    expect(next.rows.map((r) => r[0])).toEqual(['a2', 'a1', 'a3'])
  })
  it('向上移动正文行 2 → 与行 1 互换', () => {
    const next = moveRow(model(), 2, -1)
    expect(next.rows.map((r) => r[0])).toEqual(['a1', 'a3', 'a2'])
  })
  it('越界 no-op', () => {
    const m = model()
    expect(moveRow(m, 0, -1).rows).toEqual(m.rows)
    expect(moveRow(m, 2, 1).rows).toEqual(m.rows)
    expect(moveRow(m, -1, 1).rows).toEqual(m.rows)
  })
})

describe('moveCol', () => {
  it('向右移动列 0 → 与列 1 互换（header/aligns/rows 同步）', () => {
    const next = moveCol(model(), 0, 1)
    expect(next.header).toEqual(['B', 'A', 'C'])
    expect(next.aligns).toEqual(['center', 'none', 'right'])
    expect(next.rows[0]).toEqual(['b1', 'a1', 'c1'])
  })
  it('越界 no-op', () => {
    const m = model()
    expect(moveCol(m, 0, -1).header).toEqual(m.header)
    expect(moveCol(m, 2, 1).header).toEqual(m.header)
  })
})

describe('setCellText', () => {
  it('更新表头单元格', () => {
    const next = setCellText(model(), -1, 1, 'Name')
    expect(next.header).toEqual(['A', 'Name', 'C'])
  })

  it('更新正文单元格', () => {
    const next = setCellText(model(), 1, 2, 'done')
    expect(next.rows[1]).toEqual(['a2', 'b2', 'done'])
  })

  it('越界 no-op', () => {
    const m = model()
    expect(setCellText(m, 0, 9, 'x')).toBe(m)
    expect(setCellText(m, 9, 0, 'x')).toBe(m)
  })
})

describe('序列化', () => {
  it('tableToTsv：制表符分隔，去掉换行', () => {
    const tsv = tableToTsv(model())
    expect(tsv.split('\n')[0]).toBe('A\tB\tC')
    expect(tsv.split('\n')[1]).toBe('a1\tb1\tc1')
  })
  it('tableToCsv：带引号转义', () => {
    const m = model()
    m.rows[0][0] = 'has, comma'
    m.rows[0][1] = 'has "quote"'
    const csv = tableToCsv(m)
    expect(csv.split('\n')[1]).toBe('"has, comma","has ""quote""",c1')
  })
  it('tableToMarkdown：复用 formatTable 输出 GFM 源码', () => {
    const md = tableToMarkdown(model())
    expect(md).toMatch(/^\| A/m)
    expect(md).toMatch(/-{2,}/)
  })
  it('tableToHtml：升级为可承载高级表格属性的安全 HTML 表格源码', () => {
    const html = tableToHtml(model())
    expect(html).toContain('<table>')
    expect(html).toContain('<thead>')
    expect(html).toContain('<tbody>')
    expect(html).toContain('<th>A</th>')
    expect(html).toContain('<th style="text-align:center">B</th>')
    expect(html).toContain('<td style="text-align:right">c1</td>')
  })
  it('tableToHtml：转义单元格 HTML，避免把用户内容当标签执行', () => {
    const m = model()
    m.rows[0][0] = '<script>alert(1)</script>'
    expect(tableToHtml(m)).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })
  it('tableToHtml：升级时保留常用行内 Markdown 语义', () => {
    const m = model()
    m.rows[0][0] = '`title`'
    m.rows[0][1] = '**重要**'
    expect(tableToHtml(m)).toContain('<code>title</code>')
    expect(tableToHtml(m)).toContain('<strong>重要</strong>')
  })
})
