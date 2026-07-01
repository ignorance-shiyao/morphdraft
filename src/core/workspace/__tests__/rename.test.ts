import { describe, expect, it } from 'vitest'
import { buildIndex, type DocInput } from '../index'
import { buildRenamePlan, executeRenamePlan } from '../rename'

const docs: DocInput[] = [
  { id: 'a', title: '旧标题', contentMarkdown: '---\ntitle: 旧标题\n---\n\n# 正文' },
  {
    id: 'b',
    title: '引用页',
    contentMarkdown: [
      '普通文字旧标题不应改变',
      '[[旧标题]] [[旧标题|别名]] [[旧标题#章节]]',
      '[文档](旧标题.md) [锚点](旧标题.md#章节)',
      '```md',
      '[[旧标题]]',
      '```',
    ].join('\n'),
  },
]

describe('安全重命名计划', () => {
  it('只改索引命中的 WikiLink 和 Markdown 文档链接', () => {
    const plan = buildRenamePlan(buildIndex(docs), docs, 'a', '新标题')
    expect(plan.oldTitle).toBe('旧标题')
    expect(plan.newTitle).toBe('新标题')
    expect(plan.referenceChanges).toHaveLength(1)
    expect(plan.referenceChanges[0].after).toContain('[[新标题]] [[新标题|别名]] [[新标题#章节]]')
    expect(plan.referenceChanges[0].after).toContain('[文档](新标题.md) [锚点](新标题.md#章节)')
    expect(plan.referenceChanges[0].after).toContain('普通文字旧标题不应改变')
    expect(plan.referenceChanges[0].after).toContain('```md\n[[旧标题]]\n```')
  })

  it('更新目标文档 frontmatter 标题', () => {
    const plan = buildRenamePlan(buildIndex(docs), docs, 'a', '新标题')
    expect(plan.targetAfter).toContain('title: 新标题')
  })

  it('同步更新目标文档内部的自引用', () => {
    const selfDocs: DocInput[] = [
      { id: 'a', title: '旧标题', contentMarkdown: '---\ntitle: 旧标题\n---\n\n[[旧标题#正文]]' },
    ]
    const plan = buildRenamePlan(buildIndex(selfDocs), selfDocs, 'a', '新标题')
    expect(plan.targetAfter).toContain('[[新标题#正文]]')
  })

  it('新标题已存在时拒绝生成计划', () => {
    const withDuplicate = [...docs, { id: 'c', title: '新标题', contentMarkdown: '' }]
    expect(() => buildRenamePlan(buildIndex(withDuplicate), withDuplicate, 'a', '新标题'))
      .toThrow('新标题已存在')
  })
})

describe('安全重命名执行', () => {
  it('引用全部写入后最后重命名目标', async () => {
    const plan = buildRenamePlan(buildIndex(docs), docs, 'a', '新标题')
    const calls: string[] = []
    await executeRenamePlan(plan, {
      update: async (id) => { calls.push(`update:${id}`) },
      rename: async (id) => { calls.push(`rename:${id}`); return id },
    })
    expect(calls).toEqual(['update:b', 'rename:a'])
  })

  it('重命名失败时回滚已写入的引用', async () => {
    const plan = buildRenamePlan(buildIndex(docs), docs, 'a', '新标题')
    const writes: string[] = []
    await expect(executeRenamePlan(plan, {
      update: async (id, markdown) => { writes.push(`${id}:${markdown.includes('新标题') ? 'new' : 'old'}`) },
      rename: async () => { throw new Error('rename failed') },
    })).rejects.toThrow('rename failed')
    expect(writes).toEqual(['b:new', 'b:old'])
  })
})
