// M6-1: docx.js 结构化 Word（markdown-it token → docx.js 对象）
// 替代旧 html-docx-js-typescript 的 altChunk 方案，输出真正可编辑的 Word 文档。
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, AlignmentType,
  ImageRun, BorderStyle,
  ExternalHyperlink, FootnoteReferenceRun,
  type IRunOptions, type IParagraphOptions,
} from 'docx'
import { renderStatic } from './render-static'
import { saveFile } from './save'
import type { ThemeTokens } from '../themes/presets'
import type { DocxTemplate } from './docx'

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

// ── 模板样式 ──
interface TemplateStyle {
  fontFamily: string
  headingFamily: string
  fontSize: number // pt
  h1Size: number
  h2Size: number
  h3Size: number
  lineHeight: number
}

const TEMPLATES: Record<DocxTemplate, TemplateStyle> = {
  default: { fontFamily: 'Arial', headingFamily: 'Arial', fontSize: 11, h1Size: 22, h2Size: 17, h3Size: 14, lineHeight: 1.6 },
  official: { fontFamily: 'SimSun', headingFamily: 'SimHei', fontSize: 12, h1Size: 22, h2Size: 16, h3Size: 14, lineHeight: 1.5 },
  academic: { fontFamily: 'Times New Roman', headingFamily: 'Times New Roman', fontSize: 12, h1Size: 18, h2Size: 15, h3Size: 13, lineHeight: 1.8 },
  minimal: { fontFamily: 'Helvetica Neue', headingFamily: 'Helvetica Neue', fontSize: 11, h1Size: 20, h2Size: 16, h3Size: 13, lineHeight: 1.7 },
}

// ── inline HTML → TextRun[] ──
function inlineToRuns(html: string, base: IRunOptions = {}): (TextRun | ExternalHyperlink)[] {
  const runs: (TextRun | ExternalHyperlink)[] = []
  // 简单的 HTML 标签解析（支持 <b>, <strong>, <i>, <em>, <code>, <a>, <s>, <sup>, <sub>）
  const tagRe = /<(\/?)(b|strong|i|em|code|a|s|del|sup|sub)([^>]*)>([\s\S]*?)<\/?\2>/gi
  let lastIdx = 0
  let match: RegExpExecArray | null
  const stack: IRunOptions[] = [{ ...base }]

  while ((match = tagRe.exec(html)) !== null) {
    // 前面的纯文本
    if (match.index > lastIdx) {
      const text = html.slice(lastIdx, match.index)
      if (text) runs.push(new TextRun({ text, ...stack[stack.length - 1] }))
    }

    const isClose = match[1] === '/'
    const tag = match[2].toLowerCase()
    const content = match[4]

    if (isClose) {
      stack.pop()
    } else {
      const top = { ...stack[stack.length - 1] }
      if (tag === 'b' || tag === 'strong') top.bold = true
      if (tag === 'i' || tag === 'em') top.italics = true
      if (tag === 's' || tag === 'del') top.strike = true
      if (tag === 'code') { top.font = 'Consolas'; top.size = 20; /* 10pt */ }
      if (tag === 'sup') top.superScript = true
      if (tag === 'sub') top.subScript = true
      if (tag === 'a') {
        const href = match[3].match(/href="([^"]+)"/)?.[1] || ''
        if (href && content) {
          runs.push(new ExternalHyperlink({ children: [new TextRun({ text: content, style: 'Hyperlink', ...top })], link: href }))
          lastIdx = match.index + match[0].length
          continue
        }
      }
      stack.push(top)
    }

    if (content && tag !== 'a') {
      runs.push(new TextRun({ text: content, ...stack[stack.length - 1] }))
    }
    lastIdx = match.index + match[0].length
  }

  // 剩余文本
  if (lastIdx < html.length) {
    const text = html.slice(lastIdx)
    if (text) runs.push(new TextRun({ text, ...stack[stack.length - 1] }))
  }

  return runs.length ? runs : [new TextRun({ text: html, ...base })]
}

