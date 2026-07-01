// M8-6: 错误提示规范（错误码→中文提示+建议动作）

interface ErrorInfo {
  title: string
  message: string
  suggestion?: string
}

const ERROR_MAP: Record<string, ErrorInfo> = {
  // 导出错误
  'export_failed': { title: '导出失败', message: '文件导出过程中发生错误', suggestion: '请检查文件名是否包含特殊字符，或磁盘空间是否充足。' },
  'export_pdf_failed': { title: 'PDF 导出失败', message: '无法生成 PDF 文件', suggestion: '请尝试减少文档中的图表数量，或切换到"矢量 PDF"模式。' },
  'export_docx_failed': { title: 'Word 导出失败', message: '无法生成 Word 文件', suggestion: '请检查文档中是否包含不支持的内容（如交互式图表）。' },
  'export_pptx_failed': { title: 'PPTX 导出失败', message: '无法生成幻灯片文件', suggestion: '请确保在幻灯片模式下导出，且文档包含幻灯片分页标记（---）。' },

  // 导入错误
  'import_word_failed': { title: 'Word 导入失败', message: '无法解析该 Word 文件', suggestion: '请确保文件是 .docx 格式（非旧版 .doc），且文件未损坏。' },
  'import_notion_failed': { title: 'Notion 导入失败', message: '无法解析该 zip 文件', suggestion: '请确保使用 Notion 的"导出为 Markdown & CSV"功能导出的 zip 文件。' },
  'import_md_failed': { title: '文件导入失败', message: '无法读取该文件', suggestion: '请确保文件是 UTF-8 编码的 .md 文件。' },

  // 存储错误
  'storage_full': { title: '存储空间不足', message: '本地存储空间已满', suggestion: '请清理不需要的文档，或将工作目录切换到有更多空间的磁盘。' },
  'save_failed': { title: '保存失败', message: '文档保存过程中发生错误', suggestion: '请检查工作目录是否可写，或尝试另存为到其他位置。' },
  'snapshot_failed': { title: '快照保存失败', message: '版本快照无法保存', suggestion: '文档内容仍保留在编辑器中，请尝试手动保存。' },

  // 文件系统错误
  'file_not_found': { title: '文件未找到', message: '目标文件不存在或已被移动', suggestion: '请检查文件路径是否正确，或刷新文档列表。' },
  'permission_denied': { title: '权限不足', message: '无法访问目标文件或目录', suggestion: '请检查文件权限，或将文件复制到有写入权限的位置。' },
  'vault_error': { title: '工作目录错误', message: '无法读写工作目录中的文件', suggestion: '请检查工作目录路径是否正确，或在设置中更换工作目录。' },
}

export function getErrorInfo(code: string, fallback?: string): ErrorInfo {
  return ERROR_MAP[code] || {
    title: '操作失败',
    message: fallback || '发生未知错误',
    suggestion: '请重试，或联系技术支持。',
  }
}

// 统一错误处理：获取错误信息 + 返回可显示的格式
export function handleError(error: unknown): ErrorInfo {
  if (error instanceof Error) {
    // 尝试匹配已知错误码
    for (const [code, info] of Object.entries(ERROR_MAP)) {
      if (error.message.includes(code) || error.message.toLowerCase().includes(code.replace(/_/g, ' '))) {
        return info
      }
    }
    // 未匹配的错误
    return {
      title: '操作失败',
      message: error.message,
      suggestion: '请重试，如果问题持续出现，请联系技术支持。',
    }
  }
  return {
    title: '操作失败',
    message: String(error),
    suggestion: '请重试。',
  }
}
