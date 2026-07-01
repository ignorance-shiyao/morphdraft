// R0b-1：外部变更监听 — Tauri fs watch 工作目录。
// 外部新增/改名/删除/修改 .md → 刷新列表；当前文件被改给非阻塞冲突提示、被删则选最近/建空白。
// 自身保存经 vaultSelfWrite 抑制，不误报冲突。

import { ref } from 'vue'
import { useDocumentStore } from '../stores/document'
import { useSettingsStore } from '../stores/settings'
import { normalizeFsEvent, vaultSelfWrite, type RawFsEvent } from '../core/fileEvents'

let unwatch: (() => void) | null = null
const watching = ref(false)

export function useFileWatcher() {
  const doc = useDocumentStore()
  const settings = useSettingsStore()

  async function startWatching() {
    // 仅桌面 + 已选工作目录 + vault 后端时监听
    if (!settings.isTauri || !settings.workDir || doc.backendKind !== 'vault' || watching.value) return
    try {
      const { watch } = await import('@tauri-apps/plugin-fs')
      unwatch = await watch(
        settings.workDir,
        (raw: RawFsEvent) => { void handleRaw(raw) },
        { recursive: true },
      )
      watching.value = true
    } catch (e) {
      // 非阻塞：监听起不来不该挡住编辑，记录后照常工作
      console.error('文件监听启动失败：', e)
    }
  }

  async function handleRaw(raw: RawFsEvent) {
    const ev = normalizeFsEvent(raw)
    if (!ev) return
    const mdPaths = ev.paths.filter((p) => p.endsWith('.md') && !p.includes('/.morphdraft/'))
    if (!mdPaths.length) return

    for (const path of mdPaths) {
      const isCurrent = path === doc.currentId
      if (ev.kind === 'removed' || ev.kind === 'renamed') {
        if (isCurrent) await doc.handleCurrentFileGone()
        else await doc.refreshList()
        continue
      }
      // created / changed：自身写入则跳过（含一次保存的多事件）
      if (vaultSelfWrite.isSelfWrite(path)) continue
      if (ev.kind === 'changed' && isCurrent) {
        await flagIfDiverged(path)
      } else {
        await doc.refreshList()
      }
    }
  }

  // 读盘对比：磁盘内容与编辑器不一致才提示（兼作自身写入的二次防误报）。
  async function flagIfDiverged(path: string) {
    try {
      const { readTextFile } = await import('@tauri-apps/plugin-fs')
      const diskContent = await readTextFile(path)
      if (diskContent !== doc.markdown) doc.flagExternalConflict(path, diskContent)
    } catch {
      // 读取失败忽略，不阻塞
    }
  }

  function stopWatching() {
    if (unwatch) {
      unwatch()
      unwatch = null
    }
    watching.value = false
  }

  return { watching, startWatching, stopWatching }
}
