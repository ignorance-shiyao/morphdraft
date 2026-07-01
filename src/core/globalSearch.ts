// R0b-2：全文搜索的可测纯逻辑——把 document.searchAll() 的扁平命中按文档分组、
// 限制每文档命中数，并派生面板四态。面板组件只管渲染与 emit(docId,line)。

// 与 stores/document.ts 的 DocSearchHit 结构兼容（此处自带定义，避免 core→store 运行时耦合）。
export interface SearchHit {
  docId: string
  title: string
  line: number
  snippet: string
}

export interface SearchGroup {
  docId: string
  title: string
  hits: SearchHit[]
}

// 按文档分组，保持首次出现顺序；每文档命中上限 maxPerDoc（默认 5）。
export function groupSearchHits(hits: SearchHit[], maxPerDoc = 5): SearchGroup[] {
  const order: string[] = []
  const map = new Map<string, SearchGroup>()
  for (const h of hits) {
    let g = map.get(h.docId)
    if (!g) {
      g = { docId: h.docId, title: h.title, hits: [] }
      map.set(h.docId, g)
      order.push(h.docId)
    }
    if (g.hits.length < maxPerDoc) g.hits.push(h)
  }
  return order.map((id) => map.get(id)!)
}

export type SearchState = 'empty' | 'results' | 'no-results' | 'error'

// 四态：读取失败 > 空查询 > 无结果 > 有结果。
export function searchState(query: string, hits: SearchHit[] | null, errored: boolean): SearchState {
  if (errored) return 'error'
  if (!query.trim()) return 'empty'
  if (!hits || hits.length === 0) return 'no-results'
  return 'results'
}
