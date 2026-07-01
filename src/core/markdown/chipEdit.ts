// 行内标签编辑的纯核心（M3 地基）：把 ((...)) / :name: 的源码片段解析为结构化字段，
// 编辑后再序列化回源码。与渲染器 chips.ts / icons.ts 的语法一一对应。
// 纯函数、无 DOM、无 i18n 依赖，供未来的「行内标签弹层」组件复用并独立单测。

export const CHIP_COLORS = ['green', 'red', 'blue', 'amber', 'gray', 'primary'] as const
export type ChipColor = (typeof CHIP_COLORS)[number]

export type ChipFields =
  | { kind: 'pill'; color?: ChipColor; text: string }
  | { kind: 'bar'; value: number; label?: string }
  | { kind: 'spark'; values: number[] }
  | { kind: 'icon'; name: string }

const COLOR_SET = new Set<string>(CHIP_COLORS)

// 解析单个 chip 源码（不含周围文本）：
//   ((...))          → pill / bar / spark
//   :name:           → icon
// 解析失败返回 null。
export function parseChip(source: string): ChipFields | null {
  const s = source.trim()

  const icon = /^:([a-z][a-z0-9-]*):$/i.exec(s)
  if (icon) return { kind: 'icon', name: icon[1].toLowerCase() }

  const paren = /^\(\(\s*([^()]+?)\s*\)\)$/.exec(s)
  if (!paren) return null
  const inner = paren[1].trim()

  const bar = /^bar:\s*(\d{1,3})(?::\s*(.+))?$/i.exec(inner)
  if (bar) {
    const value = Math.max(0, Math.min(100, Number(bar[1])))
    const label = bar[2]?.trim()
    return label ? { kind: 'bar', value, label } : { kind: 'bar', value }
  }

  const spark = /^spark:\s*([\d.,\s-]+)$/i.exec(inner)
  if (spark) {
    const values = spark[1].split(',').map((x) => parseFloat(x.trim())).filter((n) => Number.isFinite(n))
    if (values.length >= 2) return { kind: 'spark', values }
  }

  const colored = /^([a-z]+):\s*(.+)$/i.exec(inner)
  if (colored && COLOR_SET.has(colored[1].toLowerCase())) {
    return { kind: 'pill', color: colored[1].toLowerCase() as ChipColor, text: colored[2].trim() }
  }

  return { kind: 'pill', text: inner }
}

// 结构化字段 → 源码片段（与 parseChip 互逆；值做边界规整）。
export function serializeChip(fields: ChipFields): string {
  switch (fields.kind) {
    case 'icon':
      return `:${fields.name}:`
    case 'bar': {
      const v = Math.max(0, Math.min(100, Math.round(fields.value)))
      const label = fields.label?.trim()
      return label ? `((bar:${v}:${label}))` : `((bar:${v}))`
    }
    case 'spark':
      return `((spark:${fields.values.join(',')}))`
    case 'pill':
      return fields.color ? `((${fields.color}:${fields.text}))` : `((${fields.text}))`
  }
}
