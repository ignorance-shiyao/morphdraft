// GFM 表格的解析 / 重新格式化 / 结构变换。纯函数，作用于「行数组」坐标
// （与 CodeMirror 文档行号一致，0 基）。不做所见即所得，始终回写 markdown 源。

export type Align = 'none' | 'left' | 'center' | 'right'

export interface TableModel {
  fromLine: number // 表格首行（表头）所在行，0 基，含
  toLine: number // 表格末行所在行，0 基，含
  header: string[]
  aligns: Align[]
  rows: string[][] // 正文行
}

const DELIM_CELL = /^\s*:?-{1,}:?\s*$/

// CJK 全角字符按 2 宽，便于源码里对齐美观
function cellWidth(s: string): number {
  let w = 0
  for (const ch of s) {
    w += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/.test(ch)
      ? 2
      : 1
  }
  return w
}

function pad(s: string, width: number, align: Align): string {
  const gap = Math.max(0, width - cellWidth(s))
  if (align === 'right') return ' '.repeat(gap) + s
  if (align === 'center') {
    const left = Math.floor(gap / 2)
    return ' '.repeat(left) + s + ' '.repeat(gap - left)
  }
  return s + ' '.repeat(gap)
}

// 一行 `| a | b |` → ['a','b']（去掉外侧竖线，trim 各格；支持转义 \|）
function splitRow(line: string): string[] {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|')) s = s.slice(0, -1)
  const cells: string[] = []
  let cur = ''
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') {
      cur += '\\|'
      i++
    } else if (s[i] === '|') {
      cells.push(cur.trim())
      cur = ''
    } else {
      cur += s[i]
    }
  }
  cells.push(cur.trim())
  return cells
}

function isTableLine(line: string): boolean {
  return line.includes('|') && line.trim() !== ''
}

function parseAligns(delimCells: string[]): Align[] {
  return delimCells.map((c) => {
    const t = c.trim()
    const l = t.startsWith(':')
    const r = t.endsWith(':')
    if (l && r) return 'center'
    if (r) return 'right'
    if (l) return 'left'
    return 'none'
  })
}

// 判断 cursorLine 是否落在某个 GFM 表格里，返回该表格的模型；否则 null。
export function detectTable(lines: string[], cursorLine: number): TableModel | null {
  if (cursorLine < 0 || cursorLine >= lines.length) return null
  if (!isTableLine(lines[cursorLine])) return null

  // 向上、向下扩张到连续的表格行
  let from = cursorLine
  while (from > 0 && isTableLine(lines[from - 1])) from--
  let to = cursorLine
  while (to < lines.length - 1 && isTableLine(lines[to + 1])) to++

  // 至少 表头 + 分隔行
  if (to - from < 1) return null
  const delimCells = splitRow(lines[from + 1])
  if (delimCells.length === 0 || !delimCells.every((c) => DELIM_CELL.test(c))) return null

  const header = splitRow(lines[from])
  const aligns = parseAligns(delimCells)
  const rows: string[][] = []
  for (let i = from + 2; i <= to; i++) rows.push(splitRow(lines[i]))

  // 规整列数：以表头列数为准
  const cols = header.length
  const fix = (r: string[]) => {
    const out = r.slice(0, cols)
    while (out.length < cols) out.push('')
    return out
  }
  while (aligns.length < cols) aligns.push('none')
  return {
    fromLine: from,
    toLine: to,
    header: fix(header),
    aligns: aligns.slice(0, cols),
    rows: rows.map(fix),
  }
}

