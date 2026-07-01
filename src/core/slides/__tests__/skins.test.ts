import { describe, expect, it } from 'vitest'
import { appShellClassForSkin, findSkin } from '../skins'

describe('幻灯片皮肤', () => {
  it('提供常规皮肤 token', () => {
    expect(findSkin('glass')).toMatchObject({ id: 'glass', name: '毛玻璃', dark: true })
  })

  it('不再为皮肤启用应用外壳', () => {
    expect(appShellClassForSkin('glass')).toBe('')
    expect(appShellClassForSkin('none')).toBe('')
    expect(appShellClassForSkin(null)).toBe('')
  })
})
