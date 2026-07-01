export interface LineRange {
    start: number
    end: number
}

export interface InlineRange {
    from: number
    to: number
    source: string
}

export interface LocatedInlineRange extends InlineRange {
    line: number
}

export type InlineEditKind =
    | 'link'
    | 'image'
    | 'code'
    | 'math'
    | 'strong'
    | 'strongEmphasis'
    | 'emphasis'
    | 'strike'
    | 'mark'
    | 'underline'
    | 'kbd'
    | 'sub'
    | 'sup'
    | 'autoLink'

const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+/

export function blockEditRange(lines: string[], line: number): LineRange {
    const start = Math.max(0, Math.min(line, lines.length - 1))
    const first = lines[start] ?? ''
    if (/^#{1,6}\s+/.test(first) || /^([-*_])(?:\s*\1){2,}\s*$/.test(first)) {
        return {start, end: start}
    }

    const fence = first.match(/^(```|~~~)/)
    if (fence) return closedBlockRange(lines, start, (value) => value.startsWith(fence[1]))
    if (/^\s*\$\$/.test(first)) {
        if (first.trim().length > 4 && first.trim().endsWith('$$')) return {start, end: start}
        return closedBlockRange(lines, start, (value) => value.trim().endsWith('$$'))
    }

    const list = first.match(LIST_ITEM)
    if (list) {
        const indent = list[1].length
        let end = start
        while (end + 1 < lines.length) {
            const next = lines[end + 1]
            if (!next.trim() || LIST_ITEM.test(next)) break
            const nextIndent = next.match(/^\s*/)?.[0].length ?? 0
            if (nextIndent <= indent) break
            end++
        }
        return {start, end}
    }

    if (/^>\s?/.test(first)) {
        let end = start
        while (end + 1 < lines.length) {
            const next = lines[end + 1]
            if (!next.trim()) break
            if (/^>\s?/.test(next)) {
                end++
                continue
            }
            if (!isBlockBoundary(next)) {
                end++
                continue
            }
            break
        }
        return {start, end}
    }

    let end = start
    while (end + 1 < lines.length) {
        const next = lines[end + 1]
        if (!next.trim() || isBlockBoundary(next)) break
        end++
    }
    return {start, end}
}

export function fencedContentRange(lines: string[], range: LineRange): LineRange {
    if (!/^(```|~~~)/.test(lines[range.start] ?? '')) return range
    return {start: range.start + 1, end: range.end - 1}
}

export function fenceLanguageRange(line: string): InlineRange | null {
    const match = line.match(/^(```|~~~)([^\s{]*)/)
    if (!match) return null
    const from = match[1].length
    return {from, to: from + match[2].length, source: match[2]}
}

export function inlineEditRange(
    line: string,
    kind: InlineEditKind,
    visibleText: string,
    occurrence = 0,
): InlineRange | null {
    const pattern = inlinePattern(kind)
    let matchedOccurrence = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(line))) {
        const content = inlineMatchContent(kind, match)
        if (content.trim() !== visibleText.trim()) continue
        if (matchedOccurrence++ < occurrence) continue
        return {from: match.index, to: match.index + match[0].length, source: match[0]}
    }
    return null
}

export function findInlineEditRange(
    lines: string[],
    range: LineRange,
    kind: InlineEditKind,
    visibleText: string,
    occurrence = 0,
): LocatedInlineRange | null {
    let seen = 0
    for (let line = range.start; line <= range.end; line++) {
        const pattern = inlinePattern(kind)
        let match: RegExpExecArray | null
        while ((match = pattern.exec(lines[line] ?? ''))) {
            const content = inlineMatchContent(kind, match)
            if (content.trim() !== visibleText.trim()) continue
            if (seen++ < occurrence) continue
            return {
                line,
                from: match.index,
                to: match.index + match[0].length,
                source: match[0],
            }
        }
    }
    return null
}

function inlineMatchContent(kind: InlineEditKind, match: RegExpExecArray): string {
    if (kind === 'code') return match[2] ?? ''
    if (kind === 'autoLink') return match[0] ?? ''
    return match.slice(1).find((value) => value !== undefined) ?? ''
}

function inlinePattern(kind: InlineEditKind): RegExp {
    const patterns: Record<InlineEditKind, RegExp> = {
        link: /\[([^\]]+)]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
        image: /!\[([^\]]*)]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
        code: /(`+)([^`\n]+?)\1/g,
        math: /\$([^$\n]+)\$/g,
        // 粗斜体 ***x*** / ___x___ 作为整体编辑单元（须在 strong 之前匹配，避免被 ** 抢断）
        strongEmphasis: /\*\*\*([^*\n]+)\*\*\*|___([^_\n]+)___/g,
        strong: /\*\*([^*\n]+)\*\*|__([^_\n]+)__/g,
        emphasis: /(?<!\*)\*([^*\n]+)\*(?!\*)|(?<!_)_([^_\n]+)_(?!_)/g,
        strike: /~~([^~\n]+)~~/g,
        mark: /==([^=\n]+)==/g,
        underline: /<u>([^<\n]+)<\/u>|<ins>([^<\n]+)<\/ins>/gi,
        kbd: /<kbd>([^<\n]+)<\/kbd>/gi,
        sub: /(?<!~)~([^~\n]+)~(?!~)/g,
        sup: /(?<!\^)\^([^^\n]+)\^(?!\^)/g,
        autoLink: /https?:\/\/[^\s<>()]+/g,
    }
    return patterns[kind]
}

function closedBlockRange(lines: string[], start: number, closes: (line: string) => boolean): LineRange {
    for (let end = start + 1; end < lines.length; end++) {
        if (closes(lines[end])) return {start, end}
    }
    return {start, end: start}
}

function isBlockBoundary(line: string): boolean {
    return /^#{1,6}\s+/.test(line)
        || LIST_ITEM.test(line)
        || /^>\s?/.test(line)
        || /^```|^~~~|^:::/.test(line)
        || /^\s*\$\$/.test(line)
        || /^\s*\|/.test(line)
}
