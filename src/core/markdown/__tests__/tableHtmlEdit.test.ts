import { describe, expect, it } from 'vitest'
import {
  appendHtmlTableColumn,
  appendHtmlTableRow,
  findHtmlTableBlock,
  getHtmlTableCellText,
  mergeHtmlTableCells,
  setHtmlTableCellText,
  setHtmlTableColumnWidth,
} from '../tableHtmlEdit'

const html = `<table>
<thead>
  <tr><th>A</th><th style="text-align:center">B</th></tr>
</thead>
<tbody>
  <tr><td>a1</td><td>b1</td></tr>
  <tr><td>a2</td><td>b2</td></tr>
</tbody>
</table>`

const html3 = `<table>
<tbody>
  <tr><td>a1</td><td>b1</td><td>c1</td></tr>
  <tr><td>a2</td><td>b2</td><td>c2</td></tr>
  <tr><td>a3</td><td>b3</td><td>c3</td></tr>
</tbody>
</table>`

const htmlWithSpan = `<table>
<tbody>
  <tr><td colspan="2">a1</td><td>c1</td></tr>
  <tr><td>a2</td><td>b2</td><td>c2</td></tr>
  <tr><td>a3</td><td>b3</td><td>c3</td></tr>
</tbody>
</table>`

describe('HTML 表格源码编辑', () => {
  it('定位完整 HTML table block', () => {
    const lines = ['前文', ...html.split('\n'), '后文']
    expect(findHtmlTableBlock(lines, 1)).toMatchObject({
      fromLine: 1,
      toLine: html.split('\n').length,
      html,
    })
    expect(findHtmlTableBlock(lines, 0)).toBeNull()
  })

  it('设置整列宽度，保留已有样式', () => {
    const next = setHtmlTableColumnWidth(html, 1, 180)
    expect(next).toContain('<th style="text-align:center;width:180px">B</th>')
    expect(next).toContain('<td style="width:180px">b1</td>')
    expect(next).toContain('<td style="width:180px">b2</td>')
  })

  it('设置视觉列宽时识别已有 colspan', () => {
    const next = setHtmlTableColumnWidth(htmlWithSpan, 1, 220)
    expect(next).toMatch(/<td\b(?=[^>]*colspan="2")(?=[^>]*style="width:220px")[^>]*>a1<\/td>/)
    expect(next).toContain('<td style="width:220px">b2</td>')
    expect(next).toContain('<td style="width:220px">b3</td>')
    expect(next).not.toContain('<td style="width:220px">c2</td>')
  })

  it('列宽会被夹在合理范围内', () => {
    expect(setHtmlTableColumnWidth(html, 0, 2)).toContain('width:24px')
    expect(setHtmlTableColumnWidth(html, 0, 9999)).toContain('width:2000px')
  })

  it('追加 HTML 表格行，列数跟随首行', () => {
    const next = appendHtmlTableRow(html)
    expect(next).toContain('<tr><td></td><td></td></tr>')
    expect(next.indexOf('<tr><td></td><td></td></tr>')).toBeLessThan(next.indexOf('</tbody>'))
  })

  it('追加 HTML 表格行时按 colspan 后的视觉列数补齐', () => {
    const next = appendHtmlTableRow(htmlWithSpan)
    expect(next).toContain('<tr><td></td><td></td><td></td></tr>')
  })

  it('追加 HTML 表格列，表头用 th，正文用 td', () => {
    const next = appendHtmlTableColumn(html)
    expect(next).toContain('<th></th></tr>')
    expect(next).toContain('<td></td></tr>')
  })

  it('横向合并单元格，保留左上角内容并水平垂直居中', () => {
    const next = mergeHtmlTableCells(html3, 0, 0, 0, 1)
    expect(next).toMatch(/<td\b(?=[^>]*colspan="2")(?=[^>]*text-align:center)(?=[^>]*vertical-align:middle)[^>]*>a1<\/td><td>c1<\/td>/)
    expect(next).not.toContain('<td>b1</td>')
  })

  it('纵向合并单元格，保留左上角内容并居中', () => {
    const next = mergeHtmlTableCells(html3, 0, 1, 0, 0)
    expect(next).toMatch(/<td\b(?=[^>]*rowspan="2")(?=[^>]*text-align:center)(?=[^>]*vertical-align:middle)[^>]*>a1<\/td><td>b1<\/td><td>c1<\/td>/)
    expect(next).toContain('<tr><td>b2</td><td>c2</td></tr>')
    expect(next).not.toContain('<td>a2</td>')
  })

  it('矩形合并单元格，写入 rowspan + colspan、居中并删除内部单元格', () => {
    const next = mergeHtmlTableCells(html3, 0, 1, 0, 1)
    expect(next).toMatch(/<td\b(?=[^>]*rowspan="2")(?=[^>]*colspan="2")(?=[^>]*text-align:center)(?=[^>]*vertical-align:middle)[^>]*>a1<\/td><td>c1<\/td>/)
    expect(next).toContain('<tr><td>c2</td></tr>')
    expect(next).not.toContain('<td>b1</td>')
    expect(next).not.toContain('<td>a2</td>')
    expect(next).not.toContain('<td>b2</td>')
  })

  it('在已有 colspan 的表格里按视觉网格完整合并', () => {
    const next = mergeHtmlTableCells(htmlWithSpan, 0, 1, 0, 1)
    expect(next).toMatch(/<td\b(?=[^>]*rowspan="2")(?=[^>]*colspan="2")(?=[^>]*text-align:center)[^>]*>a1<\/td><td>c1<\/td>/)
    expect(next).toContain('<tr><td>c2</td></tr>')
    expect(next).not.toContain('<td>a2</td>')
    expect(next).not.toContain('<td>b2</td>')
  })

  it('拒绝半截覆盖已有合并单元格，避免破坏表格拓扑', () => {
    expect(mergeHtmlTableCells(htmlWithSpan, 0, 1, 1, 2)).toBe(htmlWithSpan)
  })

  it('按视觉坐标读取单元格文本（含合并）', () => {
    expect(getHtmlTableCellText(html3, 0, 0)).toBe('a1')
    expect(getHtmlTableCellText(html3, 1, 2)).toBe('c2')
    // 合并后 (0,0)~(1,1) 的锚点单元格覆盖整片，坐标 (1,1) 也应取到合并格内容
    const merged = mergeHtmlTableCells(html3, 0, 1, 0, 1)
    expect(getHtmlTableCellText(merged, 1, 1)).toBe('a1')
  })

  it('按视觉坐标改写单元格文本，保留 colspan/rowspan/样式', () => {
    const merged = mergeHtmlTableCells(html3, 0, 1, 0, 1)
    const next = setHtmlTableCellText(merged, 0, 0, '新内容')
    expect(next).toMatch(/<td\b(?=[^>]*rowspan="2")(?=[^>]*colspan="2")[^>]*>新内容<\/td>/)
    // 在合并块内的任意子坐标改写，命中的都是同一个锚点单元格
    expect(setHtmlTableCellText(merged, 1, 1, 'X')).toContain('>X</td>')
  })

  it('改写单元格文本时转义 HTML 特殊字符', () => {
    expect(setHtmlTableCellText(html3, 0, 0, 'a<b>&c')).toContain('>a&lt;b&gt;&amp;c</td>')
  })
})
