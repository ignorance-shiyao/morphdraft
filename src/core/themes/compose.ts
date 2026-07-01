// M1T-1: 主题双维重构 — HueTokens × ModeTokens → ThemeTokens
// 参考 Typora Phycat-Color：一份共享骨架 + 每个色系只是一小撮变量覆盖。
// composeTheme(hue, mode) 纯函数合成，输出与现有 ThemeTokens 完全兼容。

import type { ThemeTokens } from './presets'

// ── 色彩计算助手（输出仍是 hex，图表库可直接解析） ──
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const i = parseInt(n, 16)
  return [(i >> 16) & 255, (i >> 8) & 255, i & 255]
}
function rgbToHex(rgb: [number, number, number]): string {
  return '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
}
// 在两色之间线性插值，t=0→a，t=1→b
function mix(a: string, b: string, t: number): string {
  const A = hexToRgb(a), B = hexToRgb(b)
  return rgbToHex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t])
}
function relLum(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a: string, b: string): number {
  const L1 = relLum(a), L2 = relLum(b)
  const hi = Math.max(L1, L2), lo = Math.min(L1, L2)
  return (hi + 0.05) / (lo + 0.05)
}
// 把强调色提亮/压暗到对背景达到目标对比度（暗色下深主色会被提亮到可读）
function ensureContrast(accent: string, bg: string, target = 4.5, toward = '#ffffff'): string {
  let c = accent
  for (let t = 0; t < 0.92 && contrast(c, bg) < target; t += 0.07) {
    c = mix(accent, toward, t)
  }
  return c
}

// 暗色锚点：近黑中性，再按色系主色微染 → 每个暗色主题带本系色温，消除"暖色配冷海军蓝"的割裂感。
const DARK_ANCHOR = '#0c0e15'
const DARK_FG = '#e9ecf4'
function deriveDark(primary: string) {
  const accent = ensureContrast(primary, DARK_ANCHOR, 4.6)      // 深主色提亮到可读
  const bg = mix(DARK_ANCHOR, primary, 0.05)                    // 5% 色系微染
  const panelBg = mix(bg, '#ffffff', 0.06)                      // 面板抬一档
  const codeBg = mix(bg, '#000000', 0.30)                       // 代码块沉一档
  const border = mix(bg, DARK_FG, 0.17)                         // 边框更可见
  const muted = mix(DARK_FG, bg, 0.40)                          // 次级文字够亮
  return { accent, bg, fg: DARK_FG, panelBg, codeBg, border, muted }
}
// 浅色中性跟随 bg 色温（暖纸面不再配冷灰 chrome）。主色保持原样——浅色主色多为
// 品牌亮色（青岚天蓝等），不做对比度压暗以免改掉辨识度；可读性问题集中在暗色。
function deriveLight(primary: string, bg: string, fg: string) {
  const panelBg = mix(bg, fg, 0.035)
  const codeBg = mix(bg, fg, 0.055)
  const border = mix(bg, fg, 0.11)
  const muted = mix(fg, bg, 0.40)
  return { accent: primary, bg, fg, panelBg, codeBg, border, muted }
}

// ── 色系层（每色系一份） ──
export interface HueTokens {
  id: string
  name: string
  primaryColor: string
  bgTint: string       // 背景色温倾向（浅色用）
  darkBg: string       // 深色模式背景
  headingFamily?: string
}

// ── 明暗骨架层（light/dark 各一份） ──
export interface ModeTokens {
  dark: boolean
  fg: string
  muted: string
  border: string
  codeBg: string
  panelBg: string
}

// ── 明暗骨架预设 ──
export const LIGHT_MODE: ModeTokens = {
  dark: false,
  fg: '#1f2328',
  muted: '#6b7280',
  border: '#e5e7eb',
  codeBg: '#f6f8fa',
  panelBg: '#fafafa',
}

export const DARK_MODE: ModeTokens = {
  dark: true,
  fg: '#e8eaf2',
  muted: '#9aa0b8',
  border: '#222a44',
  codeBg: '#141b30',
  panelBg: '#161d33',
}

// ── 合成函数：HueTokens × ModeTokens → ThemeTokens ──
export function composeTheme(hue: HueTokens, mode: ModeTokens): ThemeTokens {
  // 中性色不再用扁平共享值，而是按色系派生：暗色按主色微染 + 深主色提亮，浅色中性跟随纸面色温。
  const d = mode.dark
    ? deriveDark(hue.primaryColor)
    : deriveLight(hue.primaryColor, hue.bgTint, mode.fg)
  return {
    id: `${hue.id}-${mode.dark ? 'dark' : 'light'}`,
    name: `${hue.name}${mode.dark ? '·深色' : ''}`,
    type: 'all',
    dark: mode.dark,
    primaryColor: d.accent,
    bg: d.bg,
    fg: d.fg,
    muted: d.muted,
    border: d.border,
    codeBg: d.codeBg,
    panelBg: d.panelBg,
    fontFamily: '-apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
    headingWeight: 700,
    headingFamily: hue.headingFamily,
  }
}

