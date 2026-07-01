// M2-7: 中西文混排自动空隙（CJK↔Latin/数字边界加 1/4 em 视觉间距）
//
// 策略：CSS text-autospace 做主力（Chromium/FF 支持），本插件做旧浏览器 fallback。
// 不改源文件——只在渲染后的 HTML 文本节点中插入 <span class="cjk-space"> 元素。
// 该 span 仅在 CSS text-autospace 不生效时显示（CSS 控制 display）。
import type MarkdownIt from 'markdown-it'

const CJK = /[\u2e80-\u9fff\ua000-\ua4cf\uac00-\ud7af\uf900-\ufaff\ufe30-\ufe4f]/
const NON_CJK = /[a-zA-Z0-9.,;:!?'")\]}%]/
const CJK_PUNCT = /[\u3001-\u3011\u3014-\u301f\uff01-\uff0f\uff1a-\uff20\uff3b-\uff40\uff5b-\uff65]/

function needsSpace(prev: string, next: string): boolean {
  return CJK.test(prev) && !CJK_PUNCT.test(prev) && NON_CJK.test(next)
}

function processText(text: string): string {
  let result = ''
  for (let i = 0; i < text.length; i++) {
    result += text[i]
    if (i < text.length - 1 && needsSpace(text[i], text[i + 1])) {
      result += '<span class="cjk-space"></span>'
    }
  }
  return result
}

export function cjkSpacingPlugin(md: MarkdownIt) {
  const original = md.renderer.rules.text!
  md.renderer.rules.text = (tokens, idx, options, env, self) => {
    const text = tokens[idx].content
    if (!CJK.test(text)) return original(tokens, idx, options, env, self)
    return processText(md.utils.escapeHtml(text))
  }
}
