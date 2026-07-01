export type FontKind = 'body' | 'heading' | 'code'

export interface FontOption {
    value: string
    label: string
    css: string
    kinds: FontKind[]
}

export const FONT_STORAGE_KEYS: Record<FontKind, string> = {
    body: 'mddoc:font-body',
    heading: 'mddoc:font-heading',
    code: 'mddoc:font-code',
}

const THEME_FONT: Record<FontKind, string> = {
    body: 'var(--theme-font-family)',
    heading: 'var(--theme-heading-family)',
    code: 'var(--theme-font-family-mono)',
}

export const BUILTIN_FONTS: FontOption[] = [
    {value: 'theme', label: '跟随当前主题', css: '', kinds: ['body', 'heading', 'code']},
    {
        value: 'inter',
        label: 'Inter',
        css: '"Inter", "Noto Sans SC", "PingFang SC", system-ui, sans-serif',
        kinds: ['body', 'heading'],
    },
    {
        value: 'lxgw-wenkai',
        label: '霞鹜文楷',
        css: '"LXGW WenKai", "霞鹜文楷", "STKaiti", "KaiTi", serif',
        kinds: ['body', 'heading'],
    },
    {
        value: 'lora',
        label: 'Lora',
        css: '"Lora", "Noto Serif SC", "Songti SC", serif',
        kinds: ['body', 'heading'],
    },
    {
        value: 'jetbrains-mono',
        label: 'JetBrains Mono',
        css: '"JetBrains Mono", "SFMono-Regular", Consolas, Menlo, monospace',
        kinds: ['code'],
    },
]

export function fontCssValue(kind: FontKind, value: string): string {
    if (value === 'theme') return THEME_FONT[kind]
    if (value.startsWith('system:')) {
        const family = value.slice('system:'.length).replace(/"/g, '\\"')
        return `"${family}", ${kind === 'code' ? 'monospace' : 'sans-serif'}`
    }
    return BUILTIN_FONTS.find((font) => font.value === value && font.kinds.includes(kind))?.css
        ?? THEME_FONT[kind]
}

export function fontOptionsForKind(kind: FontKind, systemFonts: string[]): FontOption[] {
    const builtins = BUILTIN_FONTS.filter((font) => font.kinds.includes(kind))
    const system = systemFonts.map((family) => ({
        value: `system:${family}`,
        label: family,
        css: `"${family}"`,
        kinds: [kind],
    }))
    return [...builtins, ...system]
}

export function applyFontPreferences(
    style: CSSStyleDeclaration,
    preferences: Record<FontKind, string>,
): void {
    style.setProperty('--font-family', fontCssValue('body', preferences.body))
    style.setProperty('--heading-family', fontCssValue('heading', preferences.heading))
    style.setProperty('--font-family-mono', fontCssValue('code', preferences.code))
}

export async function discoverSystemFonts(): Promise<string[]> {
    const query = (window as Window & {
        queryLocalFonts?: () => Promise<Array<{ family: string }>>
    }).queryLocalFonts
    if (query) {
        const fonts = await query()
        return [...new Set(fonts.map((font) => font.family).filter(Boolean))].sort((a, b) => a.localeCompare(b))
    }

    const candidates = [
        'Arial', 'Helvetica Neue', 'Times New Roman', 'Georgia', 'Courier New',
        'PingFang SC', 'Microsoft YaHei', 'Songti SC', 'STKaiti', 'Menlo',
    ]
    return candidates.filter((family) => document.fonts?.check(`12px "${family}"`))
}
