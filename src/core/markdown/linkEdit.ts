export interface MarkdownLinkFields {
  text: string
  url: string
  title: string
}

export function parseMarkdownLink(source: string): MarkdownLinkFields | null {
  const match = source.match(/^\[([^\]]+)]\((<[^>]+>|[^)\s]+)(?:\s+"((?:\\"|[^"])*)")?\)$/)
  if (!match) return null
  const rawUrl = match[2]
  return {
    text: match[1],
    url: rawUrl.startsWith('<') && rawUrl.endsWith('>') ? rawUrl.slice(1, -1) : rawUrl,
    title: (match[3] ?? '').replace(/\\"/g, '"'),
  }
}

export function buildMarkdownLink(fields: MarkdownLinkFields): string {
  const text = fields.text || fields.url
  const url = /\s/.test(fields.url) ? `<${fields.url}>` : fields.url
  const title = fields.title ? ` "${fields.title.replace(/"/g, '\\"')}"` : ''
  return `[${text}](${url}${title})`
}
