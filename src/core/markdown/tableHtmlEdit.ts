// 安全 HTML table 的源码级小变换。用于预览侧高级表格编辑：
// GFM 表格负责轻量输入；一旦需要列宽/行高/合并，就升级为 HTML table 承载属性。

export interface HtmlTableBlock {
  fromLine: number
  toLine: number
  html: string
}

const TABLE_START = /^\s*<table(?:\s[^>]*)?>/i
const TABLE_END = /<\/table>\s*$/i
const CELL_OPEN = /<(th|td)\b([^>]*)>/gi
const TR_BLOCK = /<tr\b[^>]*>[\s\S]*?<\/tr>/gi
const CELL_BLOCK = /<(th|td)\b[^>]*>[\s\S]*?<\/\1>/gi

function clampPx(px: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(px)))
}

export function findHtmlTableBlock(lines: string[], sourceLine: number): HtmlTableBlock | null {
  if (sourceLine < 0 || sourceLine >= lines.length) return null
  if (!TABLE_START.test(lines[sourceLine] ?? '')) return null
  let to = sourceLine
  while (to < lines.length) {
    if (TABLE_END.test(lines[to] ?? '')) {
      return { fromLine: sourceLine, toLine: to, html: lines.slice(sourceLine, to + 1).join('\n') }
    }
    to++
  }
  return null
}