// 把模型重新格式化为对齐美观的 markdown 行
export function formatTable(m: TableModel): string[] {
  const cols = m.header.length
  const widths: number[] = []
  for (let c = 0; c < cols; c++) {
    let w = cellWidth(m.header[c] ?? '')
    for (const r of m.rows) w = Math.max(w, cellWidth(r[c] ?? ''))
    widths[c] = Math.max(3, w)
  }
  // 以表头列数为准，防止 aligns/rows 长度不一致导致分隔行多列
  const headerLine =
    '| ' + m.header.map((h, c) => pad(h, widths[c], m.aligns[c] ?? 'none')).join(' | ') + ' |'
  const delimLine =
    '| ' +
    m.header
      .map((_h, c) => {
        const w = widths[c]
        const a = m.aligns[c] ?? 'none'
        if (a === 'center') return ':' + '-'.repeat(w - 2) + ':'
        if (a === 'right') return '-'.repeat(w - 1) + ':'
        if (a === 'left') return ':' + '-'.repeat(w - 1)
        return '-'.repeat(w)
      })
      .join(' | ') +
    ' |'
  const bodyLines = m.rows.map(
    (r) => '| ' + r.map((cell, c) => pad(cell ?? '', widths[c], m.aligns[c])).join(' | ') + ' |',
  )
  return [headerLine, delimLine, ...bodyLines]
}

// ---- 结构变换（返回新模型；bodyIndex = -1 表示作用于表头那一段）----

export function insertRow(m: TableModel, afterBodyIndex: number): TableModel {
  const empty = new Array(m.header.length).fill('')
  const rows = m.rows.slice()
  rows.splice(afterBodyIndex + 1, 0, empty)
  return { ...m, rows }
}

export function deleteRow(m: TableModel, bodyIndex: number): TableModel {
  if (bodyIndex < 0 || bodyIndex >= m.rows.length) return m
  const rows = m.rows.slice()
  rows.splice(bodyIndex, 1)
  return { ...m, rows }
}

export function insertCol(m: TableModel, at: number): TableModel {
  const header = m.header.slice()
  header.splice(at, 0, '列')
  const aligns = m.aligns.slice()
  aligns.splice(at, 0, 'none')
  const rows = m.rows.map((r) => {
    const nr = r.slice()
    nr.splice(at, 0, '')
    return nr
  })
  return { ...m, header, aligns, rows }
}

export function deleteCol(m: TableModel, at: number): TableModel {
  if (m.header.length <= 1) return m
  const header = m.header.slice()
  header.splice(at, 1)
  const aligns = m.aligns.slice()
  aligns.splice(at, 1)
  const rows = m.rows.map((r) => {
    const nr = r.slice()
    nr.splice(at, 1)
    return nr
  })
  return { ...m, header, aligns, rows }
}

export function setColAlign(m: TableModel, at: number, align: Align): TableModel {
  const aligns = m.aligns.slice()
  aligns[at] = align
  return { ...m, aligns }
}

// M2：预览侧单元格原地编辑。bodyIndex=-1 表示表头。
export function setCellText(m: TableModel, bodyIndex: number, col: number, text: string): TableModel {
  if (col < 0 || col >= m.header.length) return m
  if (bodyIndex < 0) {
    const header = m.header.slice()
    header[col] = text
    return { ...m, header }
  }
  if (bodyIndex >= m.rows.length) return m
  const rows = m.rows.map((r) => r.slice())
  rows[bodyIndex][col] = text
  return { ...m, rows }
}

// O3：上下移动正文行（bodyIndex<0 表头不参与移动；越界视为 no-op）
export function moveRow(m: TableModel, bodyIndex: number, dir: -1 | 1): TableModel {
  const target = bodyIndex + dir
  if (bodyIndex < 0 || bodyIndex >= m.rows.length || target < 0 || target >= m.rows.length) return m
  const rows = m.rows.slice()
  ;[rows[bodyIndex], rows[target]] = [rows[target], rows[bodyIndex]]
  return { ...m, rows }
}

// O3：左右移动整列（header + aligns + 各 row 同步）
export function moveCol(m: TableModel, at: number, dir: -1 | 1): TableModel {
  const target = at + dir
  const n = m.header.length
  if (at < 0 || at >= n || target < 0 || target >= n) return m
  const swap = <T>(arr: T[]): T[] => {
    const next = arr.slice()
    ;[next[at], next[target]] = [next[target], next[at]]
    return next
  }
  return {
    ...m,
    header: swap(m.header),
    aligns: swap(m.aligns),
    rows: m.rows.map((r) => swap(r)),
  }
}

