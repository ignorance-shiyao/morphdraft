// 文档数据类型（本地 IndexedDB 与桌面 vault 文件后端共用）。

export interface DocMeta {
  id: string
  title: string
  mode: string
  themeId: string
  updatedAt: string
  tags?: string[]
  folder?: string // 预留：单层文件夹名
}

export interface DocFull extends DocMeta {
  contentMarkdown: string
}

export interface DocVersion {
  id: string
  versionNo: number
  contentMarkdown: string
  createdAt: string
}
