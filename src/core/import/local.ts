// 统一本地文档 → Markdown：md/markdown/txt 直接打开；其他格式转换后导入。
// 桌面端若检测到系统 `markitdown` 命令则优先用它（高保真），否则回落纯 JS 转换器。

import { isTauri } from '../vaultPath'
import {
    csvToMarkdown, jsonToMarkdown, xlsxToMarkdown, pptxToMarkdown,
    pdfToMarkdown, pdfToMarkdownLite,
} from './converters'

// 支持的扩展名（用于文件对话框 filters / 拖放过滤）
export const SUPPORTED_EXTS = [
  'md', 'markdown', 'txt',
  'docx', 'doc', 'html', 'htm', 'csv', 'tsv', 'json', 'xlsx', 'xls', 'pptx', 'pdf',
]

export function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i + 1).toLowerCase() : ''
}

// 直接打开（无需转换）的纯文本格式
export function isDirectOpen(ext: string): boolean {
  return ext === 'md' || ext === 'markdown' || ext === 'txt'
}

export function isSupported(name: string): boolean {
  return SUPPORTED_EXTS.includes(extOf(name))
}

export interface LocalSource {
  name: string
  path?: string // Tauri 原生对话框选中的绝对路径
  file?: File // 浏览器 File / 拖放
}

export interface ConvertResult {
  title: string
  markdown: string
  via: 'direct' | 'markitdown' | string // string = 用到的 JS 转换器扩展名
}

export interface ConvertProgress {
  stage: 'reading' | 'converting' | 'saving'
  detail?: string
}

async function readBytes(src: LocalSource): Promise<Uint8Array> {
  if (src.file) return new Uint8Array(await src.file.arrayBuffer())
  if (src.path && isTauri()) {
    const { readFile } = await import('@tauri-apps/plugin-fs')
    return readFile(src.path)
  }
  throw new Error('无法读取文件字节')
}

async function readText(src: LocalSource): Promise<string> {
  if (src.file) return src.file.text()
  if (src.path && isTauri()) {
    const { readTextFile } = await import('@tauri-apps/plugin-fs')
    return readTextFile(src.path)
  }
  throw new Error('无法读取文件文本')
}

function deriveTitle(name: string, markdown: string): string {
  const h = /^#{1,3}\s+(.+)$/m.exec(markdown)
  if (h) return h[1].trim()
  const base = name.replace(/\.[^.]+$/, '').trim()
  return base || '导入文档'
}

// —— markitdown CLI（桌面可选）——
let mdAvail: Promise<boolean> | undefined
export function markitdownAvailable(): Promise<boolean> {
  if (!isTauri()) return Promise.resolve(false)
  if (mdAvail) return mdAvail
  mdAvail = (async () => {
    try {
      const { Command } = await import('@tauri-apps/plugin-shell')
      const out = await Command.create('markitdown', ['--version']).execute()
      return out.code === 0
    } catch {
      return false
    }
  })()
  return mdAvail
}

async function runMarkitdown(path: string): Promise<string> {
  const { Command } = await import('@tauri-apps/plugin-shell')
  const out = await Command.create('markitdown', [path]).execute()
  if (out.code !== 0) throw new Error(out.stderr || 'markitdown 转换失败')
  return out.stdout
}

// PDF：优先 liteparse-wasm（高保真），失败或空结果回落 pdfjs（兜底，含扫描件纯文本）
export async function convertPdf(bytes: Uint8Array): Promise<string> {
    try {
        const md = await pdfToMarkdownLite(bytes)
        if (md.trim()) return md
    } catch (e) {
        console.warn('[import] liteparse PDF 解析失败，回落 pdfjs：', e)
    }
    return pdfToMarkdown(bytes)
}

// 用纯 JS 转换器按扩展名转换
async function convertWithJs(ext: string, src: LocalSource): Promise<string> {
  switch (ext) {
    case 'docx':
    case 'doc': {
      const { docxToMarkdown } = await import('./docx')
      const bytes = await readBytes(src)
      return docxToMarkdown(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
    }
    case 'html':
    case 'htm': {
      const { htmlToMarkdown } = await import('../clipboard')
      return htmlToMarkdown(await readText(src))
    }
    case 'csv':
      return csvToMarkdown(await readText(src), ',')
    case 'tsv':
      return csvToMarkdown(await readText(src), '\t')
    case 'json':
      return jsonToMarkdown(await readText(src))
    case 'xlsx':
    case 'xls':
      return xlsxToMarkdown(await readBytes(src))
    case 'pptx':
      return pptxToMarkdown(await readBytes(src))
    case 'pdf':
        return convertPdf(await readBytes(src))
    default:
      throw new Error(`不支持的文件类型：.${ext}`)
  }
}

export async function convertToMarkdown(
  src: LocalSource,
  onProgress?: (info: ConvertProgress) => void,
): Promise<ConvertResult> {
  const ext = extOf(src.name)
  onProgress?.({ stage: 'reading' })

  // 1. 纯文本直接打开
  if (isDirectOpen(ext)) {
    const markdown = await readText(src)
    return { title: deriveTitle(src.name, markdown), markdown, via: 'direct' }
  }

  // 2. 桌面 + 有路径 + markitdown 可用 → 优先用 markitdown
  if (isTauri() && src.path && (await markitdownAvailable())) {
    onProgress?.({ stage: 'converting', detail: 'markitdown' })
    try {
      const markdown = await runMarkitdown(src.path)
      return { title: deriveTitle(src.name, markdown), markdown, via: 'markitdown' }
    } catch {
      // markitdown 失败 → 回落 JS
    }
  }

  // 3. 纯 JS 转换器
  onProgress?.({ stage: 'converting', detail: ext })
  const markdown = await convertWithJs(ext, src)
  return { title: deriveTitle(src.name, markdown), markdown, via: ext }
}
