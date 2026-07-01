import { describe, expect, it } from 'vitest'
import SAMPLE from '../../../samples/full-syntax.md?raw'

const MERMAID_TYPES = [
  'flowchart', 'sequenceDiagram', 'classDiagram', 'stateDiagram-v2', 'erDiagram',
  'journey', 'gantt', 'pie', 'quadrantChart', 'requirementDiagram', 'gitGraph',
  'C4Context', 'mindmap', 'timeline', 'sankey-beta', 'xychart-beta', 'block-beta',
  'packet-beta', 'kanban', 'architecture-beta', 'radar-beta', 'eventmodeling',
  'treemap-beta', 'venn-beta', 'ishikawa-beta', 'wardley-beta', 'treeView-beta',
] as const

const ECHARTS_SERIES = [
  'line', 'bar', 'pie', 'scatter', 'effectScatter', 'radar', 'tree', 'treemap',
  'sunburst', 'boxplot', 'candlestick', 'heatmap', 'parallel', 'lines', 'graph',
  'sankey', 'funnel', 'gauge', 'pictorialBar', 'themeRiver',
] as const

describe('默认全语法样例', () => {
  it('覆盖项目内 Mermaid 11.15 注册的全部图种', () => {
    for (const type of MERMAID_TYPES) {
      expect(SAMPLE, `缺少 Mermaid: ${type}`).toContain(`\`\`\`mermaid\n${type}`)
    }
  })

  it('覆盖 ECharts 内置主要 series，并保证每段配置是合法 JSON', () => {
    const blocks = [...SAMPLE.matchAll(/```echarts\n([\s\S]*?)\n```/g)]
    const found = new Set<string>()

    for (const [, source] of blocks) {
      const option = JSON.parse(source) as { series?: Array<{ type?: string }> }
      for (const series of option.series ?? []) {
        if (series.type) found.add(series.type)
      }
    }

    expect(blocks.length).toBeGreaterThanOrEqual(ECHARTS_SERIES.length)
    for (const type of ECHARTS_SERIES) {
      expect(found, `缺少 ECharts series: ${type}`).toContain(type)
    }
  })

  it('覆盖 MorphDraft 扩展语法和 Slidev 示例语法', () => {
    for (const syntax of [
      ':::note', ':::tip', ':::info', ':::success', ':::warning', ':::danger',
      ':::question', ':::card', ':::details', ':::cols', ':::timeline', ':::steps',
      '> [!NOTE]', '- [ ]', '[toc]', '<v-click>', 'layout: two-cols',
    ]) {
      expect(SAMPLE, `缺少语法: ${syntax}`).toContain(syntax)
    }
  })

  it('覆盖 Markdown 关键变体、嵌套与边界语法', () => {
    for (const syntax of [
      'Setext 一级标题', 'Setext 二级标题', '[参考链接][morphdraft-ref]',
      '[[工作区索引]]', '~~~javascript', '<details open>', '`\\|` 转义竖线',
      '\\begin{bmatrix}', '\\begin{cases}', '4. 从指定序号开始',
      '[^multi]: 第一段脚注',
    ]) {
      expect(SAMPLE, `缺少 Markdown 变体: ${syntax}`).toContain(syntax)
    }
  })

  it('覆盖 Mermaid 常用控制语法和 ECharts option 组件', () => {
    for (const syntax of [
      'subgraph', 'classDef', 'linkStyle', 'rect rgb', 'critical',
      'state "并发处理"', 'milestone', 'zero or more',
    ]) {
      expect(SAMPLE, `缺少 Mermaid 变体: ${syntax}`).toContain(syntax)
    }

    for (const optionKey of [
      '"dataset"', '"encode"', '"dataZoom"', '"visualMap"', '"toolbox"',
      '"axisPointer"', '"brush"', '"graphic"', '"timeline"', '"calendar"',
      '"markPoint"', '"markLine"', '"markArea"',
    ]) {
      expect(SAMPLE, `缺少 ECharts option: ${optionKey}`).toContain(optionKey)
    }
  })
})
