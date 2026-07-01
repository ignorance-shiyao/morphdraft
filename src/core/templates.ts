// M3-6: 文档模板库 — 内置模板定义

export interface DocTemplate {
  id: string
  name: string
  category: string
  content: string
}

export const TEMPLATES: DocTemplate[] = [
  {
    id: 'blank',
    name: '空白文档',
    category: '通用',
    content: '# 新文档\n\n',
  },
  {
    id: 'weekly',
    name: '周报',
    category: '工作',
    content: `---
title: 周报
---

# 周报 · {{date}}

## 本周完成

- 

## 下周计划

- 

## 问题与风险

- `,
  },
  {
    id: 'meeting',
    name: '会议纪要',
    category: '工作',
    content: `---
title: 会议纪要
---

# 会议纪要

- **日期**：
- **参会人**：
- **主题**：

## 议题

### 1. 

**结论**：

## 行动项

| 负责人 | 事项 | 截止日期 |
| --- | --- | --- |
|  |  |  |`,
  },
  {
    id: 'tech-plan',
    name: '技术方案',
    category: '工作',
    content: `---
title: 技术方案
---

# 技术方案

## 背景

## 目标

## 方案设计

### 架构

### 数据模型

### 接口设计

## 风险与对策

## 排期

| 阶段 | 内容 | 负责人 | 时间 |
| --- | --- | --- | --- |
|  |  |  |  |`,
  },
  {
    id: 'courseware',
    name: '课件',
    category: '教学',
    content: `---
title: 课件
mode: slide
---

<!-- layout: cover -->

# 课程标题

副标题

---

## 本节内容

1. 
2. 
3. 

---

## 要点一

:::note
核心概念
:::

---

## 要点二

---

## 总结

- `,
  },
  {
    id: 'paper',
    name: '论文笔记',
    category: '学术',
    content: `---
title: 论文笔记
---

# 论文笔记

- **标题**：
- **作者**：
- **发表**：
- **链接**：

## 摘要

## 方法

## 实验结果

## 个人评价

## 关键引用

[^1]: `,
  },
]

export function getTemplates(): DocTemplate[] {
  return TEMPLATES
}

export function getTemplateById(id: string): DocTemplate | undefined {
  return TEMPLATES.find(t => t.id === id)
}
