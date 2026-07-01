import hljs from 'highlight.js/lib/common'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// highlight.js 的 common 包不含 mermaid 语法，单独写一个轻量 tokenizer，
// 复用 hljs-* token 类名，这样配色直接走全局已注入的 CODE_CSS，不用额外加样式。
const MERMAID_KEYWORDS = '(?:graph|flowchart|sequenceDiagram|classDiagram|stateDiagram-v2|stateDiagram'
  + '|erDiagram|gantt|pie|journey|gitGraph|mindmap|timeline|subgraph|end|participant|actor|class|state'
  + '|note|loop|alt|else|opt|par|and|rect|activate|deactivate|click|style|classDef|linkStyle|direction'
  + '|TD|TB|BT|RL|LR)'
const MERMAID_TOKEN_RE = new RegExp(
  '(%%[^\\n]*)' // 注释
  + '|("[^"]*")' // 字符串
  + '|(<\\|--|--\\|>|o--o|x--x|--x|--o|<-->|-\\.-{1,2}>|={1,3}>|-{1,3}>)' // 箭头
  + '|(\\b\\d+\\b)' // 数字
  + `|(\\b${MERMAID_KEYWORDS}\\b)`, // 关键字
  'g',
)

function highlightMermaidHtml(code: string): string {
  let out = ''
  let last = 0
  let m: RegExpExecArray | null
  MERMAID_TOKEN_RE.lastIndex = 0
  while ((m = MERMAID_TOKEN_RE.exec(code))) {
    out += esc(code.slice(last, m.index))
    const [full, comment, str, arrow, num, kw] = m
    if (comment) out += `<span class="hljs-comment">${esc(comment)}</span>`
    else if (str) out += `<span class="hljs-string">${esc(str)}</span>`
    else if (arrow) out += `<span class="hljs-symbol">${esc(arrow)}</span>`
    else if (num) out += `<span class="hljs-number">${esc(num)}</span>`
    else if (kw) out += `<span class="hljs-keyword">${esc(kw)}</span>`
    else out += esc(full)
    last = MERMAID_TOKEN_RE.lastIndex
  }
  out += esc(code.slice(last))
  return out
}

// 供行内代码编辑器使用：把纯文本代码转成 hljs token span（不含 <pre>/<code> 外壳），
// 配色复用全局已注入的 CODE_CSS（见 codeTheme.ts + main.ts）。
// LaTeX / 数学：hljs common 包不含 latex，自写轻量 tokenizer——
// 高亮 $$/$ 定界符、\命令、{}[] 括号、^_ 上下标、% 注释，复用 hljs-* 配色。
const LATEX_TOKEN_RE = new RegExp(
  '(%[^\\n]*)' // 注释
  + '|(\\$\\$|\\$)' // 定界符
  + '|(\\\\[A-Za-z]+|\\\\.)' // 命令 \alpha \, \\
  + '|([{}\\[\\]])' // 括号
  + '|([_^])' // 上下标
  + '|(\\b\\d+(?:\\.\\d+)?\\b)', // 数字
  'g',
)

function highlightLatexHtml(code: string): string {
  let out = ''
  let last = 0
  let m: RegExpExecArray | null
  LATEX_TOKEN_RE.lastIndex = 0
  while ((m = LATEX_TOKEN_RE.exec(code))) {
    out += esc(code.slice(last, m.index))
    const [full, comment, delim, cmd, brace, supsub, num] = m
    if (comment) out += `<span class="hljs-comment">${esc(comment)}</span>`
    else if (delim) out += `<span class="hljs-meta">${esc(delim)}</span>`
    else if (cmd) out += `<span class="hljs-keyword">${esc(cmd)}</span>`
    else if (brace) out += `<span class="hljs-punctuation">${esc(brace)}</span>`
    else if (supsub) out += `<span class="hljs-operator">${esc(supsub)}</span>`
    else if (num) out += `<span class="hljs-number">${esc(num)}</span>`
    else out += esc(full)
    last = LATEX_TOKEN_RE.lastIndex
  }
  out += esc(code.slice(last))
  return out
}

export function highlightCodeHtml(code: string, lang: string): string {
  if (lang === 'mermaid') return highlightMermaidHtml(code)
  if (lang === 'latex' || lang === 'tex' || lang === 'math') return highlightLatexHtml(code)
  if (lang && hljs.getLanguage(lang)) {
    try {
      return hljs.highlight(code, { language: lang }).value
    } catch {
      /* fall through */
    }
  }
  return esc(code)
}
