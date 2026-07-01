import { PAPER_SIZES, MARGIN_PRESETS, type PaperSize, type PaperMargin } from '../paper'

const PXMM = 96 / 25.4

function marginScale(size: PaperSize) {
  return size === 'a6' ? 0.55 : size === 'a5' ? 0.78 : 1
}

export interface PageGroup {
  elements: HTMLElement[]
}

export interface TablePiece {
  el: HTMLTableElement
  height: number
}

interface TableSplit {
  pieces: TablePiece[]
  // 当前页剩余空间连「表头+首行」都放不下时为 true：整表应另起一页再拆，避免首段溢出
  firstOnNewPage: boolean
}

// 把超出一页的表格按行拆分成多个 <table>，表头（thead）在每一段都克隆保留一份。
// 行节点是「移动」而非克隆，原表格最终只剩第一段的行。
// firstBudget：表格在当前页剩余的可用高度；pageBudget：另起一页时的整页可用高度。
// 返回的 height 是各段的 border-box 高度（不含外边距），外边距由调用方按合并规则统一处理。
function splitTableRows(table: HTMLTableElement, firstBudget: number, pageBudget: number, zoom: number): TableSplit {
  const thead = table.querySelector(':scope > thead') as HTMLElement | null
  const tbody = table.querySelector(':scope > tbody') as HTMLElement | null
  const rows = tbody ? (Array.from(tbody.children) as HTMLElement[]) : []
  const fullHeight = table.getBoundingClientRect().height / zoom
  const single: TableSplit = { pieces: [{ el: table, height: fullHeight }], firstOnNewPage: false }
  if (!rows.length) return single

  const theadH = thead ? thead.getBoundingClientRect().height / zoom : 0
  const rowHeights = rows.map((r) => r.getBoundingClientRect().height / zoom)

  // 表头本身已经塞不满一整页，放弃拆分，按原样整体溢出（极端情况）
  if (pageBudget - theadH <= rowHeights[0]) return single

  // 当前页剩余装不下「表头+首行」，整表移到新页从头拆
  const onNewPage = firstBudget - theadH < rowHeights[0]
  const firstAvail = onNewPage ? pageBudget : firstBudget

  const pages: HTMLElement[][] = [[]]
  let pageIdx = 0
  let budget = firstAvail - theadH
  rows.forEach((row, i) => {
    const h = rowHeights[i]
    if (pages[pageIdx].length && h > budget) {
      pages.push([])
      pageIdx++
      budget = pageBudget - theadH
    }
    pages[pageIdx].push(row)
    budget -= h
  })
  if (pages.length === 1) return single

  const pageHeights = pages.map((rowsOnPage) =>
    theadH + rowsOnPage.reduce((sum, r) => sum + rowHeights[rows.indexOf(r)], 0),
  )

  // 打上同一个 split-id，方便重新分页前（设置变了但内容没变）把跨页片段拼回一张完整表格再重新拆分，
  // 否则下一次会把续页片段当成独立小表格，拆分边界没法跟着新的纸张/边距设置变化
  const splitId = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
  table.dataset.splitId = splitId

  const pieces: TablePiece[] = [{ el: table, height: pageHeights[0] }]
  for (let idx = 1; idx < pages.length; idx++) {
    const clone = table.cloneNode(false) as HTMLTableElement
    clone.dataset.splitId = splitId
    if (thead) clone.appendChild(thead.cloneNode(true))
    const newTbody = document.createElement('tbody')
    pages[idx].forEach((r) => newTbody.appendChild(r))
    clone.appendChild(newTbody)
    pieces.push({ el: clone, height: pageHeights[idx] })
  }
  return { pieces, firstOnNewPage: onNewPage }
}

// 把上次拆分留下的跨页表格片段拼回一张完整表格（按 data-split-id 分组合并 tbody 行，
// 续页片段自带的 thead 克隆直接丢弃）。在重新分页前调用，避免片段越拆越碎。
export function mergeSplitTables(container: HTMLElement) {
  const kids = Array.from(container.children) as HTMLElement[]
  let i = 0
  while (i < kids.length) {
    const id = (kids[i] as HTMLElement).dataset?.splitId
    if (!id) { i++; continue }
    const head = kids[i] as HTMLTableElement
    const headBody = head.querySelector(':scope > tbody')
    let j = i + 1
    while (j < kids.length && (kids[j] as HTMLElement).dataset?.splitId === id) {
      const frag = kids[j] as HTMLTableElement
      const fragBody = frag.querySelector(':scope > tbody')
      if (headBody && fragBody) {
        while (fragBody.firstChild) headBody.appendChild(fragBody.firstChild)
      }
      frag.remove()
      j++
    }
    delete head.dataset.splitId
    i = j
  }
}

