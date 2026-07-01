// ThemeTokens → echarts 主题对象（registerTheme 用）
// 整体观感：圆润、平滑、柔和。柱图/饼图加圆角、折线默认平滑加粗、tooltip 圆角阴影。
// 文档：https://echarts.apache.org/en/option.html
import type { ThemeTokens } from '../themes/presets'
import { buildChartPalette, withAlpha } from './palette'

export interface EChartsThemeShape {
  color: string[]
  backgroundColor: string
  textStyle: { color: string; fontFamily: string }
  title: {
    textStyle: { color: string; fontWeight: number }
    subtextStyle: { color: string }
    left: string
  }
  legend: {
    textStyle: { color: string }
    itemGap: number
    icon: string
  }
  tooltip: {
    backgroundColor: string
    borderColor: string
    borderRadius: number
    padding: number[]
    textStyle: { color: string }
    extraCssText: string
  }
  categoryAxis: AxisStyle
  valueAxis: AxisStyle
  logAxis: AxisStyle
  timeAxis: AxisStyle
  line: {
    itemStyle: { borderWidth: number }
    lineStyle: { width: number }
    symbolSize: number
    symbol: string
    smooth: boolean
  }
  bar: {
    itemStyle: {
      barBorderColor: string
      barBorderWidth: number
      borderRadius: number[]
    }
  }
  pie: {
    itemStyle: {
      borderColor: string
      borderWidth: number
      borderRadius: number
    }
  }
  scatter: { itemStyle: { borderWidth: number; borderColor: string } }
  radar: {
    splitArea: { show: boolean; areaStyle: { color: string[] } }
    axisLine: { lineStyle: { color: string } }
    splitLine: { lineStyle: { color: string } }
  }
  gauge: {
    itemStyle: { color: string }
    axisLine: { lineStyle: { width: number } }
    progress: { width: number }
    detail: { fontWeight: number }
  }
  funnel: { itemStyle: { borderColor: string; borderWidth: number } }
  graph: { color: string[]; itemStyle: { borderRadius: number } }
  visualMap: { color: string[] }
  candlestick: {
    itemStyle: {
      color: string
      color0: string
      borderColor: string
      borderColor0: string
    }
  }
}

interface AxisStyle {
  axisLine: { show: boolean; lineStyle: { color: string } }
  axisTick: { show: boolean; lineStyle: { color: string } }
  axisLabel: { show: boolean; color: string }
  splitLine: { show: boolean; lineStyle: { color: string; type: string } }
  splitArea: { show: boolean; areaStyle: { color: string[] } }
}

function makeAxis(p: ReturnType<typeof buildChartPalette>): AxisStyle {
  return {
    axisLine: { show: true, lineStyle: { color: p.border } },
    axisTick: { show: false, lineStyle: { color: p.border } },
    axisLabel: { show: true, color: p.muted },
    splitLine: { show: true, lineStyle: { color: p.splitLine, type: 'dashed' } },
    splitArea: { show: false, areaStyle: { color: [withAlpha(p.fg, 0.02), withAlpha(p.fg, 0.05)] } },
  }
}

export function buildEChartsTheme(t: ThemeTokens): EChartsThemeShape {
  const p = buildChartPalette(t)
  const axis = makeAxis(p)
  // tooltip 暗底白字：暗色主题用更深底，浅色主题用墨灰底
  const tooltipBg = t.dark
    ? withAlpha('#0b1020', 0.94)
    : withAlpha('#1f2937', 0.92)
  // K 线红绿色：从色板里挑暖/冷调，避免与系列色冲突
  const candleUp = p.series[5]   // 偏暖（互补区）
  const candleDown = p.series[3] // 偏冷（邻近+60）

  return {
    color: p.series,
    backgroundColor: 'transparent',
    textStyle: { color: t.fg, fontFamily: t.fontFamily },

    title: {
      textStyle: { color: t.fg, fontWeight: 700 },
      subtextStyle: { color: p.muted },
      left: 'center',
    },

    legend: {
      textStyle: { color: t.fg },
      itemGap: 18,
      icon: 'roundRect', // 圆角小块图例（更柔和）
    },

    tooltip: {
      backgroundColor: tooltipBg,
      borderColor: 'transparent',
      borderRadius: 10,
      padding: [8, 12, 8, 12],
      textStyle: { color: '#ffffff' },
      extraCssText: 'box-shadow: 0 8px 24px rgba(0,0,0,0.18); backdrop-filter: blur(6px);',
    },

    categoryAxis: axis,
    valueAxis: axis,
    logAxis: axis,
    timeAxis: axis,

    // 折线：默认平滑、加粗、节点圆点稍大、端点空心
    line: {
      itemStyle: { borderWidth: 2 },
      lineStyle: { width: 3 },
      symbolSize: 8,
      symbol: 'emptyCircle',
      smooth: true,
    },

    // 柱状：顶部圆角（堆叠柱顶部圆角，底部直角；非堆叠 echarts 自动处理）
    bar: {
      itemStyle: {
        barBorderColor: 'transparent',
        barBorderWidth: 0,
        borderRadius: [6, 6, 0, 0],
      },
    },

    // 饼图：扇区圆角，描边用底色制造分隔
    pie: {
      itemStyle: {
        borderColor: t.bg,
        borderWidth: 3,
        borderRadius: 6,
      },
    },

    scatter: { itemStyle: { borderWidth: 1.5, borderColor: t.bg } },

    radar: {
      splitArea: {
        show: true,
        areaStyle: {
          color: [withAlpha(p.fg, 0.02), withAlpha(p.fg, 0.04)],
        },
      },
      axisLine: { lineStyle: { color: p.splitLine } },
      splitLine: { lineStyle: { color: p.splitLine } },
    },

    gauge: {
      itemStyle: { color: p.series[0] },
      axisLine: { lineStyle: { width: 18 } },
      progress: { width: 18 },
      detail: { fontWeight: 700 },
    },

    funnel: { itemStyle: { borderColor: t.bg, borderWidth: 2 } },

    graph: { color: p.series, itemStyle: { borderRadius: 6 } },

    visualMap: { color: [p.series[5], p.series[3], p.series[0]].reverse() },

    candlestick: {
      itemStyle: {
        color: candleUp,
        color0: candleDown,
        borderColor: candleUp,
        borderColor0: candleDown,
      },
    },
  }
}

// 主题名约定：morphdraft-{tokens.id}，避免与 echarts 内置 dark 冲突
export function themeName(tokensId: string): string {
  return `morphdraft-${tokensId}`
}
