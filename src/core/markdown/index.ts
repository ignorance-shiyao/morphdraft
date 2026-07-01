import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js/lib/common'
import { chartFencePlugin } from './fence'
import { containerPlugin } from './container'
import { mathPlugin } from './math'
import { alertsPlugin } from './alerts'
import { taskListPlugin } from './taskLists'
import footnotePlugin from 'markdown-it-footnote'
import markPlugin from 'markdown-it-mark'
import subPlugin from 'markdown-it-sub'
import supPlugin from 'markdown-it-sup'
import insPlugin from 'markdown-it-ins'
import { tocPlugin } from './toc'
import { wikiLinkPlugin } from './wikiLink'
import {chipsPlugin} from './chips'
import {iconsPlugin} from './icons'
import { cjkSpacingPlugin } from './cjkSpacing'
import { cjkEmphasisPlugin } from './cjkEmphasis'
import { getAssetBlob } from '../assets'
import {safeInlineHtmlPlugin} from './safeInlineHtml'

// 基础渲染器 + mermaid/echarts fence + note/card 容器。
export function createMarkdown(): MarkdownIt {
  const md = new MarkdownIt({
    html: false,
    linkify: true,
    breaks: false,
    typographer: false,
    // 代码块语法高亮（mermaid/echarts 已在 fence 插件里拦截，不会进这里）
    highlight: (code, lang) => {
      const esc = (s: string) =>
        s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

      // 解析 ```js {2,5} 语法：提取语言和高亮行号
      let highlightLines: Set<number> | null = null
      let cleanLang = lang || ''
      const hlMatch = lang?.match(/^(\S+)\s*\{([\d,\-]+)\}$/)
      if (hlMatch) {
        cleanLang = hlMatch[1]
        highlightLines = new Set()
        for (const part of hlMatch[2].split(',')) {
          const range = part.split('-').map(Number)
          if (range.length === 2) {
            for (let i = range[0]; i <= range[1]; i++) highlightLines.add(i)
          } else {
            highlightLines.add(range[0])
          }
        }
      }

        const langBadge = `<span class="code-lang" role="button" tabindex="0" title="点击修改代码语言">${cleanLang || 'text'}</span>`

      function wrapLines(html: string): string {
          const lines = html.endsWith('\n') ? html.slice(0, -1).split('\n') : html.split('\n')
        return lines.map((line, i) => {
          const cls = highlightLines?.has(i + 1) ? ' code-line hl' : ' code-line'
          return `<span class="${cls.trim()}" data-line="${i + 1}"><span class="code-lineno">${i + 1}</span><span class="code-text">${line || ' '}</span></span>`
        }).join('')
      }

      if (cleanLang && hljs.getLanguage(cleanLang)) {
        try {
          const highlighted = hljs.highlight(code, { language: cleanLang }).value
          return `<pre class="hljs">${langBadge}<code>${wrapLines(highlighted)}</code></pre>`
        } catch {
          /* fall through */
        }
      }
      return `<pre class="hljs">${langBadge}<code>${wrapLines(esc(code))}</code></pre>`
    },
  })
  md.use(chartFencePlugin)
  md.use(containerPlugin)
  md.use(mathPlugin)
  md.use(alertsPlugin)
  md.use(taskListPlugin)
  md.use(footnotePlugin)
  md.use(markPlugin)
  md.use(subPlugin)
  md.use(supPlugin)
  md.use(insPlugin)
    md.use(safeInlineHtmlPlugin)
  md.use(tocPlugin)
  md.use(sourceLinePlugin)
  md.use(imageCaptionPlugin)
  md.use(wikiLinkPlugin)
  md.use(chipsPlugin)
  md.use(iconsPlugin)
  md.use(cjkSpacingPlugin)
  md.use(cjkEmphasisPlugin) // CJK 旁的 _ / == / ~ / ^ 强调识别修复

  // 默认 markdown-it 只允许 data:image/(png|jpeg|gif|webp)，会拦掉内联 SVG 图。
  // 本应用为本地/用户自有内容，放开 data:image/*（含 svg），以支持内联与本地图片插入。
  // 同时允许 asset:// 协议（图片附件占位符）。
  md.validateLink = (url: string) => {
    const s = url.trim().toLowerCase()
    if (/^(vbscript|javascript|file):/.test(s)) return false
    if (s.startsWith('data:')) return /^data:image\/(png|jpe?g|gif|webp|svg\+xml|avif|bmp);/.test(s)
    if (s.startsWith('asset://')) return true
    return true
  }
  return md
}

