// M4-7: 演讲稿导出（每页缩略图 + 页码 + 备注对照）
import { captureSlides, type SlideDims } from './slide-capture'
import { splitSlides } from '../slides/split'
import { stripFrontmatter } from '../markdown'
import { saveFile } from './save'
import type { ThemeTokens } from '../themes/presets'

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

// 从 markdown 中提取所有幻灯片的 :::notes 备注
function extractAllNotes(markdown: string): string[] {
  const body = stripFrontmatter(markdown)
  const slides = body.split(/\n---\n/)
  return slides.map((slideMd: string) => {
    const m = slideMd.match(/:::notes\s*\n([\s\S]*?)\n:::/)
    return m ? m[1].trim() : ''
  })
}

// 生成演讲稿 HTML（每页：缩略图 + 页码 + 备注）
function buildHandoutHtml(
  slideImages: string[],
  notes: string[],
  theme: ThemeTokens,
): string {
  const rows = slideImages.map((img, i) => `
    <tr>
      <td style="width:60%;vertical-align:top;padding:12px;border:1px solid #e5e7eb;">
        <div style="font-size:11px;color:#888;margin-bottom:6px;">第 ${i + 1} 页</div>
        <img src="${img}" style="width:100%;border-radius:6px;border:1px solid #ddd;" />
      </td>
      <td style="width:40%;vertical-align:top;padding:12px;border:1px solid #e5e7eb;background:#fafafa;">
        <div style="font-size:11px;font-weight:700;color:#666;margin-bottom:8px;">备注</div>
        <div style="font-size:13px;line-height:1.7;color:#333;white-space:pre-wrap;">${notes[i] || '<span style="color:#aaa;">（无备注）</span>'}</div>
      </td>
    </tr>
  `).join('')

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: -apple-system, "Segoe UI", "PingFang SC", sans-serif; margin: 0; padding: 24px; color: #1a1a1a; }
  h1 { font-size: 20px; margin-bottom: 16px; color: ${theme.primaryColor}; }
  table { width: 100%; border-collapse: collapse; }
  @media print { body { padding: 0; } }
</style></head>
<body>
  <h1>演讲稿</h1>
  <table>${rows}</table>
</body>
</html>`
}

// 导出演讲稿为 Word（DOCX）
export async function exportHandout(
  markdown: string,
  theme: ThemeTokens,
  dims: SlideDims = { w: 1280, h: 720 },
  filename = 'handout.docx',
) {
  // 1. 截取每页幻灯片为 PNG
  const slides = await captureSlides(markdown, theme, dims)
  const slideImages = slides.map(s => s.png)

  // 2. 提取每页备注
  const notes = extractAllNotes(markdown)

  // 3. 生成 HTML
  const html = buildHandoutHtml(slideImages, notes, theme)

  // 4. 转 DOCX
  const { asBlob } = await import('html-docx-js-typescript')
  const blob = await asBlob(html)
  if (!blob) throw new Error('演讲稿 DOCX 生成失败')
  await saveFile(filename, blob as Blob, DOCX_MIME)
}

// 导出演讲稿为纯文本（备注汇总，可直接打印照读）
export async function exportHandoutText(
  markdown: string,
  filename = 'handout.txt',
) {
  const body = stripFrontmatter(markdown)
  const slides = body.split(/\n---\n/)
  const notes = extractAllNotes(markdown)

  let text = '演讲稿\n' + '='.repeat(40) + '\n\n'
  slides.forEach((slide: string, i: number) => {
    // 取标题行
    const titleMatch = slide.match(/^#\s+(.+)/m)
    const title = titleMatch ? titleMatch[1].trim() : `第 ${i + 1} 页`
    text += `【第 ${i + 1} 页】${title}\n`
    if (notes[i]) {
      text += `备注：${notes[i]}\n`
    }
    text += '-'.repeat(30) + '\n\n'
  })

  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  await saveFile(filename, blob, 'text/plain')
}
