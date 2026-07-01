// 可插入的块级片段，供编辑器斜杠命令（/）与快捷插入栏共用。
// insert：插入的文本；caret：插入后光标相对插入文本起点的偏移（默认放到末尾）。

export interface Snippet {
  label: string
  detail: string
  keywords: string
  insert: string
  caret?: number
  group: 'basic' | 'todo' | 'callout' | 'structure' | 'media' | 'slide'
  slideOnly?: boolean // 仅幻灯片模式可见（分页/版式等 PPT 概念，不污染文档编辑）
}

const F = '```'

export const SNIPPETS: Snippet[] = [
  { label: '一级标题', detail: 'H1', keywords: 'h1 title biaoti yiji #', insert: '# 标题', caret: 2, group: 'basic' },
  { label: '二级标题', detail: 'H2', keywords: 'h2 title biaoti erji ##', insert: '## 标题', caret: 3, group: 'basic' },
  { label: '三级标题', detail: 'H3', keywords: 'h3 title biaoti sanji ###', insert: '### 标题', caret: 4, group: 'basic' },
  { label: '无序列表', detail: '- 列表', keywords: 'ul list wuxu liebiao bullet', insert: '- 列表项', caret: 2, group: 'basic' },
  { label: '有序列表', detail: '1. 列表', keywords: 'ol list youxu liebiao number', insert: '1. 列表项', caret: 3, group: 'basic' },
  { label: '待办清单', detail: '- [ ] 待办', keywords: 'todo task checklist daiban renwu', insert: '- [ ] 待办事项\n- [x] 已完成', caret: 6, group: 'todo' },
  { label: '引用', detail: '> 引用', keywords: 'quote blockquote yinyong', insert: '> 引用内容', caret: 2, group: 'basic' },
  { label: '分隔线', detail: '---', keywords: 'hr divider fengexian', insert: '---', group: 'basic' },
  {
    label: '表格',
    detail: 'GFM 表格',
    keywords: 'table biaoge grid',
    insert: '| 列1 | 列2 |\n| --- | --- |\n| A | B |',
    group: 'structure',
  },
  {
    label: '代码块',
    detail: '```',
    keywords: 'code daima fence',
    insert: `${F}js\n\n${F}`,
    caret: 6,
    group: 'structure',
  },
  {
    label: '提示框',
    detail: ':::note',
    keywords: 'note tip tishi callout',
    insert: ':::note\n要点提示\n:::',
    caret: 8,
    group: 'callout',
  },
  {
    label: '卡片',
    detail: ':::card',
    keywords: 'card kapian',
    insert: ':::card\n卡片内容\n:::',
    caret: 8,
    group: 'structure',
  },
  {
    label: '两栏布局',
    detail: ':::cols',
    keywords: 'cols columns lianglan fenlan',
    insert: ':::cols\n:::col\n左列\n:::\n:::col\n右列\n:::\n:::',
    group: 'structure',
  },
  {
    label: '提示框（GitHub）',
    detail: '> [!NOTE]',
    keywords: 'alert github note warning callout',
    insert: '> [!NOTE]\n> 注记内容',
    group: 'callout',
  },
  { label: '信息框', detail: ':::info', keywords: 'info xinxi callout biaozhu', insert: ':::info\n信息内容\n:::', caret: 8, group: 'callout' },
  { label: '成功框', detail: ':::success', keywords: 'success chenggong callout biaozhu', insert: ':::success\n操作成功\n:::', caret: 11, group: 'callout' },
  { label: '警告框', detail: ':::warning', keywords: 'warning jinggao callout biaozhu', insert: ':::warning\n注意事项\n:::', caret: 11, group: 'callout' },
  { label: '问题框', detail: ':::question', keywords: 'question wenti callout biaozhu', insert: ':::question\n待解决的问题\n:::', caret: 12, group: 'callout' },
  { label: '折叠列表', detail: ':::details', keywords: 'details collapse zhedie fold', insert: ':::details 点击展开\n隐藏的内容\n:::', caret: 11, group: 'callout' },
  { label: '时间线', detail: ':::timeline', keywords: 'timeline shijianxian xulie', insert: ':::timeline\n- 第一阶段\n- 第二阶段\n- 第三阶段\n:::', group: 'structure' },
  { label: '步骤', detail: ':::steps', keywords: 'steps buzhou liucheng', insert: ':::steps\n- 准备\n- 执行\n- 复盘\n:::', group: 'structure' },
  { label: '三列布局', detail: ':::cols ×3', keywords: 'cols columns sanlie fenlan', insert: ':::cols\n:::col\n第一列\n:::\n:::col\n第二列\n:::\n:::col\n第三列\n:::\n:::', group: 'structure' },
  { label: '脚注', detail: '[^1]', keywords: 'footnote jiaozhu', insert: '正文[^1]\n\n[^1]: 脚注内容', caret: 2, group: 'structure' },
  { label: '内容目录', detail: '[toc]', keywords: 'toc mulu catalog content', insert: '[toc]', group: 'structure' },
  {
    label: '数学公式',
    detail: '$$ … $$',
    keywords: 'math katex gongshi formula latex',
    insert: '$$\n\\int_0^1 x\\,dx = \\frac12\n$$',
    caret: 3,
    group: 'structure',
  },
  {
    label: '流程图',
    detail: 'Mermaid',
    keywords: 'mermaid flow liuchengtu graph',
    insert: `${F}mermaid\ngraph LR\nA --> B --> C\n${F}`,
    group: 'media',
  },
  {
    label: '图表',
    detail: 'ECharts',
    keywords: 'echarts chart tubiao bar line',
    insert: `${F}echarts\n{ "xAxis": {"type":"category","data":["A","B","C"]},\n  "yAxis": {"type":"value"},\n  "series":[{"type":"bar","data":[10,30,20]}] }\n${F}`,
    group: 'media',
  },
  {
    label: '幻灯片分节',
    detail: '--- 新节',
    keywords: 'slide page xinjie fenjie xinye fenye huandeng',
    insert: '---',
    group: 'slide',
    slideOnly: true,
  },
  {
    label: '封面版式',
    detail: 'layout: cover',
    keywords: 'cover fengmian layout banshi',
    insert: '<!-- layout: cover -->\n\n# 标题\n\n副标题',
    group: 'slide',
    slideOnly: true,
  },
  {
    label: '章节版式',
    detail: 'layout: section',
    keywords: 'section zhangjie layout banshi',
    insert: '<!-- layout: section -->\n\n# 章节标题',
    group: 'slide',
    slideOnly: true,
  },
]
