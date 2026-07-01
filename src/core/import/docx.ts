// M8-1: Word 导入（mammoth docx→HTML → turndown HTML→md）
import mammoth from 'mammoth'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'

function createTurndown(): TurndownService {
  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  })
  td.use(gfm)

  // 保留图片
  td.addRule('images', {
    filter: 'img',
    replacement: (_content, node) => {
      const el = node as HTMLImageElement
      const src = el.getAttribute('src') || ''
      const alt = el.getAttribute('alt') || ''
      return `![${alt}](${src})`
    },
  })

  // 保留表格（turndown GFM 插件已处理）
  // 保留代码块
  td.addRule('fencedCode', {
    filter: (node) => {
      return node.nodeName === 'PRE' && node.firstChild?.nodeName === 'CODE'
    },
    replacement: (_content, node) => {
      const code = node.querySelector('code')
      const text = code?.textContent || node.textContent || ''
      const className = code?.className || ''
      const lang = className.replace(/^language-/, '').trim()
      return `\n\`\`\`${lang}\n${text}\n\`\`\`\n`
    },
  })

  return td
}

export interface WordImportResult {
  markdown: string
  title: string
  imageCount: number
}

// docx 字节 → markdown（供统一本地导入复用，不依赖 File）
export async function docxToMarkdown(arrayBuffer: ArrayBuffer): Promise<string> {
  // 1. mammoth: docx → HTML
  const result = await mammoth.convertToHtml({ arrayBuffer })
  // 2. turndown: HTML → markdown
  const markdown = createTurndown().turndown(result.value)
  // 3. 清理空行；mammoth 默认把图片内联为 base64，转存到附件库为 asset://
  const { externalizeDataImages } = await import('../markdown/externalizeImages')
  return externalizeDataImages(markdown.replace(/\n{3,}/g, '\n\n').trim())
}

export async function importWord(file: File): Promise<WordImportResult> {
  const markdown = await docxToMarkdown(await file.arrayBuffer())
  const title = file.name.replace(/\.docx?$/i, '') || '导入文档'
  const imageCount = (markdown.match(/!\[/g) || []).length
  return { markdown, title, imageCount }
}
