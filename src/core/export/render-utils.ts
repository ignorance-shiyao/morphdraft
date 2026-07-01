// M7 共享工具：inlineStyles + SVG-to-PNG 光栅化

// 需要内联的 CSS 属性（公众号/知乎只认 inline style）
export const INLINED_PROPS = [
  'color', 'background-color', 'font-size', 'font-family', 'font-weight',
  'font-style', 'line-height', 'text-align', 'text-decoration', 'text-indent',
  'margin', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
  'padding', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
  'border', 'border-left', 'border-top', 'border-bottom', 'border-right',
  'border-radius', 'display', 'max-width', 'width', 'height',
  'vertical-align', 'white-space', 'word-break', 'overflow',
]

export function inlineStyles(root: HTMLElement, extra?: string[]) {
  const props = extra ? [...INLINED_PROPS, ...extra] : INLINED_PROPS
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)
  let node: HTMLElement | null
  while ((node = walker.nextNode() as HTMLElement | null)) {
    const computed = window.getComputedStyle(node)
    for (const prop of props) {
      const val = computed.getPropertyValue(prop)
      if (val && val !== 'none' && val !== 'normal' && val !== 'auto' && val !== '0px' && val !== 'transparent') {
        node.style.setProperty(prop, val)
      }
    }
    if (node.tagName === 'PRE') {
      node.style.whiteSpace = 'pre-wrap'
      node.style.wordBreak = 'break-all'
      node.style.overflow = 'hidden'
    }
  }
}

// SVG → PNG data URL（公众号/知乎不支持 SVG）
export async function svgToPngDataUrl(svg: SVGSVGElement): Promise<string | null> {
  try {
    const vb = svg.viewBox?.baseVal
    let w = vb && vb.width ? vb.width : parseFloat(svg.getAttribute('width') || '') || svg.clientWidth || 640
    let h = vb && vb.height ? vb.height : parseFloat(svg.getAttribute('height') || '') || svg.clientHeight || 400
    if (!w || !Number.isFinite(w)) w = 640
    if (!h || !Number.isFinite(h)) h = 400

    const clone = svg.cloneNode(true) as SVGSVGElement
    clone.setAttribute('width', String(w))
    clone.setAttribute('height', String(h))
    const xml = new XMLSerializer().serializeToString(clone)
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml)

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = reject
      el.src = url
    })

    const canvas = document.createElement('canvas')
    canvas.width = w * 2
    canvas.height = h * 2
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

// 替换元素中的所有 SVG 为 PNG
export async function replaceSvgsWithPng(root: HTMLElement): Promise<void> {
  const svgs = root.querySelectorAll('svg')
  for (const svg of Array.from(svgs)) {
    const pngUrl = await svgToPngDataUrl(svg as SVGSVGElement)
    if (pngUrl) {
      const img = document.createElement('img')
      img.src = pngUrl
      img.style.maxWidth = '100%'
      svg.replaceWith(img)
    }
  }
}
