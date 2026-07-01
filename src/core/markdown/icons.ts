// 内置图标内联语法 :name:（参考设计稿的图标特性列表）。
// 白名单制：只有已知图标名才替换，:tip: / http:// / 12:30 等都不会误伤。
// 渲染为 stroke=currentColor 的内联 SVG → 跟随文字色（卡片标题里即主色）。
import type MarkdownIt from 'markdown-it'

// 24x24 描边图标路径（outline，stroke-width 2）
const ICONS: Record<string, string> = {
    check: '<path d="M20 6 9 17l-5-5"/>',
    star: '<path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 18.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z"/>',
    bolt: '<path d="M13 2 4 14h6l-1 8 9-12h-6z"/>',
    shield: '<path d="M12 3l7 3v5c0 4-3 7-7 8-4-1-7-4-7-8V6z"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>',
    rocket: '<path d="M9 15l-3-3c2-7 7-9 12-9 0 5-2 10-9 12z"/><path d="M9 15c-1 0-3 .5-4 4 3.5-1 4-3 4-4z"/><circle cx="14.5" cy="9.5" r="1.4"/>',
    heart: '<path d="M12 21C6.5 15.8 3 12.8 3 8.7 3 6.1 5 4 7.5 4 9 4 10.5 5 12 7.2 13.5 5 15 4 16.5 4 19 4 21 6.1 21 8.7c0 4.1-3.5 7.1-9 12.3z"/>',
    bulb: '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8"/><path d="M21 20c0-2.5-1.5-4.6-3.7-5.5"/>',
    chart: '<path d="M4 20V4"/><path d="M4 20h16"/><rect x="7" y="12" width="3" height="5"/><rect x="12" y="8" width="3" height="9"/><rect x="17" y="5" width="3" height="12"/>',
    up: '<path d="M12 19V5"/><path d="m6 11 6-6 6 6"/>',
    down: '<path d="M12 5v14"/><path d="m6 13 6 6 6-6"/>',
    warning: '<path d="M12 3 2 20h20z"/><path d="M12 10v4"/><path d="M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
    flag: '<path d="M5 21V4"/><path d="M5 4h11l-1.5 4L16 12H5"/>',
    sparkles: '<path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6z"/><path d="M18.5 14.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
    right: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
    left: '<path d="M19 12H5"/><path d="m11 6-6 6 6 6"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    money: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10"/><path d="M14.5 9.3c0-1.1-1.1-1.8-2.5-1.8s-2.5.7-2.5 1.8.9 1.5 2.5 1.8 2.6.8 2.6 2-1.2 1.9-2.6 1.9-2.6-.8-2.6-1.9"/>',
    calendar: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 9h16"/><path d="M8 3v4"/><path d="M16 3v4"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 3v2.5M12 18.5V21M21 12h-2.5M5.5 12H3M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8M18.4 18.4l-1.8-1.8M7.4 7.4 5.6 5.6"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
    download: '<path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M4 21h16"/>',
    link: '<path d="M9 15l6-6"/><path d="M10.5 6.5 13 4a4 4 0 0 1 6 6l-2.5 2.5"/><path d="M13.5 17.5 11 20a4 4 0 0 1-6-6l2.5-2.5"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    tag: '<path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    pin: '<path d="M12 21s7-5.5 7-11a7 7 0 0 0-14 0c0 5.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18"/>',
    fire: '<path d="M12 3c1 3-1 4-1 6a3 3 0 0 0 3 3c1.5 0 2-1 2-2 2 1.5 3 3.5 3 6a7 7 0 0 1-14 0c0-3 2-5 3-7 .8-1.6 2-3.5 4-6z"/>',
    trophy: '<path d="M8 4h8v4a4 4 0 0 1-8 0z"/><path d="M8 6H5v1a3 3 0 0 0 3 3M16 6h3v1a3 3 0 0 1-3 3"/><path d="M10 14h4M9 20h6M12 14v6"/>',
    refresh: '<path d="M4 12a8 8 0 0 1 13.7-5.7L20 8"/><path d="M20 4v4h-4"/><path d="M20 12a8 8 0 0 1-13.7 5.7L4 16"/><path d="M4 20v-4h4"/>',
}

export const ICON_NAMES = Object.keys(ICONS)

const RE = /:([a-z][a-z0-9-]*):/g

function svg(name: string): string {
    return (
        `<svg class="md-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
        `stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`
    )
}

export function iconsPlugin(md: MarkdownIt) {
    md.core.ruler.push('icons', (state) => {
        for (const tok of state.tokens) {
            if (tok.type !== 'inline' || !tok.children) continue
            for (let i = 0; i < tok.children.length; i++) {
                const child = tok.children[i]
                if (child.type !== 'text' || !child.content.includes(':')) continue

                const text = child.content
                RE.lastIndex = 0
                const newTokens: typeof tok.children = []
                let last = 0
                let m: RegExpExecArray | null
                while ((m = RE.exec(text))) {
                    if (!(m[1] in ICONS)) continue // 非白名单 → 不替换
                    if (m.index > last) {
                        const t = new state.Token('text', '', 0)
                        t.content = text.slice(last, m.index)
                        newTokens.push(t)
                    }
                    const h = new state.Token('html_inline', '', 0)
                    h.content = svg(m[1])
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