// ── markdown-it token 流 → docx.js Paragraph[] ──
function tokensToDocx(tokens: any[], tpl: TemplateStyle): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = []
  let i = 0

  while (i < tokens.length) {
    const tok = tokens[i]

    // 标题
    if (tok.type === 'heading_open') {
      const level = parseInt(tok.tag?.[1] || '1') as 1 | 2 | 3 | 4 | 5 | 6
      const inline = tokens[i + 1]
      const text = inline?.children?.map((c: any) => c.content || '').join('') || ''
      const headingMap: Record<number, typeof HeadingLevel[keyof typeof HeadingLevel]> = {
        1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3,
        4: HeadingLevel.HEADING_4, 5: HeadingLevel.HEADING_5, 6: HeadingLevel.HEADING_6,
      }
      const sizeMap: Record<number, number> = { 1: tpl.h1Size, 2: tpl.h2Size, 3: tpl.h3Size, 4: tpl.fontSize + 1, 5: tpl.fontSize, 6: tpl.fontSize - 1 }
      elements.push(new Paragraph({
        heading: headingMap[level],
        children: [new TextRun({ text, bold: true, size: sizeMap[level] * 2, font: tpl.headingFamily })],
      }))
      i += 3 // open + inline + close
      continue
    }

    // 段落
    if (tok.type === 'paragraph_open') {
      const inline = tokens[i + 1]
      if (inline?.children) {
        const runs = inlineTokensToRuns(inline.children, tpl)
        elements.push(new Paragraph({ children: runs, spacing: { line: tpl.lineHeight * 240 } }))
      }
      i += 3
      continue
    }

    // 列表项
    if (tok.type === 'bullet_list_open' || tok.type === 'ordered_list_open') {
      const isOrdered = tok.type === 'ordered_list_open'
      let itemIdx = 1
      i++
      while (i < tokens.length && tokens[i].type !== 'bullet_list_close' && tokens[i].type !== 'ordered_list_close') {
        if (tokens[i].type === 'list_item_open') {
          i++
          // 找到段落内容
          while (i < tokens.length && tokens[i].type !== 'list_item_close') {
            if (tokens[i].type === 'paragraph_open') {
              const inline = tokens[i + 1]
              if (inline?.children) {
                const runs = inlineTokensToRuns(inline.children, tpl)
                const bullet = isOrdered ? itemIdx + '. ' : '• '
                runs.unshift(new TextRun({ text: bullet, bold: true }))
                elements.push(new Paragraph({ children: runs, indent: { left: 720 } }))
                itemIdx++
              }
              i += 3
            } else {
              i++
            }
          }
        } else {
          i++
        }
      }
      i++ // skip close
      continue
    }

    // 引用
    if (tok.type === 'blockquote_open') {
      i++
      while (i < tokens.length && tokens[i].type !== 'blockquote_close') {
        if (tokens[i].type === 'paragraph_open') {
          const inline = tokens[i + 1]
          if (inline?.children) {
            const runs = inlineTokensToRuns(inline.children, tpl)
            elements.push(new Paragraph({
              children: runs,
              indent: { left: 720 },
              border: { left: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC', space: 4 } },
            }))
          }
          i += 3
        } else {
          i++
        }
      }
      i++
      continue
    }

    // 代码块
    if (tok.type === 'fence') {
      const code = tok.content || ''
      const lang = tok.info?.trim() || ''
      elements.push(new Paragraph({
        children: [new TextRun({ text: (lang ? `[${lang}] ` : '') + code, font: 'Consolas', size: 18, color: '333333' })],
        spacing: { before: 120, after: 120 },
      }))
      i++
      continue
    }

    // 水平线
    if (tok.type === 'hr') {
      elements.push(new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC', space: 4 } },
        spacing: { before: 200, after: 200 },
      }))
      i++
      continue
    }

    // 表格
    if (tok.type === 'table_open') {
      const rows: TableRow[] = []
      i++
      let isHeader = false
      while (i < tokens.length && tokens[i].type !== 'table_close') {
        if (tokens[i].type === 'thead_open') { isHeader = true; i++; continue }
        if (tokens[i].type === 'thead_close') { isHeader = false; i++; continue }
        if (tokens[i].type === 'tr_open') {
          const cells: TableCell[] = []
          i++
          while (i < tokens.length && tokens[i].type !== 'tr_close') {
            if (tokens[i].type === 'th_open' || tokens[i].type === 'td_open') {
              const inline = tokens[i + 1]
              const text = inline?.children?.map((c: any) => c.content || '').join('') || ''
              cells.push(new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text, bold: isHeader, size: 22 })] })],
                shading: isHeader ? { fill: 'F0F0F3' } : undefined,
              }))
              i += 3 // open + inline + close
            } else {
              i++
            }
          }
          if (cells.length) rows.push(new TableRow({ children: cells }))
        }
        i++
      }
      if (rows.length) {
        elements.push(new Table({
          rows,
          width: { size: 100, type: WidthType.PERCENTAGE },
        }))
      }
      i++
      continue
    }

    i++
  }

  return elements
}

