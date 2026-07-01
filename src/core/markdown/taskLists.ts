import type MarkdownIt from 'markdown-it'

// 待办清单（GFM task list）：`- [ ] 待办` / `- [x] 完成` 渲染成只读复选框。
// 借鉴 Gamma「待办事项清单」。core ruler 在 inline 之后改写列表项首行。
export function taskListPlugin(md: MarkdownIt): void {
  md.core.ruler.after('inline', 'task_lists', (state) => {
    const tokens = state.tokens
    for (let i = 2; i < tokens.length; i++) {
      if (tokens[i].type !== 'inline') continue
      if (tokens[i - 1].type !== 'paragraph_open') continue
      if (tokens[i - 2].type !== 'list_item_open') continue
      const inline = tokens[i]
      const first = inline.children?.[0]
      if (!first || first.type !== 'text') continue
      const m = /^\[([ xX])\](?:\s+|$)/.exec(first.content)
      if (!m) continue

      const checked = m[1].toLowerCase() === 'x'
      first.content = first.content.slice(m[0].length)
      const box = new state.Token('html_inline', '', 0)
      // U4：可点击切换（预览拦截 click → 改写源码并排序）；不再 disabled。
      box.content = `<input class="task-checkbox" type="checkbox"${checked ? ' checked' : ''}> `
      inline.children!.unshift(box)

      tokens[i - 2].attrJoin('class', checked ? 'task-item done' : 'task-item')
      // 给最近的列表容器打 task-list 类（隐藏默认 marker）
      for (let j = i - 2; j >= 0; j--) {
        if (tokens[j].type === 'bullet_list_open' || tokens[j].type === 'ordered_list_open') {
          tokens[j].attrJoin('class', 'task-list')
          break
        }
      }
    }
  })
}