function setStyle(openTag: string, prop: string, value: string): string {
  const styleMatch = openTag.match(/\sstyle=(["'])(.*?)\1/i)
  const pairs = new Map<string, string>()
  if (styleMatch) {
    for (const raw of styleMatch[2].split(';')) {
      const [kRaw, vRaw] = raw.split(':')
      const k = kRaw?.trim().toLowerCase()
      const v = vRaw?.trim()
      if (k && v) pairs.set(k, v)
    }
  }
  pairs.set(prop, value)
  const style = Array.from(pairs.entries()).map(([k, v]) => `${k}:${v}`).join(';')
  if (styleMatch) return openTag.replace(/\sstyle=(["'])(.*?)\1/i, ` style="${style}"`)
  return openTag.replace(/>$/, ` style="${style}">`)
}

function setAttr(openTag: string, name: 'rowspan' | 'colspan', value: number): string {
  const attr = `${name}="${value}"`
  const re = new RegExp(`\\s${name}=(["']).*?\\1`, 'i')
  if (re.test(openTag)) return openTag.replace(re, ` ${attr}`)
  return openTag.replace(/>$/, ` ${attr}>`)
}

function removeAttr(openTag: string, name: 'rowspan' | 'colspan'): string {
  return openTag.replace(new RegExp(`\\s${name}=(["']).*?\\1`, 'i'), '')
}

function setSpanAttr(openTag: string, name: 'rowspan' | 'colspan', value: number): string {
  return value > 1 ? setAttr(openTag, name, value) : removeAttr(openTag, name)
}

function attrInt(openTag: string, name: 'rowspan' | 'colspan'): number {
  const match = openTag.match(new RegExp(`\\s${name}=(["'])(\\d+)\\1`, 'i'))
  const n = match ? Number(match[2]) : 1
  return Number.isFinite(n) && n > 0 ? Math.min(n, 99) : 1
}

interface ParsedCell {
  open: string
  close: string
  inner: string
  full: string
}

interface PlacedCell {
  row: number
  col: number
  rowEnd: number
  colEnd: number
  cell: ParsedCell
}

function parseCells(rowHtml: string): ParsedCell[] {
  const out: ParsedCell[] = []
  rowHtml.replace(/<(th|td)\b[^>]*>[\s\S]*?<\/\1>/gi, (full) => {
    const match = full.match(/^(<(th|td)\b[^>]*>)([\s\S]*)(<\/\2>)$/i)
    if (match) out.push({ open: match[1], inner: match[3], close: match[4], full })
    return full
  })
  return out
}

function serializeCells(cells: ParsedCell[]): string {
  return cells.map((c) => `${c.open}${c.inner}${c.close}`).join('')
}

function parseRows(html: string): { rowHtml: string; cells: ParsedCell[] }[] {
  const rows: { rowHtml: string; cells: ParsedCell[] }[] = []
  html.replace(TR_BLOCK, (rowHtml) => {
    rows.push({ rowHtml, cells: parseCells(rowHtml) })
    return rowHtml
  })
  return rows
}

function placeCells(rows: { cells: ParsedCell[] }[]): PlacedCell[] {
  const placed: PlacedCell[] = []
  const occupied = new Map<number, Set<number>>()
  const mark = (row: number, col: number) => {
    const set = occupied.get(row) ?? new Set<number>()
    set.add(col)
    occupied.set(row, set)
  }
  rows.forEach((row, r) => {
    let col = 0
    for (const cell of row.cells) {
      while (occupied.get(r)?.has(col)) col++
      const rowspan = attrInt(cell.open, 'rowspan')
      const colspan = attrInt(cell.open, 'colspan')
      const item = { row: r, col, rowEnd: r + rowspan - 1, colEnd: col + colspan - 1, cell }
      placed.push(item)
      for (let rr = item.row; rr <= item.rowEnd; rr++) {
        for (let cc = item.col; cc <= item.colEnd; cc++) mark(rr, cc)
      }
      col += colspan
    }
  })
  return placed
}

function replaceRows(html: string, rows: string[]): string {
  let rowIndex = -1
  return html.replace(TR_BLOCK, () => rows[++rowIndex] ?? '')
}

function serializeRow(rowHtml: string, cells: ParsedCell[]): string {
  return rowHtml.replace(/(<tr\b[^>]*>)[\s\S]*?(<\/tr>)/i, (_m, open, close) => `${open}${serializeCells(cells)}${close}`)
}

export function setHtmlTableColumnWidth(html: string, col: number, px: number): string {
  if (col < 0) return html
  const width = `${clampPx(px, 24, 2000)}px`
  const rows = parseRows(html)
  const targets = new Set(
    placeCells(rows)
      .filter((p) => p.col <= col && p.colEnd >= col)
      .map((p) => p.cell),
  )
  if (!targets.size) return html
  return replaceRows(html, rows.map((row) => serializeRow(
    row.rowHtml,
    row.cells.map((cell) => targets.has(cell) ? { ...cell, open: setStyle(cell.open, 'width', width) } : cell),
  )))
}

function visualColumnCount(html: string): number {
  const rows = parseRows(html)
  return placeCells(rows).reduce((max, p) => Math.max(max, p.colEnd + 1), 0)
}

export function appendHtmlTableRow(html: string): string {
  const cols = Math.max(1, visualColumnCount(html))
  const row = `  <tr>${Array.from({ length: cols }, () => '<td></td>').join('')}</tr>`
  if (/<\/tbody>/i.test(html)) return html.replace(/<\/tbody>/i, `${row}\n</tbody>`)
  return html.replace(/<\/table>/i, `<tbody>\n${row}\n</tbody>\n</table>`)
}

export function appendHtmlTableColumn(html: string): string {
  return html.replace(TR_BLOCK, (rowHtml) => {
    const cell = /<th\b/i.test(rowHtml) ? '<th></th>' : '<td></td>'
    return rowHtml.replace(/<\/tr>/i, `${cell}</tr>`)
  })
}

function escapeCellText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function unescapeCellText(s: string): string {
  return s
    .replace(/<[^>]*>/g, '') // 去掉行内标签，取纯文本
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function anchorCellAt(rows: { cells: ParsedCell[] }[], row: number, col: number): ParsedCell | null {
  const target = placeCells(rows).find(
    (p) => p.row <= row && p.rowEnd >= row && p.col <= col && p.colEnd >= col,
  )
  return target?.cell ?? null
}

// 读取 HTML 表格中视觉坐标 (row, col) 处（含合并）单元格的纯文本内容
export function getHtmlTableCellText(html: string, row: number, col: number): string {
  const rows = parseRows(html)
  const cell = anchorCellAt(rows, row, col)
  return cell ? unescapeCellText(cell.inner).trim() : ''
}

// 把 HTML 表格中视觉坐标 (row, col) 处（含合并）单元格的内容改写为给定纯文本
export function setHtmlTableCellText(html: string, row: number, col: number, text: string): string {
  const rows = parseRows(html)
  const target = anchorCellAt(rows, row, col)
  if (!target) return html
  const inner = escapeCellText(text)
  return replaceRows(
    html,
    rows.map((r) => serializeRow(r.rowHtml, r.cells.map((c) => (c === target ? { ...c, inner } : c)))),
  )
}

export function mergeHtmlTableCells(
  html: string,
  rowStart: number,
  rowEnd: number,
  colStart: number,
  colEnd: number,
): string {
  const r1 = Math.min(rowStart, rowEnd)
  const r2 = Math.max(rowStart, rowEnd)
  const c1 = Math.min(colStart, colEnd)
  const c2 = Math.max(colStart, colEnd)
  if (r1 < 0 || c1 < 0 || (r1 === r2 && c1 === c2)) return html

  const rows = parseRows(html)
  const placed = placeCells(rows)
  const overlaps = placed.filter((p) => !(p.rowEnd < r1 || p.row > r2 || p.colEnd < c1 || p.col > c2))
  if (!overlaps.length) return html

  // 已有 rowspan/colspan 时，只允许完整覆盖单元格；半截选中会破坏表格拓扑，直接拒绝。
  if (overlaps.some((p) => p.row < r1 || p.rowEnd > r2 || p.col < c1 || p.colEnd > c2)) return html

  const topLeft = overlaps.find((p) => p.row === r1 && p.col === c1)
  if (!topLeft) return html
  const remove = new Set(overlaps.map((p) => p.cell))
  let changed = false
  const nextRows = rows.map((row) => {
    const kept: ParsedCell[] = []
    for (const cell of row.cells) {
      if (!remove.has(cell)) {
        kept.push(cell)
      } else if (cell === topLeft.cell) {
        let open = cell.open
        open = setSpanAttr(open, 'rowspan', r2 - r1 + 1)
        open = setSpanAttr(open, 'colspan', c2 - c1 + 1)
        // 合并后的单元格内容水平 + 垂直居中
        open = setStyle(open, 'text-align', 'center')
        open = setStyle(open, 'vertical-align', 'middle')
        kept.push({ ...cell, open })
        changed = true
      } else {
        changed = true
      }
    }
    return serializeRow(row.rowHtml, kept)
  })
  if (!changed) return html

  return replaceRows(html, nextRows)
}
