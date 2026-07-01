import { describe, it, expect } from 'vitest'
import { safeFilename } from '../filename'

describe('safeFilename（导出默认文件名）', () => {
  it('正常标题 + 扩展名', () => {
    expect(safeFilename('我的文档', 'pdf')).toBe('我的文档.pdf')
  })

  it('去掉非法字符 \\ / : * ? " < > |，折叠空格', () => {
    expect(safeFilename('a/b:c*d?e"f<g>h|i', 'html')).toBe('a b c d e f g h i.html')
  })

  it('空标题回退「未命名文档」', () => {
    expect(safeFilename('', 'docx')).toBe('未命名文档.docx')
    expect(safeFilename('   ', 'docx')).toBe('未命名文档.docx')
  })

  it('超长标题截断到 80 字符', () => {
    const long = 'a'.repeat(200)
    const out = safeFilename(long, 'pdf')
    expect(out).toBe('a'.repeat(80) + '.pdf')
  })

  it('首尾空白被 trim', () => {
    expect(safeFilename('  报告  ', 'pdf')).toBe('报告.pdf')
  })
})
