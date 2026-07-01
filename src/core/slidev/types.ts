// Slidev 引擎（应用内移植）的归一化数据模型。
// 解析来源是 @slidev/parser 的 parseSync，但本层把它收敛成渲染器友好的稳定结构，
// 与解析库解耦：渲染器/布局/主题只依赖这里的 SlidevDeck / SlidevSlide。

// 单页内的「插槽」：Slidev 用 `::right::` / `::left::` 等行分隔多槽布局（如 two-cols）。
// default 槽 = 第一个具名分隔符之前的正文；其余按名字归槽。
export interface SlideSlots {
  default: string
  [name: string]: string
}

export interface SlidevSlide {
  index: number // 0 基页序
  start: number // 该页在源码中的起始行（0 基，来自解析器 SourceSlideInfo.start），供点击跳源码/翻页定位
  layout: string // 布局 id，缺省 'default'
  classes: string[] // frontmatter.class 归一化为类名数组
  clicks?: number // frontmatter.clicks（点击步数，可选）
  frontmatter: Record<string, unknown>
  content: string // 该页正文（含未切分的 ::slot:: 标记，原样）
  slots: SlideSlots // 切分后的插槽（default 永远存在）
  note?: string // 演讲备注（来自 HTML 注释）
  title?: string // 解析库推断的页标题
}

export interface SlidevDeck {
  slides: SlidevSlide[]
  theme?: string // 整套主题 id（来自首页 headmatter `theme:`）
  engine?: string // `engine:` 头（用于引擎选择，通常 'slidev'）
  title?: string // 整套标题（首页 headmatter `title:`）
}
