import type MarkdownIt from 'markdown-it'

// GitHub 风格提示框：blockquote 首行 `[!NOTE] / [!TIP] / [!WARNING] / [!IMPORTANT] / [!CAUTION]`
// 渲染成带图标的彩色 callout，与现有 :::note/:::card 并存。

const TYPES: Record<string, { label: string; icon: string }> = {
  note: {
    label: '注记',
    icon: 'M12 16v-4M12 8h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
  },
  tip: {
    label: '提示',
    icon: 'M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2h6c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z',
  },
  important: {
    label: '重要',
    icon: 'M12 8v4M12 16h.01M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  },
  warning: {
    label: '警告',
    icon: 'M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
  },
  caution: {
    label: '注意',
    icon: 'M12 16h.01M12 8v4M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
  },
}

const MARKER = /^\[!(\w+)\]/i

function titleHtml(type: string): string {
  const t = TYPES[type]
  const svg = `<svg class="alert-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${t.icon}"/></svg>`
  return `<p class="alert-title">${svg}<span>${t.label}</span></p>`
}

// 每种类型的强调色（用色相区分，明暗主题都可读）。供预览与导出共用。
const HUES: Record<string, string> = {
  note: '#3b82f6',
  tip: '#22c55e',
  important: '#8b5cf6',
  warning: '#f59e0b',
  caution: '#ef4444',
}

export const ALERT_CSS = `
.alert{margin:16px 0;padding:10px 16px;border-radius:8px;border-left:4px solid var(--alert-color);
  background:color-mix(in srgb,var(--alert-color) 8%,transparent);}
.alert>:first-child{margin-top:0}.alert>:last-child{margin-bottom:0}
.alert-title{display:flex;align-items:center;gap:7px;margin:0 0 6px;font-weight:700;
  color:var(--alert-color);font-size:0.94em;}
.alert-title .alert-icon{flex:0 0 auto}
${Object.entries(HUES)
  .map(([k, c]) => `.alert-${k}{--alert-color:${c}}`)
  .join('')}
`

export function alertsPlugin(md: MarkdownIt): void {
  md.core.ruler.after('inline', 'github_alerts', (state) => {
    const tokens = state.tokens
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== 'blockquote_open') continue
      // blockquote_open -> paragraph_open -> inline
      const para = tokens[i + 1]
      const inline = tokens[i + 2]
      if (!para || para.type !== 'paragraph_open' || !inline || inline.type !== 'inline') continue
      const first = inline.children?.[0]
      if (!first || first.type !== 'text') continue
      const m = MARKER.exec(first.content)
      if (!m) continue
      const type = m[1].toLowerCase()
      if (!TYPES[type]) continue

      // 改 blockquote -> div.alert
      const open = tokens[i]
      open.tag = 'div'
      open.attrSet('class', `alert alert-${type}`)
      // 配对的 close
      let depth = 0
      for (let j = i + 1; j < tokens.length; j++) {
        if (tokens[j].type === 'blockquote_open') depth++
        else if (tokens[j].type === 'blockquote_close') {
          if (depth === 0) {
            tokens[j].tag = 'div'
            break
          }
          depth--
        }
      }

      // 去掉首行标记：text 去掉 "[!TYPE]"，若其后紧跟 softbreak 也去掉
      first.content = first.content.replace(MARKER, '').replace(/^\s+/, '')
      if (first.content === '' && inline.children) {
        const next = inline.children[1]
        if (next && next.type === 'softbreak') inline.children.splice(0, 2)
        else inline.children.splice(0, 1)
      }
      // 若该段被掏空（纯标题行），移除空 paragraph
      if (inline.children && inline.children.length === 0) {
        tokens.splice(i + 1, 3) // paragraph_open, inline, paragraph_close
      }

      // 注入标题块
      const titleTok = new state.Token('html_block', '', 0)
      titleTok.content = titleHtml(type)
      tokens.splice(i + 1, 0, titleTok)
    }
  })
}
