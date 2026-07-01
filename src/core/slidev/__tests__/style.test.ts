import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { SLIDEV_GALLERY_THEME_IDS } from '../themes'

describe('Slidev 视觉系统', () => {
  it('包含续页、页码、表面 token 与标题装饰', () => {
    const css = readFileSync(new URL('../../../styles/slidevThemes.css', import.meta.url), 'utf8')
    expect(css).toContain('.slide-surface[data-autopage]')
    expect(css).toContain('counter-increment: slidev-page')
    expect(css).toContain('--sd-panel')
    expect(css).toContain('--sd-deck-title')
    expect(css).toContain('.slidev-has-title')
    expect(css).not.toContain('MORPHDRAFT / DECK')
  })

  it('每个官方画廊主题都有独立视觉选择器', () => {
    const css = readFileSync(new URL('../../../styles/slidevThemes.css', import.meta.url), 'utf8')
    for (const id of SLIDEV_GALLERY_THEME_IDS) {
      expect(css, `缺少主题样式: ${id}`).toContain(`.slidev-theme-${id}`)
    }
  })
})
