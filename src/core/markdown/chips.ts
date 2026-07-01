// 设计稿组件内联语法（药丸/进度条），参考 ppt-mixed-layouts 表格里的状态标签与进度。
// 语法（行内，可用在表格单元格、列表、正文）：
//   ((完成))                 中性药丸
//   ((green:完成)) ((red:风险)) ((blue:进行中)) ((amber:待定)) ((gray:暂停)) ((primary:重点))
//   ((bar:75))               迷你进度条
//   ((bar:75:品牌焕新))       带标签的进度条（标签 + 条 + 百分比）
//   ((spark:3,5,2,8,6))       迷你折线（sparkline，适合表格单元格）
// 渲染期生成 HTML → 预览 / 幻灯片 / 导出（html/docx/公众号）一致生效。

import type MarkdownIt from 'markdown-it'

const RE = /\(\(\s*([^()]+?)\s*\)\)/g
const COLORS = new Set(['green', 'red', 'blue', 'amber', 'gray', 'primary'])

// 一串数字 → 迷你折线 SVG（归一化到 viewBox，末点加圆点）
function buildSpark(nums: number[]): string {
    const W = 100, H = 24, pad = 3
    const min = Math.min(...nums), max = Math.max(...nums)
    const span = max - min || 1
    const xy = nums.map((n, i) => {
        const x = pad + (W - 2 * pad) * (nums.length === 1 ? 0 : i / (nums.length - 1))
        const y = pad + (H - 2 * pad) * (1 - (n - min) / span)
        return [x, y] as const
    })
    const pts = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
    const [lx, ly] = xy[xy.length - 1]
    return (
        `<span class="ui-spark"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">` +
        `<polyline points="${pts}"/><circle class="ui-spark-dot" cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="2"/>` +
        `</svg></span>`
    )
}

function renderChip(inner: string, esc: (s: string) => string): string | null {
    // 进度条：bar:NN 或 bar:NN:标签
    const bar = /^bar:\s*(\d{1,3})(?::\s*(.+))?$/i.exec(inner)
    if (bar) {
        const pct = Math.max(0, Math.min(100, Number(bar[1])))
        const label = bar[2]?.trim()
        const labelHtml = label ? `<span class="ui-bar-label">${esc(label)}</span>` : ''
        return (
            `<span class="ui-bar">${labelHtml}` +
            `<span class="ui-bar-track"><span class="ui-bar-fill" style="width:${pct}%"></span></span>` +
            `<span class="ui-bar-pct">${pct}%</span></span>`
        )
    }
    // 迷你折线：spark:逗号分隔数字
    const spark = /^spark:\s*([\d.,\s-]+)$/i.exec(inner)
    if (spark) {
        const nums = spark[1].split(',').map((s) => parseFloat(s.trim())).filter((n) => Number.isFinite(n))
        if (nums.length >= 2) return buildSpark(nums)
    }
    // 彩色药丸：color:文本
    const colored = /^([a-z]+):\s*(.+)$/i.exec(inner)
    if (colored && COLORS.has(colored[1].toLowerCase())) {
        return `<span class="pill pill-${colored[1].toLowerCase()}">${esc(colored[2].trim())}</span>`
    }
    // 中性药丸
    return `<span class="pill">${esc(inner)}</span>`
}

export function chipsPlugin(md: MarkdownIt) {
    const esc = (s: string) => md.utils.escapeHtml(s)
    md.core.ruler.push('chips', (state) => {
        for (const tok of state.tokens) {
            if (tok.type !== 'inline' || !tok.children) continue
            for (let i = 0; i < tok.children.length; i++) {
                const child = tok.children[i]
                if (child.type !== 'text' || !child.content.includes('((')) continue

                // 逐个匹配直接拼 token（避免对含嵌套 span 的进度条做事后正则切分）
                const text = child.content
                RE.lastIndex = 0
                const newTokens: typeof tok.children = []
                let last = 0
                let m: RegExpExecArray | null
                while ((m = RE.exec(text))) {
                    const out = renderChip(m[1], esc)
                    if (!out) continue
                    if (m.index > last) {
                        const t = new state.Token('text', '', 0)
                        t.content = text.slice(last, m.index)
                        newTokens.push(t)
                    }
                    const h = new state.Token('html_inline', '', 0)
                    h.content = out
                    newTokens.push(h)
                    last = m.index + m[0].length
                }
                if (!newTokens.length) continue
                if (last < text.length) {
                    const t = new state.Token('text', '', 0)
                    t.content = text.slice(last)
                    newTokens.push(t)
                }
                tok.children.splice(i, 1, ...newTokens)
                i += newTokens.length - 1
            }
        }
    })
}
