import type { DocMeta, DocFull, DocVersion } from './docTypes'
import { localDocuments } from './localDocuments'
import { fsVault } from './fsVault'

// 文档后端统一接口：本地(IndexedDB) 与 桌面 vault(本地文件) 都实现这组方法。
export interface DocBackend {
  list(): Promise<DocMeta[]>
  get(id: string): Promise<DocFull>
  create(d: Partial<DocFull>): Promise<DocFull>
  update(id: string, d: Partial<DocFull>): Promise<DocFull>
  // 可选：显式重命名（vault 会据此 rename 磁盘文件并改变 id；其余后端等价于改标题）
  rename?(id: string, title: string, contentMarkdown: string): Promise<DocFull>
  remove(id: string): Promise<unknown>
  snapshot(id: string): Promise<DocVersion>
  versions(id: string): Promise<DocVersion[]>
  restore(id: string, no: number): Promise<DocFull>
}

export type BackendKind = 'local' | 'vault'

export function pickBackend(kind: BackendKind): DocBackend {
  return kind === 'vault' ? (fsVault as DocBackend) : (localDocuments as DocBackend)
}
