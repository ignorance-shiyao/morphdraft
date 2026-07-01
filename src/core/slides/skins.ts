// 幻灯片专属「视觉风格皮肤」。仅作用于 PPT 模式，不影响文档/公众号的中文审美体系。
// 每个皮肤 = 一组幻灯片局部 CSS 变量（颜色/字体）+ 由 slideSkins.css 提供的招牌装饰（按 .skin-<id> 选择）。
import type { ThemeTokens } from '../themes/presets'

export interface SlideSkin {
  id: string
  name: string
  dark: boolean
  bg: string
  fg: string
  primary: string
  muted: string
  border: string
  codeBg: string
  panelBg: string
  fontFamily?: string
  headingFamily?: string
}

const INTER = 'Inter, system-ui, "Noto Sans SC", sans-serif'
const MONO = '"JetBrains Mono", "IBM Plex Mono", SFMono-Regular, Menlo, monospace'
const GROTESK = '"Space Grotesk", Inter, "Noto Sans SC", sans-serif'
const HELV = 'Inter, "Helvetica Neue", Helvetica, "Noto Sans SC", sans-serif'
const SERIF = '"Playfair Display", "Noto Serif SC", Georgia, serif'
const SERIF_CN = '"Noto Serif SC", "Playfair Display", Georgia, serif'
const ARCHIVO = '"Archivo Black", "Space Grotesk", sans-serif'
const OSWALD = 'Oswald, Inter, "Noto Sans SC", sans-serif'

