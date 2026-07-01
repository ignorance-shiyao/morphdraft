import type MarkdownIt from 'markdown-it'

// 轻量容器（借鉴 Gamma 智能布局/标注框）：
//  标注框：:::note :::tip :::info :::success :::warning :::danger :::question :::caution :::important
//  卡片：:::card  / :::panel 标题（带标题头的面板卡，参考 PPT 设计稿）
//  布局：:::cols / :::col（N 列），:::timeline（时间线），:::steps（步骤）
//  PPT 组件：:::kpi（大数字统计卡网格）、:::gallery（图片网格）、:::process（横向编号流程）
//            :::matrix（2×2 风险矩阵，4 项列表按象限着色）、:::roadmap（横向阶段路线图）
//  折叠：:::details 摘要标题 ...（可折叠）
// 语法：单独一行 ":::kind [标题]" 开始，单独一行 ":::" 结束；支持嵌套（深度匹配）。

const CALLOUTS = new Set([
  'note', 'tip', 'info', 'success', 'warning', 'danger', 'question', 'caution', 'important',
])
const LAYOUTS = new Set([
    'cols', 'col', 'timeline', 'steps', 'kpi', 'gallery', 'process', 'matrix', 'roadmap',
])
const OPEN = /^:::\s*([a-z]+)(?:\s+(.+?))?\s*$/i
const ANY_OPEN = /^:::\s*[a-z]/i
const CLOSE = /^:::\s*$/

function isKnown(kind: string): boolean {
    return CALLOUTS.has(kind) || LAYOUTS.has(kind)
        || kind === 'card' || kind === 'panel' || kind === 'details' || kind === 'notes'
}

function classFor(kind: string): string {
  if (kind === 'cols') return 'cols'
  if (kind === 'col') return 'col'
  if (kind === 'timeline') return 'timeline'
  if (kind === 'steps') return 'steps'
    if (kind === 'kpi') return 'kpi-grid'
    if (kind === 'gallery') return 'gallery'
    if (kind === 'process') return 'process'
    if (kind === 'matrix') return 'matrix'
    if (kind === 'roadmap') return 'roadmap'
  if (kind === 'card') return 'callout callout-card'
    if (kind === 'panel') return 'callout callout-card panel'
  if (kind === 'notes') return 'speaker-notes'
  return `callout callout-${kind}`
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function containerPlugin(md: MarkdownIt) {
  md.block.ruler.before('fence', 'container', (state, startLine, endLine, silent) => {
    const start = state.bMarks[startLine] + state.tShift[startLine]
    const max = state.eMarks[startLine]
    const m = OPEN.exec(state.src.slice(start, max))
    if (!m) return false
    const kind = m[1].toLowerCase()
    if (!isKnown(kind)) return false
    if (silent) return true

    const title = (m[2] ?? '').trim()
    // 深度匹配：遇到任意 ":::xxx" 入栈，遇到 ":::" 出栈，深度归零处即为本容器的闭合
    let depth = 1
    let nextLine = startLine + 1
    let found = false
    for (; nextLine < endLine; nextLine++) {
      const s = state.bMarks[nextLine] + state.tShift[nextLine]
      const e = state.eMarks[nextLine]
      const ln = state.src.slice(s, e)
      if (ANY_OPEN.test(ln)) depth++
      else if (CLOSE.test(ln)) {
        depth--
        if (depth === 0) {
          found = true
          break
        }
      }
    }

    const oldParent = state.parentType
    const oldLineMax = state.lineMax
    // @ts-expect-error markdown-it 内部类型未导出 parentType 字符串
    state.parentType = 'container'
    state.lineMax = found ? nextLine : endLine

    const isDetails = kind === 'details'
    let token = state.push('container_open', isDetails ? 'details' : 'div', 1)
    token.attrSet('class', isDetails ? 'collapsible' : classFor(kind))
    token.map = [startLine, nextLine]
    // 风险矩阵坐标轴：:::matrix 可能性 | 影响 → data-x/data-y（CSS 用 attr() 渲染轴标签）
    if (kind === 'matrix' && title) {
      const [xAxis, yAxis] = title.split('|').map((s) => s.trim())
      if (xAxis) token.attrSet('data-x', xAxis)
      if (yAxis) token.attrSet('data-y', yAxis)
    }

    if (isDetails) {
      const sum = state.push('html_block', '', 0)
      sum.content = `<summary>${esc(title || '详情')}</summary>\n`
    } else if (kind === 'panel' && title) {
        // 面板卡标题头（参考 PPT 设计稿的「区域表现 / 方案评估」面板头）
        const head = state.push('html_block', '', 0)
        head.content = `<div class="panel-head">${esc(title)}</div>\n`
    }

    state.md.block.tokenize(state, startLine + 1, state.lineMax)

    token = state.push('container_close', isDetails ? 'details' : 'div', -1)

    state.parentType = oldParent
    state.lineMax = oldLineMax
    state.line = found ? nextLine + 1 : endLine
    return true
  })
}
