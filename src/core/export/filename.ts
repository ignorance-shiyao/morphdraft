// 由文档标题生成安全文件名（去非法字符），作为导出默认名。
export function safeFilename(title: string, ext: string): string {
  const base = (title || '')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
  return `${base || '未命名文档'}.${ext}`
}
