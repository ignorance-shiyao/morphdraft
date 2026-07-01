// U4：任务列表交互的纯逻辑——切换某行复选框状态，并把所在「同级任务块」自动排序
// （未完成在前、已完成在后，稳定排序）。预览只负责把点击映射到源码行后调用本函数。

const TASK_RE = /^(\s*)([-*+])\s\[([ xX])\]\s/

export interface TaskLineInfo {
  indent: string
  marker: string
  checked: boolean
}

export function parseTaskLine(line: string): TaskLineInfo | null {
  const m = TASK_RE.exec(line)
  if (!m) return null
  return { indent: m[1], marker: m[2], checked: m[3].toLowerCase() === 'x' }
}

function setChecked(line: string, checked: boolean): string {
  return line.replace(TASK_RE, (_full, indent: string, marker: string) =>
    `${indent}${marker} [${checked ? 'x' : ' '}] `,
  )
}

// 一个顶层任务项 = 该任务行 + 其后所有缩进更深的从属行（子任务/续行）。
interface TaskUnit {
  startLine: number
  lines: string[]
  checked: boolean
}

function editTaskBlock(markdown: string, line: number, checked?: boolean): string {
  const lines = markdown.split('\n')
  if (line < 0 || line >= lines.length) return markdown
  const target = parseTaskLine(lines[line])
  if (!target) return markdown
  const base = target.indent.length

  if (checked != null) lines[line] = setChecked(lines[line], checked)

  // 判断某行是否属于「基准任务块」：同缩进任务项 = 块成员起点；更深缩进 = 从属行。
  const isBaseItem = (i: number): boolean => {
    const info = parseTaskLine(lines[i])
    return !!info && info.indent.length === base
  }
  const isChildOf = (i: number): boolean => {
    const raw = lines[i]
    if (raw.trim() === '') return false // 空行视为块边界
    const lead = raw.length - raw.trimStart().length
    return lead > base
  }

  // 向上找块起点
  let start = line
  while (start - 1 >= 0 && (isBaseItem(start - 1) || isChildOf(start - 1))) start--
  // 向下找块终点
  let end = line
  while (end + 1 < lines.length && (isBaseItem(end + 1) || isChildOf(end + 1))) end++

  // 块内必须以基准任务项开头（否则不动，避免误伤）
  if (!isBaseItem(start)) return lines.join('\n')

  // 切成顶层单元
  const units: TaskUnit[] = []
  let cur: TaskUnit | null = null
  for (let i = start; i <= end; i++) {
    if (isBaseItem(i)) {
      cur = { startLine: i, lines: [lines[i]], checked: parseTaskLine(lines[i])!.checked }
      units.push(cur)
    } else if (cur) {
      cur.lines.push(lines[i])
    } else {
      // 块起点之前的非任务行（理论上不会发生，因 start 已校验）——原样保留
      return lines.join('\n')
    }
  }

  // 稳定排序：未完成(false) 在前，已完成(true) 在后
  const sorted = units
    .map((u, idx) => ({ u, idx }))
    .sort((a, b) => Number(a.u.checked) - Number(b.u.checked) || a.idx - b.idx)
    .flatMap((x) => x.u.lines)

  return [...lines.slice(0, start), ...sorted, ...lines.slice(end + 1)].join('\n')
}

// 切换 line 行的勾选态，并对其所在「同级任务块」排序后返回新 markdown。
// 同级块：以 line 的缩进为基准，向上下扩展的、连续的同缩进任务项（含各自从属行）。
export function toggleTaskAndSort(markdown: string, line: number): string {
  const target = parseTaskLine(markdown.split('\n')[line] ?? '')
  if (!target) return markdown
  return editTaskBlock(markdown, line, !target.checked)
}

export function setTaskCheckedAndSort(markdown: string, line: number, checked: boolean): string {
  return editTaskBlock(markdown, line, checked)
}

export function sortTaskBlock(markdown: string, line: number): string {
  return editTaskBlock(markdown, line)
}
