import { slugify } from '../markdown/toc'
import type { IndexedDoc, WorkspaceIndex } from './index'

export type DiagnosticSeverity = 'error' | 'warning' | 'info'

export type WorkspaceDiagnosticCode =
  | 'missing-wikilink-target'
  | 'ambiguous-wikilink-target'
  | 'unstable-wikilink-case'
  | 'missing-wikilink-anchor'
  | 'missing-markdown-anchor'
  | 'missing-markdown-document'
  | 'missing-asset'

const DIAGNOSTIC_MESSAGE_KEYS: Record<WorkspaceDiagnosticCode, string> = {
  'missing-wikilink-target': 'problems.messages.missingWikilinkTarget',
  'ambiguous-wikilink-target': 'problems.messages.ambiguousWikilinkTarget',
  'unstable-wikilink-case': 'problems.messages.unstableWikilinkCase',
  'missing-wikilink-anchor': 'problems.messages.missingWikilinkAnchor',
  'missing-markdown-anchor': 'problems.messages.missingMarkdownAnchor',
  'missing-markdown-document': 'problems.messages.missingMarkdownDocument',
  'missing-asset': 'problems.messages.missingAsset',
}

export function diagnosticMessageKey(code: WorkspaceDiagnosticCode): string {
  return DIAGNOSTIC_MESSAGE_KEYS[code]
}

export interface WorkspaceDiagnostic {
  code: WorkspaceDiagnosticCode
  severity: DiagnosticSeverity
  docId: string
  docTitle: string
  line: number
  messageParams: Record<string, string | number>
  target: string
  replacement?: { from: string; to: string }
}

function splitWikiTarget(raw: string): { title: string; anchor: string } {
  const hash = raw.indexOf('#')
  if (hash < 0) return { title: raw.trim(), anchor: '' }
  return {
    title: raw.slice(0, hash).trim(),
    anchor: raw.slice(hash + 1).trim(),
  }
}

function decodePart(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function diagnoseWikiLinks(index: WorkspaceIndex, doc: IndexedDoc): WorkspaceDiagnostic[] {
  const out: WorkspaceDiagnostic[] = []
  for (const link of doc.wikilinks) {
    const { title, anchor } = splitWikiTarget(link.page)
    const exactIds = index.titleToIds.get(title) ?? []
    if (exactIds.length === 0) {
      const caseMatches = index.docs.filter((item) => item.title.toLocaleLowerCase() === title.toLocaleLowerCase())
      if (caseMatches.length === 1) {
        out.push({
          code: 'unstable-wikilink-case',
          severity: 'warning',
          docId: doc.id,
          docTitle: doc.title,
          line: link.line,
          messageParams: { actual: caseMatches[0].title },
          target: link.page,
          replacement: { from: title, to: caseMatches[0].title },
        })
      } else {
        out.push({
          code: 'missing-wikilink-target',
          severity: 'error',
          docId: doc.id,
          docTitle: doc.title,
          line: link.line,
          messageParams: { target: title },
          target: link.page,
        })
      }
      continue
    }
    if (exactIds.length > 1) {
      out.push({
        code: 'ambiguous-wikilink-target',
        severity: 'warning',
        docId: doc.id,
        docTitle: doc.title,
        line: link.line,
        messageParams: { target: title, count: exactIds.length },
        target: link.page,
      })
      continue
    }
    if (anchor) {
      const target = index.byId.get(exactIds[0])
      const normalizedAnchor = slugify(decodePart(anchor))
      if (target && !target.anchors.includes(normalizedAnchor)) {
        out.push({
          code: 'missing-wikilink-anchor',
          severity: 'error',
          docId: doc.id,
          docTitle: doc.title,
          line: link.line,
          messageParams: { target: title, anchor },
          target: link.page,
        })
      }
    }
  }
  return out
}

function markdownTitleFromHref(href: string): string {
  const clean = decodePart(href.split(/[?#]/, 1)[0]).replace(/\\/g, '/')
  const basename = clean.split('/').pop() ?? clean
  return basename.replace(/\.md$/i, '')
}

function diagnoseMarkdownLinks(index: WorkspaceIndex, doc: IndexedDoc): WorkspaceDiagnostic[] {
  const out: WorkspaceDiagnostic[] = []
  for (const link of doc.mdLinks) {
    if (link.isAnchor) {
      const anchor = slugify(decodePart(link.href.slice(1)))
      if (!doc.anchors.includes(anchor)) {
        out.push({
          code: 'missing-markdown-anchor',
          severity: 'error',
          docId: doc.id,
          docTitle: doc.title,
          line: link.line,
          messageParams: { anchor: link.href.slice(1) },
          target: link.href,
        })
      }
      continue
    }
    if (!link.isExternal && /\.md(?:[?#].*)?$/i.test(link.href)) {
      const title = markdownTitleFromHref(link.href)
      if (!index.titleToIds.has(title)) {
        out.push({
          code: 'missing-markdown-document',
          severity: 'error',
          docId: doc.id,
          docTitle: doc.title,
          line: link.line,
          messageParams: { target: link.href },
          target: link.href,
        })
      }
    }
  }
  return out
}

export function diagnoseWorkspace(
  index: WorkspaceIndex,
  availableAssetIds?: ReadonlySet<string>,
): WorkspaceDiagnostic[] {
  const out: WorkspaceDiagnostic[] = []
  for (const doc of index.docs) {
    out.push(...diagnoseWikiLinks(index, doc))
    out.push(...diagnoseMarkdownLinks(index, doc))
    if (availableAssetIds) {
      for (const asset of doc.assets) {
        if (!availableAssetIds.has(asset)) {
          out.push({
            code: 'missing-asset',
            severity: 'error',
            docId: doc.id,
            docTitle: doc.title,
            line: doc.mdLinks.find((link) => link.href === `asset://${asset}`)?.line ?? 0,
            messageParams: { target: `asset://${asset}` },
            target: `asset://${asset}`,
          })
        }
      }
    }
  }
  return out
}

export function applyDiagnosticReplacement(markdown: string, diagnostic: WorkspaceDiagnostic): string {
  if (!diagnostic.replacement) return markdown
  const lines = markdown.split('\n')
  const line = lines[diagnostic.line]
  if (line === undefined || !line.includes(diagnostic.replacement.from)) return markdown
  lines[diagnostic.line] = line.replace(diagnostic.replacement.from, diagnostic.replacement.to)
  return lines.join('\n')
}

export function diagnosticRange(
  markdown: string,
  diagnostic: WorkspaceDiagnostic,
): { from: number; to: number } | null {
  const lines = markdown.split('\n')
  const line = lines[diagnostic.line]
  if (line === undefined) return null
  const target = diagnostic.replacement?.from ?? diagnostic.target
  const column = line.indexOf(target)
  if (column < 0) return null
  let lineStart = 0
  for (let index = 0; index < diagnostic.line; index++) lineStart += lines[index].length + 1
  return { from: lineStart + column, to: lineStart + column + target.length }
}
