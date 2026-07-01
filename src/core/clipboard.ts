// 智能粘贴：HTML→Markdown（turndown + GFM 表格/删除线），以及图片粘贴/拖入存附件库。
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'
import { saveAsset } from './assets'

let turndown: TurndownService | null = null

function getTurndown(): TurndownService {
  if (turndown) return turndown
  const td = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
    strongDelimiter: '**',
    linkStyle: 'inlined',
  })
  td.use(gfm)
  td.remove(['style', 'script', 'meta', 'link'])
  // 不要给文本里的 markdown 特殊字符加反斜杠转义：粘贴本就是 markdown 的内容时，
  // 默认转义会把 # > - | 等全部变成 \# \> \- \|，污染源码。宁可不转义。
  td.escape = (s: string) => s
  turndown = td
  return td
}

export function htmlToMarkdown(html: string): string {
  return getTurndown()
    .turndown(html)
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// 把 File（图片）存入附件库（vault 落盘 / 否则 IndexedDB），返回 asset:// 占位符。
export async function fileToAsset(file: File): Promise<string | null> {
  try {
    const blob = file instanceof Blob ? file : new Blob([file])
    return await saveAsset(blob, file.type || 'image/png')
  } catch {
    return null
  }
}

export function firstImageFile(dt: DataTransfer | null): File | null {
  if (!dt) return null
  const files = Array.from(dt.files || [])
  const f = files.find((x) => x.type.startsWith('image/'))
  if (f) return f
  for (const item of Array.from(dt.items || [])) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) return file
    }
  }
  return null
}
