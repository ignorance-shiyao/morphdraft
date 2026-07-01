// 行内 DOM → Markdown 源码序列化（WYSIWYG 编辑的基石）。
// 把渲染态行内 DOM（strong/em/code/a/mark/...）忠实还原为本应用的 Markdown 行内语法，
// 供「所见即所得」编辑在提交时把用户对渲染内容的改动写回源码。纯逻辑，按最小结构接口实现，
// 不依赖真实 DOM，便于单测；DOM 入口见 serializeInlineDom。

// 最小节点结构（兼容真实 DOM Node 与测试用假节点）。
export interface SNode {
  nodeType: number
  nodeName: string
  textContent?: string | null
  childNodes: ArrayLike<SNode>
  getAttribute?(name: string): string | null
  dataset?: Record<string, string | undefined>
}

const TEXT_NODE = 3
const ELEMENT_NODE = 1

function tag(n: SNode): string {
  return n.nodeName.toLowerCase()
}

function children(n: SNode): SNode[] {
  return Array.from(n.childNodes)
}

function attr(n: SNode, name: string): string | null {
  return n.getAttribute ? n.getAttribute(name) : null
}

// 序列化一个节点的所有子节点（行内内容）。
export function serializeInline(parent: SNode): string {
  return children(parent).map(serializeNode).join('')
}

function serializeNode(n: SNode): string {
  if (n.nodeType === TEXT_NODE) return n.textContent ?? ''
  if (n.nodeType !== ELEMENT_NODE) return ''
  if (hasAnyClass(n, ['md-heading-toggle', 'md-image-resize', 'md-table-handle', 'md-row-select', 'md-table-resize'])) return ''
  const t = tag(n)
  const inner = () => serializeInline(n)

  switch (t) {
    case 'br':
      return '\n'
    case 'strong':
    case 'b': {
      // 粗斜体：<strong><em>…</em></strong> → ***…***
      const only = soleChild(n)
      if (only && (tag(only) === 'em' || tag(only) === 'i')) return `***${serializeInline(only)}***`
      return `**${inner()}**`
    }
    case 'em':
    case 'i': {
      const only = soleChild(n)
      if (only && (tag(only) === 'strong' || tag(only) === 'b')) return `***${serializeInline(only)}***`
      return `*${inner()}*`
    }
    case 'code':
      // 行内代码：内容含反引号时用更长的围栏。
      return fenceCode(n.textContent ?? '')
    case 'mark':
      return `==${inner()}==`
    case 's':
    case 'del':
    case 'strike': // execCommand('strikeThrough') 产物
      return `~~${inner()}~~`
    case 'u':
    case 'ins':
      return `<u>${inner()}</u>`
    case 'kbd':
      return `<kbd>${inner()}</kbd>`
    case 'sub':
      return `~${inner()}~`
    case 'sup':
      return `^${inner()}^`
    case 'a': {
      const href = attr(n, 'href') ?? ''
      const title = attr(n, 'title')
      const text = inner()
      // 自动链接：文本等于地址 → 裸 URL。
      if (text === href) return href
      return title ? `[${text}](${href} "${title}")` : `[${text}](${href})`
    }
    case 'img': {
      const alt = attr(n, 'alt') ?? ''
      const src = attr(n, 'src') ?? ''
      const title = attr(n, 'title')
      return title ? `![${alt}](${src} "${title}")` : `![${alt}](${src})`
    }
    default:
      // .math-inline → $…$（源码在 data-math-source）
      if (n.dataset?.mathSource !== undefined || hasClass(n, 'math-inline')) {
        const src = n.dataset?.mathSource ?? attr(n, 'data-math-source') ?? ''
        return `$${src}$`
      }
      // 语法高亮 token 容器（.md-syntax-token）等未知包裹：透传子内容。
      return inner()
  }
}

function soleChild(n: SNode): SNode | null {
  const kids = children(n).filter((c) => !(c.nodeType === TEXT_NODE && (c.textContent ?? '') === ''))
  return kids.length === 1 && kids[0].nodeType === ELEMENT_NODE ? kids[0] : null
}

function hasClass(n: SNode, cls: string): boolean {
  const c = attr(n, 'class') ?? ''
  return c.split(/\s+/).includes(cls)
}

function hasAnyClass(n: SNode, classes: string[]): boolean {
  const c = attr(n, 'class') ?? ''
  if (!c) return false
  const set = new Set(c.split(/\s+/))
  return classes.some((cls) => set.has(cls))
}

function fenceCode(text: string): string {
  const runs = text.match(/`+/g)
  const longest = runs ? Math.max(...runs.map((r) => r.length)) : 0
  const fence = '`'.repeat(longest + 1)
  const pad = longest > 0 ? ' ' : ''
  return `${fence}${pad}${text}${pad}${fence}`
}

// 真实 DOM 入口。
export function serializeInlineDom(el: Element): string {
  return serializeInline(el as unknown as SNode)
}
