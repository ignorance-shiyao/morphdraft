import { asBlob } from 'html-docx-js-typescript'
import { renderStatic } from './render-static'
import { captureSlides, type SlideDims } from './slide-capture'
import { saveFile } from './save'
import { CODE_CSS } from '../markdown/codeTheme'
import { ALERT_CSS } from '../markdown/alerts'
import { BLOCKS_CSS } from '../markdown/blocksCss'
import type { ThemeTokens } from '../themes/presets'

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export type DocxTemplate = 'default' | 'official' | 'academic' | 'minimal'

interface TemplateStyle {
  fontFamily: string
  headingFamily: string
  fontSize: number
  h1Size: number
  h2Size: number
  h3Size: number
  lineHeight: number
  margins: { top: number; right: number; bottom: number; left: number }
}

const TEMPLATES: Record<DocxTemplate, TemplateStyle> = {
  default: {
    fontFamily: '-apple-system, "Segoe UI", "PingFang SC", sans-serif',
    headingFamily: '-apple-system, "Segoe UI", "PingFang SC", sans-serif',
    fontSize: 11, h1Size: 22, h2Size: 17, h3Size: 14, lineHeight: 1.6,
    margins: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
  },
  official: {
    fontFamily: '"SimSun", "宋体", serif',
    headingFamily: '"SimHei", "黑体", sans-serif',
    fontSize: 12, h1Size: 22, h2Size: 16, h3Size: 14, lineHeight: 1.5,
    margins: { top: 1440, right: 1440, bottom: 1440, left: 1800 },
  },
  academic: {
    fontFamily: '"Times New Roman", "Source Han Serif SC", serif',
    headingFamily: '"Source Han Serif SC", "Noto Serif SC", serif',
    fontSize: 12, h1Size: 18, h2Size: 15, h3Size: 13, lineHeight: 1.8,
    margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
  },
  minimal: {
    fontFamily: '"Helvetica Neue", "PingFang SC", sans-serif',
    headingFamily: '"Helvetica Neue", "PingFang SC", sans-serif',
    fontSize: 11, h1Size: 20, h2Size: 16, h3Size: 13, lineHeight: 1.7,
    margins: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
  },
}

// Word 通过 HTML(altChunk) 导入，对内联 <svg> 支持很差，
// 因此把图表 SVG 先栅格化成 PNG 再嵌入，保证图表在 Word 里可见。
// Word 按 img 的 width/height 属性（像素→EMU）渲染、不认 max-width，
// 故按页面正文宽度等比缩放，避免大图溢出页面。
const DOCX_CONTENT_PX = 620 // A4/Letter 纵向、0.75in 边距下的正文宽度近似
async function rasterizeCharts(root: HTMLElement): Promise<void> {
  const svgs = Array.from(root.querySelectorAll('svg'))
  await Promise.all(
    svgs.map(async (svg) => {
      try {
        const el = svg as SVGSVGElement
        const { w, h } = svgDims(el)
        const png = await svgToPng(el)
        if (!png) return
        const dw = Math.min(w, DOCX_CONTENT_PX)
        const dh = Math.round(h * (dw / w))
        const img = document.createElement('img')
        img.src = png
        img.setAttribute('width', String(Math.round(dw)))
        img.setAttribute('height', String(dh))
        img.style.maxWidth = '100%'
        svg.replaceWith(img)
      } catch {
        /* 失败则保留原 svg（Word 可能不显示，但不阻断导出） */
      }
    }),
  )
}

function svgDims(svg: SVGSVGElement): { w: number; h: number } {
  const vb = svg.viewBox?.baseVal
  let w = vb && vb.width ? vb.width : parseFloat(svg.getAttribute('width') || '') || svg.clientWidth
  let h = vb && vb.height ? vb.height : parseFloat(svg.getAttribute('height') || '') || svg.clientHeight
  if (!w || !Number.isFinite(w)) w = 640
  if (!h || !Number.isFinite(h)) h = 400
  return { w, h }
}

