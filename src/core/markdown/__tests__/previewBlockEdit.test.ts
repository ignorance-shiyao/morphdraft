import { describe, expect, it } from 'vitest'
import { blockEnterEdit, blockLinePrefix, blockLinePrefixKind, collapseDuplicateQuotePrefix, lineContinueEnter, mapVisibleOffsetToSource } from '../previewBlockEdit'

describe('previewBlockEdit', () => {
  it('detects blockquote prefix', () => {
    expect(blockLinePrefix('> quote')).toBe('> ')
    expect(blockLinePrefixKind('> quote')).toBe('blockquote')
  })

  it('detects heading and list prefixes', () => {
    expect(blockLinePrefix('## 标题')).toBe('## ')
    expect(blockLinePrefixKind('## 标题')).toBe('heading')
    expect(blockLinePrefix('- item')).toBe('- ')
    expect(blockLinePrefixKind('- item')).toBe('bullet')
    expect(blockLinePrefix('1. first')).toBe('1. ')
    expect(blockLinePrefixKind('1. first')).toBe('ordered')
    expect(blockLinePrefix('* item')).toBe('* ')
    expect(blockLinePrefix('+ item')).toBe('+ ')
  })

  it('detects empty task prefix without forcing the caret to line start', () => {
    expect(blockLinePrefix('- [x]')).toBe('- [x]')
    expect(blockLinePrefixKind('- [x]')).toBe('task')
    expect(mapVisibleOffsetToSource(0, '- [x]')).toBe('- [x]'.length)
  })

  it('continues blockquote on Enter at line end', () => {
    const text = '> line one'
    const r = blockEnterEdit(text, text.length)
    expect(r?.next).toBe('> line one\n> ')
    expect(r?.caret).toBe(r!.next.length)
  })

  it('continues blockquote on Enter in line middle', () => {
    const text = '> abcd'
    const r = blockEnterEdit(text, 3)
    expect(r?.next).toBe('> a\n> bcd')
    expect(r?.caret).toBe(6)
  })

  it('exits blockquote on Enter in empty prefixed line (stays editable)', () => {
    const text = '> line one\n> '
    const r = blockEnterEdit(text, text.length)
    expect(r?.next).toBe('> line one\n\n')
    expect(r?.caret).toBe(12)
  })

  it('double Enter inserts another blank line', () => {
    const text = '> line one\n\n'
    const r = blockEnterEdit(text, text.length)
    expect(r?.next).toBe('> line one\n\n\n')
    expect(r?.caret).toBe(13)
  })

  it('continues task list prefix', () => {
    const text = '- [ ] todo'
    const r = blockEnterEdit(text, text.length)
    expect(r?.next).toBe('- [ ] todo\n- [ ] ')
  })

  it('exits task list on empty checkbox-only line', () => {
    const text = '- [x]'
    const r = blockEnterEdit(text, text.length)
    expect(r?.next).toBe('\n')
    expect(lineContinueEnter(text, text.length).lines).toEqual([''])
  })

  it('continues bullet list prefix', () => {
    const text = '- first'
    const r = blockEnterEdit(text, text.length)
    expect(r?.next).toBe('- first\n- ')
  })

  it('increments ordered list on Enter', () => {
    const text = '1. first'
    const r = blockEnterEdit(text, text.length)
    expect(r?.next).toBe('1. first\n2. ')
    expect(r?.caret).toBe(r!.next.length)
  })

  it('exits bullet list on empty prefixed line', () => {
    const text = '- item\n- '
    const r = blockEnterEdit(text, text.length)
    expect(r?.next).toBe('- item\n\n')
  })

  it('heading Enter at EOL inserts plain newline without # prefix', () => {
    const text = '# Title'
    const r = blockEnterEdit(text, text.length)
    expect(r?.next).toBe('# Title\n')
    expect(r?.caret).toBe(text.length + 1)
  })

  it('heading Enter mid-line inserts plain newline', () => {
    const text = '# Title'
    const r = blockEnterEdit(text, 4)
    expect(r?.next).toBe('# Ti\ntle')
  })

  it('exits heading on empty prefixed line', () => {
    const text = '## '
    const r = blockEnterEdit(text, text.length)
    expect(r?.next).toBe('\n')
  })

  it('plain paragraph Enter at EOL', () => {
    const text = 'hello'
    const r = blockEnterEdit(text, text.length)
    expect(r?.next).toBe('hello\n')
  })

  it('maps blockquote visible click to source offset', () => {
    expect(mapVisibleOffsetToSource(0, '> hello')).toBe(2)
    expect(mapVisibleOffsetToSource(3, '> hello')).toBe(5)
    expect(mapVisibleOffsetToSource(2, '> a\n> b')).toBe(6)
  })

  it('collapses accidental duplicate quote prefixes from WYSIWYG serialization', () => {
    expect(collapseDuplicateQuotePrefix('> > 内容')).toBe('> 内容')
    expect(collapseDuplicateQuotePrefix('  > > 内容')).toBe('  > 内容')
    expect(collapseDuplicateQuotePrefix('> 内容')).toBe('> 内容')
  })

  describe('lineContinueEnter（按行回车，贴合直觉）', () => {
    it('H1 非空：第一次回车 → 下一行延续同级标题', () => {
      const r = lineContinueEnter('# 标题', '# 标题'.length)
      expect(r.lines).toEqual(['# 标题', '# '])
      expect(r.caretLine).toBe(1)
    })
    it('空 H1：再回车 → 退出格式为无格式空行（停留本行）', () => {
      const r = lineContinueEnter('# ', 2)
      expect(r.lines).toEqual([''])
      expect(r.caretLine).toBe(0)
    })
    it('引用非空：回车 → 下一行延续 `> `', () => {
      const r = lineContinueEnter('> 内容', '> 内容'.length)
      expect(r.lines).toEqual(['> 内容', '> '])
    })
    it('空引用：回车 → 退出为无格式空行', () => {
      expect(lineContinueEnter('> ', 2).lines).toEqual([''])
    })
    it('有序列表：回车 → 序号 +1', () => {
      expect(lineContinueEnter('2. 项', '2. 项'.length).lines).toEqual(['2. 项', '3. '])
    })
    it('任务项：回车 → 新未勾选项（不沿用勾选态）', () => {
      expect(lineContinueEnter('- [x] 完成', '- [x] 完成'.length).lines).toEqual(['- [x] 完成', '- [ ] '])
    })
    it('空任务项：回车 → 退出为无格式空行', () => {
      expect(lineContinueEnter('- [x]', '- [x]'.length).lines).toEqual([''])
    })
    it('行中拆分：光标后的内容移到延续行', () => {
      const r = lineContinueEnter('# AB', 3) // 光标在 A 与 B 之间（# + 空格 + A = 3）
      expect(r.lines).toEqual(['# A', '# B'])
    })
    it('无格式段落：普通拆行', () => {
      expect(lineContinueEnter('hello', 5).lines).toEqual(['hello', ''])
    })
  })
})
