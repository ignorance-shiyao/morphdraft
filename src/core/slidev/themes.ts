// Slidev 官方主题画廊的应用内移植注册表。
// 主题包的 Vue 组件与 UnoCSS 不直接注入应用；这里保留来源与视觉母题，
// 由 slidevThemes.css 重建可离线、可导出且互不冲突的页面级视觉。

export interface SlidevTheme {
  id: string
  name: string
  dark: boolean
  bg: string
  fg: string
  primary: string
  muted: string
  border: string
  codeBg: string
  fontFamily: string
  headingFamily: string
  sourcePackage: string
  sourceUrl: string
  author: string
  visualStyle: string
  gallery: boolean
}

export interface SlidevThemeChartTokens {
  id: string
  name: string
  type: 'slide'
  dark: boolean
  primaryColor: string
  bg: string
  fg: string
  muted: string
  border: string
  codeBg: string
  panelBg: string
  fontFamily: string
  headingWeight: number
  headingFamily: string
}

const SANS = '"Avenir Next", "Noto Sans SC", system-ui, sans-serif'
const HUMANIST = '"Gill Sans", "Avenir Next", "Noto Sans SC", sans-serif'
const SERIF = '"Iowan Old Style", "Noto Serif SC", Georgia, serif'
const MONO = '"JetBrains Mono", "SFMono-Regular", Menlo, monospace'
const APPLE = '-apple-system, "SF Pro Display", "Helvetica Neue", "Noto Sans SC", sans-serif'
const HAND = '"Bradley Hand", "Comic Sans MS", "Noto Sans SC", cursive'
const CONDENSED = '"Arial Narrow", "Avenir Next Condensed", "Noto Sans SC", sans-serif'

export const SLIDEV_GALLERY_THEME_IDS = [
  'default',
  'seriph',
  'apple-basic',
  'bricks',
  'shibainu',
  'geist',
  'light-icons',
  'eloc',
  'purplin',
  'unicorn',
  'zhozhoba',
  'penguin',
  'vuetiful',
  'takahashi',
  'academic',
  'mokkapps',
  'the-unnamed',
  'dracula',
  'frankfurt',
  'hep',
  'excali-slide',
  'mint',
  'neversink',
  'ktym4a',
  'nord',
  'scholarly',
  'field-manual',
  'touying',
] as const