function svgToPng(svg: SVGSVGElement): Promise<string> {
  const { w, h } = svgDims(svg)
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('width', String(w))
  clone.setAttribute('height', String(h))
  const xml = new XMLSerializer().serializeToString(clone)
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml)
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const scale = 2
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(w * scale)
      canvas.height = Math.round(h * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) return resolve('')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      try {
        resolve(canvas.toDataURL('image/png'))
      } catch {
        resolve('')
      }
    }
    img.onerror = () => resolve('')
    img.src = url
  })
}

// Word 对 CSS 支持有限：用基础、稳妥的样式（字体、标题、表格边框、代码底色）。
function docCss(theme: ThemeTokens, tpl: TemplateStyle): string {
  return `
body{font-family:${tpl.fontFamily};color:#1a1a1a;font-size:${tpl.fontSize}pt;line-height:${tpl.lineHeight};}
h1,h2,h3,h4{font-family:${tpl.headingFamily};color:#111;}
h1{font-size:${tpl.h1Size}pt;border-bottom:1px solid #ccc;padding-bottom:4px;}
h2{font-size:${tpl.h2Size}pt;} h3{font-size:${tpl.h3Size}pt;}
a{color:${theme.primaryColor};}
code{background:#f0f0f3;padding:1px 4px;border-radius:3px;font-family:Consolas,monospace;}
pre{background:#f5f5f7;padding:10px;border:1px solid #e3e3e8;}
pre code{background:none;padding:0;}
blockquote{margin:0;padding-left:12px;border-left:3px solid #ccc;color:#555;}
table{border-collapse:collapse;width:100%;}
th,td{border:1px solid #999;padding:5px 9px;}
th{background:#f0f0f3;font-weight:700;}
tr:nth-child(even){background:#f8f8fa;}
img{max-width:100%;}
figure{margin:12px 0;text-align:center;}
figcaption{margin-top:6px;font-size:0.88em;color:#666;line-height:1.5;}
${CODE_CSS}
${ALERT_CSS}
${BLOCKS_CSS}
.math-block{text-align:center;}
`
}

function wrap(body: string, css: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"/><style>${css}</style></head><body>${body}</body></html>`
}

// 文档模式：固化 HTML（图表栅格化）→ DOCX。
export async function exportDocx(
  markdown: string,
  theme: ThemeTokens,
  mode: 'document' | 'slide' = 'document',
  dims: SlideDims = { w: 1280, h: 720 },
  filename = mode === 'slide' ? 'slides.docx' : 'document.docx',
  template: DocxTemplate = 'default',
) {
  const tpl = TEMPLATES[template]
  if (mode === 'slide') {
    await exportSlideDocx(markdown, theme, dims, filename)
    return
  }
  const r = await renderStatic(markdown, { dark: false, tokens: theme, width: 794 })
  await rasterizeCharts(r.el)
  const body = r.el.innerHTML
  r.dispose()
  const html = wrap(`<div>${body}</div>`, docCss(theme, tpl))
  const blob = await asBlob(html, { orientation: 'portrait', margins: tpl.margins })
  await saveFile(filename, blob as Blob, DOCX_MIME)
}

// 幻灯片模式：每页截图整页平铺到 Word。
async function exportSlideDocx(markdown: string, theme: ThemeTokens, dims: SlideDims, filename: string) {
  const slides = await captureSlides(markdown, theme, dims)
  const portrait = dims.h > dims.w
  const body = slides
    .map((s, i) => `<p><img src="${s.png}" width="960" alt="Slide ${i + 1}" /></p>`)
    .join('')
  const html = wrap(body, 'body{margin:0}img{width:100%}')
  const blob = await asBlob(html, { orientation: portrait ? 'portrait' : 'landscape', margins: { top: 360, right: 360, bottom: 360, left: 360 } })
  await saveFile(filename, blob as Blob, DOCX_MIME)
}
