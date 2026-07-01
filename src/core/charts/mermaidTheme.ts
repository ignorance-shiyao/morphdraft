// ThemeTokens → mermaid themeVariables
// 覆盖 14 种图：flowchart / sequence / class / state / er / gantt / pie /
// journey / gitGraph / mindmap / timeline / quadrant / requirement / sankey
// 参考：https://mermaid.js.org/config/theming.html#theme-variables
import type { ThemeTokens } from '../themes/presets'
import { buildChartPalette, withAlpha } from './palette'

export interface MermaidThemeConfig {
  theme: 'base'
  themeVariables: Record<string, string>
  fontFamily: string
}

export function buildMermaidTheme(t: ThemeTokens): MermaidThemeConfig {
  const p = buildChartPalette(t)
  const [c0, c1, c2, c3, c4, c5, c6, c7] = p.series
  // 节点文字颜色：深色主题用近黑，浅色主题用纯白（保证在节点底色上可读）
  const nodeText = t.dark ? '#0f172a' : '#ffffff'
  const lineColor = p.muted
  const labelBg = withAlpha(t.bg, 0.85)
  // 浅底文字（用于浅色 section / 节点底色）
  const onLight = t.fg

  return {
    theme: 'base',
    fontFamily: t.fontFamily,
    themeVariables: {
      // —— 全局 ——
      background: 'transparent',
      fontFamily: t.fontFamily,
      fontSize: '14px',
      primaryColor: c0,
      primaryTextColor: nodeText,
      primaryBorderColor: c0,
      secondaryColor: c1,
      secondaryTextColor: nodeText,
      secondaryBorderColor: c1,
      tertiaryColor: c2,
      tertiaryTextColor: nodeText,
      tertiaryBorderColor: c2,
      // —— 文字与连线 ——
      textColor: t.fg,
      lineColor,
      mainBkg: c0,
      nodeBorder: c0,
      clusterBkg: withAlpha(c0, 0.08),
      clusterBorder: withAlpha(c0, 0.4),
      titleColor: t.fg,
      edgeLabelBackground: labelBg,
      labelBackground: labelBg,

      // —— 序列图 ——
      actorBkg: c0,
      actorBorder: c0,
      actorTextColor: nodeText,
      actorLineColor: lineColor,
      signalColor: t.fg,
      signalTextColor: t.fg,
      labelBoxBkgColor: c1,
      labelBoxBorderColor: c1,
      labelTextColor: nodeText,
      loopTextColor: t.fg,
      noteBkgColor: withAlpha(c3, 0.18),
      noteTextColor: t.fg,
      noteBorderColor: withAlpha(c3, 0.5),
      activationBkgColor: withAlpha(c0, 0.22),
      activationBorderColor: c0,

      // —— 甘特图 ——
      gridColor: p.splitLine,
      doneTaskBkgColor: withAlpha(p.muted, 0.6),
      doneTaskBorderColor: p.muted,
      activeTaskBkgColor: c0,
      activeTaskBorderColor: c0,
      critBkgColor: c5,
      critBorderColor: c5,
      taskBkgColor: withAlpha(c0, 0.7),
      taskBorderColor: c0,
      taskTextColor: nodeText,
      taskTextLightColor: t.fg,
      taskTextOutsideColor: t.fg,
      taskTextDarkColor: nodeText,
      sectionBkgColor: withAlpha(c1, 0.18),
      sectionBkgColor2: withAlpha(c2, 0.18),
      altSectionBkgColor: withAlpha(c3, 0.12),
      titleColor2: t.fg,
      todayLineColor: c5,

      // —— 类图/状态图 ——
      classText: t.fg,
      transitionColor: lineColor,
      transitionLabelColor: t.fg,
      stateLabelColor: t.fg,
      stateBkg: withAlpha(c0, 0.12),
      labelColor: t.fg,
      altBackground: withAlpha(c0, 0.06),
      compositeBackground: withAlpha(c0, 0.08),
      compositeTitleBackground: withAlpha(c0, 0.18),
      compositeBorder: withAlpha(c0, 0.5),
      innerEndBackground: t.fg,
      specialStateColor: c5,
      errorBkgColor: c5,
      errorTextColor: nodeText,

      // —— 饼图 ——
      pie1: p.series[0], pie2: p.series[1], pie3: p.series[2], pie4: p.series[3],
      pie5: p.series[4], pie6: p.series[5], pie7: p.series[6], pie8: p.series[7],
      pie9: p.series[0], pie10: p.series[2], pie11: p.series[4], pie12: p.series[6],
      pieTitleTextColor: t.fg,
      pieTitleTextSize: '18px',
      pieSectionTextColor: nodeText,
      pieSectionTextSize: '13px',
      pieLegendTextColor: t.fg,
      pieLegendTextSize: '12px',
      pieStrokeColor: t.bg,
      pieOuterStrokeWidth: '2px',
      pieOuterStrokeColor: t.bg,
      pieOpacity: '0.95',

      // —— 用户旅程 Journey（修复可读性） ——
      // mermaid journey 用 section* 配色区分阶段，actor 是右侧得分小人头
      cScale0: c0, cScale1: c1, cScale2: c2, cScale3: c3,
      cScale4: c4, cScale5: c5, cScale6: c6, cScale7: c7,
      cScaleLabel0: nodeText, cScaleLabel1: nodeText, cScaleLabel2: nodeText,
      cScaleLabel3: nodeText, cScaleLabel4: nodeText, cScaleLabel5: nodeText,
      cScaleLabel6: nodeText, cScaleLabel7: nodeText,
      // 浅色 section 横幅
      cScalePeer0: withAlpha(c0, 0.18),
      cScalePeer1: withAlpha(c1, 0.18),
      cScalePeer2: withAlpha(c2, 0.18),
      cScalePeer3: withAlpha(c3, 0.18),
      cScalePeer4: withAlpha(c4, 0.18),
      cScalePeer5: withAlpha(c5, 0.18),
      cScalePeer6: withAlpha(c6, 0.18),
      cScalePeer7: withAlpha(c7, 0.18),
      // section 文字与任务文字
      sectionColor: t.fg,
      taskColor: t.fg,
      // 评分小人头
      fillType0: c0, fillType1: c1, fillType2: c2, fillType3: c3,
      fillType4: c4, fillType5: c5, fillType6: c6, fillType7: c7,

      // —— GitGraph ——
      git0: c0, git1: c1, git2: c2, git3: c3,
      git4: c4, git5: c5, git6: c6, git7: c7,
      gitInv0: nodeText, gitInv1: nodeText, gitInv2: nodeText, gitInv3: nodeText,
      gitInv4: nodeText, gitInv5: nodeText, gitInv6: nodeText, gitInv7: nodeText,
      gitBranchLabel0: nodeText, gitBranchLabel1: nodeText,
      gitBranchLabel2: nodeText, gitBranchLabel3: nodeText,
      gitBranchLabel4: nodeText, gitBranchLabel5: nodeText,
      gitBranchLabel6: nodeText, gitBranchLabel7: nodeText,
      commitLabelColor: t.fg,
      commitLabelBackground: withAlpha(t.bg, 0.92),
      commitLabelFontSize: '12px',
      tagLabelColor: nodeText,
      tagLabelBackground: c5,
      tagLabelBorder: c5,
      tagLabelFontSize: '11px',
      gitBranchLabel: nodeText,

      // —— 思维导图 Mindmap（依据深度循环用色） ——
      // mermaid mindmap 用 section* 变量但有限，主要靠 cScale*；这里再绑一次以加强
      // 中央节点 / 各分支节点底色按深度走 c0..c7
      // 文字与节点边框
      mindmapNode: c0,
      mindmapNodeBorder: c0,
      // 二级以上深度用 secondary/tertiary 节点色（mermaid 内部循环）
      // 中心节点字色加大对比
      mindmapTextColor: nodeText,

      // —— 时间线 Timeline ——
      // mermaid timeline 用 sectionBkgColor* + cScale* 区分 section
      // 已在 cScale0..7 设置；这里补充 section 标题色
      // 时间点圆圈颜色直接用 series 色板
      // （timeline 没有专属变量，主要靠通用色板）

      // —— 象限图 Quadrant ——
      // 四象限填充与文字（已知变量名）
      quadrant1Fill: withAlpha(c0, 0.18),
      quadrant2Fill: withAlpha(c1, 0.18),
      quadrant3Fill: withAlpha(c4, 0.18),
      quadrant4Fill: withAlpha(c3, 0.18),
      quadrant1TextFill: t.fg,
      quadrant2TextFill: t.fg,
      quadrant3TextFill: t.fg,
      quadrant4TextFill: t.fg,
      quadrantPointFill: c0,
      quadrantPointTextFill: t.fg,
      quadrantXAxisTextFill: t.fg,
      quadrantYAxisTextFill: t.fg,
      quadrantInternalBorderStrokeFill: withAlpha(t.border, 0.6),
      quadrantExternalBorderStrokeFill: t.border,
      quadrantTitleFill: t.fg,

      // —— 需求图 Requirement ——
      requirementBackground: withAlpha(c0, 0.08),
      requirementBorderColor: c0,
      requirementBorderSize: '1',
      requirementTextColor: t.fg,
      relationColor: lineColor,
      relationLabelBackground: labelBg,
      relationLabelColor: t.fg,

      // —— Sankey（mermaid 11+） ——
      // 主要靠 cScale* 已覆盖

      // —— ER 关系图 ——
      // 已用 mainBkg / nodeBorder / lineColor 覆盖；补充关系标签
      attributeBackgroundColorOdd: withAlpha(c0, 0.06),
      attributeBackgroundColorEven: withAlpha(c0, 0.12),

      // —— 全局：圆角与边框（mermaid 部分图通过 CSS 才能改圆角，这里设的是可被识别的边框宽度） ——
      nodeTextColor: nodeText,
      onLight,
    },
  }
}
