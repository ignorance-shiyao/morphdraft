import { describe, expect, it } from 'vitest'
import { buildIndex } from '../index'
import {
  applyDiagnosticReplacement,
  diagnosticMessageKey,
  diagnosticRange,
  diagnoseWorkspace,
} from '../diagnostics'

describe('工作区链接诊断', () => {
  it('把稳定错误码映射为界面翻译键', () => {
    expect(diagnosticMessageKey('missing-wikilink-target')).toBe('problems.messages.missingWikilinkTarget')
    expect(diagnosticMessageKey('missing-asset')).toBe('problems.messages.missingAsset')
  })

  it('报告不存在的 WikiLink 目标', () => {
    const index = buildIndex([
      { id: 'a', title: 'A', contentMarkdown: '参见 [[不存在]]' },
    ])
    expect(diagnoseWorkspace(index).map((item) => item.code)).toEqual(['missing-wikilink-target'])
  })

  it('报告重名目标和不存在的目标锚点', () => {
    const index = buildIndex([
      { id: 'a', title: 'A', contentMarkdown: '[[重名]]\n[[目标#没有这个标题]]' },
      { id: 'b', title: '重名', contentMarkdown: '' },
      { id: 'c', title: '重名', contentMarkdown: '' },
      { id: 'd', title: '目标', contentMarkdown: '# 已有标题' },
    ])
    expect(diagnoseWorkspace(index).map((item) => item.code)).toEqual([
      'ambiguous-wikilink-target',
      'missing-wikilink-anchor',
    ])
  })

  it('报告当前文档中不存在的 Markdown 锚点', () => {
    const index = buildIndex([
      { id: 'a', title: 'A', contentMarkdown: '# 已有\n[跳转](#不存在)' },
    ])
    expect(diagnoseWorkspace(index)[0]).toMatchObject({
      code: 'missing-markdown-anchor',
      docId: 'a',
      line: 1,
    })
  })

  it('报告不存在的本地 Markdown 文档和资产', () => {
    const index = buildIndex([
      { id: 'a', title: 'A', contentMarkdown: '[文档](缺失.md)\n![图](asset://missing.png)' },
    ])
    expect(diagnoseWorkspace(index, new Set()).map((item) => item.code)).toEqual([
      'missing-markdown-document',
      'missing-asset',
    ])
  })

  it('大小写不一致时给出可应用的标题修复', () => {
    const index = buildIndex([
      { id: 'a', title: 'A', contentMarkdown: '[[target]]' },
      { id: 'b', title: 'Target', contentMarkdown: '' },
    ])
    const diagnostic = diagnoseWorkspace(index)[0]
    expect(diagnostic).toMatchObject({
      code: 'unstable-wikilink-case',
      severity: 'warning',
      messageParams: { actual: 'Target' },
      replacement: { from: 'target', to: 'Target' },
    })
    expect('message' in diagnostic).toBe(false)
  })

  it('快速修复只替换诊断行内的目标文本', () => {
    const index = buildIndex([
      { id: 'a', title: 'A', contentMarkdown: 'target\n参见 [[target]]\ntarget' },
      { id: 'b', title: 'Target', contentMarkdown: '' },
    ])
    const diagnostic = diagnoseWorkspace(index)[0]
    expect(applyDiagnosticReplacement('target\n参见 [[target]]\ntarget', diagnostic)).toBe(
      'target\n参见 [[Target]]\ntarget',
    )
  })

  it('返回编辑器波浪线对应的精确文本范围', () => {
    const markdown = '前文\n参见 [[target]]\n后文'
    const index = buildIndex([
      { id: 'a', title: 'A', contentMarkdown: markdown },
    ])
    expect(diagnosticRange(markdown, diagnoseWorkspace(index)[0])).toEqual({
      from: 8,
      to: 14,
    })
  })
})
