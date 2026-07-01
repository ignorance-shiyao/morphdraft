// M4-6 步进动画：把 <!-- step --> 标记行「抹空」（保持行数），并记录其行号。
//
// 为什么不走 markdown 渲染（替换成注释/容器都失败过）：
//   - HTML 注释在 html:false 下被转义；:::step 容器无闭合会吞整页。
// 正确做法：抹空标记行（渲染成空、不留痕迹），返回标记行号；
//   渲染后由 reveal.ts 按行号给「标记后的第一个块」加 class="fragment"。
//
// 不变量：body 行数必须与输入完全一致——否则 renderMarkdown 注入的
// data-source-line 会相对 body 偏移，导致 PPT 卡片点选编辑改错行（M4-1）。

const STEP_LINE = /^\s*<!--\s*step\s*-->\s*$/

export interface StepResult {
  body: string        // 抹空 step 标记行后的 body（行数不变）
  stepLines: number[] // 0 基行号：每个 step 标记原来所在的行
}

export function extractSteps(body: string): StepResult {
  const lines = body.split('\n')
  const stepLines: number[] = []
  const out = lines.map((line, i) => {
    if (STEP_LINE.test(line)) {
      stepLines.push(i)
      return '' // 抹空：渲染成空、不留痕迹，行数守恒
    }
    return line
  })
  return { body: out.join('\n'), stepLines }
}