interface BlockMetric {
  border: number // border-box 高度（不含外边距）
  mt: number     // margin-top
  mb: number     // margin-bottom
}

// 把渲染后的顶层块按纸张可用高度打包（供 DocumentPreview 预览分页与 PDF 导出共用）。
//
// 关键点：相邻块的外边距在排版时会「合并」(collapse)，块间真实间距 = max(上块 margin-bottom, 下块 margin-top)，
// 而不是两者相加；且页首块的 margin-top、页尾块的 margin-bottom 会被 CSS 归零。
// 因此这里按合并规则累加高度（而非简单 height+mt+mb 求和），避免把段落间距重复计算导致提前翻页、产生大片留白。
// 普通块整块不拆；超高的 <table> 按行拆分跨页并重复表头，尽量先填满当前页剩余空间再翻页。
export function paginateBlocks(
  container: HTMLElement,
  paperSize: PaperSize,
  paperMargin: PaperMargin,
  zoom = 1,
): PageGroup[] {
  const kids = Array.from(container.children) as HTMLElement[]
  if (!kids.length) return []

  const paper = PAPER_SIZES[paperSize]
  const m = MARGIN_PRESETS[paperMargin]
  const scale = marginScale(paperSize)
  const padXmm = m.x * scale
  const contentPx = (paper.heightMm - 2 * m.y * scale) * PXMM

  // 测量时把内容宽度收到「纸张内容宽」(= 纸宽 − 2×左右边距)，与最终 sheet 内宽一致
  const prevPadding = container.style.padding
  container.style.padding = `0 ${padXmm}mm`
  const metrics: BlockMetric[] = kids.map((k) => {
    const cs = getComputedStyle(k)
    return {
      border: k.getBoundingClientRect().height / zoom,
      mt: parseFloat(cs.marginTop || '0'),
      mb: parseFloat(cs.marginBottom || '0'),
    }
  })

  const groups: PageGroup[] = [{ elements: [] }]
  let acc = 0      // 当前页已用高度：各块 border-box + 已合并的块间间距，不含末块的 margin-bottom
  let prevMb = 0   // 当前页最后一个块的 margin-bottom（用于和下一块的 margin-top 合并）

  const curEmpty = () => groups[groups.length - 1].elements.length === 0
  function newPage() {
    groups.push({ elements: [] })
    acc = 0
    prevMb = 0
  }
  // topGap：本块与当前页上一块合并后的间距（页首为 0）
  function place(el: HTMLElement, border: number, mb: number, topGap: number) {
    groups[groups.length - 1].elements.push(el)
    acc += topGap + border
    prevMb = mb
  }

  kids.forEach((k, i) => {
    const { border, mt, mb } = metrics[i]
    const empty = curEmpty()
    const topGap = empty ? 0 : Math.max(prevMb, mt)
    const fits = empty ? border <= contentPx : acc + topGap + border <= contentPx

    // 放不下且是表格：按行拆，尽量先填满当前页剩余空间，减少翻页留白
    if (!fits && k.tagName === 'TABLE') {
      const remainder = empty ? contentPx : contentPx - acc - topGap
      const { pieces, firstOnNewPage } = splitTableRows(k as HTMLTableElement, remainder, contentPx, zoom)
      if (pieces.length > 1) {
        const moveFirst = firstOnNewPage && !empty
        if (moveFirst) newPage()
        place(pieces[0].el, pieces[0].height, pieces.length === 1 ? mb : 0, moveFirst ? 0 : topGap)
        for (let idx = 1; idx < pieces.length; idx++) {
          newPage()
          place(pieces[idx].el, pieces[idx].height, idx === pieces.length - 1 ? mb : 0, 0)
        }
        return
      }
      // 拆不动（极端）→ 落到下面整块处理
    }

    if (fits) {
      place(k, border, mb, topGap)
      return
    }

    // 放不下且不可拆：整块移到新页（当前页已空则就地放下，避免产生空白页）
    if (!empty) newPage()
    place(k, border, mb, 0)
  })

  container.style.padding = prevPadding
  return groups
}
