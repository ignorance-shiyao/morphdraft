// M1W-1: fsVault 后端 — 实现 DocBackend 全接口
// 桌面端通过 Tauri fs API 读写文件系统；浏览器端降级 IndexedDB。

import type { DocFull, DocMeta, DocVersion } from './docTypes'
import { localDocuments } from './localDocuments'
import { parseFrontmatter } from './markdown'
import { getWorkDir, isTauri } from './vaultPath'
import { loadFs, atomicWriteText } from './fsUtil'

const VAULT_DIR = '.morphdraft'

// 读取文件内容
async function readFile(path: string): Promise<string> {
  if (!isTauri()) throw new Error('fsVault requires Tauri')
  const fs = await loadFs()
  const content = await fs.readTextFile(path)
  return content
}

// 写入文件内容（原子写入）
async function writeFile(path: string, content: string): Promise<void> {
  if (!isTauri()) throw new Error('fsVault requires Tauri')
  await atomicWriteText(path, content)
}

// 扫描目录下的 .md 文件
async function scanDir(dir: string): Promise<string[]> {
  if (!isTauri()) return []
  const fs = await loadFs()
  const files: string[] = []
  async function walk(d: string) {
    const entries = await fs.readDir(d)
    for (const entry of entries) {
      const fullPath = `${d}/${entry.name}`
      if (entry.isDirectory) {
        await walk(fullPath)
      } else if (entry.name?.endsWith('.md')) {
        files.push(fullPath)
      }
    }
  }
  try {
    await walk(dir)
  } catch {
    // 目录不存在，返回空
  }
  return files
}

// 获取文件修改时间
async function getFileModified(path: string): Promise<number> {
  if (!isTauri()) return Date.now()
  const fs = await loadFs()
  try {
    const stat = await fs.stat(path)
    return stat.mtime?.getTime?.() ?? Date.now()
  } catch {
    return Date.now()
  }
}

