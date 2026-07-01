import type MarkdownIt from 'markdown-it'

// CJK 强调修复：markdown-it 默认把中日韩表意文字当作“词字符”，于是 `_`（以及
// markdown-it-mark/sub/sup 的 `==`/`~`/`^`）的「词内不强调」规则会挡掉紧贴中文的强调，
// 例如 `中文___粗斜体___中文` 渲染成字面量。星号 `*` 没有该限制，故 `***` 一直正常。
//
// 修法：覆盖 StateInline.prototype.scanDelims，让 CJK 字符在 flanking 判定中算作“标点”，
// 这样 `_` 能在中文旁开合；`*`（canSplitWord）与 ASCII（如 snake_case）行为不变。

// 表意文字 / 假名 / CJK 标点 / 全角区。
const CJK = /[⺀-⻿　-〿぀-ヿ㐀-䶿一-鿿豈-﫿＀-￯]/

export function cjkEmphasisPlugin(md: MarkdownIt): void {
  const State = (md.inline as unknown as { State: { prototype: Record<string, unknown> } }).State
  const u = md.utils
  const isPunct = (code: number): boolean => {
    if (u.isMdAsciiPunct(code)) return true
    const ch = String.fromCharCode(code)
    return u.isPunctChar(ch) || CJK.test(ch)
  }

  // 复刻 markdown-it scanDelims，仅把 CJK 纳入“标点”。返回结构与原版一致。
  State.prototype.scanDelims = function (this: {
    posMax: number
    src: string
  }, start: number, canSplitWord: boolean) {
    const max = this.posMax
    const marker = this.src.charCodeAt(start)
    const lastChar = start > 0 ? this.src.charCodeAt(start - 1) : 0x20
    let pos = start
    while (pos < max && this.src.charCodeAt(pos) === marker) pos++
    const count = pos - start
    const nextChar = pos < max ? this.src.charCodeAt(pos) : 0x20

    const isLastWS = u.isWhiteSpace(lastChar)
    const isNextWS = u.isWhiteSpace(nextChar)
    const isLastPunct = isPunct(lastChar)
    const isNextPunct = isPunct(nextChar)

    const leftFlanking = !isNextWS && (!isNextPunct || isLastWS || isLastPunct)
    const rightFlanking = !isLastWS && (!isLastPunct || isNextWS || isNextPunct)

    const can_open = canSplitWord ? leftFlanking : leftFlanking && (!rightFlanking || isLastPunct)
    const can_close = canSplitWord ? rightFlanking : rightFlanking && (!leftFlanking || isNextPunct)

    return { can_open, can_close, length: count }
  }
}