export const SLIDEV_THEMES: SlidevTheme[] = [
  {
    id: 'default', name: 'Default · 官方', dark: false,
    bg: '#ffffff', fg: '#18181b', primary: '#2563eb', muted: '#71717a',
    border: 'rgba(24,24,27,.14)', codeBg: '#f4f4f5', fontFamily: SANS, headingFamily: SANS,
    sourcePackage: '@slidev/theme-default', sourceUrl: 'https://github.com/slidevjs/themes/tree/main/packages/theme-default',
    author: 'Anthony Fu', visualStyle: 'minimal-grid', gallery: true,
  },
  {
    id: 'seriph', name: 'Seriph · 官方', dark: false,
    bg: '#fdfbf7', fg: '#292524', primary: '#9a664d', muted: '#78716c',
    border: 'rgba(41,37,36,.15)', codeBg: '#f2ede6', fontFamily: SANS, headingFamily: SERIF,
    sourcePackage: '@slidev/theme-seriph', sourceUrl: 'https://github.com/slidevjs/themes/tree/main/packages/theme-seriph',
    author: 'Anthony Fu', visualStyle: 'literary-serif', gallery: true,
  },
  {
    id: 'apple-basic', name: 'Apple Basic · 官方', dark: false,
    bg: '#fbfbfd', fg: '#1d1d1f', primary: '#0071e3', muted: '#86868b',
    border: 'rgba(29,29,31,.11)', codeBg: '#f5f5f7', fontFamily: APPLE, headingFamily: APPLE,
    sourcePackage: '@slidev/theme-apple-basic', sourceUrl: 'https://github.com/slidevjs/themes/tree/main/packages/theme-apple-basic',
    author: 'Jeremy Meissner', visualStyle: 'keynote-minimal', gallery: true,
  },
  {
    id: 'bricks', name: 'Bricks · 官方', dark: false,
    bg: '#fffdf9', fg: '#211f1c', primary: '#e4572e', muted: '#746e67',
    border: 'rgba(33,31,28,.18)', codeBg: '#fff0e8', fontFamily: SANS, headingFamily: MONO,
    sourcePackage: '@slidev/theme-bricks', sourceUrl: 'https://github.com/slidevjs/themes/tree/main/packages/theme-bricks',
    author: 'iiiiiiinès', visualStyle: 'modular-bricks', gallery: true,
  },
  {
    id: 'shibainu', name: 'Shibainu · 官方', dark: false,
    bg: '#f7efe2', fg: '#3b2a1e', primary: '#c66b3d', muted: '#8f7765',
    border: 'rgba(59,42,30,.18)', codeBg: '#eadcc8', fontFamily: HUMANIST, headingFamily: HUMANIST,
    sourcePackage: '@slidev/theme-shibainu', sourceUrl: 'https://github.com/slidevjs/themes/tree/main/packages/theme-shibainu',
    author: 'iiiiiiinès', visualStyle: 'warm-playful', gallery: true,
  },
  {
    id: 'geist', name: 'Vercel / Geist', dark: false,
    bg: '#ffffff', fg: '#000000', primary: '#000000', muted: '#666666',
    border: 'rgba(0,0,0,.16)', codeBg: '#fafafa', fontFamily: SANS, headingFamily: MONO,
    sourcePackage: 'slidev-theme-geist', sourceUrl: 'https://github.com/nico-bachner/slidev-theme-geist',
    author: 'Nico Bachner', visualStyle: 'vercel-monochrome', gallery: true,
  },
  {
    id: 'light-icons', name: 'Light Icons', dark: false,
    bg: '#ffffff', fg: '#172033', primary: '#3b82f6', muted: '#7b8794',
    border: 'rgba(23,32,51,.13)', codeBg: '#f2f6fc', fontFamily: SANS, headingFamily: SANS,
    sourcePackage: 'slidev-theme-light-icons', sourceUrl: 'https://github.com/lightvue/slidev-theme-light-icons',
    author: 'Pulkit Aggarwal', visualStyle: 'airy-iconic', gallery: true,
  },
  {
    id: 'eloc', name: 'Eloc', dark: false,
    bg: '#f4f1e9', fg: '#242424', primary: '#e03e2f', muted: '#77736a',
    border: 'rgba(36,36,36,.18)', codeBg: '#e9e4d8', fontFamily: SANS, headingFamily: CONDENSED,
    sourcePackage: 'slidev-theme-eloc', sourceUrl: 'https://github.com/zthxxx/slides/tree/master/packages/slidev-theme-eloc',
    author: 'Amio', visualStyle: 'editorial-concise', gallery: true,
  },
  {
    id: 'purplin', name: 'Purplin', dark: true,
    bg: '#191424', fg: '#f4efff', primary: '#a855f7', muted: '#a89bbf',
    border: 'rgba(244,239,255,.17)', codeBg: '#2a2238', fontFamily: SANS, headingFamily: SANS,
    sourcePackage: 'slidev-theme-purplin', sourceUrl: 'https://github.com/moudev/slidev-theme-purplin',
    author: 'Mauricio Martínez', visualStyle: 'purple-bottom-bar', gallery: true,
  },
  {
    id: 'unicorn', name: 'Unicorn', dark: true,
    bg: '#111827', fg: '#f8fafc', primary: '#f472b6', muted: '#a5b4c7',
    border: 'rgba(248,250,252,.16)', codeBg: '#1e293b', fontFamily: SANS, headingFamily: SANS,
    sourcePackage: 'slidev-theme-unicorn', sourceUrl: 'https://github.com/dawntraoz/slidev-theme-unicorn',
    author: 'Alba Silvente', visualStyle: 'neon-unicorn', gallery: true,
  },
  {
    id: 'zhozhoba', name: 'Zhozhoba', dark: false,
    bg: '#fff7e8', fg: '#31261e', primary: '#f97316', muted: '#8a7565',
    border: 'rgba(49,38,30,.17)', codeBg: '#f5e8d2', fontFamily: HUMANIST, headingFamily: SERIF,
    sourcePackage: 'slidev-theme-zhozhoba', sourceUrl: 'https://github.com/thatoranzhevyy/slidev-theme-zhozhoba',
    author: 'Bogenbai Bayzharassov', visualStyle: 'sunset-editorial', gallery: true,
  },
  {
    id: 'penguin', name: 'Penguin', dark: false,
    bg: '#f8fafc', fg: '#21313b', primary: '#2f7d8c', muted: '#778891',
    border: 'rgba(33,49,59,.15)', codeBg: '#eaf1f3', fontFamily: SANS, headingFamily: SANS,
    sourcePackage: 'slidev-theme-penguin', sourceUrl: 'https://github.com/alvarosaburido/slidev-theme-penguin',
    author: 'Alvaro Saburido', visualStyle: 'cool-rounded', gallery: true,
  },
  {
    id: 'vuetiful', name: 'Vuetiful', dark: false,
    bg: '#ffffff', fg: '#213547', primary: '#42b883', muted: '#71808c',
    border: 'rgba(33,53,71,.15)', codeBg: '#edf8f2', fontFamily: SANS, headingFamily: SANS,
    sourcePackage: 'slidev-theme-vuetiful', sourceUrl: 'https://github.com/LinusBorg/slidev-theme-vuetiful',
    author: 'Thorsten Lünborg', visualStyle: 'vue-geometric', gallery: true,
  },
  {
    id: 'takahashi', name: 'Takahashi', dark: false,
    bg: '#ffffff', fg: '#111111', primary: '#ef233c', muted: '#737373',
    border: 'rgba(17,17,17,.18)', codeBg: '#f5f5f5', fontFamily: SANS, headingFamily: SANS,
    sourcePackage: 'slidev-theme-takahashi', sourceUrl: 'https://github.com/kecrily/slidev-theme-takahashi',
    author: 'Percy M.', visualStyle: 'takahashi-big-type', gallery: true,
  },
  {
    id: 'academic', name: 'Academic', dark: false,
    bg: '#faf8f2', fg: '#1e293b', primary: '#1d4ed8', muted: '#64748b',
    border: 'rgba(30,41,59,.16)', codeBg: '#eef1f5', fontFamily: SERIF, headingFamily: SERIF,
    sourcePackage: 'slidev-theme-academic', sourceUrl: 'https://github.com/alexanderdavide/slidev-theme-academic',
    author: 'Alexander Eble', visualStyle: 'academic-paper', gallery: true,
  },
  {
    id: 'mokkapps', name: 'Mokkapps', dark: true,
    bg: '#101827', fg: '#f7fafc', primary: '#a3e635', muted: '#94a3b8',
    border: 'rgba(247,250,252,.16)', codeBg: '#1c2738', fontFamily: SANS, headingFamily: MONO,
    sourcePackage: 'slidev-theme-mokkapps', sourceUrl: 'https://github.com/mokkapps/slidev-theme-mokkapps',
    author: 'Michael Hoffmann', visualStyle: 'developer-lime', gallery: true,
  },
  {
    id: 'the-unnamed', name: 'The unnamed', dark: true,
    bg: '#0d1524', fg: '#dce7f5', primary: '#f141a8', muted: '#8191a8',
    border: 'rgba(220,231,245,.16)', codeBg: '#162238', fontFamily: MONO, headingFamily: MONO,
    sourcePackage: 'slidev-theme-the-unnamed', sourceUrl: 'https://github.com/estruyf/slidev-theme-the-unnamed',
    author: 'Elio Struyf', visualStyle: 'vscode-cyber', gallery: true,
  },
  {
    id: 'dracula', name: 'Dracula', dark: true,
    bg: '#282a36', fg: '#f8f8f2', primary: '#bd93f9', muted: '#8b92b7',
    border: 'rgba(248,248,242,.17)', codeBg: '#44475a', fontFamily: MONO, headingFamily: SANS,
    sourcePackage: 'slidev-theme-dracula', sourceUrl: 'https://github.com/jd-solanki/slidev-theme-dracula',
    author: 'JD Solanki', visualStyle: 'dracula-terminal', gallery: true,
  },
  {
    id: 'frankfurt', name: 'Frankfurt', dark: true,
    bg: '#0e1b2e', fg: '#eaf1f8', primary: '#4fd1c5', muted: '#8ca2b8',
    border: 'rgba(234,241,248,.16)', codeBg: '#18283d', fontFamily: SANS, headingFamily: SANS,
    sourcePackage: 'slidev-theme-frankfurt', sourceUrl: 'https://github.com/MuTsunTsai/slidev-theme-frankfurt',
    author: 'Mu-Tsun Tsai', visualStyle: 'beamer-navigation', gallery: true,
  },
  {
    id: 'hep', name: 'HEP', dark: false,
    bg: '#ffffff', fg: '#17233b', primary: '#005bbb', muted: '#68758a',
    border: 'rgba(23,35,59,.16)', codeBg: '#edf3fa', fontFamily: SANS, headingFamily: SERIF,
    sourcePackage: 'slidev-theme-hep', sourceUrl: 'https://github.com/AvencastF/slidev-theme-hep',
    author: 'Yulei Zhang', visualStyle: 'physics-blueprint', gallery: true,
  },
  {
    id: 'excali-slide', name: 'Excali-slide', dark: false,
    bg: '#fffdf8', fg: '#25232a', primary: '#7c3aed', muted: '#77717f',
    border: 'rgba(37,35,42,.22)', codeBg: '#f2eef9', fontFamily: HAND, headingFamily: HAND,
    sourcePackage: 'slidev-theme-excali-slide', sourceUrl: 'https://github.com/filiphric/slidev-theme-excali-slide',
    author: 'Filip Hric', visualStyle: 'excalidraw-handmade', gallery: true,
  },
  {
    id: 'mint', name: 'Mint', dark: false,
    bg: '#f1fff8', fg: '#18372c', primary: '#10b981', muted: '#668278',
    border: 'rgba(24,55,44,.15)', codeBg: '#dcf7e9', fontFamily: SANS, headingFamily: SERIF,
    sourcePackage: 'slidev-theme-mint', sourceUrl: 'https://github.com/alfatta/slidev-theme-mint',
    author: 'Alfatta Rezqa', visualStyle: 'mint-botanical', gallery: true,
  },
  {
    id: 'neversink', name: 'Neversink', dark: false,
    bg: '#fff9ea', fg: '#19253a', primary: '#f05a28', muted: '#746f65',
    border: 'rgba(25,37,58,.18)', codeBg: '#f1ead8', fontFamily: HUMANIST, headingFamily: CONDENSED,
    sourcePackage: 'slidev-theme-neversink', sourceUrl: 'https://github.com/gureckis/slidev-theme-neversink',
    author: 'Todd M. Gureckis', visualStyle: 'education-whimsical', gallery: true,
  },
  {
    id: 'ktym4a', name: 'ktym4a', dark: true,
    bg: '#1e1e2e', fg: '#cdd6f4', primary: '#cba6f7', muted: '#9399b2',
    border: 'rgba(205,214,244,.16)', codeBg: '#313244', fontFamily: MONO, headingFamily: SANS,
    sourcePackage: 'slidev-theme-ktym4a', sourceUrl: 'https://github.com/ktym4a/slidev-theme-ktym4a',
    author: 'ktym4a', visualStyle: 'catppuccin-rotation', gallery: true,
  },
  {
    id: 'nord', name: 'Nord', dark: true,
    bg: '#2e3440', fg: '#eceff4', primary: '#88c0d0', muted: '#a7b0c0',
    border: 'rgba(236,239,244,.16)', codeBg: '#3b4252', fontFamily: SANS, headingFamily: SERIF,
    sourcePackage: 'slidev-theme-nord', sourceUrl: 'https://github.com/oller/slidev-theme-nord',
    author: 'David Ollerhead', visualStyle: 'nordic-calm', gallery: true,
  },
  {
    id: 'scholarly', name: 'Scholarly', dark: false,
    bg: '#fffdf7', fg: '#202936', primary: '#17365d', muted: '#6c7582',
    border: 'rgba(32,41,54,.17)', codeBg: '#eef1f5', fontFamily: SERIF, headingFamily: SERIF,
    sourcePackage: 'slidev-theme-scholarly', sourceUrl: 'https://github.com/jxpeng98/slidev-theme-scholarly',
    author: 'Jiaxin Peng', visualStyle: 'beamer-scholarly', gallery: true,
  },
  {
    id: 'field-manual', name: 'Field Manual', dark: false,
    bg: '#e9e1c8', fg: '#25291e', primary: '#59633f', muted: '#6f705f',
    border: 'rgba(37,41,30,.28)', codeBg: '#d8cfb3', fontFamily: MONO, headingFamily: CONDENSED,
    sourcePackage: 'slidev-theme-field-manual', sourceUrl: 'https://github.com/pjdoland/slidev-theme-field-manual',
    author: 'PJ Doland', visualStyle: 'military-field-manual', gallery: true,
  },
  {
    id: 'touying', name: 'Touying', dark: false,
    bg: '#ffffff', fg: '#1f2937', primary: '#3b82f6', muted: '#6b7280',
    border: 'rgba(31,41,55,.15)', codeBg: '#f1f5f9', fontFamily: SANS, headingFamily: SERIF,
    sourcePackage: 'slidev-theme-touying', sourceUrl: 'https://github.com/kermanx/slidev-theme-touying',
    author: '_Kerman', visualStyle: 'typst-structured', gallery: true,
  },
  {
    id: 'nuxt', name: 'Nuxt 夜 · 扩展', dark: true,
    bg: '#0c1a17', fg: '#e6f4ee', primary: '#00dc82', muted: '#7fa395',
    border: 'rgba(230,244,238,.16)', codeBg: '#142620', fontFamily: SANS, headingFamily: SANS,
    sourcePackage: 'morphdraft-extension', sourceUrl: 'https://nuxt.com/design-kit',
    author: 'MorphDraft', visualStyle: 'nuxt-extension', gallery: false,
  },
]

