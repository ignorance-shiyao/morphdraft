// 设置统一配置文件（桌面）：localStorage 仍是各 store 的同步事实来源，
// 这里加一层磁盘镜像——启动时从 <appConfigDir>/settings.json 恢复，之后变更防抖回写。
// 好处：WebView 清缓存不丢设置、可随配置目录备份/迁移。浏览器端 no-op。

import { isTauri } from './vaultPath'
import { loadFs, atomicWriteText } from './fsUtil'

const CONFIG_FILE = 'settings.json'
// 需要镜像的 localStorage key 前缀（设置/UI/主题/标签/图床）
const PREFIXES = ['mddoc:', 'morphdraft-']
// 排除：文档正文本身（量大、且已由文档后端持久化），不属于「设置」
const EXCLUDE = new Set(['mddoc:current'])

function isMirrored(key: string): boolean {
  return !EXCLUDE.has(key) && PREFIXES.some((p) => key.startsWith(p))
}

async function tauriPath() {
  const { appConfigDir } = await import('@tauri-apps/api/path')
  return appConfigDir()
}

// 启动时调用（mount 前，await）：磁盘配置为桌面端权威，覆盖写回 localStorage。
export async function hydrateFromDisk(): Promise<void> {
  if (!isTauri()) return
  try {
    const dir = await tauriPath()
    const fs = await loadFs()
    const path = `${dir}/${CONFIG_FILE}`
    if (!(await fs.exists(path))) return
    const raw = await fs.readTextFile(path)
    const data = JSON.parse(raw) as Record<string, unknown>
    for (const [key, value] of Object.entries(data)) {
      if (isMirrored(key) && typeof value === 'string') {
        try { localStorage.setItem(key, value) } catch { /* ignore */ }
      }
    }
  } catch {
    // 首次无文件 / 解析失败 → 忽略，按默认值启动
  }
}

let flushTimer: number | undefined
let dirty = false

function collect(): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && isMirrored(key)) {
      const v = localStorage.getItem(key)
      if (v !== null) out[key] = v
    }
  }
  return out
}

async function flush(): Promise<void> {
  dirty = false
  try {
    const dir = await tauriPath()
    const fs = await loadFs()
    await fs.mkdir(dir, { recursive: true }).catch(() => {})
    await atomicWriteText(`${dir}/${CONFIG_FILE}`, JSON.stringify(collect(), null, 2))
  } catch {
    // 写盘失败静默（localStorage 仍是即时事实来源）
  }
}

function scheduleFlush() {
  dirty = true
  window.clearTimeout(flushTimer)
  flushTimer = window.setTimeout(() => void flush(), 400)
}

// 启动后调用（hydrate 之后）：拦截 localStorage 写入，命中前缀即防抖回写磁盘。
export function startMirror(): void {
  if (!isTauri()) return
  const original = localStorage.setItem.bind(localStorage)
  localStorage.setItem = (key: string, value: string) => {
    original(key, value)
    if (isMirrored(key)) scheduleFlush()
  }
  // 关闭/切后台前尽力立即落盘，避免改动后 400ms 防抖窗口内退出丢最后一次设置。
  // visibilitychange→hidden 比 beforeunload 更可靠（移动/WebView 场景）。
  const flushNow = () => {
    if (!dirty) return
    window.clearTimeout(flushTimer)
    void flush()
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushNow()
  })
  window.addEventListener('beforeunload', flushNow)
}
