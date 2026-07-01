import { jsPDF } from 'jspdf'
import type { PaperSize } from '../paper'

// 多张等比图片（如每页幻灯片）→ 一页一张的 PDF（页面尺寸=图片尺寸，单位 px）。
export function slidesToPdfBlob(pngs: string[], wPx: number, hPx: number): Blob {
  const doc = new jsPDF({
    orientation: wPx >= hPx ? 'landscape' : 'portrait',
    unit: 'px',
    format: [wPx, hPx],
    compress: true,
  })
  pngs.forEach((png, i) => {
    if (i > 0) doc.addPage([wPx, hPx], wPx >= hPx ? 'landscape' : 'portrait')
    doc.addImage(png, 'PNG', 0, 0, wPx, hPx)
  })
  return doc.output('blob')
}

const PDF_PAPER: Record<PaperSize, [number, number]> = {
  a4: [595.28, 841.89],
  a5: [419.53, 595.28],
  a6: [297.64, 419.53],
  letter: [612, 792],
}

// 一张很长的图片 → 按指定纸张纵向分页（内容超出页面部分自动落到下一页）。
// paginate=false 时输出单张「连续长页」（纸张宽 × 内容总高），不切分。
export function tallImageToPdfBlob(
  png: string,
  imgWpx: number,
  imgHpx: number,
  paperSize: PaperSize = 'a4',
  paginate = true,
): Blob {
  const format = PDF_PAPER[paperSize]
  if (!paginate) {
    const w = PDF_PAPER[paperSize][0]
    const h = (imgHpx * w) / imgWpx
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: [w, h], compress: true })
    doc.addImage(png, 'PNG', 0, 0, w, h)
    return doc.output('blob')
  }
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format, compress: true })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const renderW = pageW
  const renderH = (imgHpx * renderW) / imgWpx // 等比缩放后的总高度（pt）
  let remaining = renderH
  let offset = 0
  while (remaining > 0) {
    doc.addImage(png, 'PNG', 0, -offset, renderW, renderH)
    remaining -= pageH
    offset += pageH
    if (remaining > 0) doc.addPage(format, 'portrait')
  }
  return doc.output('blob')
}
