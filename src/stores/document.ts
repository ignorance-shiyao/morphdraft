import { defineStore } from 'pinia'
import type { DocMeta } from '../core/docTypes'
import { localDocuments, type LocalDocumentsBackup } from '../core/localDocuments'
import { pickBackend, type BackendKind } from '../core/docBackend'
import { useSettingsStore } from './settings'
import { parseFrontmatter } from '../core/markdown'
import { getString, setString } from '../core/localStore'
import { vaultSelfWrite } from '../core/fileEvents'
import { buildIndex, type DocInput } from '../core/workspace'
import {
  buildRenamePlan,
  executeRenamePlan,
  setFrontmatterTitle,
  type WorkspaceRenamePlan,
} from '../core/workspace/rename'
import { translate } from '../i18n'
// 默认文档 = 全语法示例（samples/full-syntax.md，含全语法/代码/图表）
import SAMPLE from '../../samples/full-syntax.md?raw'

const STORAGE_KEY = 'mddoc:current'
const FOLDERS_KEY = 'mddoc:folders'
const SAMPLE_FOLDER = 'samples'
const SAMPLE_SEED_FLAG = 'mddoc:samples-seeded-v4'

const SAMPLE_MODULES = import.meta.glob('../../samples/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

const DEFAULT_SAMPLE_DOCS = Object.entries(SAMPLE_MODULES)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, contentMarkdown]) => ({
    title: path.split('/').pop()?.replace(/\.md$/, '') ?? 'sample',
    contentMarkdown,
  }))

export interface DocSearchHit {
  docId: string
  title: string
  line: number // 绝对行（0 基，含 frontmatter）
  snippet: string
}


function load(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? SAMPLE
  } catch {
    return SAMPLE
  }
}

function loadFolders(): string[] {
  try {
    const parsed = JSON.parse(getString(FOLDERS_KEY, '[]')) as unknown
    return Array.isArray(parsed)
      ? [...new Set(parsed.filter((v): v is string => typeof v === 'string').map((v) => v.trim()).filter(Boolean))]
      : []
  } catch {
    return []
  }
}

function saveFolders(folders: string[]) {
  setString(FOLDERS_KEY, JSON.stringify(folders))
}

