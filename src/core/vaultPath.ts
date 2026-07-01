// 共享工作目录状态：由 document store 在 init/切换后端时注入，
// 供 fsVault（文档读写）与 assets（图片落盘）共用，避免任一方反依赖 Pinia store。

let currentWorkDir = ''

export function setWorkDir(dir: string) {
  currentWorkDir = dir || ''
}

export function getWorkDir(): string {
  return currentWorkDir
}

// 是否在 Tauri 桌面 WebView 中
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

// vault 模式 = 桌面端 + 已选工作目录（文档/图片落盘到文件系统）
export function isVaultMode(): boolean {
  return isTauri() && !!currentWorkDir
}
