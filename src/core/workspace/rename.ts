import type { DocInput, IndexedDoc, WorkspaceIndex } from './index'

export interface RenameReferenceChange {
  id: string
  title: string
  before: string
  after: string
  lines: number[]
}

export interface WorkspaceRenamePlan {
  targetId: string
  oldTitle: string
  newTitle: string
  targetBefore: string
  targetAfter: string
  referenceChanges: RenameReferenceChange[]
}

export interface RenameExecutor {
  update(id: string, markdown: string): Promise<unknown>
  rename(id: string, title: string, markdown: string): Promise<string>
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function setFrontmatterTitle(markdown: string, title: string): string {
  if (markdown.startsWith('---')) {
    const end = markdown.indexOf('\n---', 3)
    if (end !== -1) {
      let head = markdown.slice(3, end)
      const rest = markdown.slice(end)
      if (/^\s*title:\s*.*$/m.test(head)) {
        head = head.replace(/^(\s*)title:\s*.*$/m, `$1title: ${title}`)
      } else {
        head = `\ntitle: ${title}${head}`
      }
      return `---${head}${rest}`
    }
  }
  return `---\ntitle: ${title}\n---\n\n${markdown}`
}

function markdownTitle(href: string): string {
  const path = href.split(/[?#]/, 1)[0].replace(/\\/g, '/')
  const basename = path.split('/').pop() ?? path
  try {
    return decodeURIComponent(basename).replace(/\.md$/i, '')
  } catch {
    return basename.replace(/\.md$/i, '')
  }
}

function replaceMarkdownHref(href: string, oldTitle: string, newTitle: string): string {
  if (markdownTitle(href) !== oldTitle) return href
  const match = href.match(/^([\s\S]*\/)?([^/?#]+)([\s\S]*)$/)
  if (!match) return href
  const encoded = match[2].includes('%') ? encodeURIComponent(newTitle) : newTitle
  return `${match[1] ?? ''}${encoded}.md${match[3] ?? ''}`
}

function rewriteReferenceDoc(indexed: IndexedDoc, markdown: string, oldTitle: string, newTitle: string) {
  const lines = markdown.split('\n')
  const changedLines = new Set<number>()
  const wikiRe = new RegExp(`(\\[\\[)${escapeRegExp(oldTitle)}(?=[#|]|\\]\\])`, 'g')

  for (const link of indexed.wikilinks) {
    const title = link.page.split('#', 1)[0].trim()
    if (title !== oldTitle || lines[link.line] === undefined) continue
    const next = lines[link.line].replace(wikiRe, `$1${newTitle}`)
    if (next !== lines[link.line]) {
      lines[link.line] = next
      changedLines.add(link.line)
    }
  }

  for (const link of indexed.mdLinks) {
    if (link.isExternal || link.isAnchor || markdownTitle(link.href) !== oldTitle) continue
    if (lines[link.line] === undefined) continue
    const nextHref = replaceMarkdownHref(link.href, oldTitle, newTitle)
    const next = lines[link.line].replaceAll(link.href, nextHref)
    if (next !== lines[link.line]) {
      lines[link.line] = next
      changedLines.add(link.line)
    }
  }

  return { markdown: lines.join('\n'), lines: [...changedLines].sort((a, b) => a - b) }
}

export function buildRenamePlan(
  index: WorkspaceIndex,
  docs: readonly DocInput[],
  targetId: string,
  newTitleInput: string,
): WorkspaceRenamePlan {
  const target = index.byId.get(targetId)
  const targetInput = docs.find((doc) => doc.id === targetId)
  if (!target || !targetInput) throw new Error('找不到待重命名文档')
  const newTitle = newTitleInput.trim()
  if (!newTitle) throw new Error('新标题不能为空')
  const existing = index.titleToIds.get(newTitle)?.filter((id) => id !== targetId) ?? []
  if (existing.length) throw new Error('新标题已存在')

  const referenceChanges: RenameReferenceChange[] = []
  for (const input of docs) {
    if (input.id === targetId) continue
    const indexed = index.byId.get(input.id)
    if (!indexed) continue
    const rewritten = rewriteReferenceDoc(indexed, input.contentMarkdown, target.title, newTitle)
    if (rewritten.markdown !== input.contentMarkdown) {
      referenceChanges.push({
        id: input.id,
        title: input.title,
        before: input.contentMarkdown,
        after: rewritten.markdown,
        lines: rewritten.lines,
      })
    }
  }

  const rewrittenTarget = rewriteReferenceDoc(target, targetInput.contentMarkdown, target.title, newTitle)
  return {
    targetId,
    oldTitle: target.title,
    newTitle,
    targetBefore: targetInput.contentMarkdown,
    targetAfter: setFrontmatterTitle(rewrittenTarget.markdown, newTitle),
    referenceChanges,
  }
}

export async function executeRenamePlan(
  plan: WorkspaceRenamePlan,
  executor: RenameExecutor,
): Promise<{ targetId: string }> {
  const applied: RenameReferenceChange[] = []
  try {
    for (const change of plan.referenceChanges) {
      await executor.update(change.id, change.after)
      applied.push(change)
    }
    const targetId = await executor.rename(plan.targetId, plan.newTitle, plan.targetAfter)
    return { targetId }
  } catch (error) {
    for (const change of applied.reverse()) {
      try {
        await executor.update(change.id, change.before)
      } catch {
        // 保留原始错误；调用方可重新加载并提示人工检查。
      }
    }
    throw error
  }
}