// 幻灯片皮肤：配色已映射为我们的 token；招牌装饰在 slideSkins.css 中按 .skin-<id> 提供。
export const SLIDE_SKINS: SlideSkin[] = [
  // —— 招牌特效（POC 验证过） ——
  { id: 'glass', name: '毛玻璃', dark: true, bg: '#0b1024', fg: '#f2f4ff', primary: '#7dd3fc', muted: '#a8aed0', border: 'rgba(255,255,255,.18)', codeBg: 'rgba(255,255,255,.10)', panelBg: 'rgba(255,255,255,.06)', fontFamily: INTER },
  { id: 'brutalism', name: '硬核', dark: false, bg: '#fffef0', fg: '#111111', primary: '#111111', muted: '#555555', border: '#000000', codeBg: '#fff38a', panelBg: '#ffffff', fontFamily: GROTESK, headingFamily: ARCHIVO },
  { id: 'swiss', name: '瑞士网格', dark: false, bg: '#ffffff', fg: '#111111', primary: '#d6001c', muted: '#888888', border: '#111111', codeBg: '#f4f4f4', panelBg: '#ffffff', fontFamily: HELV, headingFamily: HELV },
  { id: 'international-blue', name: '国际蓝格', dark: false, bg: '#fafaf8', fg: '#0a0a0a', primary: '#002FA7', muted: '#5f6368', border: 'rgba(10,10,10,.28)', codeBg: '#efefea', panelBg: '#ffffff', fontFamily: HELV, headingFamily: HELV },
  { id: 'neon', name: '赛博霓虹', dark: true, bg: '#000000', fg: '#f5f7ff', primary: '#ff2bd6', muted: '#8b8fb0', border: 'rgba(0,240,255,.40)', codeBg: '#14141f', panelBg: '#0f0f1a', fontFamily: INTER, headingFamily: MONO },
  { id: 'aurora', name: '极光', dark: true, bg: '#06091c', fg: '#e8f0ff', primary: '#5ef2c6', muted: '#7a8aae', border: 'rgba(180,220,255,.18)', codeBg: 'rgba(255,255,255,.08)', panelBg: 'rgba(255,255,255,.05)', fontFamily: INTER },
  { id: 'vaporwave', name: '蒸汽波', dark: true, bg: '#1a0938', fg: '#fdf0ff', primary: '#ff6ec7', muted: '#9a7ab8', border: 'rgba(255,110,199,.30)', codeBg: 'rgba(255,255,255,.08)', panelBg: 'rgba(255,255,255,.06)', fontFamily: GROTESK, headingFamily: GROTESK },
  { id: 'y2k', name: '千禧铬金', dark: false, bg: '#dfe4ec', fg: '#1a1f2e', primary: '#8a5cff', muted: '#8590a6', border: 'rgba(120,135,170,.34)', codeBg: 'rgba(255,255,255,.55)', panelBg: 'rgba(255,255,255,.72)', fontFamily: GROTESK, headingFamily: GROTESK },
  { id: 'terminal', name: '绿屏终端', dark: true, bg: '#030a04', fg: '#8cff9a', primary: '#00ff88', muted: '#2f8a4d', border: 'rgba(0,255,120,.28)', codeBg: '#0d2614', panelBg: '#0a1b10', fontFamily: MONO, headingFamily: MONO },
  { id: 'blueprint', name: '蓝图', dark: true, bg: '#0b3a6f', fg: '#e8f3ff', primary: '#aee1ff', muted: '#7da8cf', border: 'rgba(190,220,255,.32)', codeBg: 'rgba(255,255,255,.10)', panelBg: 'rgba(255,255,255,.06)', fontFamily: MONO, headingFamily: MONO },
  { id: 'engineering', name: '工程白图', dark: false, bg: '#ffffff', fg: '#0a1e46', primary: '#1e5ac4', muted: '#8090a8', border: 'rgba(10,30,70,.22)', codeBg: '#f4f7fb', panelBg: '#ffffff', fontFamily: INTER, headingFamily: MONO },
  { id: 'retro-tv', name: '复古显像管', dark: false, bg: '#f5ecd7', fg: '#2a1a08', primary: '#c73a1f', muted: '#a68656', border: 'rgba(120,70,20,.24)', codeBg: '#efe3c2', panelBg: '#fbf5e2', fontFamily: INTER, headingFamily: SERIF },
  { id: 'memphis', name: '孟菲斯波普', dark: false, bg: '#fef6e8', fg: '#111111', primary: '#ff3d8b', muted: '#666666', border: '#111111', codeBg: '#fff1d1', panelBg: '#ffffff', fontFamily: GROTESK, headingFamily: ARCHIVO },
  { id: 'news', name: '新闻播报', dark: false, bg: '#ffffff', fg: '#0a0a0a', primary: '#e11d2d', muted: '#7a7a7a', border: 'rgba(0,0,0,.16)', codeBg: '#ececec', panelBg: '#ffffff', fontFamily: OSWALD, headingFamily: OSWALD },

  // —— 经典配色（程序员/设计常用） ——
  { id: 'dracula', name: 'Dracula', dark: true, bg: '#282a36', fg: '#f8f8f2', primary: '#bd93f9', muted: '#6272a4', border: 'rgba(248,248,242,.14)', codeBg: '#44475a', panelBg: '#343746', fontFamily: INTER },
  { id: 'nord', name: 'Nord', dark: true, bg: '#2e3440', fg: '#eceff4', primary: '#88c0d0', muted: '#7b8394', border: 'rgba(236,239,244,.14)', codeBg: '#434c5e', panelBg: '#3b4252', fontFamily: INTER },
  { id: 'tokyo-night', name: '东京之夜', dark: true, bg: '#1a1b26', fg: '#c0caf5', primary: '#7aa2f7', muted: '#565f89', border: 'rgba(192,202,245,.14)', codeBg: '#2f334d', panelBg: '#24283b', fontFamily: INTER },
  { id: 'catppuccin-mocha', name: 'Catppuccin 深', dark: true, bg: '#1e1e2e', fg: '#cdd6f4', primary: '#cba6f7', muted: '#7f849c', border: 'rgba(205,214,244,.14)', codeBg: '#45475a', panelBg: '#313244', fontFamily: INTER },
  { id: 'catppuccin-latte', name: 'Catppuccin 浅', dark: false, bg: '#eff1f5', fg: '#4c4f69', primary: '#8839ef', muted: '#9ca0b0', border: 'rgba(76,79,105,.16)', codeBg: '#eef0f4', panelBg: '#ffffff', fontFamily: INTER },
  { id: 'gruvbox', name: 'Gruvbox 深', dark: true, bg: '#282828', fg: '#ebdbb2', primary: '#fabd2f', muted: '#928374', border: 'rgba(235,219,178,.16)', codeBg: '#504945', panelBg: '#3c3836', fontFamily: INTER },
  { id: 'rose-pine', name: 'Rosé Pine', dark: true, bg: '#191724', fg: '#e0def4', primary: '#ebbcba', muted: '#6e6a86', border: 'rgba(224,222,244,.14)', codeBg: '#2a2740', panelBg: '#26233a', fontFamily: INTER },
  { id: 'solarized-light', name: 'Solarized 浅', dark: false, bg: '#fdf6e3', fg: '#073642', primary: '#268bd2', muted: '#93a1a1', border: 'rgba(88,110,117,.22)', codeBg: '#f5efd7', panelBg: '#ffffff', fontFamily: INTER },

  // —— 商务 / 极简 / 排版 ——
    // 商务蓝：参考 ppt-mixed-layouts 设计稿——左上字母角标头、页脚品牌、白面板卡、紧凑斑马表、蓝色主调。
    {
        id: 'business-blue',
        name: '商务蓝',
        dark: false,
        bg: '#f4f6fb',
        fg: '#1a2233',
        primary: '#3a5bd8',
        muted: '#6b7488',
        border: 'rgba(26,34,51,.12)',
        codeBg: '#eef1f9',
        panelBg: '#ffffff',
        fontFamily: INTER,
        headingFamily: INTER
    },
  { id: 'corporate', name: '企业商务', dark: false, bg: '#ffffff', fg: '#0a2540', primary: '#1d4ed8', muted: '#8898aa', border: 'rgba(10,37,64,.14)', codeBg: '#f0f3f7', panelBg: '#ffffff', fontFamily: INTER },
  { id: 'pitch-deck', name: '融资 Pitch', dark: false, bg: '#ffffff', fg: '#0b0d12', primary: '#0070f3', muted: '#8b93a8', border: 'rgba(20,30,50,.12)', codeBg: '#f5f7fa', panelBg: '#ffffff', fontFamily: INTER },
  { id: 'minimal-white', name: '极简白', dark: false, bg: '#ffffff', fg: '#0c0d10', primary: '#111216', muted: '#9ca1b0', border: 'rgba(17,18,22,.10)', codeBg: '#f5f5f6', panelBg: '#ffffff', fontFamily: INTER },
  { id: 'sharp-mono', name: '锐利黑白', dark: false, bg: '#ffffff', fg: '#000000', primary: '#000000', muted: '#4a4a4a', border: '#000000', codeBg: '#f2f2f2', panelBg: '#ffffff', fontFamily: ARCHIVO, headingFamily: ARCHIVO },
  { id: 'arctic', name: '冷调', dark: false, bg: '#f2f6fb', fg: '#0e1f33', primary: '#1e6fb0', muted: '#6b819b', border: 'rgba(40,70,110,.14)', codeBg: '#edf3fa', panelBg: '#ffffff', fontFamily: INTER },

  // —— 杂志 / 艺术 / 文艺 ——
  { id: 'ink-zine', name: '墨刊纸页', dark: false, bg: '#f1efea', fg: '#0a0a0b', primary: '#0a1f3d', muted: '#6f6a60', border: 'rgba(10,10,11,.18)', codeBg: '#e8e5de', panelBg: '#f8f6f0', fontFamily: INTER, headingFamily: SERIF_CN },
  { id: 'magazine', name: '杂志大标题', dark: false, bg: '#f5efe2', fg: '#0a0a0a', primary: '#ea5a1a', muted: '#6a6458', border: 'rgba(10,10,10,.18)', codeBg: '#ede5d0', panelBg: '#fbf6e8', fontFamily: INTER, headingFamily: SERIF },
  { id: 'editorial', name: '文艺衬线', dark: false, bg: '#faf7f2', fg: '#1b1410', primary: '#8a2a1c', muted: '#8a7868', border: 'rgba(40,28,18,.14)', codeBg: '#f7f2e8', panelBg: '#ffffff', fontFamily: SERIF, headingFamily: SERIF },
  { id: 'academic', name: '学术论文', dark: false, bg: '#fdfcf8', fg: '#0a0a0a', primary: '#1a3a7a', muted: '#707070', border: 'rgba(20,20,20,.16)', codeBg: '#f5f3ea', panelBg: '#ffffff', fontFamily: SERIF, headingFamily: SERIF },
  { id: 'bauhaus', name: '包豪斯', dark: false, bg: '#f4efe3', fg: '#111111', primary: '#e03c27', muted: '#666666', border: '#111111', codeBg: '#f4efe3', panelBg: '#ffffff', fontFamily: GROTESK, headingFamily: ARCHIVO },
  { id: 'midcentury', name: '中世纪现代', dark: false, bg: '#f3ead8', fg: '#201810', primary: '#c7502a', muted: '#9a8868', border: 'rgba(60,40,20,.20)', codeBg: '#e8dcbe', panelBg: '#f9f2e0', fontFamily: INTER, headingFamily: SERIF },
  { id: 'japanese', name: '和风极简', dark: false, bg: '#fafaf5', fg: '#1a1a18', primary: '#d93a2a', muted: '#9c958a', border: 'rgba(40,30,20,.12)', codeBg: '#f5f3ea', panelBg: '#ffffff', fontFamily: INTER, headingFamily: SERIF_CN },

  // —— 柔和 / 社媒 / 多彩 ——
  { id: 'soft-pastel', name: '马卡龙', dark: false, bg: '#fdf7fb', fg: '#3a1f33', primary: '#f49bb8', muted: '#a28a99', border: 'rgba(120,70,110,.14)', codeBg: '#fdf0f5', panelBg: '#ffffff', fontFamily: INTER },
  { id: 'sunset', name: '暖阳', dark: false, bg: '#fff7ef', fg: '#2a160a', primary: '#e36a2d', muted: '#a28572', border: 'rgba(120,60,20,.14)', codeBg: '#fff2e0', panelBg: '#ffffff', fontFamily: INTER },
  { id: 'xiaohongshu', name: '小红书白', dark: false, bg: '#fffdfb', fg: '#1a1210', primary: '#ff2742', muted: '#a08d85', border: 'rgba(60,30,20,.10)', codeBg: '#fff1ea', panelBg: '#ffffff', fontFamily: INTER, headingFamily: SERIF_CN },
  { id: 'rainbow', name: '彩虹渐变', dark: false, bg: '#ffffff', fg: '#0c0d10', primary: '#ff4d8b', muted: '#9096a8', border: 'rgba(20,20,40,.10)', codeBg: '#f4f4f8', panelBg: '#ffffff', fontFamily: INTER },
]

