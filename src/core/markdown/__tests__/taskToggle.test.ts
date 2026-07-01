import { describe, it, expect } from 'vitest'
import {
  parseTaskLine,
  setTaskCheckedAndSort,
  sortTaskBlock,
  toggleTaskAndSort,
} from '../taskToggle'

describe('parseTaskLine', () => {
  it('识别未完成/完成任务行', () => {
    expect(parseTaskLine('- [ ] a')).toMatchObject({ checked: false, marker: '-' })
    expect(parseTaskLine('- [x] b')).toMatchObject({ checked: true })
    expect(parseTaskLine('  * [X] c')).toMatchObject({ checked: true, indent: '  ', marker: '*' })
    expect(parseTaskLine('- 普通项')).toBeNull()
    expect(parseTaskLine('正文')).toBeNull()
  })
})

describe('toggleTaskAndSort', () => {
  it('切换未完成 → 完成，并排到块末尾', () => {
    const md = ['- [ ] A', '- [ ] B', '- [ ] C'].join('\n')
    // 勾选 A（第 0 行）→ A 变完成并移到底部
    expect(toggleTaskAndSort(md, 0)).toBe(['- [ ] B', '- [ ] C', '- [x] A'].join('\n'))
  })

  it('切换完成 → 未完成，并排到块前部（稳定）', () => {
    const md = ['- [ ] A', '- [x] B', '- [x] C'].join('\n')
    // 取消勾选 C（第 2 行）→ C 变未完成，排到未完成组末尾、完成组之前
    expect(toggleTaskAndSort(md, 2)).toBe(['- [ ] A', '- [ ] C', '- [x] B'].join('\n'))
  })

  it('稳定排序：未完成保持原相对顺序', () => {
    const md = ['- [x] A', '- [ ] B', '- [ ] C', '- [x] D'].join('\n')
    // 勾选 B → B 完成；未完成只剩 C 在前，完成组 A,B,D 稳定
    expect(toggleTaskAndSort(md, 1)).toBe(['- [ ] C', '- [x] A', '- [x] B', '- [x] D'].join('\n'))
  })

  it('子任务/续行随父项整体移动', () => {
    const md = ['- [ ] 父A', '  - 子a1', '- [ ] 父B'].join('\n')
    // 勾选父A → 父A 带子行移到底部
    expect(toggleTaskAndSort(md, 0)).toBe(['- [ ] 父B', '- [x] 父A', '  - 子a1'].join('\n'))
  })

  it('只排序所在同级块，块外内容不动', () => {
    const md = ['# 标题', '- [ ] A', '- [ ] B', '', '正文段落'].join('\n')
    expect(toggleTaskAndSort(md, 1)).toBe(['# 标题', '- [ ] B', '- [x] A', '', '正文段落'].join('\n'))
  })

  it('非任务行 / 越界 → 原样返回', () => {
    const md = ['- [ ] A', '正文'].join('\n')
    expect(toggleTaskAndSort(md, 1)).toBe(md)
    expect(toggleTaskAndSort(md, 99)).toBe(md)
  })

  it('保留缩进与 marker 风格', () => {
    const md = ['  * [ ] a', '  * [ ] b'].join('\n')
    expect(toggleTaskAndSort(md, 0)).toBe(['  * [ ] b', '  * [x] a'].join('\n'))
  })
})

describe('任务菜单操作', () => {
  it('可明确标记完成或未完成，并保持同级任务稳定排序', () => {
    const md = ['- [ ] A', '- [x] B', '- [ ] C'].join('\n')
    expect(setTaskCheckedAndSort(md, 2, true)).toBe(
      ['- [ ] A', '- [x] B', '- [x] C'].join('\n'),
    )
    expect(setTaskCheckedAndSort(md, 1, false)).toBe(
      ['- [ ] A', '- [ ] B', '- [ ] C'].join('\n'),
    )
  })

  it('只移动已完成任务到底部，不改变勾选状态', () => {
    const md = ['正文', '- [x] A', '- [ ] B', '- [x] C', '- [ ] D', '', '尾部'].join('\n')
    expect(sortTaskBlock(md, 2)).toBe(
      ['正文', '- [ ] B', '- [ ] D', '- [x] A', '- [x] C', '', '尾部'].join('\n'),
    )
  })

  it('非任务行不执行任务菜单操作', () => {
    const md = '正文\n- [ ] A'
    expect(setTaskCheckedAndSort(md, 0, true)).toBe(md)
    expect(sortTaskBlock(md, 0)).toBe(md)
  })
})
