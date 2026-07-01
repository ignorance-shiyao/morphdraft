import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import type { Extension } from '@codemirror/state'
import type { ThemeTokens } from '../themes/presets'

// 编辑器跟随应用外壳主题，使用 --app-* 便于主题级 UI 微调。
const A = (pct: number) => `color-mix(in srgb, var(--app-primary-color) ${pct}%, transparent)`

export function makeEditorTheme(tk: ThemeTokens): Extension {
  const chrome = EditorView.theme(
    {
      '&': { color: 'var(--app-fg)', backgroundColor: 'var(--app-bg)' },
      '.cm-content': { caretColor: 'var(--app-primary-color)' },
      // 光标可见性增强：加粗到 2px、补一道主色微光，暗色/浅色背景上都更醒目
      '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: 'var(--app-primary-color)',
        borderLeftWidth: '2px',
        boxShadow: '0 0 2px var(--app-primary-color)',
      },
      '&.cm-focused .cm-cursor': { borderLeftWidth: '2px' },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
        { backgroundColor: A(22) },
      '.cm-activeLine': { backgroundColor: A(10), boxShadow: 'inset 2px 0 0 var(--app-primary-color)' },
      '.cm-gutters': {
        backgroundColor: 'transparent',
        color: 'var(--app-muted)',
        border: 'none',
      },
      '.cm-activeLineGutter': { backgroundColor: A(10), color: 'var(--app-primary-color)', fontWeight: '700' },
      '.cm-foldPlaceholder': { backgroundColor: 'transparent', border: 'none', color: 'var(--app-muted)' },
      '.cm-selectionMatch': { backgroundColor: A(18) },
    },
    { dark: tk.dark },
  )

  // 代码 token 多色板（仅围栏代码生效）：编辑器不参与导出，按明暗取固定可读色。
  const code = tk.dark
    ? { kw: '#c792ea', str: '#9ece6a', num: '#ff9e64', type: '#2ac3de', fn: 'var(--app-primary-color)', attr: '#e0af68', op: 'var(--app-muted)' }
    : { kw: '#8250df', str: '#0a7d34', num: '#b15c00', type: '#953800', fn: 'var(--app-primary-color)', attr: '#b35900', op: 'var(--app-muted)' }
  // 标记符（# > - * ` | ---）统一弱化，让内容更突出
  const mark = 'color-mix(in srgb, var(--app-muted) 78%, transparent)'

  const highlight = HighlightStyle.define([
    // —— Markdown 强调类：主色派生，跟主题 ——
    { tag: t.heading1, color: 'var(--app-primary-color)', fontWeight: '800', fontSize: '1.18em' },
    { tag: t.heading2, color: 'var(--app-primary-color)', fontWeight: '800', fontSize: '1.1em' },
    { tag: [t.heading, t.heading3, t.heading4, t.heading5, t.heading6], color: 'var(--app-primary-color)', fontWeight: '700' },
    { tag: t.strong, color: 'var(--app-fg)', fontWeight: '800' },
    { tag: t.emphasis, color: 'var(--app-fg)', fontStyle: 'italic' },
    { tag: t.strikethrough, color: 'var(--app-muted)', textDecoration: 'line-through' },
    { tag: [t.link, t.url], color: 'var(--app-primary-color)', textDecoration: 'underline' },
    { tag: t.quote, color: 'color-mix(in srgb, var(--app-fg) 62%, var(--app-muted))', fontStyle: 'italic' },
    { tag: t.list, color: 'var(--app-primary-color)', fontWeight: '700' },
    // 行内代码：主色调字 + 淡底，跟主题
    { tag: t.monospace, color: 'color-mix(in srgb, var(--app-primary-color) 82%, var(--app-fg))', backgroundColor: A(8) },
    // 标记符 / 分隔 / frontmatter：弱化
    { tag: [t.processingInstruction, t.contentSeparator, t.meta], color: mark },
    // —— 围栏代码内的语言 token（阶段③ 启用语言后生效）——
    { tag: [t.keyword, t.modifier, t.controlKeyword, t.operatorKeyword], color: code.kw },
    { tag: [t.string, t.special(t.string), t.regexp], color: code.str },
    { tag: [t.number, t.bool, t.atom], color: code.num },
    { tag: [t.typeName, t.className, t.namespace], color: code.type },
    { tag: [t.function(t.variableName), t.function(t.propertyName), t.labelName], color: code.fn },
    { tag: [t.variableName, t.definition(t.variableName)], color: code.fn },
    { tag: [t.propertyName, t.attributeName, t.tagName], color: code.attr },
    { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--app-muted)', fontStyle: 'italic' },
    { tag: [t.operator, t.punctuation, t.bracket, t.separator], color: code.op },
    { tag: t.invalid, color: '#e5484d' },
  ])

  return [chrome, syntaxHighlighting(highlight)]
}
