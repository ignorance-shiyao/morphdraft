import { describe, expect, it } from 'vitest'
import { SLIDEV_GALLERY_THEME_IDS, SLIDEV_THEMES, slidevThemeChartTokens } from '../themes'

const OFFICIAL_GALLERY_IDS = [
  'default',
  'seriph',
  'apple-basic',
  'bricks',
  'shibainu',
  'geist',
  'light-icons',
  'eloc',
  'purplin',
  'unicorn',
  'zhozhoba',
  'penguin',
  'vuetiful',
  'takahashi',
  'academic',
  'mokkapps',
  'the-unnamed',
  'dracula',
  'frankfurt',
  'hep',
  'excali-slide',
  'mint',
  'neversink',
  'ktym4a',
  'nord',
  'scholarly',
  'field-manual',
  'touying',
] as const

describe('Slidev 官方主题画廊', () => {
  it('完整注册当前画廊的 28 个主题', () => {
    expect(SLIDEV_GALLERY_THEME_IDS).toEqual(OFFICIAL_GALLERY_IDS)
    expect(new Set(SLIDEV_GALLERY_THEME_IDS).size).toBe(28)
  })

  it('每个画廊主题都有来源、作者、视觉风格和完整 tokens', () => {
    for (const id of OFFICIAL_GALLERY_IDS) {
      const theme = SLIDEV_THEMES.find((item) => item.id === id)
      expect(theme, `缺少主题 ${id}`).toBeTruthy()
      expect(theme?.sourcePackage).toBeTruthy()
      expect(theme?.sourceUrl).toMatch(/^https:\/\//)
      expect(theme?.author).toBeTruthy()
      expect(theme?.visualStyle).toBeTruthy()
      expect(theme?.bg).toMatch(/^#|^rgb|^hsl/)
      expect(theme?.fg).toMatch(/^#|^rgb|^hsl/)
      expect(theme?.primary).toMatch(/^#|^rgb|^hsl/)
    }
  })

  it('图表 tokens 跟随 Slidev 主题，而不是沿用应用主题', () => {
    const dracula = SLIDEV_THEMES.find((item) => item.id === 'dracula')!
    const tokens = slidevThemeChartTokens(dracula)
    expect(tokens.id).toBe('slidev-dracula')
    expect(tokens.dark).toBe(true)
    expect(tokens.primaryColor).toBe(dracula.primary)
    expect(tokens.bg).toBe(dracula.bg)
    expect(tokens.fg).toBe(dracula.fg)
    expect(tokens.fontFamily).toBe(dracula.fontFamily)
    expect(tokens.headingFamily).toBe(dracula.headingFamily)
  })
})
