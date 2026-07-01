import { describe, it, expect, vi, beforeEach } from 'vitest'

// B0-2 零回归测试：资产读写从 assets.ts 的 isVaultMode() 二分重构为 AssetStore 分发后，
// 对 local / vault 两种模式的输入输出必须与改前逐字节一致。这里 mock 掉 fs 与 IndexedDB，
// 断言「走哪条分支、返回什么形状」与重构前完全相同。

// vi.mock 工厂会被提升到文件顶部，故 mock 对象需经 vi.hoisted 一并提升后再引用。
const h = vi.hoisted(() => {
  const ld = {
    saveAsset: vi.fn(async () => 'asset-idb-1'),
    getAsset: vi.fn(async () => new Blob(['idb'], { type: 'image/png' })),
    listAssetIds: vi.fn(async () => ['asset-idb-1']),
    deleteAsset: vi.fn(async () => {}),
  }
  const fs = {
    mkdir: vi.fn(async () => {}),
    writeFile: vi.fn(async () => {}),
    exists: vi.fn(async () => true),
    readFile: vi.fn(async () => new Uint8Array([0x48, 0x69])),
    readDir: vi.fn(async () => [
      { name: 'asset-x.png', isDirectory: false },
      { name: 'sub', isDirectory: true },
    ]),
    remove: vi.fn(async () => {}),
  }
  return { state: { vault: false }, ld, fs }
})
const { ld, fs } = h

vi.mock('../vaultPath', () => ({
  isVaultMode: () => h.state.vault,
  getWorkDir: () => '/work',
  isTauri: () => h.state.vault,
  setWorkDir: () => {},
}))
vi.mock('../localDocuments', () => ({ localDocuments: h.ld }))
vi.mock('../fsUtil', () => ({ loadFs: async () => h.fs }))

import { saveAsset, getAssetBlob, listAllAssetIds, deleteAsset } from '../assets'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('资产抽象 · local（非 vault）模式', () => {
  beforeEach(() => { h.state.vault = false })

  it('saveAsset 走 IndexedDB，返回 asset://<裸 id>', async () => {
    const url = await saveAsset(new Blob(['x'], { type: 'image/png' }), 'image/png')
    expect(url).toBe('asset://asset-idb-1')
    expect(ld.saveAsset).toHaveBeenCalledTimes(1)
    expect(fs.writeFile).not.toHaveBeenCalled()
  })

  it('saveAsset mime 缺省回落 image/png', async () => {
    await saveAsset(new Blob([''], { type: '' }), '')
    expect(ld.saveAsset).toHaveBeenCalledWith(expect.any(Blob), 'image/png')
  })

  it('getAssetBlob 委托 localDocuments.getAsset', async () => {
    const blob = await getAssetBlob('asset-idb-1')
    expect(ld.getAsset).toHaveBeenCalledWith('asset-idb-1')
    expect(blob?.type).toBe('image/png')
    expect(fs.readFile).not.toHaveBeenCalled()
  })

  it('listAllAssetIds 走 IndexedDB 主键', async () => {
    expect(await listAllAssetIds()).toEqual(['asset-idb-1'])
    expect(fs.readDir).not.toHaveBeenCalled()
  })

  it('deleteAsset 走 IndexedDB', async () => {
    await deleteAsset('asset-idb-1')
    expect(ld.deleteAsset).toHaveBeenCalledWith('asset-idb-1')
    expect(fs.remove).not.toHaveBeenCalled()
  })
})

describe('资产抽象 · vault 模式', () => {
  beforeEach(() => { h.state.vault = true })

  it('saveAsset 落盘，返回 asset://asset-*.<ext>，不走 IndexedDB', async () => {
    const url = await saveAsset(new Blob(['x'], { type: 'image/jpeg' }), 'image/jpeg')
    expect(url).toMatch(/^asset:\/\/asset-[0-9a-f-]+\.jpg$/)
    expect(fs.writeFile).toHaveBeenCalledTimes(1)
    expect(ld.saveAsset).not.toHaveBeenCalled()
  })

  it('saveAsset 落盘失败 → 回落 IndexedDB', async () => {
    fs.writeFile.mockRejectedValueOnce(new Error('disk full'))
    const url = await saveAsset(new Blob(['x'], { type: 'image/png' }), 'image/png')
    expect(url).toBe('asset://asset-idb-1')
    expect(ld.saveAsset).toHaveBeenCalledTimes(1)
  })

  it('getAssetBlob 命中磁盘（id 含扩展名）→ 读盘还原 mime', async () => {
    const blob = await getAssetBlob('asset-x.png')
    expect(fs.readFile).toHaveBeenCalledWith('/work/.morphdraft/assets/asset-x.png')
    expect(blob?.type).toBe('image/png')
    expect(ld.getAsset).not.toHaveBeenCalled()
  })

  it('getAssetBlob 磁盘未命中 → 回落 IndexedDB', async () => {
    fs.exists.mockResolvedValueOnce(false)
    const blob = await getAssetBlob('asset-x.png')
    expect(ld.getAsset).toHaveBeenCalledWith('asset-x.png')
    expect(blob?.type).toBe('image/png')
  })

  it('getAssetBlob 无扩展名 id（历史资产）→ 直接走 IndexedDB', async () => {
    await getAssetBlob('asset-no-ext')
    expect(fs.readFile).not.toHaveBeenCalled()
    expect(ld.getAsset).toHaveBeenCalledWith('asset-no-ext')
  })

  it('listAllAssetIds 读 assets 目录，过滤子目录', async () => {
    expect(await listAllAssetIds()).toEqual(['asset-x.png'])
  })

  it('deleteAsset 删磁盘文件（命中即返回，不碰 IndexedDB）', async () => {
    await deleteAsset('asset-x.png')
    expect(fs.remove).toHaveBeenCalledWith('/work/.morphdraft/assets/asset-x.png')
    expect(ld.deleteAsset).not.toHaveBeenCalled()
  })

  it('deleteAsset 磁盘无此文件 → 回落 IndexedDB', async () => {
    fs.exists.mockResolvedValueOnce(false)
    await deleteAsset('asset-x.png')
    expect(ld.deleteAsset).toHaveBeenCalledWith('asset-x.png')
  })
})
