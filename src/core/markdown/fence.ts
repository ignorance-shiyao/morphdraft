import type MarkdownIt from 'markdown-it'

// 把 ```mermaid / ```echarts 代码块渲染成占位 div，
// 真正的渲染由 core/charts/mount.ts 在 DOM 挂载后执行（懒加载图表库）。
export function chartFencePlugin(md: MarkdownIt) {
  const fallback =
    md.renderer.rules.fence ??
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))

  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    const info = token.info.trim().toLowerCase()
    if (info === 'mermaid' || info === 'echarts') {
      const code = encodeURIComponent(token.content)
      const line = token.map ? ` data-source-line="${token.map[0]}"` : ''
      return `<div class="chart-block" data-chart-type="${info}" data-chart-code="${code}"${line}></div>\n`
    }
    const rendered = fallback(tokens, idx, options, env, self)
    if (!token.map || rendered.includes('data-source-line=')) return rendered
    return rendered.replace(/^<pre\b/, `<pre data-source-line="${token.map[0]}"`)
  }
}
