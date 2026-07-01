// 安全的 localStorage 读写：所有访问 try/catch 包裹，集中各 store 重复的持久化样板。
// 写入会被 configMirror 的 setItem patch 捕获 → 桌面端镜像到 settings.json。

export function getString(key: string, def: string): string {
  try {
    return localStorage.getItem(key) || def
  } catch {
    return def
  }
}

// '1' → true，'0' → false，其余（含未设置 / 解析失败）→ def
export function getBool(key: string, def: boolean): boolean {
  try {
    const v = localStorage.getItem(key)
    if (v === '1') return true
    if (v === '0') return false
  } catch {
    /* ignore */
  }
  return def
}

// 数值，可选夹在 [min, max]；未设置 / 非有限数 → def
export function getNumber(key: string, def: number, min = -Infinity, max = Infinity): number {
  try {
    const raw = localStorage.getItem(key)
    if (raw !== null && raw !== '') {
      const n = Number(raw)
      if (Number.isFinite(n)) return Math.min(max, Math.max(min, n))
    }
  } catch {
    /* ignore */
  }
  return def
}

// 枚举：值须是 valid 的键之一，否则 def
export function getEnum<T extends string>(key: string, valid: Record<string, unknown>, def: T): T {
  try {
    const v = localStorage.getItem(key)
    if (v && v in valid) return v as T
  } catch {
    /* ignore */
  }
  return def
}

export function setString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

export function setBool(key: string, value: boolean): void {
  setString(key, value ? '1' : '0')
}

export function setNumber(key: string, value: number): void {
  setString(key, String(value))
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}
