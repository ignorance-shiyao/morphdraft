// 统一图片附件门面：对外保持 asset://<id> 引用，内部委托给当前后端的 AssetStore。
//   - vault 模式（桌面 + 已选工作目录）：落盘到 <workDir>/.morphdraft/assets/<id>
//   - 其余（浏览器 / 未选目录）：沿用 localDocuments 的 IndexedDB 附件库
// 读取时优先磁盘、回落 IndexedDB，兼容历史（曾在浏览器存过的）资产。
// 具体读写分发收敛在 storage/assetStore.ts（B0-2 抽象），本文件只做门面 + 纯工具。

import { isVaultMode } from './vaultPath'
import { pickAssetStore, extFromMime, mimeFromId } from './storage/assetStore'

// mime/ext 推导历史上从本模块导出，保留再导出以兼容现有引用与测试。
export { extFromMime, mimeFromId }

// 当前生效的资产库：按运行模式实时选择（与改前 isVaultMode() 分发等价）。
function activeAssetStore() {
  return pickAssetStore(isVaultMode() ? 'vault' : 'local')
}

// 存图片：返回 asset://<id>。vault 落盘，否则进 IndexedDB。
export async function saveAsset(blob: Blob, mime: string): Promise<string> {
  const type = mime || blob.type || 'image/png'
  return activeAssetStore().saveAsset(blob, type)
}

// 取图片字节：vault 优先读盘，未命中回落 IndexedDB（含历史资产）。
export async function getAssetBlob(id: string): Promise<Blob | null> {
  return activeAssetStore().getAssetBlob(id)
}

// 从文本中抽取全部 asset:// 引用的 id（去重）。集中字符类，避免多处正则不同步。
export function extractAssetIds(text: string): string[] {
  return [...new Set([...text.matchAll(/asset:\/\/([a-zA-Z0-9._-]+)/g)].map((m) => m[1]))]
}

// 列出全部附件 id（vault：assets 目录下文件名；否则 IndexedDB 主键）。用于孤儿清理。
export async function listAllAssetIds(): Promise<string[]> {
  return activeAssetStore().listAssetIds()
}

// 删除单个附件（vault：删文件；否则 IndexedDB）。
export async function deleteAsset(id: string): Promise<void> {
  await activeAssetStore().deleteAsset(id)
}