// 生成文件路径（基于标题）
function titleToPath(title: string): string {
  const safe = title
    .replace(/[\/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 80)
  return `${safe || 'untitled'}.md`
}

// 从文件内容 + 路径 + mtime 构造 DocMeta（标题/模式/主题取自 frontmatter）
// 从绝对路径派生所属文件夹（= 工作目录下的相对子目录；根目录 / 内部目录返回 undefined）
export function folderFromPath(path: string): string | undefined {
  const wd = getWorkDir()
  if (!wd || !path.startsWith(`${wd}/`)) return undefined
  const rel = path.slice(wd.length + 1)
  const slash = rel.lastIndexOf('/')
  if (slash === -1) return undefined
  const dir = rel.slice(0, slash)
  if (!dir || dir === VAULT_DIR || dir.startsWith(`${VAULT_DIR}/`)) return undefined
  return dir
}

function metaFromContent(path: string, content: string, mtime: number): DocMeta {
  const fm = parseFrontmatter(content) as Record<string, string>
  const title = fm.title || path.split('/').pop()?.replace(/\.md$/i, '') || '未命名文档'
  return {
    id: path,
    title,
    mode: fm.mode === 'slide' ? 'slide' : 'document',
    themeId: fm.theme || 'azure',
    updatedAt: new Date(mtime).toISOString(),
    folder: folderFromPath(path),
  }
}

// 把文档（含其版本快照）从 oldPath 迁到 targetPath 所在位置并写入新内容。
// 目标与源相同 → 原地写；否则去重命名、搬迁快照、删除旧文件。返回最终绝对路径。
async function relocate(oldPath: string, targetPath: string, content: string): Promise<string> {
  const fs = await loadFs()
  const dir = targetPath.slice(0, targetPath.lastIndexOf('/'))
  if (dir) await fs.mkdir(dir, { recursive: true }).catch(() => {})
  const finalPath = targetPath === oldPath ? oldPath : await uniquePath(targetPath)
  await writeFile(finalPath, content)
  if (finalPath !== oldPath) {
    // 搬迁版本快照 <old>.vN.md → <final>.vN.md
    try {
      const versions = await fsVault.versions(oldPath)
      for (const v of versions) {
        await writeFile(`${finalPath}.v${v.versionNo}.md`, v.contentMarkdown)
        await fs.remove(v.id).catch(() => {})
      }
    } catch { /* 忽略快照搬迁失败 */ }
    await fs.remove(oldPath).catch(() => {})
  }
  return finalPath
}

// 若目标路径已存在，追加序号避免覆盖（untitled.md → untitled-2.md）
async function uniquePath(path: string): Promise<string> {
  if (!isTauri()) return path
  const fs = await loadFs()
  let candidate = path
  let n = 2
  // 最多探测 50 次，避免极端死循环
  for (let i = 0; i < 50; i++) {
    try {
      const exists = await fs.exists(candidate)
      if (!exists) return candidate
    } catch {
      return candidate
    }
    candidate = path.replace(/\.md$/i, `-${n}.md`)
    n++
  }
  return candidate
}

// fsVault DocBackend 实现
export const fsVault = {
  async list(): Promise<DocMeta[]> {
    if (!isTauri()) return localDocuments.list()
    const workDir = getWorkDir()
    if (!workDir) return []
    const files = await scanDir(workDir)
    const metas: DocMeta[] = []
    for (const path of files) {
      // 跳过内部目录与版本快照文件（xxx.v3.md）
      if (path.includes(`/${VAULT_DIR}/`)) continue
      if (/\.v\d+\.md$/i.test(path)) continue
      try {
        const content = await readFile(path)
        const meta = metaFromContent(path, content, await getFileModified(path))
        metas.push(meta)
      } catch {
        // 读不出的文件跳过，不影响其余文档
      }
    }
    return metas.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  },

  async get(id: string): Promise<DocFull> {
    if (!isTauri()) return localDocuments.get(id)
    const content = await readFile(id)
    const meta = metaFromContent(id, content, await getFileModified(id))
    return { ...meta, contentMarkdown: content }
  },

  async create(d: Partial<DocFull>): Promise<DocFull> {
    if (!isTauri()) return localDocuments.create(d)
    const title = d.title || '未命名文档'
    // 内容已自带 frontmatter（标题为唯一事实来源）→ 原样写；否则合成最小 frontmatter
    const content = d.contentMarkdown ?? `---\ntitle: ${title}\n---\n\n`
    const fileName = titleToPath(title)
    const workDir = getWorkDir()
    // 指定文件夹 → 落到工作目录下的同名子目录
    const dir = workDir ? (d.folder ? `${workDir}/${d.folder}` : workDir) : ''
    if (dir && d.folder) {
      const fs = await loadFs()
      await fs.mkdir(dir, { recursive: true }).catch(() => {})
    }
    const basePath = dir ? `${dir}/${fileName}` : fileName
    const path = await uniquePath(basePath)
    await writeFile(path, content)
    const meta = metaFromContent(path, content, await getFileModified(path))
    return { ...meta, contentMarkdown: content }
  },

  async update(id: string, d: Partial<DocFull>): Promise<DocFull> {
    if (!isTauri()) return localDocuments.update(id, d)
    // 文件夹变更 → 把文件搬到对应子目录（id 即路径，会随之改变）
    if (d.folder !== undefined && (d.folder || undefined) !== folderFromPath(id)) {
      const wd = getWorkDir()
      const base = id.slice(id.lastIndexOf('/') + 1)
      const targetDir = wd ? (d.folder ? `${wd}/${d.folder}` : wd) : ''
      const content = d.contentMarkdown ?? await readFile(id)
      const path = await relocate(id, targetDir ? `${targetDir}/${base}` : base, content)
      return this.get(path)
    }
    if (d.contentMarkdown !== undefined) {
      await writeFile(id, d.contentMarkdown)
    }
    return this.get(id)
  },

  // 重命名：按新标题改文件名（同目录），搬迁快照。返回新 DocFull（id 路径已变）。
  // 仅在显式重命名时调用——不走内容自动保存热路径，保持编辑期间 id 稳定。
  async rename(id: string, title: string, content: string): Promise<DocFull> {
    if (!isTauri()) return localDocuments.update(id, { title, contentMarkdown: content })
    const dir = id.slice(0, id.lastIndexOf('/'))
    const fileName = titleToPath(title)
    const path = await relocate(id, dir ? `${dir}/${fileName}` : fileName, content)
    return this.get(path)
  },

  async remove(id: string): Promise<unknown> {
    if (!isTauri()) return localDocuments.remove(id)
    const fs = await loadFs()
    await fs.remove(id)
    // 删除版本快照
    try {
      const versions = await this.versions(id)
      for (const v of versions) {
        const vPath = `${id}.v${v.versionNo}.md`
        await fs.remove(vPath).catch(() => {})
      }
    } catch {
      // 忽略
    }
  },

  async snapshot(id: string): Promise<DocVersion> {
    if (!isTauri()) return localDocuments.snapshot(id)
    const content = await readFile(id)
    const versions = await this.versions(id)
    const versionNo = (versions[0]?.versionNo ?? 0) + 1
    const vPath = `${id}.v${versionNo}.md`
    await writeFile(vPath, content)
    return {
      id: vPath,
      versionNo,
      contentMarkdown: content,
      createdAt: new Date().toISOString(),
    }
  },

  async versions(id: string): Promise<DocVersion[]> {
    if (!isTauri()) return localDocuments.versions(id)
    const fs = await loadFs()
    const dir = id.substring(0, id.lastIndexOf('/'))
    const base = id.substring(id.lastIndexOf('/') + 1)
    try {
      const entries = await fs.readDir(dir)
      const versions: DocVersion[] = []
      for (const entry of entries) {
        const match = entry.name?.match(new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.v(\\d+)\\.md$`))
        if (match) {
          const vPath = `${dir}/${entry.name}`
          const content = await readFile(vPath)
          versions.push({
            id: vPath,
            versionNo: parseInt(match[1]),
            contentMarkdown: content,
            createdAt: new Date().toISOString(),
          })
        }
      }
      return versions.sort((a, b) => b.versionNo - a.versionNo)
    } catch {
      return []
    }
  },

  async restore(id: string, versionNo: number): Promise<DocFull> {
    if (!isTauri()) return localDocuments.restore(id, versionNo)
    const versions = await this.versions(id)
    const version = versions.find(v => v.versionNo === versionNo)
    if (!version) throw new Error('version not found')
    await writeFile(id, version.contentMarkdown)
    return this.get(id)
  },
}
