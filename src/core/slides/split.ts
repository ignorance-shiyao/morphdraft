// 把 Markdown 正文（已去 frontmatter）切成幻灯片。
// 顶层一行 `---` = 新横向页；一行 `--` = 同列纵向页。
export interface SlideTree {
  // 每个横向页是一列；列内可有多张纵向页
  columns: string[][]
}

export function splitSlides(body: string): SlideTree {
  const horizontal = splitByDelimiter(body, '---')
  return {
    columns: horizontal.map((h) => splitByDelimiter(h, '--')),
  }
}

function splitByDelimiter(text: string, delim: string): string[] {
  const lines = text.split('\n')
  const out: string[][] = [[]]
  for (const line of lines) {
    if (line.trim() === delim) out.push([])
    else out[out.length - 1].push(line)
  }
  return out.map((g) => g.join('\n').trim()).filter((s, i, arr) => s.length > 0 || arr.length === 1)
}