// 内联 token → TextRun[]（栈式单遍解析，避免重复输出）
function inlineTokensToRuns(children: any[], tpl: TemplateStyle): (TextRun | ExternalHyperlink)[] {
  const runs: (TextRun | ExternalHyperlink)[] = []
  const stack: { bold?: boolean; italics?: boolean; strike?: boolean; font?: string; size?: number }[] = [{}]

  function currentStyle() {
    const base = stack[stack.length - 1]
    return { font: tpl.fontFamily, size: tpl.fontSize * 2, ...base }
  }

  for (let i = 0; i < children.length; i++) {
    const c = children[i]
    const t = c.type

    if (t === 'strong_open') { stack.push({ ...stack[stack.length - 1], bold: true }) }
    else if (t === 'strong_close' && stack.length > 1) { stack.pop() }
    else if (t === 'em_open') { stack.push({ ...stack[stack.length - 1], italics: true }) }
    else if (t === 'em_close' && stack.length > 1) { stack.pop() }
    else if (t === 's_open') { stack.push({ ...stack[stack.length - 1], strike: true }) }
    else if (t === 's_close' && stack.length > 1) { stack.pop() }
    else if (t === 'text') {
      runs.push(new TextRun({ text: c.content, ...currentStyle() }))
    }
    else if (t === 'code_inline') {
      runs.push(new TextRun({ text: c.content, font: 'Consolas', size: 20 }))
    }
    else if (t === 'link_open') {
      const href = c.attrGet('href') || ''
      // 收集链接文本直到 link_close
      const linkText: string[] = []
      let depth = 0
      for (let j = i; j < children.length; j++) {
        if (children[j].type === 'link_open') depth++
        if (children[j].type === 'link_close') { depth--; if (depth === 0) break }
        if (children[j].type === 'text') linkText.push(children[j].content)
      }
      const text = linkText.join('')
      if (href.startsWith('http')) {
        runs.push(new ExternalHyperlink({ children: [new TextRun({ text, style: 'Hyperlink', ...currentStyle() })], link: href }))
      } else {
        runs.push(new TextRun({ text, ...currentStyle() }))
      }
    }
  }
  return runs.length ? runs : [new TextRun({ text: '' })]
}

// ── 导出入口 ──
export async function exportDocxStructured(
  markdown: string,
  theme: ThemeTokens,
  filename = 'document.docx',
  template: DocxTemplate = 'default',
) {
  const tpl = TEMPLATES[template]

  // 解析 markdown
  const md = (await import('markdown-it')).default()
  const tokens = md.parse(markdown, {})

  // 转为 docx.js 元素
  const elements = tokensToDocx(tokens, tpl)

  // 创建文档
  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: tpl.fontFamily, size: tpl.fontSize * 2 } },
        heading1: { run: { font: tpl.headingFamily, size: tpl.h1Size * 2, bold: true } },
        heading2: { run: { font: tpl.headingFamily, size: tpl.h2Size * 2, bold: true } },
        heading3: { run: { font: tpl.headingFamily, size: tpl.h3Size * 2, bold: true } },
      },
    },
    sections: [{ children: elements }],
  })

  // 生成 blob
  const blob = await Packer.toBlob(doc)
  await saveFile(filename, blob, DOCX_MIME)
}
