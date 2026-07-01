import { defineStore } from 'pinia'

// 编辑器 ↔ 文档预览 的双向定位与滚动同步协调。
export const useSyncStore = defineStore('sync', {
  state: () => ({
    gotoLine: 0, // 预览点击 → 编辑器跳转到的绝对行（0 基）
    gotoColumn: 0, // 预览点击 → 编辑器跳转列（0 基；无精确列时为 0）
    gotoNonce: 0,
    cursorLine: 0, // 编辑器当前光标绝对行（0 基）
    scrollLine: 0, // 需要对齐到视口顶部的绝对行
    scrollSource: '' as '' | 'editor' | 'preview',
    scrollNonce: 0,
  }),
  actions: {
    requestGoto(line: number, column = 0) {
      this.gotoLine = line
      this.gotoColumn = Math.max(0, column)
      this.gotoNonce++
    },
    setCursorLine(line: number) {
      this.cursorLine = line
    },
    requestScroll(line: number, source: 'editor' | 'preview') {
      this.scrollLine = line
      this.scrollSource = source
      this.scrollNonce++
    },
  },
})
