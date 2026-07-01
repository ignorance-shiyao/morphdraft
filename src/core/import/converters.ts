// 纯 JS 本地文档 → Markdown 转换器（默认路径，无需 markitdown）。
// 各重型库（xlsx/pdfjs/jszip）懒加载，浏览器主包不受影响。

// —— 表格工具 ——
function escCell(v: unknown): string {
  return String(v ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim()
}

// 二维数组 → GFM 表格（首行为表头；空数据返回空串）
export function rowsToTable(rows: unknown[][]): string {
  const nonEmpty = rows.filter((r) => r.some((c) => String(c ?? '').trim() !== ''))
  if (!nonEmpty.length) return ''
  const cols = Math.max(...nonEmpty.map((r) => r.length))
  const pad = (r: unknown[]) => Array.from({ length: cols }, (_, i) => escCell(r[i]))
  const head = pad(nonEmpty[0])
  const body = nonEmpty.slice(1).map(pad)
  const lines = [
    `| ${head.join(' | ')} |`,
    `| ${head.map(() => '---').join(' | ')} |`,
    ...body.map((r) => `| ${r.join(' | ')} |`),
  ]
  return lines.join('\n')
}

// —— CSV / TSV ——
// 解析一段分隔符文本为二维数组（支持引号包裹、字段内换行、"" 转义）
export function parseDelimited(text: string, delim: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const src = text.replace(/\r\n/g, '\n')
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else field += c
    } else if (c === '"') {
      inQuotes = true
    } else if (c === delim) {
      row.push(field); field = ''
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = ''
    } else field += c
  }
  row.push(field)
  if (row.length > 1 || row[0] !== '') rows.push(row)
  return rows
}

export function csvToMarkdown(text: string, delim = ','): string {
  return rowsToTable(parseDelimited(text, delim))
}

// —— JSON ——
// 扁平对象数组 → 表格；否则美化为 ```json 代码块
export function jsonToMarkdown(text: string): string {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return '```\n' + text.trim() + '\n```'
  }
  const isFlatObj = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === 'object' && !Array.isArray(v) &&
    Object.values(v).every((x) => x === null || typeof x !== 'object')
  if (Array.isArray(data) && data.length && data.every(isFlatObj)) {
    const keys = [...new Set(data.flatMap((o) => Object.keys(o as object)))]
    const rows = [keys, ...data.map((o) => keys.map((k) => (o as Record<string, unknown>)[k]))]
    return rowsToTable(rows)
  }
  return '```json\n' + JSON.stringify(data, null, 2) + '\n```'
}

// —— XLSX / XLS ——
export async function xlsxToMarkdown(bytes: Uint8Array): Promise<string> {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(bytes, { type: 'array' })
  const parts: string[] = []
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: '' })
    const table = rowsToTable(rows)
    if (table) parts.push(`## ${name}\n\n${table}`)
  }
  return parts.join('\n\n')
}

// —— PPTX ——（jszip 读各 slide xml，抽 <a:t> 文本）
export async function pptxToMarkdown(bytes: Uint8Array): Promise<string> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(bytes)
  const slideNames = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)\.xml$/)![1])
      const nb = Number(b.match(/slide(\d+)\.xml$/)![1])
      return na - nb
    })
  const parts: string[] = []
  for (let i = 0; i < slideNames.length; i++) {
    const xml = await zip.files[slideNames[i]].async('string')
    const texts = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) =>
      m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'"),
    )
    const body = texts.map((t) => t.trim()).filter(Boolean).join('\n\n')
    parts.push(`## 第 ${i + 1} 页\n\n${body}`)
  }
  return parts.join('\n\n---\n\n')
}

// —— PDF（liteparse-wasm）——
// 纯浏览器 WASM，启发式重建标题/表格/列表/链接，质量远好于下面 pdfjs 的纯换行。
// wasm 二进制（~4.7MB）作为独立资源 URL 懒加载，不进主包。
let liteInit: Promise<void> | undefined

async function ensureLiteParse(): Promise<void> {
    if (!liteInit) {
        liteInit = (async () => {
            const init = (await import('@llamaindex/liteparse-wasm')).default
            const wasmUrl = (await import('@llamaindex/liteparse-wasm/liteparse_wasm_bg.wasm?url')).default
            await init({module_or_path: wasmUrl})
        })()
    }
    return liteInit
}

export async function pdfToMarkdownLite(bytes: Uint8Array): Promise<string> {
    const {LiteParse} = await import('@llamaindex/liteparse-wasm')
    await ensureLiteParse()
    const parser = new LiteParse({
        outputFormat: 'markdown',
        imageMode: 'placeholder', // 浏览器无法落盘图片，仅占位
        ocrEnabled: false, // 浏览器无 OCR 后端，扫描件文本由 pdfjs 回落兜底
        extractLinks: true,
    })
    const result = await parser.parse(bytes)
    return String(result?.text ?? '').trim()
}

// —— PDF（pdfjs 回落）——（逐页抽文本；worker 走 import.meta.url）
export async function pdfToMarkdown(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()
  const doc = await pdfjs.getDocument({ data: bytes }).promise
  const parts: string[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    // 按 y 坐标换行：同一 transform[5] 视为同一行
    let lastY: number | null = null
    let line = ''
    const lines: string[] = []
    for (const item of content.items as Array<{ str: string; transform: number[] }>) {
      const y = item.transform[5]
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        lines.push(line.trimEnd()); line = ''
      }
      line += item.str
      lastY = y
    }
    if (line.trim()) lines.push(line.trimEnd())
    parts.push(`## 第 ${p} 页\n\n${lines.filter(Boolean).join('\n\n')}`)
  }
  return parts.join('\n\n---\n\n')
}