function deriveTitle(md: string): string {
  const fm = parseFrontmatter(md)
  if (fm.title) return fm.title
  const body = md.replace(/^---[\s\S]*?---/, '')
  const h = /^#{1,3}\s+(.+)$/m.exec(body)
  if (h) return h[1].trim()
  // 回退：用「首个非空行文本」自动命名（去掉标题/引用/列表等块前缀），不再一直停留在「未命名」
  for (const raw of body.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const text = line.replace(/^(?:#{1,6}\s+|>\s?|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)/, '').trim()
    if (text) return text.slice(0, 60)
  }
  return translate('documentStore.untitled')
}

let saveTimer: number | undefined
let autoSnapshotTimer: number | undefined
const AUTO_SNAPSHOT_INTERVAL = 5 * 60 * 1000

export const useDocumentStore = defineStore('document', {
  state: () => ({
    markdown: load(),
    title: translate('documentStore.untitled'),
    backendOn: true, // 文档库是否就绪
    backendChecking: false,
    backendError: '',
    backendKind: 'local' as BackendKind, // 数据后端：local=浏览器 IndexedDB / vault=本地文件夹
    currentId: null as string | null,
    list: [] as DocMeta[],
    folders: loadFolders(),
    saving: false, // 是否正在防抖保存中
    // R0b-1：当前文件被外部修改时的非阻塞冲突提示（diskContent 留作「采用外部版本」用）
    externalConflict: null as { path: string; diskContent: string } | null,
  }),
  getters: {
    backend: (state) => pickBackend(state.backendKind),
    backendLabel: (state) => (state.backendKind === 'vault' ? translate('savePopover.storageLocal') : translate('savePopover.storageBuiltin')),
  },
  actions: {
    // 启动：纯本地。桌面端有工作目录时用 vault(本地文件)，否则用浏览器 IndexedDB。
    async init() {
      if (this.backendChecking) return
      this.backendChecking = true
      this.backendError = ''
      try {
        const settings = useSettingsStore()
        // 桌面端有工作目录时使用 vault 后端
        if (settings.isTauri && settings.workDir) {
          this.backendKind = 'vault'
          // 把工作目录注入共享状态（fsVault 文档读写 + assets 图片落盘据此），避免反依赖 store
          const { setWorkDir } = await import('../core/vaultPath')
          setWorkDir(settings.workDir)
        } else {
          this.backendKind = 'local'
        }

        const be = this.backend
        this.backendOn = true
        this.list = await be.list()

        // 默认样例：一次性种入 samples 文件夹（按标题去重 + localStorage 标记）。
        // 种入后写标记，后续用户删除样例也不会每次启动恢复。
        let seededSampleId: string | null = null
        const hadDocsBeforeSamples = this.list.length > 0
        if (!getString(SAMPLE_SEED_FLAG, '')) {
          this.createFolder(SAMPLE_FOLDER)
          for (const sample of DEFAULT_SAMPLE_DOCS) {
            const title = deriveTitle(sample.contentMarkdown) || sample.title
            const existing = this.list.find((d) => d.title === title)
            if (existing) {
              if (existing.folder !== SAMPLE_FOLDER) await be.update(existing.id, { folder: SAMPLE_FOLDER })
              await be.update(existing.id, { contentMarkdown: sample.contentMarkdown })
              continue
            }
            const created = await be.create({
              title,
              contentMarkdown: sample.contentMarkdown,
              folder: SAMPLE_FOLDER,
            })
            if (!seededSampleId) seededSampleId = created.id
          }
          this.list = await be.list()
          setString(SAMPLE_SEED_FLAG, '1')
        }

        if (seededSampleId && !hadDocsBeforeSamples) {
          await this.open(seededSampleId) // 首次种入示例 → 打开它
        } else if (this.list.length === 0) {
          const created = await be.create({
            title: deriveTitle(this.markdown),
            contentMarkdown: this.markdown,
          })
          this.list = await be.list()
          this.applyOpened(created.id, created.contentMarkdown)
        } else {
          await this.open(this.list[0].id) // 列表按 updatedAt 倒序，取最近
        }
      } catch (e) {
        this.backendOn = false
        this.currentId = null
        this.list = []
        this.title = deriveTitle(this.markdown)
        this.backendError = e instanceof Error ? e.message : String(e)
      } finally {
        this.backendChecking = false
      }
    },

    // 设置变更后切换后端并重新加载
    async reload() {
      this.backendChecking = false
      await this.init()
    },

    applyOpened(id: string, md: string) {
      this.currentId = id
      this.markdown = md
      this.title = deriveTitle(md)
    },

    async open(id: string) {
      if (!this.backendOn) return
      const doc = await this.backend.get(id)
      this.applyOpened(doc.id, doc.contentMarkdown)
    },

    // M8-1: Word 导入
    async importWordFile(file: File) {
      const { importWord } = await import('../core/import/docx')
      const result = await importWord(file)
      if (this.backendOn) {
        const created = await this.backend.create({ title: result.title, contentMarkdown: result.markdown })
        this.list = await this.backend.list()
        this.applyOpened(created.id, created.contentMarkdown)
      } else {
        this.markdown = result.markdown
        this.title = result.title
      }
      return result
    },

    // 统一「打开本地文档」：md 直开 / 其他格式转 Markdown 后建文档并打开
    async importLocalDocument(
      src: import('../core/import/local').LocalSource,
      options: {
        open?: boolean
        onProgress?: (info: import('../core/import/types').ImportProgressInfo) => void
      } = {},
    ) {
      const { convertToMarkdown } = await import('../core/import/local')
      options.onProgress?.({ stage: 'reading' })
      const result = await convertToMarkdown(src, (info) => {
        options.onProgress?.({ stage: info.stage, detail: info.detail })
      })
      options.onProgress?.({ stage: 'saving', detail: result.via })
      // 兜底：任何转换器残留的内联 base64 图片转存为 asset://（避免源码膨胀）
      const { externalizeDataImages } = await import('../core/markdown/externalizeImages')
      result.markdown = await externalizeDataImages(result.markdown)
      const shouldOpen = options.open !== false
      if (this.backendOn) {
        const created = await this.backend.create({ title: result.title, contentMarkdown: result.markdown })
        this.list = await this.backend.list()
        if (shouldOpen) this.applyOpened(created.id, created.contentMarkdown)
        return { ...result, id: created.id }
      } else {
        this.markdown = result.markdown
        this.title = result.title
        return { ...result, id: this.currentId }
      }
    },

    // M8-2: Notion zip 导入
    async importNotionZip(file: File) {
      const { importNotionZip } = await import('../core/import/notion')
      const result = await importNotionZip(file)
      let imported = 0
      for (const f of result.files) {
        if (f.content && !f.name.endsWith('/')) {
          await this.backend.create({ title: f.name, contentMarkdown: f.content })
          imported++
        }
      }
      this.list = await this.backend.list()
      return { imported, total: result.totalCount }
    },

    async newDoc(templateId?: string, folder?: string) {
      if (!this.backendOn) return
      const { getTemplateById } = await import('../core/templates')
      const template = templateId ? getTemplateById(templateId) : null
      const content = template?.content || translate('documentStore.newDocMarkdown')
      const title = template?.name || translate('documentStore.untitled')
      const targetFolder = folder?.trim()
      if (targetFolder) this.createFolder(targetFolder)
      const created = await this.backend.create({ title, contentMarkdown: content, folder: targetFolder || undefined })
      this.list = await this.backend.list()
      this.applyOpened(created.id, created.contentMarkdown)
    },

    async removeDoc(id: string) {
      if (!this.backendOn) return
      await this.backend.remove(id)
      this.list = await this.backend.list()
      if (this.currentId === id) {
        if (this.list.length) await this.open(this.list[0].id)
        else await this.newDoc()
      }
    },

    // 设置文档标签
    async setDocTags(id: string, tags: string[]) {
      if (!this.backendOn) return
      await this.backend.update(id, { tags })
      this.list = await this.backend.list()
    },

    // 设置文档所属文件夹（'' / undefined = 未分类）
    async setDocFolder(id: string, folder: string | undefined) {
      if (!this.backendOn) return
      const targetFolder = folder?.trim()
      if (targetFolder) this.createFolder(targetFolder)
      // vault 后端会把文件搬到子目录，id（=路径）随之改变 → 同步当前打开的文档 id
      const updated = await this.backend.update(id, { folder: targetFolder || undefined })
      if (this.currentId === id) this.currentId = updated.id
      this.list = await this.backend.list()
    },

    createFolder(name: string) {
      const folder = name.trim()
      if (!folder) return
      if (this.folders.includes(folder)) return
      this.folders = [...this.folders, folder]
      saveFolders(this.folders)
    },

    async snapshot() {
      if (this.backendOn && this.currentId) await this.backend.snapshot(this.currentId)
    },

    startAutoSnapshot() {
      this.stopAutoSnapshot()
      autoSnapshotTimer = window.setInterval(() => {
        this.snapshot()
      }, AUTO_SNAPSHOT_INTERVAL)
    },

    stopAutoSnapshot() {
      if (autoSnapshotTimer) {
        window.clearInterval(autoSnapshotTimer)
        autoSnapshotTimer = undefined
      }
    },

    async listVersions() {
      if (!this.backendOn || !this.currentId) return []
      return this.backend.versions(this.currentId)
    },

    async restoreVersion(no: number) {
      if (!this.backendOn || !this.currentId) return
      const doc = await this.backend.restore(this.currentId, no)
      this.applyOpened(doc.id, doc.contentMarkdown)
    },

    // 全库搜索：跨所有文档标题 + 正文逐行匹配（当前文档用内存中未保存内容）。
    async searchAll(query: string): Promise<DocSearchHit[]> {
      const q = query.trim().toLowerCase()
      if (!q || !this.backendOn) return []
      const hits: DocSearchHit[] = []
      for (const meta of this.list) {
        let md: string
        try {
          md = meta.id === this.currentId ? this.markdown : (await this.backend.get(meta.id)).contentMarkdown
        } catch {
          continue
        }
        const lines = md.split('\n')
        let count = 0
        for (let i = 0; i < lines.length && count < 5; i++) {
          if (lines[i].toLowerCase().includes(q)) {
            hits.push({
              docId: meta.id,
              title: meta.title || translate('documentStore.untitled'),
              line: i,
              snippet: lines[i].trim().slice(0, 140) || translate('documentStore.emptyLine'),
            })
            count++
          }
        }
        if (hits.length >= 80) break
      }
      return hits
    },

    // R0b-1：仅刷新文档列表（外部新增/改名/改动其它文件时用，不动当前打开内容）。
    async refreshList() {
      if (!this.backendOn) return
      try {
        this.list = await this.backend.list()
      } catch {
        /* 列举失败时静默保留旧列表，不阻塞编辑 */
      }
    },

    // R0b-1：当前打开的文件被外部删除/改名 → 不调 open('')，改选最近文档或建空白。
    async handleCurrentFileGone() {
      this.externalConflict = null
      await this.refreshList()
      if (this.list.some((d) => d.id === this.currentId)) return // 仍在（误报）
      if (this.list.length) await this.open(this.list[0].id)
      else await this.newDoc()
    },

    // R0b-1：标记当前文件被外部修改（非阻塞，UI 给「采用外部版本/保留我的」）。
    flagExternalConflict(path: string, diskContent: string) {
      this.externalConflict = { path, diskContent }
    },

    // R0b-1：解决冲突。useExternal=采用磁盘版本（会重新落盘，等价于自身保存）。
    resolveExternalConflict(useExternal: boolean) {
      const c = this.externalConflict
      this.externalConflict = null
      if (useExternal && c) this.setMarkdown(c.diskContent)
    },

    async exportBackup() {
      return localDocuments.exportBackup()
    },

    async buildPortableExport() {
      if (!this.backendOn) throw new Error(translate('documentStore.libraryNotReady'))
      const inputs: { id: string; title: string; contentMarkdown: string }[] = []
      for (const meta of this.list) {
        const contentMarkdown = meta.id === this.currentId
          ? this.markdown
          : (await this.backend.get(meta.id)).contentMarkdown
        inputs.push({ id: meta.id, title: meta.title || translate('documentStore.untitled'), contentMarkdown })
      }
      const [{ buildPortablePackage }, { getAssetBlob }] = await Promise.all([
        import('../core/export/portable'),
        import('../core/assets'),
      ])
      return buildPortablePackage(inputs, getAssetBlob)
    },

    async importBackup(backup: LocalDocumentsBackup) {
      await localDocuments.importBackup(backup)
      this.list = await localDocuments.list()
      if (this.list.length) await this.open(this.list[0].id)
      else await this.newDoc()
    },

    async clearLocalData() {
      await localDocuments.clearAll()
      const created = await localDocuments.create({
        title: translate('documentStore.untitled'),
        contentMarkdown: translate('documentStore.newDocMarkdown'),
      })
      this.list = await localDocuments.list()
      this.applyOpened(created.id, created.contentMarkdown)
    },

    // 重命名：写入 frontmatter title。vault 后端会据此 rename 磁盘文件（id 改变）；
    // 其余后端 id 不变。显式重命名走独立路径，不复用内容自动保存热路径。
    async renameDoc(title: string) {
      const t = title.trim()
      if (!t) return
      const next = setFrontmatterTitle(this.markdown, t)
      this.markdown = next
      this.title = t
      const be = this.backend
      const targetId = this.currentId
      if (be.rename && this.backendOn && targetId) {
        window.clearTimeout(saveTimer) // 取消挂起的旧路径自动保存，避免写回旧文件
        this.saving = true
        try {
          const moved = await be.rename(targetId, t, next)
          if (this.currentId === targetId) this.currentId = moved.id
          this.list = await be.list()
        } catch {
          /* 失败时保持内存内容，不阻塞编辑 */
        } finally {
          this.saving = false
        }
      } else {
        this.setMarkdown(next)
      }
    },

    async prepareSafeRename(title: string): Promise<WorkspaceRenamePlan> {
      if (!this.backendOn || !this.currentId) throw new Error(translate('documentStore.noRenameTarget'))
      const inputs: DocInput[] = []
      for (const meta of this.list) {
        const contentMarkdown = meta.id === this.currentId
          ? this.markdown
          : (await this.backend.get(meta.id)).contentMarkdown
        inputs.push({ id: meta.id, title: meta.title, contentMarkdown })
      }
      return buildRenamePlan(buildIndex(inputs), inputs, this.currentId, title)
    },

    async executeSafeRename(plan: WorkspaceRenamePlan) {
      if (!this.backendOn || !this.currentId || this.currentId !== plan.targetId) {
        throw new Error(translate('documentStore.renameTargetChanged'))
      }
      window.clearTimeout(saveTimer)
      this.saving = true
      try {
        const result = await executeRenamePlan(plan, {
          update: async (id, markdown) => this.backend.update(id, { contentMarkdown: markdown }),
          rename: async (id, title, markdown) => {
            const renamed = this.backend.rename
              ? await this.backend.rename(id, title, markdown)
              : await this.backend.update(id, { title, contentMarkdown: markdown })
            return renamed.id
          },
        })
        this.currentId = result.targetId
        this.markdown = plan.targetAfter
        this.title = plan.newTitle
        this.list = await this.backend.list()
      } finally {
        this.saving = false
      }
    },

    // 清理未被任何文档引用的图片附件（孤儿）。扫描全部文档正文收集引用的 asset id，
    // 删除附件库中未出现的。注意：仅历史快照引用的图片也会被视为孤儿删除。
    async cleanupOrphanAssets(): Promise<{ removed: number; scanned: number }> {
      if (!this.backendOn) return { removed: 0, scanned: 0 }
      const { listAllAssetIds, deleteAsset, extractAssetIds } = await import('../core/assets')
      const referenced = new Set<string>()
      for (const meta of this.list) {
        let md: string
        try {
          md = meta.id === this.currentId ? this.markdown : (await this.backend.get(meta.id)).contentMarkdown
        } catch {
          continue
        }
        for (const id of extractAssetIds(md)) referenced.add(id)
      }
      const all = await listAllAssetIds()
      let removed = 0
      for (const id of all) {
        if (!referenced.has(id)) {
          await deleteAsset(id)
          removed++
        }
      }
      return { removed, scanned: all.length }
    },

    setMarkdown(value: string) {
      this.markdown = value
      this.title = deriveTitle(value)
      const title = this.title
      const backendOn = this.backendOn
      const targetId = this.currentId
      // 防抖持久化
      const be = this.backend
      this.saving = true
      window.clearTimeout(saveTimer)
      saveTimer = window.setTimeout(() => {
        if (backendOn && targetId) {
          be
            .update(targetId, { contentMarkdown: value, title })
            .then(() => {
              // R0b-1：vault 落盘后标记自身写入，抑制文件监听把它误报为外部冲突。
              if (this.backendKind === 'vault') vaultSelfWrite.markWrite(targetId)
              const item = this.list.find((d) => d.id === targetId)
              if (item) {
                item.title = title
                item.updatedAt = new Date().toISOString()
                this.list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
              }
            })
            .catch(() => {})
            .finally(() => {
              this.saving = false
            })
        } else {
          setString(STORAGE_KEY, value)
          this.saving = false
        }
      }, 500)
    },
  },
})
