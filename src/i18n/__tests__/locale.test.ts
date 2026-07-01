import { describe, expect, it } from 'vitest'
import { resolveLocale } from '../locales'
import { messages } from '../messages'

describe('界面语言解析', () => {
  it('按系统语言列表选择第一个受支持语言', () => {
    expect(resolveLocale(['it-IT', 'fr-CA', 'en-US'])).toBe('fr-FR')
  })

  it('中文繁体环境回退到当前提供的简体中文', () => {
    expect(resolveLocale(['zh-TW'])).toBe('zh-CN')
  })

  it('完全不支持时回退英文', () => {
    expect(resolveLocale(['it-IT', 'ar-SA'])).toBe('en-US')
  })
})

describe('命令面板与帮助文案', () => {
  it('英文和中文都提供命令面板、快捷键与语法速查文案', () => {
    for (const locale of ['en-US', 'zh-CN'] as const) {
      const message = messages[locale]
      expect(message.commandPalette.placeholderCommands).toBeTruthy()
      expect(message.commandPalette.commands.docNew).toBeTruthy()
      expect(message.help.title).toBeTruthy()
      expect(message.help.shortcuts.paletteCommands).toBeTruthy()
      expect(message.help.syntax.wikilink).toBeTruthy()
    }
  })
})

describe('页面预览与同步滚动文案', () => {
  it('英文和中文都提供页面控制及同步滚动文案', () => {
    for (const locale of ['en-US', 'zh-CN'] as const) {
      const message = messages[locale]
      expect(message.previewControls.page).toBeTruthy()
      expect(message.previewControls.fitPage).toBeTruthy()
      expect(message.previewControls.paginated).toBeTruthy()
      expect(message.layout.syncScroll).toBeTruthy()
      expect(message.layout.syncScrollOn).toBeTruthy()
      expect(message.layout.syncScrollOff).toBeTruthy()
    }
  })
})

describe('检索与辅助编辑文案', () => {
  it('英文和中文都提供搜索、大纲、卡片和表格工具文案', () => {
    for (const locale of ['en-US', 'zh-CN'] as const) {
      const message = messages[locale]
      expect(message.globalSearch.placeholder).toBeTruthy()
      expect(message.outline.empty).toBeTruthy()
      expect(message.cardEditor.save).toBeTruthy()
      expect(message.tableTools.rowAbove).toBeTruthy()
    }
  })
})
