import {readFileSync} from 'node:fs'
import { describe, expect, it } from 'vitest'
import { chartCardTitle } from '../chartCards'

const source = readFileSync(new URL('../chartCards.ts', import.meta.url), 'utf8')

describe('chartCardTitle（页面图表卡片标题匹配）', () => {
  it('只接受紧邻图表的三级标题', () => {
    expect(chartCardTitle('H3', '1. 柱状图（分组）', 'echarts')).toEqual({
      title: '1. 柱状图（分组）',
      type: 'echarts',
    })
    expect(chartCardTitle('H2', '四、ECharts 图表', 'echarts')).toBeNull()
  })

  it('拒绝空标题和未知图表类型', () => {
    expect(chartCardTitle('H3', '  ', 'mermaid')).toBeNull()
    expect(chartCardTitle('H3', '示例', 'unknown')).toBeNull()
  })

    it('避免使用会被 Reveal 识别为纵向幻灯片的 section', () => {
        expect(source).toContain("document.createElement('div')")
        expect(source).not.toContain("document.createElement('section')")
    })
})