export function findSlidevTheme(id: string | undefined): SlidevTheme {
  return SLIDEV_THEMES.find((theme) => theme.id === id) ?? SLIDEV_THEMES[0]
}

export function slidevThemeVars(theme: SlidevTheme): Record<string, string> {
  return {
    '--sd-bg': theme.bg,
    '--sd-fg': theme.fg,
    '--sd-primary': theme.primary,
    '--sd-muted': theme.muted,
    '--sd-border': theme.border,
    '--sd-code-bg': theme.codeBg,
    '--sd-font': theme.fontFamily,
    '--sd-heading-font': theme.headingFamily,
    '--sd-mono': MONO,
    '--sd-panel': theme.dark ? 'color-mix(in srgb, var(--sd-fg) 6%, var(--sd-bg))' : 'color-mix(in srgb, var(--sd-bg) 72%, #fff)',
    '--sd-shadow': theme.dark
      ? '0 22px 54px color-mix(in srgb, #000 34%, transparent)'
      : '0 18px 46px color-mix(in srgb, var(--sd-fg) 7%, transparent)',
    '--sd-radius': '14px',
  }
}

export function slidevThemeChartTokens(theme: SlidevTheme): SlidevThemeChartTokens {
  return {
    id: `slidev-${theme.id}`,
    name: theme.name,
    type: 'slide',
    dark: theme.dark,
    primaryColor: theme.primary,
    bg: theme.bg,
    fg: theme.fg,
    muted: theme.muted,
    border: theme.border,
    codeBg: theme.codeBg,
    panelBg: theme.dark
      ? 'color-mix(in srgb, var(--sd-fg) 6%, var(--sd-bg))'
      : 'color-mix(in srgb, var(--sd-bg) 72%, #fff)',
    fontFamily: theme.fontFamily,
    headingFamily: theme.headingFamily,
    headingWeight: 700,
  }
}