// ── 色系预设（从现有 14 套 preset 映射） ──
export const HUES: Record<string, HueTokens> = {
  moon: {
    id: 'moon', name: '月白', primaryColor: '#334155',
    bgTint: '#ffffff', darkBg: '#0b1020',
  },
  azure: {
    id: 'azure', name: '青岚', primaryColor: '#0ea5e9',
    bgTint: '#ffffff', darkBg: '#0b1020',
  },
  violet: {
    id: 'violet', name: '黛紫', primaryColor: '#6c5ce7',
    bgTint: '#ffffff', darkBg: '#0b1020',
  },
  paper: {
    id: 'paper', name: '霁蓝', primaryColor: '#2563eb',
    bgTint: '#fafaf8', darkBg: '#0b1020',
    headingFamily: '"Source Han Serif SC", "Noto Serif SC", "Songti SC", Georgia, serif',
  },
  midnight: {
    id: 'midnight', name: '墨夜', primaryColor: '#8b8cff',
    bgTint: '#0b1020', darkBg: '#0b1020',
  },
  cinnabar: {
    id: 'cinnabar', name: '丹砂', primaryColor: '#c0392b',
    bgTint: '#ffffff', darkBg: '#0b1020',
  },
  prussian: {
    id: 'prussian', name: '靛青', primaryColor: '#002FA7',
    bgTint: '#fafaf8', darkBg: '#0b1020',
  },
  tangerine: {
    id: 'tangerine', name: '橘洲', primaryColor: '#e25822',
    bgTint: '#f7f5ee', darkBg: '#0b1020',
  },
  pine: {
    id: 'pine', name: '苍翠', primaryColor: '#3f8d6e',
    bgTint: '#eef4ef', darkBg: '#0b1020',
    headingFamily: '"Playfair Display", "Noto Serif SC", Georgia, "Songti SC", serif',
  },
  xuan: {
    id: 'xuan', name: '宣纸', primaryColor: '#1B365D',
    bgTint: '#f5f4ed', darkBg: '#0b1020',
    headingFamily: '"Source Han Serif SC", "Noto Serif SC", "Songti SC", Georgia, serif',
  },
  clay: {
    id: 'clay', name: '陶土', primaryColor: '#8a4b2d',
    bgTint: '#eedfc7', darkBg: '#0b1020',
    headingFamily: '"Playfair Display", "Noto Serif SC", Georgia, "Songti SC", serif',
  },
}

// ── 旧 ID 别名表（兼容 frontmatter `theme: midnight` 等） ──
const ALIASES: Record<string, { hue: string; dark: boolean }> = {
  // 旧 preset id → { hue, dark }
  moon: { hue: 'moon', dark: false },
  azure: { hue: 'azure', dark: false },
  violet: { hue: 'violet', dark: false },
  paper: { hue: 'paper', dark: false },
  midnight: { hue: 'midnight', dark: true },
  cinnabar: { hue: 'cinnabar', dark: false },
  prussian: { hue: 'prussian', dark: false },
  tangerine: { hue: 'tangerine', dark: false },
  pine: { hue: 'pine', dark: false },
  xuan: { hue: 'xuan', dark: false },
  clay: { hue: 'clay', dark: false },
}

// 生成所有主题组合
export function getAllThemes(): ThemeTokens[] {
  const themes: ThemeTokens[] = []
  for (const hue of Object.values(HUES)) {
    // midnight 是旧深色主题，不生成浅色组合。
    if (hue.id === 'midnight') {
      themes.push(composeTheme(hue, DARK_MODE))
    } else {
      themes.push(composeTheme(hue, LIGHT_MODE))
      themes.push(composeTheme(hue, DARK_MODE))
    }
  }
  return themes
}

// 通过旧 ID 解析主题（兼容 frontmatter）
export function resolveThemeId(id: string): ThemeTokens | null {
  // 直接匹配
  const all = getAllThemes()
  const direct = all.find(t => t.id === id)
  if (direct) return direct

  // 别名匹配
  const alias = ALIASES[id]
  if (alias) {
    const hue = HUES[alias.hue]
    if (hue) return composeTheme(hue, alias.dark ? DARK_MODE : LIGHT_MODE)
  }

  return null
}

// 获取同色系的暗色变体（用于导出 HTML 双主题）
export function getDarkVariant(theme: ThemeTokens): ThemeTokens | null {
  const hueId = theme.id.replace(/-light$/, '').replace(/-dark$/, '')
  const hue = HUES[hueId]
  if (!hue) return null
  return composeTheme(hue, DARK_MODE)
}

// 获取默认主题
export const DEFAULT_THEME_ID = 'azure-light'
