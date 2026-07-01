import { domToPng } from 'modern-screenshot'
import { renderStatic } from './render-static'
import { captureSlides } from './slide-capture'
import { slidesToPdfBlob } from './pdf-image'
import { saveFile } from './save'
import { applyThemeTo } from '../themes/apply'
import { PAPER_SIZES, MARGIN_PRESETS, LINE_HEIGHTS, paperPadding, type PaperSize, type PaperMargin, type LineHeightKey } from '../paper'
import { paginateBlocks } from './paginate'
import type { SlideDims } from './slide-capture'
import type { ThemeTokens } from '../themes/presets'

const PXMM = 96 / 25.4

export interface ExportPdfOpts {
  lineHeight?: LineHeightKey
  dims?: SlideDims
  paperMargin?: PaperMargin
  onProgress?: (current: number, total: number) => void
}

// 生成真 PDF 文件（jsPDF），始终分页，样式与预览一致。
export async function exportPdf(
  markdown: string,
  theme: ThemeTokens,
  mode: 'document' | 'slide',
  paperSize: PaperSize = 'a4',
  opts: ExportPdfOpts = {},
  filename = mode === 'slide' ? 'slides.pdf' : 'document.pdf',
) {
  if (mode === 'slide') {
    const dims = opts.dims ?? { w: 1280, h: 720 }
    const slides = await captureSlides(markdown, theme, dims)
    if (!slides.length) return
    const blob = slidesToPdfBlob(slides.map((s) => s.png), dims.w, dims.h)
    await saveFile(filename, blob, 'application/pdf')
    return
  }

  // ── 文档模式：始终分页 ──
  const paper = PAPER_SIZES[paperSize]
  const pm: PaperMargin = opts.paperMargin ?? 'normal'
  const padding = paperPadding(paperSize, pm)
  const lh = LINE_HEIGHTS[opts.lineHeight ?? 'normal']

  // 1. 离屏渲染（与预览相同的 markdown-it + 图表管线）
  const r = await renderStatic(markdown, { dark: theme.dark, tokens: theme, width: paper.widthPx })
  applyThemeTo(r.el, theme)
  applyPreviewStyles(r.el, theme, paperSize, padding, lh.value)

  // 2. 用共享分页算法（与 DocumentPreview 预览同一份代码）
  const groups = paginateBlocks(r.el, paperSize, pm)
  if (!groups.length) {
    r.dispose()
    return
  }

  // 3. 逐页截图
  const pageW = paper.widthPx
  const pageH = Math.round(paper.heightMm * PXMM)
  const pngs: string[] = []

  for (let i = 0; i < groups.length; i++) {
    const g = groups[i]
    opts.onProgress?.(i + 1, groups.length)
    const sheet = document.createElement('div')
    sheet.className = 'doc-preview'
    sheet.style.cssText = [
      `position:fixed;left:-99999px;top:0`,
      `width:${pageW}px`,
      `height:${pageH}px`,
      `background:${theme.bg}`,
      `padding:${padding}`,
      `box-sizing:border-box`,
      `overflow:hidden`,
      `line-height:${lh.value}`,
      `font-family:${theme.fontFamily}`,
      `color:${theme.fg}`,
    ].join(';')
    applyThemeTo(sheet, theme)
    applyPreviewStyles(sheet, theme, paperSize, padding, lh.value)
    g.elements.forEach((el) => sheet.appendChild(el))
    document.body.appendChild(sheet)
    const png = await domToPng(sheet, { width: pageW, height: pageH, scale: 2, backgroundColor: theme.bg })
    sheet.remove()
    pngs.push(png)
  }

  r.dispose()

  // 4. 合并为 PDF
  const blob = slidesToPdfBlob(pngs, pageW, pageH)
  await saveFile(filename, blob, 'application/pdf')
}

