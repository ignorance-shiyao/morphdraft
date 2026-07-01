export interface OutlineItem {
  level: number
  text: string
  line: number // 绝对行号（0 基，对应编辑器行）
}

// 解析标题生成大纲：跳过 frontmatter 与代码围栏内部。
export function parseOutline(src: string): OutlineItem[] {
  const lines = src.split('\n')
  let bodyStart = 0
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1)
    if (end !== -1) bodyStart = end + 1
  }
  const out: OutlineItem[] = []
  let inFence = false
  for (let n = 0; n < lines.length; n++) {
    const ln = lines[n]
    if (/^\s*(```|~~~)/.test(ln)) {
      inFence = !inFence
      continue
    }
    if (inFence || n < bodyStart) continue
    const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(ln)
    if (m) {
      out.push({
        level: m[1].length,
        text: m[2].replace(/[`*_]/g, '').trim(),
        line: n,
      })
    }
  }
  return out
}
