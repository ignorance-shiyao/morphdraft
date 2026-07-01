// 计算每张「横向幻灯片」在编辑器中的起始绝对行号（与 splitSlides 的横向分页一一对应）。
// 用于幻灯片模式的双向定位：光标行 ↔ 幻灯片序号。
export function horizontalSlideStarts(src: string): number[] {
  const lines = src.split('\n')
  let i = 0
  // 跳过 frontmatter
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1)
    if (end !== -1) i = end + 1
  }
  const starts: number[] = []
  let start = -1 // 当前横向幻灯片第一行「有内容」的绝对行号
  for (; i < lines.length; i++) {
    const t = lines[i].trim()
    if (t === '---') {
      if (start >= 0) {
        starts.push(start)
        start = -1
      }
    } else if (t && start < 0) {
      start = i
    }
  }
  if (start >= 0) starts.push(start)
  return starts
}

// 计算每个「叶子页」（含纵向子页）的起始绝对行号，二维结构与 splitSlides 一致：
// columns[h][v] = 第 h 横向列、第 v 纵向页的第一行有内容的绝对行号。
// 用于 M4-1b：纵向多页时给每个内层 section 各记 startLine，卡片点选编辑才不会错行。
export function slideLeafStarts(src: string): number[][] {
  const lines = src.split('\n')
  let i = 0
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1)
    if (end !== -1) i = end + 1
  }
  const columns: number[][] = []
  let curCol: number[] = []
  let start = -1
  const flushLeaf = () => {
    if (start >= 0) { curCol.push(start); start = -1 }
  }
  const flushCol = () => {
    flushLeaf()
    if (curCol.length) { columns.push(curCol); curCol = [] }
  }
  for (; i < lines.length; i++) {
    const t = lines[i].trim()
    if (t === '---') flushCol()
    else if (t === '--') flushLeaf()
    else if (t && start < 0) start = i
  }
  flushCol()
  return columns
}

// 给定起始行数组与光标绝对行，返回所属幻灯片序号（找不到返回 -1）。
export function lineToSlideIndex(starts: number[], line: number): number {
  if (!starts.length) return -1
  let idx = 0
  for (let i = 0; i < starts.length; i++) {
    if (line >= starts[i]) idx = i
    else break
  }
  return idx
}

export function absoluteSlideSourceLine(
    startLine: number,
    directiveOffset: number,
    localLine: number,
    autoPageFirstLocal?: number,
): number {
    if (autoPageFirstLocal != null) return startLine + localLine - autoPageFirstLocal
    return startLine + directiveOffset + localLine
}
