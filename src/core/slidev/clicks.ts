// Slidev 点击动画（<v-click> / <v-clicks>）的应用内移植。
// html:false 下原生标签会被吞，故按「整行标记」切段：把 <v-click>/<v-clicks> 开闭标记单独成行解析，
// 分段渲染后给点击组加 .fragment —— reveal.js 原生识别 .fragment 逐步显示，SlidesHandle.step() 已复用。
//
// 支持：
//   <v-click> … </v-click>      整组作为「一次点击」出现（同 data-fragment-index 同时显示）
//   <v-clicks> … </v-clicks>    包列表时每个 <li> 各点击一次；否则整组一次点击
// 暂不支持 at=/depth= 等高级参数（后续按需）。

export type RenderMd = (src: string) => string

interface ClickNode {
  type: 'text' | 'click' | 'clicks'
  md: string
}

const OPEN_CLICKS = /^<v-clicks\b[^>]*>$/
const CLOSE_CLICKS = /^<\/v-clicks>$/
const OPEN_CLICK = /^<v-click\b[^>]*>$/
const CLOSE_CLICK = /^<\/v-click>$/

// 把内容按整行标记切成节点序列。未闭合/嵌套从简：遇到开标记进入对应组，遇到闭标记结束当前组。
export function parseClicks(content: string): ClickNode[] {
  const nodes: ClickNode[] = []
  const lines = content.split('\n')
  let cur: ClickNode | null = null
  const flushText = (buf: string[]) => {
    const md = buf.join('\n').trim()
    if (md) nodes.push({ type: 'text', md })
  }
  let textBuf: string[] = []
  for (const line of lines) {
    const t = line.trim()
    if (cur) {
      if ((cur.type === 'clicks' && CLOSE_CLICKS.test(t)) || (cur.type === 'click' && CLOSE_CLICK.test(t))) {
        cur.md = cur.md.trim()
        nodes.push(cur)
        cur = null
        continue
      }
      cur.md += (cur.md ? '\n' : '') + line
      continue
    }
    if (OPEN_CLICKS.test(t)) { flushText(textBuf); textBuf = []; cur = { type: 'clicks', md: '' }; continue }
    if (OPEN_CLICK.test(t)) { flushText(textBuf); textBuf = []; cur = { type: 'click', md: '' }; continue }
    textBuf.push(line)
  }
  if (cur) { cur.md = cur.md.trim(); nodes.push(cur) } // 容错：未闭合也收尾
  flushText(textBuf)
  return nodes
}

// 给一段 HTML 里的顶层 <li> 加 .fragment（v-clicks 包列表时逐项点击）。无嵌套深度处理（首版）。
function markListItems(html: string): { html: string; matched: boolean } {
  let matched = false
  const out = html.replace(/<li(\s[^>]*)?>/g, (m, attrs: string | undefined) => {
    matched = true
    if (attrs && /class\s*=/.test(attrs)) {
      return m.replace(/class\s*=\s*"([^"]*)"/, 'class="$1 fragment"')
    }
    return `<li${attrs ?? ''} class="fragment">`
  })
  return { html: out, matched }
}

export function hasClicks(content: string): boolean {
  return content.split('\n').some((l) => {
    const t = l.trim()
    return OPEN_CLICKS.test(t) || OPEN_CLICK.test(t)
  })
}

// 点击感知渲染：把切好的段落各自渲染并对点击组加 .fragment。
export function renderClickAware(content: string, md: RenderMd): string {
  const nodes = parseClicks(content)
  // 无任何点击标记 → 原样整段渲染（不改变既有行为）
  if (nodes.every((n) => n.type === 'text')) return md(content)
  return nodes.map((n) => {
    if (n.type === 'text') return md(n.md)
    if (n.type === 'click') return `<div class="fragment slidev-click">${md(n.md)}</div>`
    // clicks：包列表则逐项 fragment；否则整组一次
    const rendered = md(n.md)
    const { html, matched } = markListItems(rendered)
    return matched ? html : `<div class="fragment slidev-clicks">${rendered}</div>`
  }).join('\n')
}
