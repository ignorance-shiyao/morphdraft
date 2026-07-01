import { describe, it, expect, beforeEach } from 'vitest'
import { folderFromPath } from '../fsVault'
import { setWorkDir } from '../vaultPath'

describe('folderFromPath：从绝对路径派生文件夹', () => {
  beforeEach(() => setWorkDir('/home/u/vault'))

  it('根目录文件 → undefined', () => {
    expect(folderFromPath('/home/u/vault/note.md')).toBeUndefined()
  })

  it('一级子目录 → 文件夹名', () => {
    expect(folderFromPath('/home/u/vault/work/note.md')).toBe('work')
  })

  it('多级子目录 → 相对目录路径', () => {
    expect(folderFromPath('/home/u/vault/work/2026/note.md')).toBe('work/2026')
  })

  it('内部目录 .morphdraft → undefined（不当作文件夹）', () => {
    expect(folderFromPath('/home/u/vault/.morphdraft/assets/x.png')).toBeUndefined()
  })

  it('工作目录外的路径 → undefined', () => {
    expect(folderFromPath('/other/place/note.md')).toBeUndefined()
  })

  it('未设置工作目录 → undefined', () => {
    setWorkDir('')
    expect(folderFromPath('/home/u/vault/work/note.md')).toBeUndefined()
  })
})
