// R1-1 工作区索引（纯核心）。给定全部文档内容，构建可被补全/反链/诊断/搜索/重命名
// 共用的内存索引。本模块**不渲染、不保存、不碰 UI、不改文件**（设计 §13）。
//
// 复用既有解析：标题用 outline.parseOutline、锚点 slug 用 toc.slugify、
// WikiLink 用 wikiLink.extractWikiLinks、资产用 assets.extractAssetIds——避免规则漂移。

import { parseOutline } from '../markdown/outline'
import { slugify } from '../markdown/toc'
import { extractWikiLinks } from '../markdown/wikiLink'
import { extractAssetIds } from '../assets'

export interface IndexedHeading {
  level: number
  text: string
  line: number
  slug: string
}
export interface IndexedWikiLink {
  page: string
  display: string
  line: number
  snippet: string
}
export interface IndexedMdLink {
  href: string
  line: number
  isExternal: boolean
  isAnchor: boolean
}
export interface IndexedDoc {
  id: string
  title: string
  headings: IndexedHeading[]
  anchors: string[]
  wikilinks: IndexedWikiLink[]
  mdLinks: IndexedMdLink[]
  assets: string[]
}
export interface WorkspaceIndex {
  docs: IndexedDoc[]
  byId: Map<string, IndexedDoc>
  titleToIds: Map<string, string[]>
}

export interface DocInput {
  id: string
  title: string
  contentMarkdown: string
}

// 普通 Markdown 链接 / 图片：[text](href) 或 ![alt](href)。捕获 href（到首个空白或右括号）。
const MD_LINK_RE = /!?\[[^\]]*\]\(\s*([^)\s]+)(?:\s+[^)]*)?\)/g

// 锚点 slug 去重，与 toc.ts 同策略（slug / slug-1 / slug-2 …）。
function uniqueSlug(text: string, used: Set<string>): string {
  let id = slugify(text)
  let n = 1
  const base = id
  while (used.has(id)) id = `${base}-${n++}`
  used.add(id)
  return id
}

// 单篇文档 → 索引项。代码围栏内不抽取链接，frontmatter 由各解析器自行处理。
export function indexDoc(doc: DocInput): IndexedDoc {
  const md = doc.contentMarkdown || ''
  const lines = md.split('\n')

  const usedSlugs = new Set<string>()
  const headings: IndexedHeading[] = parseOutline(md).map((h) => ({
    level: h.level,
    text: h.text,
    line: h.line,
    slug: uniqueSlug(h.text, usedSlugs),
  }))

  const wikilinks: IndexedWikiLink[] = []
  const mdLinks: IndexedMdLink[] = []
  let inFence = false
  for (let n = 0; n < lines.length; n++) {
    const ln = lines[n]
    if (/^\s*(```|~~~)/.test(ln)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    for (const w of extractWikiLinks(ln)) {
      wikilinks.push({ page: w.page, display: w.display, line: n, snippet: ln.trim().slice(0, 120) })
    }
    for (const m of ln.matchAll(MD_LINK_RE)) {
      const href = m[1]
      mdLinks.push({
        href,
        line: n,
        isExternal: /^[a-z][a-z0-9+.-]*:\/\//i.test(href) || href.startsWith('asset://'),
        isAnchor: href.startsWith('#'),
      })
    }
  }

  return {
    id: doc.id,
    title: doc.title,
    headings,
    anchors: headings.map((h) => h.slug),
    wikilinks,
    mdLinks,
    assets: extractAssetIds(md),
  }
}

function reindex(docs: IndexedDoc[]): WorkspaceIndex {
  const byId = new Map<string, IndexedDoc>()
  const titleToIds = new Map<string, string[]>()
  for (const d of docs) {
    byId.set(d.id, d)
    const ids = titleToIds.get(d.title)
    if (ids) ids.push(d.id)
    else titleToIds.set(d.title, [d.id])
  }
  return { docs, byId, titleToIds }
}

export function buildIndex(docs: DocInput[]): WorkspaceIndex {
  return reindex(docs.map(indexDoc))
}

// 增量：替换/新增单篇后返回**新**索引（不可变，便于 Vue 响应与测试）。
export function updateDocInIndex(index: WorkspaceIndex, doc: DocInput): WorkspaceIndex {
  const next = indexDoc(doc)
  const docs = index.docs.some((d) => d.id === doc.id)
    ? index.docs.map((d) => (d.id === doc.id ? next : d))
    : [...index.docs, next]
  return reindex(docs)
}

export function removeDocFromIndex(index: WorkspaceIndex, id: string): WorkspaceIndex {
  return reindex(index.docs.filter((d) => d.id !== id))
}

// —— 派生查询（共用索引，不重复扫描全库）——

// 引用某标题的文档（反链）：以 WikiLink 目标为准，返回首次命中行。
export function backlinksOf(index: WorkspaceIndex, title: string): { id: string; title: string; line: number; snippet: string }[] {
  const target = title.trim()
  if (!target) return []
  const out: { id: string; title: string; line: number; snippet: string }[] = []
  for (const d of index.docs) {
    const hit = d.wikilinks.find((w) => w.page === target)
    if (hit) out.push({ id: d.id, title: d.title, line: hit.line, snippet: hit.snippet })
  }
  return out
}

// 重名标题（标题→多个文档）。
export function duplicateTitles(index: WorkspaceIndex): string[] {
  const out: string[] = []
  for (const [title, ids] of index.titleToIds) {
    if (ids.length > 1) out.push(title)
  }
  return out
}

// 标题补全候选：前缀命中优先，其次包含匹配；均忽略大小写，保持稳定顺序。
export function titleCandidates(index: WorkspaceIndex, prefix: string): IndexedDoc[] {
  const q = prefix.trim().toLowerCase()
  if (!q) return index.docs
  const prefixHits: IndexedDoc[] = []
  const fuzzyHits: IndexedDoc[] = []
  for (const d of index.docs) {
    const t = d.title.toLowerCase()
    if (t.startsWith(q)) prefixHits.push(d)
    else if (t.includes(q)) fuzzyHits.push(d)
  }
  return [...prefixHits, ...fuzzyHits]
}

export function anchorsOf(index: WorkspaceIndex, docId: string): string[] {
  return index.byId.get(docId)?.anchors ?? []
}
