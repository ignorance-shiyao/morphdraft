import type { ThemeTokens } from './presets'
import {applyFontPreferences, FONT_STORAGE_KEYS} from '../fonts'
import {getString} from '../localStore'

function storedFontPreferences() {
    return {
        body: getString(FONT_STORAGE_KEYS.body, 'theme'),
        heading: getString(FONT_STORAGE_KEYS.heading, 'theme'),
        code: getString(FONT_STORAGE_KEYS.code, 'theme'),
    }
}

function applyThemeFonts(s: CSSStyleDeclaration, t: ThemeTokens) {
    s.setProperty('--theme-font-family', t.fontFamily)
    s.setProperty('--theme-heading-family', t.headingFamily ?? t.fontFamily)
    s.setProperty('--theme-font-family-mono', '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace')
    applyFontPreferences(s, storedFontPreferences())
}

// token → CSS 变量，写到 :root。组件样式只引用这些变量。
export function applyTheme(t: ThemeTokens) {
  const s = document.documentElement.style
  // 内容主题：文档预览、幻灯片预览、导出继续使用这些变量。
  s.setProperty('--primary-color', t.primaryColor)
  s.setProperty('--bg', t.bg)
  s.setProperty('--fg', t.fg)
  s.setProperty('--muted', t.muted)
  s.setProperty('--border', t.border)
  s.setProperty('--code-bg', t.codeBg)
  s.setProperty('--panel-bg', t.panelBg)
    applyThemeFonts(s, t)
  s.setProperty('--heading-weight', String(t.headingWeight))

  // 应用外壳也跟随主题。单独保留 --app-* 是为了后续能给不同主题做 UI 级微调，
  // 而不是把主题辨识度从工具栏/侧栏/编辑器里抹掉。
  s.setProperty('--app-primary-color', t.primaryColor)
  s.setProperty('--app-bg', t.bg)
  s.setProperty('--app-fg', t.fg)
  s.setProperty('--app-muted', t.muted)
  s.setProperty('--app-border', t.border)
  s.setProperty('--app-code-bg', t.codeBg)
  s.setProperty('--app-panel-bg', t.panelBg)
  s.setProperty(
    '--app-soft-bg',
    t.dark
      ? `color-mix(in srgb, ${t.panelBg} 86%, #ffffff 6%)`
      : `color-mix(in srgb, ${t.panelBg} 72%, ${t.bg})`,
  )
  // 控件「高光上边」：浅色用半透白，暗色几乎无（否则发白发怪）
  s.setProperty('--app-edge', t.dark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.5)')

  // —— 视觉焕新（2026-06-16）：从主题派生「分层外壳表面」，让外壳有纵深而非一片平涂 ——
  // 仍由主题 token 合成（保留双层主题变量契约 + 14 主题辨识度），只是层次更克制、更有秩序。
  // shell：顶栏/侧栏/状态栏的底；比内容 bg 略微沉一档。
  s.setProperty(
    '--app-shell-bg',
    t.dark
      ? `color-mix(in srgb, ${t.bg} 88%, #000 12%)`
      : `color-mix(in srgb, ${t.panelBg} 55%, ${t.bg})`,
  )
  // elevated：浮层/卡片/下拉/分段控件轨道；比 shell 再亮一档（暗色提亮、浅色趋近纯底 + 阴影托起）。
  s.setProperty(
    '--app-elevated',
    t.dark
      ? `color-mix(in srgb, ${t.bg} 80%, #fff 7%)`
      : `color-mix(in srgb, ${t.bg} 96%, ${t.fg} 2%)`,
  )
  // 交互叠加：hover/active 统一主色淡染；focus ring 统一主色环。
  s.setProperty('--app-hover', `color-mix(in srgb, ${t.primaryColor} 9%, transparent)`)
  s.setProperty('--app-active', `color-mix(in srgb, ${t.primaryColor} 15%, transparent)`)
  s.setProperty('--app-ring', `color-mix(in srgb, ${t.primaryColor} 32%, transparent)`)
  // 次级前景：比 muted 更可读，用于 doc-title/标签等次要文字。
  s.setProperty('--app-fg-soft', `color-mix(in srgb, ${t.fg} 70%, ${t.muted})`)
  // 分隔线：比 border 更轻，避免外壳被切得很碎。
  s.setProperty('--app-hairline', `color-mix(in srgb, ${t.border} 60%, transparent)`)

  document.documentElement.dataset.theme = t.dark ? 'dark' : 'light'
}

// 把 token 写到指定元素（导出离屏容器用，独立于 :root）。
export function applyThemeTo(el: HTMLElement, t: ThemeTokens) {
  const s = el.style
  s.setProperty('--primary-color', t.primaryColor)
  s.setProperty('--bg', t.bg)
  s.setProperty('--fg', t.fg)
  s.setProperty('--muted', t.muted)
  s.setProperty('--border', t.border)
  s.setProperty('--code-bg', t.codeBg)
  s.setProperty('--panel-bg', t.panelBg)
    applyThemeFonts(s, t)
  s.setProperty('--heading-weight', String(t.headingWeight))
}
