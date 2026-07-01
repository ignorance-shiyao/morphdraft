// E1: 图表插入按类型选择 —— mermaid / echarts 各类型的起手模板。
// 颜色不写死：echarts 由 mountECharts 注入主题（tokens），mermaid 由 setMermaidTheme 跟随主题。
// 模板尽量「能直接渲染、易改」，覆盖常用类型。

export interface ChartTemplate {
  value: string
  label: string
  hint?: string
  code: string // 完整代码块（含 ``` 围栏）
}

const F = '```'

export const MERMAID_TEMPLATES: ChartTemplate[] = [
  {
    value: 'flowchart',
    label: '流程图',
    hint: 'flowchart',
    code: `${F}mermaid\nflowchart LR\n  A[开始] --> B{判断}\n  B -->|是| C[处理]\n  B -->|否| D[结束]\n  C --> D\n${F}`,
  },
  {
    value: 'sequence',
    label: '时序图',
    hint: 'sequenceDiagram',
    code: `${F}mermaid\nsequenceDiagram\n  participant 用户\n  participant 系统\n  用户->>系统: 发起请求\n  系统-->>用户: 返回结果\n${F}`,
  },
  {
    value: 'gantt',
    label: '甘特图',
    hint: 'gantt',
    code: `${F}mermaid\ngantt\n  title 项目排期\n  dateFormat YYYY-MM-DD\n  section 设计\n  需求调研 :a1, 2026-01-01, 7d\n  原型设计 :after a1, 5d\n  section 开发\n  编码实现 :2026-01-13, 10d\n${F}`,
  },
  {
    value: 'class',
    label: '类图',
    hint: 'classDiagram',
    code: `${F}mermaid\nclassDiagram\n  class Animal {\n    +String name\n    +eat()\n  }\n  class Dog {\n    +bark()\n  }\n  Animal <|-- Dog\n${F}`,
  },
  {
    value: 'state',
    label: '状态图',
    hint: 'stateDiagram',
    code: `${F}mermaid\nstateDiagram-v2\n  [*] --> 待处理\n  待处理 --> 处理中: 受理\n  处理中 --> 已完成: 完成\n  已完成 --> [*]\n${F}`,
  },
  {
    value: 'pie',
    label: '饼图',
    hint: 'pie',
    code: `${F}mermaid\npie title 占比分布\n  "A" : 40\n  "B" : 35\n  "C" : 25\n${F}`,
  },
  {
    value: 'mindmap',
    label: '思维导图',
    hint: 'mindmap',
    code: `${F}mermaid\nmindmap\n  root((中心主题))\n    分支一\n      要点1\n      要点2\n    分支二\n      要点3\n${F}`,
  },
  {
    value: 'gitgraph',
    label: 'Git 图',
    hint: 'gitGraph',
    code: `${F}mermaid\ngitGraph\n  commit\n  branch dev\n  checkout dev\n  commit\n  checkout main\n  merge dev\n${F}`,
  },
  {
    value: 'er',
    label: '实体关系',
    hint: 'erDiagram',
    code: `${F}mermaid\nerDiagram\n  用户 ||--o{ 订单 : 拥有\n  订单 ||--|{ 商品 : 包含\n${F}`,
  },
  {
    value: 'journey',
    label: '用户旅程',
    hint: 'journey',
    code: `${F}mermaid\njourney\n  title 用户使用旅程\n  section 上手\n    注册: 4: 用户\n    引导: 3: 用户\n  section 使用\n    创作: 5: 用户\n${F}`,
  },
]

export const ECHARTS_TEMPLATES: ChartTemplate[] = [
  {
    value: 'bar',
    label: '柱状图',
    hint: 'bar',
    code: `${F}echarts\n{\n  "xAxis": { "type": "category", "data": ["一月", "二月", "三月", "四月"] },\n  "yAxis": { "type": "value" },\n  "series": [{ "type": "bar", "data": [120, 200, 150, 80] }]\n}\n${F}`,
  },
  {
    value: 'line',
    label: '折线图',
    hint: 'line',
    code: `${F}echarts\n{\n  "xAxis": { "type": "category", "data": ["一月", "二月", "三月", "四月"] },\n  "yAxis": { "type": "value" },\n  "series": [{ "type": "line", "smooth": true, "data": [120, 200, 150, 80] }]\n}\n${F}`,
  },
  {
    value: 'pie',
    label: '饼图',
    hint: 'pie',
    code: `${F}echarts\n{\n  "series": [{\n    "type": "pie",\n    "radius": "60%",\n    "data": [\n      { "value": 40, "name": "A" },\n      { "value": 35, "name": "B" },\n      { "value": 25, "name": "C" }\n    ]\n  }]\n}\n${F}`,
  },
  {
    value: 'scatter',
    label: '散点图',
    hint: 'scatter',
    code: `${F}echarts\n{\n  "xAxis": {},\n  "yAxis": {},\n  "series": [{\n    "type": "scatter",\n    "data": [[10, 8], [8, 7], [13, 9], [9, 11], [11, 6]]\n  }]\n}\n${F}`,
  },
  {
    value: 'radar',
    label: '雷达图',
    hint: 'radar',
    code: `${F}echarts\n{\n  "radar": {\n    "indicator": [\n      { "name": "性能", "max": 100 },\n      { "name": "易用", "max": 100 },\n      { "name": "美观", "max": 100 },\n      { "name": "稳定", "max": 100 }\n    ]\n  },\n  "series": [{\n    "type": "radar",\n    "data": [{ "value": [85, 90, 80, 95] }]\n  }]\n}\n${F}`,
  },
  {
    value: 'funnel',
    label: '漏斗图',
    hint: 'funnel',
    code: `${F}echarts\n{\n  "series": [{\n    "type": "funnel",\n    "data": [\n      { "value": 100, "name": "访问" },\n      { "value": 70, "name": "注册" },\n      { "value": 40, "name": "下单" },\n      { "value": 20, "name": "复购" }\n    ]\n  }]\n}\n${F}`,
  },
  {
    value: 'gauge',
    label: '仪表盘',
    hint: 'gauge',
    code: `${F}echarts\n{\n  "series": [{\n    "type": "gauge",\n    "data": [{ "value": 72, "name": "完成率" }]\n  }]\n}\n${F}`,
  },
  {
    value: 'candlestick',
    label: 'K 线图',
    hint: 'candlestick',
    code: `${F}echarts\n{\n  "xAxis": { "type": "category", "data": ["1", "2", "3", "4"] },\n  "yAxis": {},\n  "series": [{\n    "type": "candlestick",\n    "data": [[20, 34, 10, 38], [40, 35, 30, 50], [31, 38, 33, 44], [38, 15, 5, 42]]\n  }]\n}\n${F}`,
  },
]