export function findSkin(id: string | null | undefined): SlideSkin | null {
  if (!id || id === 'none') return null
  return SLIDE_SKINS.find((s) => s.id === id) ?? null
}

export function appShellClassForSkin(_id: string | null | undefined): string {
  return ''
}

// 皮肤激活时，把它的配色注入 ThemeTokens，让 mermaid/echarts 跟随皮肤变色。
export function applySkinToTokens(base: ThemeTokens, skin: SlideSkin): ThemeTokens {
  return {
    ...base,
    id: `${base.id}__${skin.id}`,
    dark: skin.dark,
    primaryColor: skin.primary,
    bg: skin.bg,
    fg: skin.fg,
    muted: skin.muted,
    border: skin.border,
    codeBg: skin.codeBg,
    panelBg: skin.panelBg,
    fontFamily: skin.fontFamily ?? base.fontFamily,
    headingFamily: skin.headingFamily ?? skin.fontFamily ?? base.headingFamily,
  }
}

// 把皮肤配色写成 CSS 变量键值（注入到 .reveal 根，子元素继承）。
export function skinCssVars(skin: SlideSkin): Record<string, string> {
  return {
    '--bg': skin.bg,
    '--fg': skin.fg,
    '--primary-color': skin.primary,
    '--muted': skin.muted,
    '--border': skin.border,
    '--code-bg': skin.codeBg,
    '--panel-bg': skin.panelBg,
    '--font-family': skin.fontFamily ?? '',
    '--heading-family': skin.headingFamily ?? skin.fontFamily ?? '',
  }
}
