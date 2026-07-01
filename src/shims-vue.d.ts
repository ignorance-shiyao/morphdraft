declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare module '*.md?raw' {
  const content: string
  export default content
}

declare module 'markdown-it-footnote' {
  import type MarkdownIt from 'markdown-it'
  const plugin: (md: MarkdownIt) => void
  export default plugin
}

declare module 'markdown-it-mark' {
  import type MarkdownIt from 'markdown-it'
  const plugin: (md: MarkdownIt) => void
  export default plugin
}
declare module 'markdown-it-sub' {
  import type MarkdownIt from 'markdown-it'
  const plugin: (md: MarkdownIt) => void
  export default plugin
}
declare module 'markdown-it-sup' {
  import type MarkdownIt from 'markdown-it'
  const plugin: (md: MarkdownIt) => void
  export default plugin
}
declare module 'markdown-it-ins' {
  import type MarkdownIt from 'markdown-it'
  const plugin: (md: MarkdownIt) => void
  export default plugin
}

declare module 'turndown-plugin-gfm' {
  import type TurndownService from 'turndown'
  export const gfm: TurndownService.Plugin
  export const tables: TurndownService.Plugin
  export const strikethrough: TurndownService.Plugin
  export const taskListItems: TurndownService.Plugin
}