// 图片 title 属性渲染为居中图注：<figure><img><figcaption>title</figcaption></figure>
function imageCaptionPlugin(md: MarkdownIt) {
  const defaultRender = md.renderer.rules.image!
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    const title = token.attrGet('title')
    if (!title) return defaultRender(tokens, idx, options, env, self)
    const img = self.renderToken(tokens, idx, options)
    return `<figure>${img}<figcaption>${md.utils.escapeHtml(title)}</figcaption></figure>`
  }
}

// 给块级元素打 data-source-line（token.map[0]，相对喂入文本的 0 基行号）。
function sourceLinePlugin(md: MarkdownIt) {
  md.core.ruler.push('source_line', (state) => {
    for (const tok of state.tokens) {
      if (!tok.map) continue
      if (tok.type.endsWith('_open') || tok.type === 'fence' || tok.type === 'hr') {
        tok.attrSet('data-source-line', String(tok.map[0]))
      }
    }
  })
}

export const md = createMarkdown()

// 把 markdown 中的 asset://xxx 引用替换为 blob: URL（vault 读盘 / 否则 IndexedDB）。
export async function resolveAssetUrls(src: string): Promise<string> {
  const assetPattern = /asset:\/\/([a-zA-Z0-9._-]+)/g
  const matches = [...src.matchAll(assetPattern)]
  if (!matches.length) return src
  const ids = [...new Set(matches.map((m) => m[1]))]
  const urlMap = new Map<string, string>()
  await Promise.all(ids.map(async (id) => {
    const blob = await getAssetBlob(id)
    if (blob) {
      const url = URL.createObjectURL(blob)
      urlMap.set(id, url)
    }
  }))
  return src.replace(assetPattern, (_, id) => urlMap.get(id) ?? `asset://${id}`)
}

export function renderMarkdown(src: string): string {
  // 去掉 HTML 注释（版式指令如 <!-- layout: cover --> 等不应在正文渲染中漏出）
  const cleaned = stripFrontmatter(src).replace(/<!--[\s\S]*?-->/g, '')
  return md.render(cleaned)
}

// 供双向定位用：渲染并返回 data-source-line 对应的「编辑器绝对行偏移」。
// 处理两点：①去掉 frontmatter 后 body 行号要加回偏移；②HTML 注释用等长空白替换以保持行号不移位。
export function renderWithSource(src: string): { html: string; lineOffset: number } {
  let offset = 0
  let rest = src
  if (src.startsWith('---')) {
    const end = src.indexOf('\n---', 3)
    if (end !== -1) {
      const after = src.indexOf('\n', end + 1)
      if (after !== -1) {
        offset = src.slice(0, after + 1).split('\n').length - 1
        rest = src.slice(after + 1)
      }
    }
  }
  const body = rest.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '))
  return { html: md.render(body), lineOffset: offset }
}

// 取出顶部 --- yaml --- 原文（不含 --- 分隔），无则返回空串
function frontmatterBlock(src: string): string {
  if (!src.startsWith('---')) return ''
  const end = src.indexOf('\n---', 3)
  if (end === -1) return ''
  return src.slice(src.indexOf('\n') + 1, end)
}

// 去掉顶部的 --- yaml --- 区块
export function stripFrontmatter(src: string): string {
  if (!src.startsWith('---')) return src
  const end = src.indexOf('\n---', 3)
  if (end === -1) return src
  const after = src.indexOf('\n', end + 1)
  return after === -1 ? '' : src.slice(after + 1)
}

// 极简 frontmatter 解析：仅取 key: value 行（足够 theme/mode/title/aspectRatio）。
export function parseFrontmatter(src: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of frontmatterBlock(src).split('\n')) {
    const m = /^\s*([A-Za-z_][\w-]*)\s*:\s*(.+?)\s*$/.exec(line)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}
