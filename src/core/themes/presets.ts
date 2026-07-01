export interface ThemeTokens {
  id: string
  name: string
  type: 'document' | 'slide' | 'mobile' | 'all'
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
  headingFamily?: string // 可选：标题字体（不填则用 fontFamily）
}

const SANS = '-apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
const YAHEI = '"Microsoft YaHei", "PingFang SC", sans-serif'
// 以下字体栈在缺少对应 webfont 时会优雅回退到系统字体
const GEOMETRIC = '"Inter Tight", Inter, system-ui, "Noto Sans SC", sans-serif'
const SERIF_CN = '"Source Han Serif SC", "Noto Serif SC", "Songti SC", Georgia, serif'
const SERIF_DISPLAY = '"Playfair Display", "Noto Serif SC", Georgia, "Songti SC", serif'

// 自有主题集：原创命名，配色去重（同色系仅保留一套）。
export const PRESETS: Record<string, ThemeTokens> = {
  // —— 浅色基础 ——
  moon: {
    id: 'moon', name: '月白', type: 'all', dark: false,
    primaryColor: '#334155', bg: '#ffffff', fg: '#1f2328', muted: '#6b7280',
    border: '#e5e7eb', codeBg: '#f6f8fa', panelBg: '#fafafa',
    fontFamily: SANS, headingWeight: 700,
  },
  azure: {
    id: 'azure', name: '青岚', type: 'all', dark: false,
    primaryColor: '#0ea5e9', bg: '#ffffff', fg: '#0f172a', muted: '#64748b',
    border: '#e2e8f0', codeBg: '#f1f5f9', panelBg: '#f8fafc',
    fontFamily: SANS, headingWeight: 700,
  },
  violet: {
    id: 'violet', name: '黛紫', type: 'all', dark: false,
    primaryColor: '#6c5ce7', bg: '#ffffff', fg: '#1a1a2e', muted: '#6b6b80',
    border: '#ece9fb', codeBg: '#f6f5ff', panelBg: '#f7f6ff',
    fontFamily: SANS, headingWeight: 700,
  },
  // 极简纸感：暖白底 + 蓝 + 衬线标题（对标参考稿）
  paper: {
    id: 'paper', name: '霁蓝', type: 'all', dark: false,
    primaryColor: '#2563eb', bg: '#fafaf8', fg: '#111827', muted: '#6b7280',
    border: '#e7e7e2', codeBg: '#f4f4f1', panelBg: '#f7f7f3',
    fontFamily: SANS, headingWeight: 700, headingFamily: SERIF_CN,
  },

  // —— 深色 ——
  midnight: {
    id: 'midnight', name: '墨夜', type: 'all', dark: true,
    primaryColor: '#8b8cff', bg: '#0b1020', fg: '#e8eaf2', muted: '#9aa0b8',
    border: '#222a44', codeBg: '#141b30', panelBg: '#161d33',
    fontFamily: SANS, headingWeight: 700,
  },

  // —— 商务/汇报 ——
  cinnabar: {
    id: 'cinnabar', name: '丹砂', type: 'all', dark: false,
    primaryColor: '#c0392b', bg: '#ffffff', fg: '#1a1a1a', muted: '#7a7a7a',
    border: '#ecdcd9', codeBg: '#faf3f2', panelBg: '#fbf7f6',
    fontFamily: YAHEI, headingWeight: 700,
  },
  prussian: {
    id: 'prussian', name: '靛青', type: 'all', dark: false,
    primaryColor: '#002FA7', bg: '#fafaf8', fg: '#0a0a0a', muted: '#6b6b6b',
    border: '#d9d9d2', codeBg: '#f0f0ec', panelBg: '#f2f2ee',
    fontFamily: GEOMETRIC, headingFamily: GEOMETRIC, headingWeight: 800,
  },
  tangerine: {
    id: 'tangerine', name: '橘洲', type: 'all', dark: false,
    primaryColor: '#e25822', bg: '#f7f5ee', fg: '#1a1206', muted: '#736f66',
    border: '#dcd7c8', codeBg: '#efece2', panelBg: '#f1eee5',
    fontFamily: GEOMETRIC, headingFamily: GEOMETRIC, headingWeight: 800,
  },

  // —— 自然/纸感（衬线） ——
  // 苍翠：护眼绿系。背景带淡绿调（减少蓝光眩光），主色取翠绿中调（不刺眼也不闷），
  // 文字深翠灰、对比适中。id 保留 pine 兼容已有用户存档。
  pine: {
    id: 'pine', name: '苍翠', type: 'all', dark: false,
    primaryColor: '#3f8d6e', bg: '#eef4ef', fg: '#1f3a2e', muted: '#637b6a',
    border: '#d4ddd5', codeBg: '#e5ece6', panelBg: '#e7eee8',
    fontFamily: SANS, headingFamily: SERIF_DISPLAY, headingWeight: 700,
  },
  xuan: {
    id: 'xuan', name: '宣纸', type: 'all', dark: false,
    primaryColor: '#1B365D', bg: '#f5f4ed', fg: '#1f1d18', muted: '#6b665b',
    border: '#d4d1c5', codeBg: '#efeee5', panelBg: '#efeee5',
    fontFamily: SERIF_CN, headingFamily: SERIF_CN, headingWeight: 700,
  },
  clay: {
    id: 'clay', name: '陶土', type: 'all', dark: false,
    primaryColor: '#8a4b2d', bg: '#eedfc7', fg: '#2a1e13', muted: '#7a6a55',
    border: '#d4c2a2', codeBg: '#e4d6bb', panelBg: '#e0d0b6',
    fontFamily: SANS, headingFamily: SERIF_DISPLAY, headingWeight: 700,
  },
}

export const PRESET_LIST = Object.values(PRESETS)
export const DEFAULT_THEME_ID = 'azure'
