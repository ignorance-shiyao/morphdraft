// M4-3: 智能版式推荐引擎
// 根据幻灯片内容特征推荐合适的版式。
import type { SlideLayout } from './layout'

export interface LayoutSuggestion {
  layout: SlideLayout
  reason: string
  recommended: boolean // ★ 标记推荐项
}

// 分析幻灯片内容，返回版式推荐列表
export function suggestLayouts(md: string): LayoutSuggestion[] {
  const lines = md.split('\n').map(l => l.trim()).filter(Boolean)
  const headings = lines.filter(l => /^#{1,6}\s/.test(l))
  const images = lines.filter(l => /^!\[.*\]\(.*\)/.test(l))
  const tables = lines.filter(l => /^\|/.test(l))
  const lists = lines.filter(l => /^[-*+]\s/.test(l) || /^\d+\.\s/.test(l))
  const codeBlocks = lines.filter(l => /^```/.test(l))
  const hasChart = lines.some(l => /```(mermaid|echarts)/.test(l))
  const totalChars = lines.join('').length

  const suggestions: LayoutSuggestion[] = []

  // cover: 仅标题 + 极少内容
  if (headings.length === 1 && lines.length <= 4 && !images.length && !tables.length) {
    suggestions.push({ layout: 'cover', reason: '仅标题，适合封面', recommended: true })
  }

  // section: 章节标题页
  if (headings.length === 1 && lines.length <= 3 && !images.length) {
    suggestions.push({ layout: 'section', reason: '章节标题，适合分隔页', recommended: headings[0]?.startsWith('# ') })
  }

  // center: 引用/金句
  if (lines.some(l => /^>/.test(l)) && lines.length <= 3) {
    suggestions.push({ layout: 'center', reason: '引用/金句，适合居中', recommended: true })
  }

    // image-full: 多图为主、文字少 → 整图铺底
    if (images.length >= 3) {
        suggestions.push({
            layout: 'image-full',
            reason: '多图视觉，整图铺底',
            recommended: !suggestions.some(s => s.recommended)
        })
    }

    // grid: 两图或多块并列 → 卡片栅格
    if (images.length === 2 || (lists.length >= 4 && !tables.length)) {
        suggestions.push({layout: 'grid', reason: '多块并列，卡片栅格', recommended: false})
    }

    // image-left / image-right: 单图
  if (images.length === 1 && (headings.length || lists.length)) {
      suggestions.push({
          layout: 'image-right',
          reason: '图文混排，图片右置',
          recommended: !suggestions.some(s => s.recommended)
      })
    suggestions.push({ layout: 'image-left', reason: '图文混排，图片左置', recommended: false })
  }

    // split: 内容厚重、块多且无图 → 自动双栏
    const heavy = tables.length + lists.length + codeBlocks.length
    if (!images.length && lines.length >= 12 && heavy >= 8) {
        suggestions.push({
            layout: 'split',
            reason: '内容厚重，自动双栏',
            recommended: !suggestions.some(s => s.recommended)
        })
  }

  // default: 内容较多
  if (lines.length > 5 || tables.length || hasChart) {
    suggestions.push({ layout: 'default', reason: '内容丰富，适合标准版式', recommended: !suggestions.some(s => s.recommended) })
  }

  // 如果没有推荐项，标记 default 为推荐
  if (!suggestions.some(s => s.recommended) && suggestions.length) {
    suggestions[suggestions.length - 1].recommended = true
  }

  return suggestions
}

// 获取推荐的版式（第一个 recommended 项）
export function getRecommendedLayout(md: string): SlideLayout {
  const suggestions = suggestLayouts(md)
  const rec = suggestions.find(s => s.recommended)
  return rec?.layout ?? 'default'
}
