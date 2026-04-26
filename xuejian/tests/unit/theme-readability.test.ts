import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { appThemes, resolveAppTheme } from '@/design-system/themes'
import type { AppThemeId } from '@/types'

const KEY_SOURCES = [
  'src/features/dashboard/HomePage.tsx',
  'src/features/review/ReviewPage.tsx',
  'src/features/documents/ReaderPage.tsx',
  'src/features/documents/LibraryPage.tsx',
  'src/features/settings/SettingsPage.tsx',
  'src/components/shell/AppShell.tsx',
  'src/components/learning/FlipCard.tsx',
  'src/components/learning/RatingBar.tsx',
]

function readSource(relPath: string): string {
  return readFileSync(resolve(__dirname, '../../', relPath), 'utf-8')
}

const HARDCODED_COLOUR_PATTERN =
  /\b(?:bg-white|text-white|bg-black|text-black|(?:bg|text|border)-(?:red|orange|amber|emerald|rose|blue|green|purple|teal|cyan|violet|fuchsia|lime|yellow|stone|zinc|slate|neutral|gray|grey)-\d{2,3}|(?:bg|text)-(?:surface|on-surface|primary|secondary|tertiary|on-primary|on-secondary|on-tertiary)(?:-[a-z]+)*)\b/

describe('key pages use theme tokens, no hardcoded colours', () => {
  it.each(KEY_SOURCES)('%s has no hardcoded colour classes', (sourcePath) => {
    const src = readSource(sourcePath)
    const lines = src.split('\n')
    const violations: string[] = []

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      if (/^\s*(\/\/|\/\*|\*|import\s)/.test(line)) continue
      const match = HARDCODED_COLOUR_PATTERN.exec(line)
      if (match) {
        violations.push(`L${index + 1}: ${match[0]} => ${line.trim().slice(0, 90)}`)
      }
    }

    expect(
      violations,
      `${sourcePath} contains hardcoded colour classes:\n${violations.join('\n')}`
    ).toHaveLength(0)
  })

  it('ships a single official theme with a stable CSS variable set', () => {
    const themeIds = Object.keys(appThemes) as AppThemeId[]
    expect(themeIds).toEqual(['default'])

    const baseVars = Object.keys(appThemes.default.cssVariables).sort()
    for (const id of themeIds) {
      const vars = Object.keys(appThemes[id].cssVariables).sort()
      expect(vars, `theme "${id}" has mismatched variables`).toEqual(baseVars)
    }
  })

  it('every theme can be resolved without error', () => {
    const themeIds = Object.keys(appThemes) as AppThemeId[]
    for (const id of themeIds) {
      const theme = resolveAppTheme(id)
      expect(theme.id).toBe(id)
      expect(theme.label.length).toBeGreaterThan(0)
    }
  })

  it('official paper theme keeps a readable ink-on-paper contrast baseline', () => {
    const theme = appThemes.default
    const inkParts = theme.cssVariables['--ink'].split(' ').map(Number)
    const paperParts = theme.cssVariables['--paper-base'].split(' ').map(Number)

    expect(inkParts.every((value) => value <= 60)).toBe(true)
    expect(paperParts.every((value) => value >= 230)).toBe(true)
  })
})
