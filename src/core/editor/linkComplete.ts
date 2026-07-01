import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import type { WorkspaceIndex } from '../workspace'
import { anchorsOf, titleCandidates } from '../workspace'

export interface LinkCompletionOption {
  label: string
  apply: string
  detail?: string
}

export interface LinkCompletionResult {
  from: number
  options: LinkCompletionOption[]
}

function headingOptions(index: WorkspaceIndex, docId: string, query: string, suffix: string): LinkCompletionOption[] {
  const q = query.toLowerCase()
  const doc = index.byId.get(docId)
  if (!doc) return []
  return doc.headings
    .filter((heading) => !q || heading.text.toLowerCase().includes(q) || heading.slug.toLowerCase().includes(q))
    .map((heading) => ({
      label: heading.text,
      apply: `${heading.slug}${suffix}`,
      detail: `#${heading.slug}`,
    }))
}

export function linkCompletionAt(
  textBeforeCursor: string,
  cursor: number,
  index: WorkspaceIndex,
  currentDocId: string,
): LinkCompletionResult | null {
  const before = textBeforeCursor.slice(0, cursor)

  const wikiAnchor = before.match(/\[\[([^\]#|]+)#([^\]]*)$/)
  if (wikiAnchor) {
    const title = wikiAnchor[1].trim()
    const query = wikiAnchor[2]
    const targetId = index.titleToIds.get(title)?.[0]
    if (!targetId) return { from: cursor - query.length, options: [] }
    return {
      from: cursor - query.length,
      options: headingOptions(index, targetId, query, ']]'),
    }
  }

  const wiki = before.match(/\[\[([^\]]*)$/)
  if (wiki) {
    const query = wiki[1]
    return {
      from: cursor - query.length,
      options: titleCandidates(index, query).map((doc) => ({
        label: doc.title,
        apply: `${doc.title}]]`,
        detail: 'WikiLink',
      })),
    }
  }

  const currentAnchor = before.match(/\]\(#([^)]*)$/)
  if (currentAnchor) {
    const query = currentAnchor[1]
    return {
      from: cursor - query.length,
      options: headingOptions(index, currentDocId, query, ')'),
    }
  }

  const markdownLink = before.match(/!?\[[^\]]*\]\(([^)]*)$/)
  if (markdownLink) {
    const query = markdownLink[1]
    const q = query.toLowerCase()
    const docs = index.docs
      .filter((doc) => doc.id !== currentDocId && (!q || doc.title.toLowerCase().includes(q)))
      .map((doc) => ({ label: doc.title, apply: `${doc.title}.md)`, detail: 'Markdown' }))
    const assets = [...new Set(index.docs.flatMap((doc) => doc.assets))]
      .filter((asset) => !q || asset.toLowerCase().includes(q))
      .map((asset) => ({ label: asset, apply: `asset://${asset})`, detail: 'Asset' }))
    return { from: cursor - query.length, options: [...docs, ...assets] }
  }

  return null
}

export function createLinkCompletions(
  getIndex: () => WorkspaceIndex,
  getCurrentDocId: () => string,
) {
  return (context: CompletionContext): CompletionResult | null => {
    const line = context.state.doc.lineAt(context.pos)
    const result = linkCompletionAt(line.text, context.pos - line.from, getIndex(), getCurrentDocId())
    if (!result) return null
    return {
      from: line.from + result.from,
      options: result.options.map((option) => ({
        label: option.label,
        apply: option.apply,
        detail: option.detail,
        type: option.detail === 'Asset' ? 'variable' : 'text',
      })),
      validFor: /^[^)\]]*$/,
    }
  }
}