// O3：把表格序列化为可粘贴的格式
//   - 'tsv'：制表符分隔（粘到 Excel/Numbers/Sheets 即识别为表格）
//   - 'markdown'：标准 GFM 表格源码
//   - 'csv'：逗号分隔，含 " 转义
export function tableToTsv(m: TableModel): string {
  const enc = (s: string) => s.replace(/\t/g, ' ').replace(/\r?\n/g, ' ')
  return [m.header.map(enc).join('\t'), ...m.rows.map((r) => r.map((c) => enc(c ?? '')).join('\t'))].join('\n')
}
export function tableToCsv(m: TableModel): string {
  const enc = (s: string) => {
    const v = (s ?? '').replace(/\r?\n/g, ' ')
    return /[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
  }
  return [m.header.map(enc).join(','), ...m.rows.map((r) => r.map((c) => enc(c ?? '')).join(','))].join('\n')
}
export function tableToMarkdown(m: TableModel): string {
  return formatTable(m).join('\n')
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function renderInlineCell(s: string): string {
  return escapeHtml(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/==([^=]+)==/g, '<mark>$1</mark>')
    .replace(/&lt;u&gt;([\s\S]*?)&lt;\/u&gt;/g, '<u>$1</u>')
    .replace(/&lt;kbd&gt;([\s\S]*?)&lt;\/kbd&gt;/g, '<kbd>$1</kbd>')
    .replace(/~([^~\s]+)~/g, '<sub>$1</sub>')
    .replace(/\^([^^\s]+)\^/g, '<sup>$1</sup>')
}

function alignStyle(align: Align): string {
  if (align === 'left') return ' style="text-align:left"'
  if (align === 'center') return ' style="text-align:center"'
  if (align === 'right') return ' style="text-align:right"'
  return ''
}

// HTML table 是预览侧高级表格编辑的持久化格式：
// GFM 管道表无法表达列宽/行高/rowspan/colspan，复杂编辑需要先升级为安全 HTML 表格。
export function tableToHtml(m: TableModel): string {
  const th = m.header
    .map((cell, c) => `<th${alignStyle(m.aligns[c] ?? 'none')}>${renderInlineCell(cell ?? '')}</th>`)
    .join('')
  const rows = m.rows
    .map((row) => {
      const cells = m.header
        .map((_h, c) => `<td${alignStyle(m.aligns[c] ?? 'none')}>${renderInlineCell(row[c] ?? '')}</td>`)
        .join('')
      return `  <tr>${cells}</tr>`
    })
    .join('\n')
  return `<table>\n<thead>\n  <tr>${th}</tr>\n</thead>\n<tbody>\n${rows}\n</tbody>\n</table>`
}

// 生成空表（含表头），供「插入表格」用
export function makeEmptyTable(rows: number, cols: number): string {
  const header: string[] = []
  for (let c = 0; c < cols; c++) header.push(`列${c + 1}`)
  const body: string[][] = []
  for (let r = 0; r < rows; r++) body.push(new Array(cols).fill(''))
  return formatTable({ fromLine: 0, toLine: 0, header, aligns: new Array(cols).fill('none'), rows: body }).join('\n')
}

// 根据光标列位置算它落在第几列（0 基）
export function colAtChar(line: string, ch: number): number {
  let col = 0
  let started = false
  for (let i = 0; i < ch && i < line.length; i++) {
    if (line[i] === '\\' && line[i + 1] === '|') {
      i++
      continue
    }
    if (line[i] === '|') {
      if (started) col++
      else started = true // 第一个 | 是外侧竖线，不计
    }
  }
  return Math.max(0, col)
}

export function resolveTableContext(
  lines: string[],
  lineIndex: number,
  charIndex: number,
): { model: TableModel; col: number; bodyIndex: number } | null {
  const model = detectTable(lines, lineIndex)
  const line = lines[lineIndex]
  if (!model || line === undefined) return null
  const col = Math.min(colAtChar(line, charIndex), model.header.length - 1)
  const rel = lineIndex - model.fromLine
  return {
    model,
    col,
    bodyIndex: rel >= 2 ? rel - 2 : -1,
  }
}
