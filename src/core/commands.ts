// 命令面板的数据类型 + 轻量模糊匹配（子序列评分，无第三方依赖）。

export interface Command {
  id: string
  title: string
  subtitle?: string
  keywords?: string
  group: string
  run: () => void | Promise<void>
}

export interface Scored<T> {
  item: T
  score: number
  // 命中字符在 title 中的下标，用于高亮
  matches: number[]
}

// 子序列模糊评分：query 的字符需按序出现在 text 中。
// 连续命中、词首命中、靠前命中加分；返回 null 表示不匹配。
function score(query: string, text: string): { score: number; matches: number[] } | null {
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  if (!q) return { score: 0, matches: [] }
  let qi = 0
  let s = 0
  let prevIdx = -2
  const matches: number[] = []
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] !== q[qi]) continue
    matches.push(ti)
    let gain = 10
    if (ti === prevIdx + 1) gain += 12 // 连续
    if (ti === 0 || /[\s/_-]/.test(t[ti - 1])) gain += 8 // 词首
    gain += Math.max(0, 6 - ti) // 靠前
    s += gain
    prevIdx = ti
    qi++
  }
  if (qi < q.length) return null // 未全部命中
  s -= text.length * 0.1 // 越短越优先
  return { score: s, matches }
}

// 对一组命令按 query 过滤+排序。query 为空时按原序返回全部。
export function fuzzyFilter(
  items: Command[],
  query: string,
): Scored<Command>[] {
  const q = query.trim()
  if (!q) return items.map((item) => ({ item, score: 0, matches: [] }))
  const out: Scored<Command>[] = []
  for (const item of items) {
    const hay = item.title + (item.keywords ? ' ' + item.keywords : '')
    const r = score(q, hay)
    if (r) {
      // matches 只在 title 范围内保留，便于高亮
      const m = r.matches.filter((i) => i < item.title.length)
      out.push({ item, score: r.score, matches: m })
    }
  }
  out.sort((a, b) => b.score - a.score)
  return out
}
