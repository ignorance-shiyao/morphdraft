// 用 @slidev/parser 的浏览器安全核心入口（`/core`，无 Node fs 依赖）解析 Slidev 风格 markdown，
// 归一化成本仓自有的 SlidevDeck（见 types.ts），供渲染器/布局/主题消费。
import { parseSync } from '@slidev/parser/core'
import type { SlideSlots, SlidevDeck, SlidevSlide } from './types'

// 行级插槽分隔符：Slidev 用 `::name::` 单独成行切分多槽布局（two-cols 的 ::right:: 等）。
const SLOT_MARKER = /^::\s*([\w-]+)\s*::\s*$/

function splitSlots(content: string): SlideSlots {
  const slots: SlideSlots = { default: '' }
  const buckets: { name: string; lines: string[] }[] = [{ name: 'default', lines: [] }]
  for (const line of content.split('\n')) {
    const m = line.match(SLOT_MARKER)
    if (m) buckets.push({ name: m[1], lines: [] })
    else buckets[buckets.length - 1].lines.push(line)
  }
  for (const b of buckets) slots[b.name] = b.lines.join('\n').trim()
  return slots
}

function normalizeClasses(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((v) => String(v).split(/\s+/)).filter(Boolean)
  if (typeof value === 'string') return value.split(/\s+/).filter(Boolean)
  return []
}

export function parseSlidevDeck(markdown: string): SlidevDeck {
  // parseSync(content, filepath)；filepath 仅用于错误信息，传空字符串即可。
  const parsed = parseSync(markdown, '')
  const rawSlides = parsed.slides ?? []

  const slides: SlidevSlide[] = rawSlides.map((s, i) => {
    const fm = (s.frontmatter ?? {}) as Record<string, unknown>
    const content = s.content ?? ''
    const layout = typeof fm.layout === 'string' && fm.layout ? fm.layout : 'default'
    const clicks = typeof fm.clicks === 'number' ? fm.clicks : undefined
    return {
      index: i,
      start: typeof (s as { start?: number }).start === 'number' ? (s as { start: number }).start : 0,
      layout,
      classes: normalizeClasses(fm.class),
      clicks,
      frontmatter: fm,
      content,
      slots: splitSlots(content),
      note: s.note ?? undefined,
      title: s.title ?? undefined,
    }
  })

  // 整套配置取自首页 headmatter（Slidev 约定：第一块 frontmatter 同时是 deck 配置）。
  const head = (rawSlides[0]?.frontmatter ?? {}) as Record<string, unknown>
  return {
    slides,
    theme: typeof head.theme === 'string' ? head.theme : undefined,
    engine: typeof head.engine === 'string' ? head.engine : undefined,
    title: typeof head.title === 'string' ? head.title : undefined,
  }
}
