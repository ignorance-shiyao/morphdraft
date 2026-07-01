// 共享色板生成器：ThemeTokens → 系列色板
// mermaid 与 echarts 共用同一份算法，保证两种图表"看起来是一家人"。
import type { ThemeTokens } from '../themes/presets'

interface HSL { h: number; s: number; l: number }

function hexToHsl(hex: string): HSL {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16) / 255
  const g = parseInt(clean.slice(2, 4), 16) / 255
  const b = parseInt(clean.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break
      case g: h = (b - r) / d + 2; break
      case b: h = (r - g) / d + 4; break
    }
    h /= 6
  }
  return { h: h * 360, s: s * 100, l: l * 100 }
}

function hslToHex({ h, s, l }: HSL): string {
  const sn = Math.max(0, Math.min(100, s)) / 100
  const ln = Math.max(0, Math.min(100, l)) / 100
  const c = (1 - Math.abs(2 * ln - 1)) * sn
  const hh = ((h % 360) + 360) % 360 / 60
  const x = c * (1 - Math.abs((hh % 2) - 1))
  let r = 0, g = 0, b = 0
  if (hh < 1) [r, g, b] = [c, x, 0]
  else if (hh < 2) [r, g, b] = [x, c, 0]
  else if (hh < 3) [r, g, b] = [0, c, x]
  else if (hh < 4) [r, g, b] = [0, x, c]
  else if (hh < 5) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const m = ln - c / 2
  const to2 = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0')
  return `#${to2(r)}${to2(g)}${to2(b)}`
}

// 主色 hex 衍生 8 色色板。
// 「高级感」要点（对标 Stripe / Linear / Observable 等现代数据可视化）：
//   1) 整体降饱和——避免霓虹刺眼的彩虹色；
//   2) 各槽位明度错落有节奏——产生层次而非一片死板；
//   3) 色相分布广以保证可辨识，但用「柔和强调」代替纯互补（+180）的硬碰撞。
// 槽位：[色相偏移 dh, 饱和度偏移 ds, 明度偏移 dl]，以主色为锚点（slot0 保留主色色相）。
const PALETTE_SLOTS: [number, number, number][] = [
  [0, 0, 0],       // 主色（锚点）
  [202, -16, 9],   // 柔和冷调强调（近互补但降饱和抬亮，不刺眼）
  [-30, -4, -7],   // 邻近暖侧、压暗
  [150, -22, 13],  // 青绿 / 薄荷，明亮通透
  [40, -12, 5],    // 金橙暖点
  [-66, -18, 16],  // 紫粉，高明度低饱和
  [98, -24, 1],    // 草木绿，沉一点
  [232, -14, -8],  // 靛蓝，压暗收尾
]

export function derivePalette(primaryHex: string, dark: boolean): string[] {
  const base = hexToHsl(primaryHex)
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
  // 明度区间：浅色主题中等、暗色主题偏亮（深底上可读）
  const lLo = dark ? 52 : 42
  const lHi = dark ? 74 : 64
  // 支撑色（slot1+）统一压低饱和上限，整体克制协调、不与主色抢戏——这是「高级」的关键。
  const sCap = dark ? 56 : 60
  const sFloor = 30
  const baseS = dark ? base.s - 16 : base.s - 12
  const baseL = dark ? base.l + 10 : Math.min(base.l, 52)
  // 感知校正：蓝紫/品红区（hue 230–320）在同饱和度下天生更暗更扎眼，额外抬亮 + 降饱和，
  // 拉平各色相的「视觉重量」，避免某一格突兀（HSL 饱和度并非感知均匀）。
  const refine = (h: number, s: number, l: number) => {
    const hh = ((h % 360) + 360) % 360
    return hh >= 230 && hh <= 320 ? { s: s - 12, l: l + 9 } : { s, l }
  }
  return PALETTE_SLOTS.map(([dh, ds, dl], i) => {
    // slot0 保留主色本身（品牌识别），不做压饱和
    if (i === 0) return hslToHex({ h: base.h, s: base.s, l: base.l })
    const h = base.h + dh
    const r = refine(h, clamp(baseS + ds, sFloor, sCap), clamp(baseL + dl, lLo, lHi))
    return hslToHex({ h, s: clamp(r.s, sFloor, sCap), l: clamp(r.l, lLo, lHi) })
  })
}

// 半透明叠加：用于 axis/grid 等弱化元素
export function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, '0')
  return `${hex}${a}`
}

// 从 tokens 一次性派生图表用色集合
export interface ChartPalette {
  primary: string
  series: string[]      // 8 色系列色板
  fg: string            // 主文字（轴线标签/图例）
  muted: string         // 弱化文字
  border: string        // 网格线/坐标轴
  bg: string            // 背景（一般透明，留作 placeholder）
  splitLine: string     // 分割线（半透明 border）
  fontFamily: string
  dark: boolean
}

export function buildChartPalette(t: ThemeTokens): ChartPalette {
  return {
    primary: t.primaryColor,
    series: derivePalette(t.primaryColor, t.dark),
    fg: t.fg,
    muted: t.muted,
    border: t.border,
    bg: 'transparent',
    splitLine: withAlpha(t.border, 0.5),
    fontFamily: t.fontFamily,
    dark: t.dark,
  }
}
