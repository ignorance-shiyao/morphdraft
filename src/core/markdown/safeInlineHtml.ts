import type MarkdownIt from 'markdown-it'

type InlineRule = Parameters<MarkdownIt['inline']['ruler']['before']>[2]
type InlineState = Parameters<InlineRule>[0]
type BlockRule = Parameters<MarkdownIt['block']['ruler']['before']>[2]
type BlockState = Parameters<BlockRule>[0]

const SAFE_TAG = /^<\/?(?:u|ins|kbd)>|^<img\b[^>]*\/?>/i
const TABLE_TAGS = new Set([
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'code', 'strong', 'em', 'del', 's', 'mark', 'u', 'ins', 'kbd', 'sub', 'sup',
])
const TABLE_BLOCK_START = /^\s*<table(?:\s[^>]*)?>/i
const TABLE_BLOCK_END = /<\/table>\s*$/i

function safeInlineHtml(state: InlineState, silent: boolean): boolean {
    if (state.src.charCodeAt(state.pos) !== 0x3c /* < */) return false
    const match = state.src.slice(state.pos).match(SAFE_TAG)
    if (!match) return false
    const raw = match[0]
    const tagMatch = raw.match(/^<\s*(\/?)([a-zA-Z0-9-]+)([^>]*)>/)
    if (!tagMatch) return false
    const tag = tagMatch[2].toLowerCase()
    const closing = !!tagMatch[1]
    if (tag === 'img' && closing) return false
    const content = tag === 'img'
        ? (() => {
            const attrs = cleanAttrs('img', tagMatch[3] ?? '')
            return attrs.includes('src=') ? `<img${attrs}>` : ''
        })()
        : raw.toLowerCase()
    if (!content) return false

    if (!silent) {
        const token = state.push('html_inline', '', 0)
        token.content = content
    }
    state.pos += raw.length
    return true
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
}

function cleanStyle(value: string): string {
    const out: string[] = []
    for (const raw of value.split(';')) {
        const idx = raw.indexOf(':')
        if (idx < 0) continue
        const name = raw.slice(0, idx).trim().toLowerCase()
        const v = raw.slice(idx + 1).trim()
        if (!name || !v) continue
        if (/^(width|height|min-width|max-width|min-height|max-height)$/.test(name)) {
            if (/^\d{1,4}(\.\d{1,2})?(px|%)$/.test(v)) out.push(`${name}:${v}`)
        } else if (name === 'text-align') {
            if (/^(left|center|right)$/.test(v)) out.push(`${name}:${v}`)
        } else if (name === 'vertical-align') {
            // 合并单元格垂直居中
            if (/^(top|middle|bottom)$/.test(v)) out.push(`${name}:${v}`)
        } else if (name === 'display') {
            // 图片对齐需要块级展示
            if (/^(block|inline-block|inline)$/.test(v)) out.push(`${name}:${v}`)
        } else if (name === 'margin-left' || name === 'margin-right') {
            // 图片左/中/右对齐：margin auto + 0
            if (/^(auto|0|\d{1,4}px)$/.test(v)) out.push(`${name}:${v}`)
        } else if (name === 'border-radius') {
            if (/^\d{1,3}(px|%)$/.test(v)) out.push(`${name}:${v}`)
        } else if (name === 'box-shadow') {
            // 仅放行由数字/颜色/空格组成的安全阴影值（不含 url()/表达式）
            if (/^[0-9a-z .,()%+-]+$/i.test(v) && !/url|expression|javascript|image-set/i.test(v)) out.push(`${name}:${v}`)
        }
    }
    return out.join(';')
}

function cleanUrl(value: string): string | null {
    const s = value.trim()
    const lower = s.toLowerCase()
    if (/^(?:javascript|vbscript|file):/.test(lower)) return null
    if (lower.startsWith('data:') && !/^data:image\/(?:png|jpe?g|gif|webp|svg\+xml|avif|bmp);/i.test(s)) return null
    return s
}

