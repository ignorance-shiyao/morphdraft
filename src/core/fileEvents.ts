// R0b-1：文件监听的纯逻辑层——Tauri fs watch 原始事件归一化 + 自身写入抑制。
// 这里不接 watcher、不依赖 Tauri，便于单测；接线在 App.vue / useFileWatcher。

export type VaultFileEventKind = 'created' | 'changed' | 'removed' | 'renamed'

export interface VaultFileEvent {
  kind: VaultFileEventKind
  paths: string[]
}

// Tauri notify 事件形状不稳定：type 可能是字符串，也可能是
// { create: {...} } / { modify: { kind: 'rename', ... } } / { remove: {...} } 之类。
export interface RawFsEvent {
  type: unknown
  paths: string[]
}

function kindOf(t: unknown): VaultFileEventKind | null {
  if (typeof t === 'string') {
    if (t === 'create' || t === 'created') return 'created'
    if (t === 'modify' || t === 'modified') return 'changed'
    if (t === 'remove' || t === 'removed') return 'removed'
    if (t === 'rename' || t === 'renamed') return 'renamed'
    return null
  }
  if (t && typeof t === 'object') {
    const o = t as Record<string, unknown>
    if ('create' in o) return 'created'
    if ('remove' in o) return 'removed'
    if ('rename' in o) return 'renamed'
    if ('modify' in o) {
      const m = o.modify as Record<string, unknown> | undefined
      if (m && typeof m === 'object' && m.kind === 'rename') return 'renamed'
      return 'changed'
    }
  }
  return null
}

// 归一化单个原始事件。无法识别的类型或空路径 → null（调用方跳过）。
export function normalizeFsEvent(raw: RawFsEvent | null | undefined): VaultFileEvent | null {
  if (!raw) return null
  const kind = kindOf(raw.type)
  if (!kind) return null
  const paths = Array.isArray(raw.paths) ? raw.paths.filter((p) => typeof p === 'string' && p) : []
  if (!paths.length) return null
  return { kind, paths }
}

// 自身写入抑制：应用保存某文件前后会触发 fs watch 事件，需在短时窗口内把这些
// 「自己写的」事件判为自触发，避免误报外部冲突。按路径打时间戳，窗口内一律抑制
// （一次保存可能产生 create+modify 多个事件，故按时间过期、不在首次命中即清除）。
export class SelfWriteGuard {
  private marks = new Map<string, number>()
  constructor(private readonly windowMs = 1500) {}

  markWrite(path: string, at: number = Date.now()): void {
    this.marks.set(path, at)
  }

  isSelfWrite(path: string, at: number = Date.now()): boolean {
    const t = this.marks.get(path)
    if (t === undefined) return false
    if (at - t <= this.windowMs) return true
    this.marks.delete(path) // 过期清理
    return false
  }

  clear(path?: string): void {
    if (path === undefined) this.marks.clear()
    else this.marks.delete(path)
  }
}

// 共享单例：document store 在 vault 落盘后 markWrite，文件监听据此抑制自触发事件。
export const vaultSelfWrite = new SelfWriteGuard()
