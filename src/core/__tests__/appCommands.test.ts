import { describe, it, expect } from 'vitest'
import { APP_COMMANDS, shortcutGroups } from '../appCommands'

describe('appCommands 单一事实源', () => {
  it('命令 id 唯一', () => {
    const ids = APP_COMMANDS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('每个带 shortcut 的命令 shortcut 文案唯一', () => {
    const shortcuts = APP_COMMANDS.map((c) => c.shortcut).filter((s): s is string => !!s)
    expect(new Set(shortcuts).size).toBe(shortcuts.length)
  })

  it('每个命令的 title 非空、group 非空', () => {
    for (const c of APP_COMMANDS) {
      expect(c.title.trim().length).toBeGreaterThan(0)
      expect(c.group.trim().length).toBeGreaterThan(0)
    }
  })

  it('HelpDialog 展示的快捷键集 ⊆ 命令集（每条都能在 APP_COMMANDS 中找到对应命令）', () => {
    const known = new Map(APP_COMMANDS.filter((c) => c.shortcut).map((c) => [c.shortcut, c.title]))
    const groups = shortcutGroups()
    expect(groups.length).toBeGreaterThan(0)
    for (const g of groups) {
      for (const item of g.items) {
        expect(known.has(item.shortcut)).toBe(true)
        // 展示文案与事实源一致，杜绝漂移
        expect(item.title).toBe(known.get(item.shortcut))
      }
    }
  })

  it('展示集仅含带 shortcut 的命令，且不重复', () => {
    const seen = new Set<string>()
    for (const g of shortcutGroups()) {
      for (const item of g.items) {
        expect(item.shortcut.trim().length).toBeGreaterThan(0)
        expect(seen.has(item.shortcut)).toBe(false)
        seen.add(item.shortcut)
      }
    }
  })

  it('快捷键分组保留命令 id，供国际化映射使用', () => {
    const ids = shortcutGroups().flatMap((group) => group.items.map((item) => item.id))
    expect(ids).toEqual(APP_COMMANDS.filter((command) => command.shortcut).map((command) => command.id))
  })
})
