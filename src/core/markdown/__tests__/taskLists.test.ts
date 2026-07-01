import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '..'

describe('任务列表渲染', () => {
  it('空任务项仍渲染为 checkbox，不退化成普通 bullet + [x]', () => {
    const html = renderMarkdown('- [x]\n- [ ]')

    expect(html.match(/class="task-checkbox"/g)).toHaveLength(2)
    expect(html).toContain('type="checkbox" checked')
    expect(html).not.toContain('[x]')
    expect(html).not.toContain('[ ]')
  })
})