// 给导出容器注入与 DocumentPreview 一致的排版样式
function applyPreviewStyles(el: HTMLElement, theme: ThemeTokens, paperSize: PaperSize, padding: string, lineHeight: number) {
  el.style.lineHeight = String(lineHeight)
  el.style.fontFamily = theme.fontFamily
  el.style.color = theme.fg

  // 注入内联样式覆盖（确保子元素跟随主题）
  const css = `
    h1, h2, h3, h4, h5, h6 {
      font-weight: ${theme.headingWeight};
      font-family: ${theme.headingFamily ?? theme.fontFamily};
    }
    h1 {
      border-bottom: 1px solid color-mix(in srgb, ${theme.primaryColor} 44%, ${theme.border});
      padding-bottom: 10px;
    }
    a { color: ${theme.primaryColor}; }
    code {
      background: color-mix(in srgb, ${theme.primaryColor} 10%, ${theme.codeBg});
      color: color-mix(in srgb, ${theme.primaryColor} 85%, ${theme.fg});
      padding: 2px 6px; border-radius: 5px; font-size: 0.88em;
      border: 1px solid color-mix(in srgb, ${theme.primaryColor} 18%, transparent);
    }
    pre {
      background: ${theme.codeBg}; padding: 14px 16px; border-radius: 10px;
      overflow: auto; border: 1px solid color-mix(in srgb, ${theme.border} 60%, transparent);
    }
    pre code { background: none; padding: 0; border: 0; color: ${theme.fg}; font-size: 0.88em; }
    blockquote {
      margin: 16px 0; padding: 8px 16px;
      border-left: 4px solid ${theme.primaryColor};
      background: color-mix(in srgb, ${theme.primaryColor} 6%, transparent);
      border-radius: 0 6px 6px 0;
      color: color-mix(in srgb, ${theme.fg} 88%, ${theme.muted});
    }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid ${theme.border}; padding: 6px 10px; }
    th {
      background: color-mix(in srgb, ${theme.primaryColor} 8%, ${theme.codeBg});
      font-weight: 700;
    }
    tbody tr:nth-child(even) {
      background: color-mix(in srgb, ${theme.primaryColor} 4%, transparent);
    }
    img { max-width: 100%; border-radius: 10px; border: 1px solid ${theme.border}; }
    figure { margin: 16px 0; text-align: center; }
    figure img { display: inline-block; }
    figcaption { margin-top: 8px; font-size: 0.88em; color: ${theme.muted}; line-height: 1.5; }
    mark {
      background: color-mix(in srgb, ${theme.primaryColor} 22%, transparent);
      color: color-mix(in srgb, ${theme.primaryColor} 80%, ${theme.fg});
      padding: 1px 4px; border-radius: 3px;
    }
    kbd {
      display: inline-block; padding: 1px 6px; font-size: 0.82em;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      color: ${theme.fg}; background: ${theme.panelBg};
      border: 1px solid color-mix(in srgb, ${theme.border} 80%, transparent);
      border-bottom-width: 2px; border-radius: 4px; vertical-align: middle;
    }
    .chart-block { margin: 16px 0; }
    .chart-block svg { max-width: 100%; height: auto; }
    .chart-block[data-chart-type='echarts'] { height: 320px; }
    .callout { margin: 16px 0; padding: 12px 16px; border-radius: 8px; }
    .callout-note { background: color-mix(in srgb, ${theme.primaryColor} 8%, transparent); border-left: 4px solid ${theme.primaryColor}; }
    .callout-card { background: ${theme.panelBg}; border: 1px solid ${theme.border}; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
    .cols { display: flex; gap: 20px; align-items: flex-start; }
    .cols > .col { flex: 1 1 0; min-width: 0; }
    .task-list { list-style: none; padding-left: 2px; }
    .task-list .task-item { position: relative; list-style: none; }
    .task-checkbox { width: 15px; height: 15px; margin-right: 8px; vertical-align: -2px; accent-color: ${theme.primaryColor}; }
    .task-item.done { color: ${theme.muted}; text-decoration: line-through; text-decoration-color: color-mix(in srgb, ${theme.muted} 60%, transparent); }
  `
  let style = el.querySelector(':scope > .pdf-injected-style') as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.className = 'pdf-injected-style'
    el.prepend(style)
  }
  style.textContent = css
}
