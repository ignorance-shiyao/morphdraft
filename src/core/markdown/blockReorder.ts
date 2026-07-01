// 页内块拖拽重排：把源码里某个顶层块移动到另一个块的位置。
// 块之间以空行分隔，移动时维护单个空行间距。
// 注意：blockEditRange 是「编辑单元」（表格只取一行），重排需要「整块」，故这里自带 blockRange。

interface Range {
    start: number;
    end: number
}

const FENCE = /^\s*(```|~~~)/
const CONTAINER_OPEN = /^:::\s*[a-z]/i
const CONTAINER_CLOSE = /^:::\s*$/

// 整块范围：围栏→闭合；::: 容器→按深度配对闭合；标题/分隔线→单行；其余→连续非空行（整表/整段/整列表）。
export function blockRange(lines: string[], start: number): Range {
    const first = lines[start] ?? ''
    if (/^#{1,6}\s/.test(first) || /^([-*_])(?:\s*\1){2,}\s*$/.test(first.trim())) return {start, end: start}

    const fence = first.match(FENCE)
    if (fence) {
        for (let i = start + 1; i < lines.length; i++) {
            if (lines[i].trimStart().startsWith(fence[1])) return {start, end: i}
        }
        return {start, end: lines.length - 1}
    }

    if (CONTAINER_OPEN.test(first)) {
        let depth = 1
        for (let i = start + 1; i < lines.length; i++) {
            if (CONTAINER_OPEN.test(lines[i])) depth++
            else if (CONTAINER_CLOSE.test(lines[i])) {
                depth--;
                if (depth === 0) return {start, end: i}
            }
        }
        return {start, end: lines.length - 1}
    }

    let end = start
    while (end + 1 < lines.length && lines[end + 1].trim() !== '') end++
    return {start, end}
}

// 把 fromLine 所在块移动到 toLine 所在块的位置。
// placeAfter：插到目标块之后(true)/之前(false)；省略时默认「向下移→之后，向上移→之前」。
// 行号均为「相对喂入 markdown 的 0 基绝对行号」。落在同一块内或非法则原样返回。
export function moveBlockByLine(
    markdown: string, fromLine: number, toLine: number, placeAfter?: boolean,
): string {
    const lines = markdown.split('\n')
    if (fromLine < 0 || toLine < 0 || fromLine >= lines.length || toLine >= lines.length) return markdown

    const from = blockRange(lines, fromLine)
    const to = blockRange(lines, toLine)
    // 目标落在被拖块自身范围内 → 无操作
    if (toLine >= from.start && toLine <= from.end) return markdown

    const block = lines.slice(from.start, from.end + 1)

    // 移除被拖块；若其后紧跟一个空行，一并移除以免堆积空行
    let removeEnd = from.end
    if (lines[removeEnd + 1] === '') removeEnd += 1
    const removedCount = removeEnd - from.start + 1
    const without = [...lines.slice(0, from.start), ...lines.slice(removeEnd + 1)]

    // 目标块在被移除区之后则索引左移；据 placeAfter 决定插到目标块前/后
    const afterRemoved = to.start > from.end
    const tStart = afterRemoved ? to.start - removedCount : to.start
    const tEnd = afterRemoved ? to.end - removedCount : to.end
    const place = placeAfter ?? afterRemoved
    let insertAt = place ? tEnd + 1 : tStart
    insertAt = Math.max(0, Math.min(insertAt, without.length))

    const out = [
        ...without.slice(0, insertAt),
        '',
        ...block,
        '',
        ...without.slice(insertAt),
    ]
    // 收尾：合并连续 3+ 空行为 1 个空行，去掉首尾多余空行
    return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\n+$/, '')
}
