export type ChartCardType = 'mermaid' | 'echarts'

export function chartCardTitle(tagName: string, text: string, type: string | undefined) {
  const title = text.trim()
  if (tagName.toUpperCase() !== 'H3' || !title) return null
  if (type !== 'mermaid' && type !== 'echarts') return null
  return { title, type }
}

export function composeChartCards(root: HTMLElement): void {
  const charts = Array.from(root.querySelectorAll<HTMLElement>(':scope > .chart-block'))
  for (const chart of charts) {
    if (chart.closest('.chart-card')) continue
    const heading = chart.previousElementSibling as HTMLElement | null
    const meta = heading
      ? chartCardTitle(heading.tagName, heading.textContent ?? '', chart.dataset.chartType)
      : null
    if (!heading || !meta) continue

    // Reveal 会把任意嵌套 section 识别为纵向幻灯片；图表卡片使用 div，
    // 页面预览语义与样式不变，同时可安全复用于 PPT。
    const card = document.createElement('div')
    card.className = 'chart-card'
    card.dataset.chartType = meta.type

    const badge = document.createElement('span')
    badge.className = 'chart-card-type'
    badge.textContent = meta.type

    const body = document.createElement('div')
    body.className = 'chart-card-body'

    // 标题（H3）保持为卡外的普通标题，不再纳入卡片；卡片只裹图表本体 + 类型徽标。
    chart.before(card)
    body.append(chart)
    card.append(badge, body)
  }
}
