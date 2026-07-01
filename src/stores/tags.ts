import { defineStore } from 'pinia'
import { getString, setString } from '../core/localStore'

// 标签高亮配色：tag → hex。未配置时按名称稳定散列到调色板，保证同名标签颜色一致。
const KEY = 'mddoc:tag-colors'

export const TAG_PALETTE = [
  '#2563eb', '#16a34a', '#f59e0b', '#ef4444', '#8b5cf6',
  '#0ea5e9', '#ec4899', '#14b8a6', '#f97316', '#64748b',
]

function load(): Record<string, string> {
  try {
    return JSON.parse(getString(KEY, '{}'))
  } catch {
    return {}
  }
}

function hashHue(tag: string): string {
  let h = 0
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0
  return TAG_PALETTE[h % TAG_PALETTE.length]
}

export const useTagsStore = defineStore('tags', {
  state: () => ({
    colors: load() as Record<string, string>,
  }),
  actions: {
    colorOf(tag: string): string {
      return this.colors[tag] ?? hashHue(tag)
    },
    setColor(tag: string, color: string) {
      this.colors = { ...this.colors, [tag]: color }
      setString(KEY, JSON.stringify(this.colors))
    },
  },
})
