// Mermaid 懒加载封装。返回渲染后的 SVG 字符串（供预览与未来导出复用）。
import type { ThemeTokens } from '../themes/presets'
import { buildMermaidTheme } from './mermaidTheme'

let loaded: Promise<typeof import('mermaid')['default']> | null = null
let seq = 0

async function getMermaid() {
  if (!loaded) {
    loaded = import('mermaid').then((m) => {
      m.default.initialize({ startOnLoad: false, securityLevel: 'loose' })
      return m.default
    })
  }
  return loaded
}

export async function renderMermaid(code: string): Promise<string> {
  const mermaid = await getMermaid()
  const id = `mmd-${Date.now()}-${seq++}`
  const { svg } = await mermaid.render(id, code)
  return normalizeMermaidSvg(svg)
}

function normalizeMermaidSvg(svg: string): string {
  return svg
    .replace(/<svg\b(?![^>]*\spreserveAspectRatio=)/, '<svg preserveAspectRatio="xMidYMid meet"')
    .replace(/<svg\b([^>]*?)style="/, '<svg$1style="display:block;margin:auto;max-width:100%;height:auto;')
    .replace(/<svg\b((?:(?!style=)[^>])*)>/, '<svg$1 style="display:block;margin:auto;max-width:100%;height:auto;">')
}

// 应用主题：用当前 ThemeTokens 派生 mermaid themeVariables，
// 保证流程图/序列图/甘特图等的配色与字体跟随 14 套应用主题。
export async function setMermaidTheme(tokens: ThemeTokens) {
  const mermaid = await getMermaid()
  const cfg = buildMermaidTheme(tokens)
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    theme: cfg.theme,
    themeVariables: cfg.themeVariables,
    fontFamily: cfg.fontFamily,
  })
}
