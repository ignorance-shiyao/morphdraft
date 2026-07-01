// Tauri 文件系统小工具：集中 plugin-fs 动态加载与原子文本写入，
// 供 fsVault（文档）、configMirror（配置）、assets（图片）共用，避免各处重复。

export async function loadFs() {
  return import('@tauri-apps/plugin-fs')
}

// 原子写文本：先写临时文件再 rename，避免半截写入损坏目标文件。
export async function atomicWriteText(path: string, content: string): Promise<void> {
  const fs = await loadFs()
  const tmp = `${path}.tmp.${Date.now()}`
  await fs.writeTextFile(tmp, content)
  await fs.rename(tmp, path)
}
