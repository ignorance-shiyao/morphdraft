// 代码块高亮配色（highlight.js token 类）。随 documentElement[data-theme] 自适应明暗。
// 作为字符串导出：运行时注入 <style>（预览/截图导出），html.ts 也内联进自包含 HTML。
export const CODE_CSS = `
.hljs { color: var(--fg); background: transparent; }
.hljs-comment, .hljs-quote { color: var(--muted); font-style: italic; }
.hljs-keyword, .hljs-selector-tag, .hljs-literal, .hljs-name { color: #8250df; }
.hljs-string, .hljs-meta .hljs-string, .hljs-regexp { color: #0a7d34; }
.hljs-number, .hljs-bool { color: #b15c00; }
.hljs-title, .hljs-title.function_, .hljs-section { color: var(--primary-color, #0550ae); }
.hljs-attr, .hljs-attribute, .hljs-variable, .hljs-template-variable { color: #b35900; }
.hljs-type, .hljs-class .hljs-title, .hljs-built_in { color: #953800; }
.hljs-symbol, .hljs-bullet, .hljs-link { color: #0a7d34; }
.hljs-tag, .hljs-selector-id, .hljs-selector-class { color: #116329; }
.hljs-emphasis { font-style: italic; }
.hljs-strong { font-weight: 700; }
.hljs-deletion { color: #82071e; background: #ffebe9; }
.hljs-addition { color: #116329; background: #dafbe1; }

[data-theme="dark"] .hljs-keyword, [data-theme="dark"] .hljs-selector-tag, [data-theme="dark"] .hljs-literal, [data-theme="dark"] .hljs-name { color: #c792ea; }
[data-theme="dark"] .hljs-string, [data-theme="dark"] .hljs-regexp { color: #9ece6a; }
[data-theme="dark"] .hljs-number, [data-theme="dark"] .hljs-bool { color: #ff9e64; }
[data-theme="dark"] .hljs-title, [data-theme="dark"] .hljs-title.function_, [data-theme="dark"] .hljs-section { color: var(--primary-color, #7aa2f7); }
[data-theme="dark"] .hljs-attr, [data-theme="dark"] .hljs-attribute, [data-theme="dark"] .hljs-variable { color: #e0af68; }
[data-theme="dark"] .hljs-type, [data-theme="dark"] .hljs-built_in { color: #2ac3de; }
[data-theme="dark"] .hljs-tag, [data-theme="dark"] .hljs-selector-id, [data-theme="dark"] .hljs-selector-class { color: #73daca; }
[data-theme="dark"] .hljs-deletion { color: #ff7b72; background: #3a1014; }
[data-theme="dark"] .hljs-addition { color: #7ee787; background: #0f2d18; }
`
