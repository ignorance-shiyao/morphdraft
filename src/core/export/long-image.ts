// M7-3: 长图导出（modern-screenshot 整页 PNG，750px 宽移动端规格）
import { domToPng } from 'modern-screenshot'
import { renderStatic } from './render-static'
import { mountCharts } from '../charts/mount'
import { setMermaidTheme } from '../charts/mermaid'
import { applyThemeTo } from '../themes/apply'
import { saveFile } from './save'
import type { ThemeTokens } from '../themes/presets'

const PNG_MIME = 'image/png'
const WIDTH = 750 // 移动端宽度
const SCALE = 2   // 2x 清晰度

export async function exportLongImage(
  markdown: string,
  theme: ThemeTokens,
  filename = 'document.png',
) {
  // 1. 渲染
  await setMermaidTheme(theme)
  const r = await renderStatic(markdown, { dark: theme.dark, tokens: theme, width: WIDTH })
  applyThemeTo(r.el, theme)
  const cleanup = await mountCharts(r.el, { tokens: theme, renderer: 'svg' })

  // 2. 注入内联样式（确保截图正确）
  r.el.style.cssText = `position:fixed;left:-99999px;top:0;width:${WIDTH}px;padding:24px;background:${theme.bg};color:${theme.fg};font-family:${theme.fontFamily};line-height:1.72;`
  document.body.appendChild(r.el)

  // 3. 截图
  const png = await domToPng(r.el, {
    width: WIDTH,
    scale: SCALE,
    backgroundColor: theme.bg,
    style: { transform: 'none' },
  })

  r.dispose()
  cleanup()

  // 4. 保存
  const resp = await fetch(png)
  const blob = await resp.blob()
  await saveFile(filename, blob, PNG_MIME)
}
