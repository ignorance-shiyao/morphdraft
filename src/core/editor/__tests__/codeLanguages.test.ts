import { describe, expect, it } from 'vitest'
import { LanguageDescription } from '@codemirror/language'
import { classHighlighter, highlightTree } from '@lezer/highlight'
import { CODE_LANGUAGES } from '../codeLanguages'

async function highlightedParts(languageName: string, code: string) {
  const description = LanguageDescription.matchLanguageName(CODE_LANGUAGES, languageName, false)
  expect(description).not.toBeNull()
  const support = await description!.load()
  const parts: string[] = []
  highlightTree(support.language.parser.parse(code), classHighlighter, (from, to) => {
    parts.push(code.slice(from, to))
  })
  return parts
}

describe('CODE_LANGUAGES（源码围栏代码语言）', () => {
  it.each(['js', 'typescript', 'python', 'java', 'go', 'rust', 'sql', 'bash', 'json', 'yaml'])(
    '支持常见语言标识 %s',
    (name) => {
      expect(LanguageDescription.matchLanguageName(CODE_LANGUAGES, name, false)).not.toBeNull()
    },
  )

  it('Mermaid 关键字、箭头、数字和注释会生成语法 token', async () => {
    const parts = await highlightedParts(
      'mermaid',
      'flowchart LR\n%% comment\nA[开始] --> B{通过?}\nB -->|是| C[完成 100%]',
    )

    expect(parts).toEqual(expect.arrayContaining(['flowchart', '%% comment', '-->', '100%']))
  })

  it('ECharts 围栏按 JavaScript 对象语法高亮', async () => {
    const parts = await highlightedParts(
      'echarts',
      "const option = { series: [{ type: 'bar', data: [120, 200] }], animation: true }",
    )

    expect(parts).toEqual(expect.arrayContaining(['const', 'option', 'series', "'bar'", '120', 'true']))
  })
})
