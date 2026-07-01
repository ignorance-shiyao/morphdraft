import { safeFilename } from './filename'
import { isTauri, saveFile } from './save'
import { captureSlidePages, type SlideDims } from './slide-capture'
import type { ThemeTokens } from '../themes/presets'

export function slidePngFilename(title: string, index: number, total: number): string {
  const digits = Math.max(2, String(Math.max(1, total)).length)
  const page = String(index + 1).padStart(digits, '0')
  return safeFilename(`${title || '未命名文档'}-第${page}页`, 'png')
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, body = ''] = dataUrl.split(',', 2)
  const mime = header.match(/^data:([^;]+)/)?.[1] || 'image/png'
  const bytes = atob(body)
  const out = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) out[i] = bytes.charCodeAt(i)
  return new Blob([out], { type: mime })
}

export async function exportSlidePngs(
  markdown: string,
  theme: ThemeTokens,
  dims: SlideDims,
  indices: number[],
  title: string,
): Promise<number> {
  const { pages, total } = await captureSlidePages(markdown, theme, indices, dims)
  if (!pages.length) throw new Error('没有可导出的幻灯片页面')

  if (pages.length === 1) {
    const page = pages[0]
    await saveFile(slidePngFilename(title, page.index, total), dataUrlToBlob(page.png), 'image/png')
    return 1
  }

  if (isTauri()) {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const { writeFile } = await import('@tauri-apps/plugin-fs')
      const dir = await open({ directory: true, multiple: false, title: '选择 PNG 导出目录' })
      if (!dir || typeof dir !== 'string') return 0
      for (const page of pages) {
        const blob = dataUrlToBlob(page.png)
        await writeFile(`${dir}/${slidePngFilename(title, page.index, total)}`, new Uint8Array(await blob.arrayBuffer()))
      }
      return pages.length
    } catch {
      // 原生目录选择不可用时回落为 ZIP 另存为。
    }
  }

  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  for (const page of pages) {
    zip.file(slidePngFilename(title, page.index, total), dataUrlToBlob(page.png))
  }
  const blob = await zip.generateAsync({ type: 'blob' })
  await saveFile(safeFilename(`${title || '未命名文档'}-选定页`, 'zip'), blob, 'application/zip')
  return pages.length
}
