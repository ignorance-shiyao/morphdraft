import { blockRange, moveBlockByLine } from './blockReorder'
import { headingSections, parseMarkdownHeadings, type HeadingSection } from './headingSections'

function sectionAtLine(markdown: string, line: number): HeadingSection | null {
  return headingSections(markdown, parseMarkdownHeadings(markdown)).find((s) => s.heading.line === line) ?? null
}

function targetInsertLine(markdown: string, toLine: number, placeAfter: boolean): number {
  const targetSection = sectionAtLine(markdown, toLine)
  if (targetSection) return placeAfter ? targetSection.end : targetSection.start
  const lines = markdown.split('\n')
  const targetBlock = blockRange(lines, toLine)
  return placeAfter ? targetBlock.end + 1 : targetBlock.start
}

function moveHeadingSectionByLine(markdown: string, fromLine: number, toLine: number, placeAfter: boolean): string {
  const source = sectionAtLine(markdown, fromLine)
  if (!source) return markdown
  if (toLine >= source.start && toLine < source.end) return markdown

  const lines = markdown.split('\n')
  const moved = lines.slice(source.start, source.end)
  const insertBeforeRemoval = targetInsertLine(markdown, toLine, placeAfter)
  const removedCount = source.end - source.start
  const without = [...lines.slice(0, source.start), ...lines.slice(source.end)]
  const insertAt = insertBeforeRemoval > source.start
    ? insertBeforeRemoval - removedCount
    : insertBeforeRemoval
  without.splice(Math.max(0, Math.min(insertAt, without.length)), 0, ...moved)
  return without.join('\n')
}

export function moveDocumentUnitByLine(
  markdown: string,
  fromLine: number,
  toLine: number,
  placeAfter: boolean,
): string {
  if (fromLine === toLine) return markdown
  const lineCount = markdown.split('\n').length
  if (fromLine < 0 || toLine < 0 || fromLine >= lineCount || toLine >= lineCount) return markdown
  if (sectionAtLine(markdown, fromLine)) return moveHeadingSectionByLine(markdown, fromLine, toLine, placeAfter)
  return moveBlockByLine(markdown, fromLine, toLine, placeAfter)
}
