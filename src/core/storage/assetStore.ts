// 资产存储抽象（B0-2）：把原 assets.ts 里按 isVaultMode() 二分的图片读写收敛为
// 按后端能力分发的 AssetStore。行为对 local/vault **逐字节照搬**（含 vault 写盘失败/
// 读盘未命中时回落 IndexedDB 的顺序），不改路径、不改回落语义。

import type { AssetStore } from './types'
import type { BackendKind } from '../docBackend'
import { localDocuments } from '../localDocuments'
import { getWorkDir } from '../vaultPath'
import { loadFs } from '../fsUtil'

const ASSETS_SUBDIR = '.morphdraft/assets'

// mime → 扩展名（落盘文件后缀）
const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
}

// 扩展名 → mime（从落盘文件名还原 Blob 类型）
const EXT_TO_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  bmp: 'image/bmp',
}

export function extFromMime(mime: string): string {
  return MIME_TO_EXT[mime.toLowerCase()] || 'png'
}

export function mimeFromId(id: string): string {
  const ext = id.split('.').pop()?.toLowerCase() || ''
  return EXT_TO_MIME[ext] || 'image/png'
}

function assetsDir(): string {
  return `${getWorkDir()}/${ASSETS_SUBDIR}`
}

// 本地（IndexedDB）资产库：浏览器 / 未选工作目录。
const localAssetStore: AssetStore = {
  async saveAsset(blob, mime) {
    return `asset://${await localDocuments.saveAsset(blob, mime)}`
  },
  async getAssetBlob(id) {
    return localDocuments.getAsset(id)
  },
  async listAssetIds() {
    return localDocuments.listAssetIds()
  },
  async deleteAsset(id) {
    await localDocuments.deleteAsset(id)
  },
}

// vault（桌面 + 已选工作目录）资产库：落盘到 <workDir>/.morphdraft/assets/<id>，
// 写/读/删失败均回落 IndexedDB，保证图片不丢、兼容历史浏览器资产。
const vaultAssetStore: AssetStore = {
  async saveAsset(blob, mime) {
    try {
      const id = `asset-${crypto.randomUUID()}.${extFromMime(mime)}`
      const fs = await loadFs()
      const dir = assetsDir()
      await fs.mkdir(dir, { recursive: true }).catch(() => {})
      const bytes = new Uint8Array(await blob.arrayBuffer())
      await fs.writeFile(`${dir}/${id}`, bytes)
      return `asset://${id}`
    } catch {
      // 落盘失败 → 回落 IndexedDB
    }
    return `asset://${await localDocuments.saveAsset(blob, mime)}`
  },
  async getAssetBlob(id) {
    if (id.includes('.')) {
      try {
        const fs = await loadFs()
        const path = `${assetsDir()}/${id}`
        if (await fs.exists(path)) {
          const bytes = await fs.readFile(path)
          return new Blob([new Uint8Array(bytes)], { type: mimeFromId(id) })
        }
      } catch {
        // 读盘失败 → 回落 IndexedDB
      }
    }
    return localDocuments.getAsset(id)
  },
  async listAssetIds() {
    try {
      const fs = await loadFs()
      const dir = assetsDir()
      if (!(await fs.exists(dir))) return []
      const entries = await fs.readDir(dir)
      return entries.filter((e) => !e.isDirectory && e.name).map((e) => e.name)
    } catch {
      return []
    }
  },
  async deleteAsset(id) {
    if (id.includes('.')) {
      try {
        const fs = await loadFs()
        const path = `${assetsDir()}/${id}`
        if (await fs.exists(path)) {
          await fs.remove(path)
          return
        }
      } catch {
        // 落盘删除失败 → 尝试 IndexedDB
      }
    }
    await localDocuments.deleteAsset(id)
  },
}

// 按后端选择资产库。'server' 等远端后端的资产库在 B1 接入。
export function pickAssetStore(kind: BackendKind): AssetStore {
  return kind === 'vault' ? vaultAssetStore : localAssetStore
}
