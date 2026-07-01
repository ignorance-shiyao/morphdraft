import pptxgen from 'pptxgenjs'
import { captureSlides, type SlideDims } from './slide-capture'
import { saveFile } from './save'
import { slidesToPdfBlob } from './pdf-image'
import type { ThemeTokens } from '../themes/presets'

const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
const DEFAULT_DIMS: SlideDims = { w: 1280, h: 720 }
const PPI = 128

// 高保真混合导出：整页高清 PNG 打底（所见即所得），图表以可编辑 SVG 叠在原位。
export async function exportPptxHiFi(
  markdown: string,
  theme: ThemeTokens,
  dims: SlideDims = DEFAULT_DIMS,
  filename = 'slides.pptx',
  onProgress?: (current: number, total: number) => void,
) {
  const slides = await captureSlides(markdown, theme, dims)
  const wIn = dims.w / PPI
  const hIn = dims.h / PPI
  const pptx = new pptxgen()
  pptx.defineLayout({ name: 'CUSTOM', width: wIn, height: hIn })
  pptx.layout = 'CUSTOM'

  for (let i = 0; i < slides.length; i++) {
    const s = slides[i]
    onProgress?.(i + 1, slides.length)
    const slide = pptx.addSlide()
    slide.addImage({ data: s.png, x: 0, y: 0, w: wIn, h: hIn })
    for (const c of s.charts) {
      slide.addImage({ data: c.svg, x: c.xIn, y: c.yIn, w: c.wIn, h: c.hIn })
    }
  }

  // 输出为 blob 后统一走保存适配层（桌面=原生另存为，浏览器=下载）
  const blob = (await pptx.write({ outputType: 'blob' })) as Blob
  await saveFile(filename, blob, PPTX_MIME)
}

// 高保真 PDF：每页整页 PNG → jsPDF 生成真 PDF 文件（桌面/浏览器都稳，不依赖打印窗口）。
export async function exportPdfHiFi(
  markdown: string,
  theme: ThemeTokens,
  dims: SlideDims = DEFAULT_DIMS,
  filename = 'slides.pdf',
) {
  const slides = await captureSlides(markdown, theme, dims)
  if (!slides.length) return
  const blob = slidesToPdfBlob(
    slides.map((s) => s.png),
    dims.w,
    dims.h,
  )
  await saveFile(filename, blob, 'application/pdf')
}