function cleanAttrs(tag: string, raw: string): string {
    const attrs: string[] = []
    raw.replace(/\s([a-zA-Z:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g, (_m, nameRaw, dq, sq, bare) => {
        const name = String(nameRaw).toLowerCase()
        const value = String(dq ?? sq ?? bare ?? '')
        if (tag === 'img' && name === 'src') {
            const url = cleanUrl(value)
            if (url) attrs.push(`src="${escapeHtml(url)}"`)
        } else if (tag === 'img' && (name === 'alt' || name === 'title')) {
            attrs.push(`${name}="${escapeHtml(value)}"`)
        } else if (tag === 'img' && name === 'style') {
            const style = cleanStyle(value)
            if (style) attrs.push(`style="${style}"`)
        } else if ((tag === 'td' || tag === 'th') && (name === 'rowspan' || name === 'colspan') && /^(?:[1-9]|[1-9]\d)$/.test(value)) {
            attrs.push(`${name}="${value}"`)
        } else if ((tag === 'td' || tag === 'th') && name === 'style') {
            const style = cleanStyle(value)
            if (style) attrs.push(`style="${style}"`)
        } else if (tag === 'table' && name === 'data-source-line' && /^\d+$/.test(value)) {
            attrs.push(`${name}="${value}"`)
        }
        return ''
    })
    return attrs.length ? ` ${attrs.join(' ')}` : ''
}

export function sanitizeTableHtml(source: string, sourceLine?: number): string | null {
    if (!TABLE_BLOCK_START.test(source) || !TABLE_BLOCK_END.test(source)) return null
    if (/<(?:script|iframe|object|embed|style|link|meta)\b/i.test(source)) return null
    if (/\son[a-z]+\s*=/i.test(source)) return null

    let sawTableOpen = false
    const sanitized = source.replace(/<[^>]*>/g, (tagText) => {
        const match = tagText.match(/^<\/?\s*([a-zA-Z0-9-]+)([^>]*)>$/)
        if (!match) return escapeHtml(tagText)
        const closing = /^<\s*\//.test(tagText)
        const tag = match[1].toLowerCase()
        if (!TABLE_TAGS.has(tag)) return escapeHtml(tagText)
        if (closing) return `</${tag}>`
        const attrs = cleanAttrs(tag, match[2] ?? '')
        if (tag === 'table') {
            sawTableOpen = true
            if (attrs.includes('data-source-line=') || sourceLine == null) return `<table${attrs}>`
            return `<table${attrs} data-source-line="${sourceLine}">`
        }
        return `<${tag}${attrs}>`
    })
    return sawTableOpen ? sanitized : null
}

function safeTableBlock(state: BlockState, startLine: number, _endLine: number, silent: boolean): boolean {
    const start = state.bMarks[startLine] + state.tShift[startLine]
    const first = state.src.slice(start, state.eMarks[startLine])
    if (!TABLE_BLOCK_START.test(first)) return false

    let nextLine = startLine
    let raw = ''
    while (nextLine < state.lineMax) {
        const lineStart = state.bMarks[nextLine] + state.tShift[nextLine]
        const line = state.src.slice(lineStart, state.eMarks[nextLine])
        raw += (raw ? '\n' : '') + line
        nextLine++
        if (TABLE_BLOCK_END.test(line)) break
    }
    if (!TABLE_BLOCK_END.test(raw)) return false
    const html = sanitizeTableHtml(raw, startLine)
    if (!html) return false

    if (!silent) {
        const token = state.push('html_block', '', 0)
        token.map = [startLine, nextLine]
        token.content = html + '\n'
    }
    state.line = nextLine
    return true
}

export function safeInlineHtmlPlugin(md: MarkdownIt): void {
    md.inline.ruler.before('escape', 'safe_inline_html', safeInlineHtml)
    md.block.ruler.before('paragraph', 'safe_table_block', safeTableBlock, {
        alt: ['paragraph', 'reference', 'blockquote', 'list'],
    })
}
