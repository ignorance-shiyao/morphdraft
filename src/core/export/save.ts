import { saveAs } from 'file-saver'
// isTauri 单一来源在 vaultPath；此处再导出，兼容既有 `from '../export/save'` 的 import 路径
import { isTauri } from '../vaultPath'
import { SUPPORTED_EXTS, type LocalSource } from '../import/local'
export { isTauri }

function toBytes(data: Blob | Uint8Array | ArrayBuffer): Promise<Uint8Array> {
  if (data instanceof Uint8Array) return Promise.resolve(data)
  if (data instanceof ArrayBuffer) return Promise.resolve(new Uint8Array(data))
  return data.arrayBuffer().then((b) => new Uint8Array(b))
}

function extFilters(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  const names: Record<string, string> = {
    pdf: 'PDF', pptx: 'PowerPoint', html: '网页', md: 'Markdown', json: 'JSON', png: '图片', zip: '压缩包',
  }
  return ext ? [{ name: names[ext] || ext.toUpperCase(), extensions: [ext] }] : []
}

// 桌面端：原生「另存为」对话框 + 写文件；浏览器端：saveAs 下载。
export async function saveFile(
  filename: string,
  data: Blob | Uint8Array | ArrayBuffer,
  mime = 'application/octet-stream',
): Promise<boolean> {
  if (isTauri()) {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog')
      const { writeFile } = await import('@tauri-apps/plugin-fs')
      const path = await save({ defaultPath: filename, filters: extFilters(filename) })
      if (!path) return false // 用户取消
      await writeFile(path, await toBytes(data))
      return true
    } catch {
      // 插件未启用或失败 → 回落浏览器下载
    }
  }
  const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type: mime })
  saveAs(blob, filename)
  return true
}

const IMG_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp']

// 选择本地图片 → 返回 File（不转 base64）。调用方通常再交给 fileToAsset 存附件库（asset://）。
// 桌面端用原生对话框读字节包成 File；浏览器端用 input file。
export async function pickImageFile(): Promise<File | null> {
  if (isTauri()) {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const { readFile } = await import('@tauri-apps/plugin-fs')
      const path = await open({
        multiple: false,
        filters: [{ name: '图片', extensions: IMG_EXTS }],
      })
      if (!path || typeof path !== 'string') return null
      const bytes = await readFile(path)
      const name = path.split('/').pop() || path.split('\\').pop() || 'image.png'
      const ext = name.split('.').pop()?.toLowerCase() || 'png'
      const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : `image/${ext}`
      return new File([new Uint8Array(bytes)], name, { type: mime })
    } catch {
      /* fall through */
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.click()
  })
}

// 统一「打开本地文档」选择器：Tauri 返回 { name, path }，浏览器返回 { name, file }。
// 覆盖所有 SUPPORTED_EXTS（md 直开 / 其他转换由 convertToMarkdown 处理）。
export async function openLocalDocFile(): Promise<LocalSource | null> {
  if (isTauri()) {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const path = await open({
        multiple: false,
        filters: [{ name: '文档', extensions: SUPPORTED_EXTS }],
      })
      if (!path || typeof path !== 'string') return null
      const name = path.split(/[/\\]/).pop() || path
      return { name, path }
    } catch {
      /* 插件不可用 → 回落浏览器 input */
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = SUPPORTED_EXTS.map((e) => `.${e}`).join(',')
    input.onchange = () => {
      const file = input.files?.[0]
      resolve(file ? { name: file.name, file } : null)
    }
    input.click()
  })
}

// M8-1: 选择 Word 文件并返回 File 对象
export async function openWordFile(): Promise<File | null> {
  if (isTauri()) {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const path = await open({
        multiple: false,
        filters: [{ name: 'Word', extensions: ['docx', 'doc'] }],
      })
      if (!path || typeof path !== 'string') return null
      // 在 Tauri 中读取文件并返回 File 对象
      const { readFile } = await import('@tauri-apps/plugin-fs')
      const bytes = await readFile(path)
      const name = path.split('/').pop() || path.split('\\').pop() || 'import.docx'
      return new File([new Uint8Array(bytes)], name, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
    } catch { /* fall through */ }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.docx,.doc'
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.click()
  })
}
