import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { appThemes, resolveAppTheme } from '@/design-system/themes'
import type { AppThemeId } from '@/types'

/**
 * v4-2-a2: 关键界面切换后保持可读可用
 *
 * These tests verify that key page / component sources use theme tokens
 * (paper-*, ink-*, line-soft, highlight-*, shadow-*) and do NOT contain
 * hardcoded hex/rgba colours that would break under theme switching.
 */

const KEY_SOURCES = [
  'src/features/dashboard/DashboardPage.tsx',
  'src/features/review/ReviewPage.tsx',
  'src/features/documents/ReaderPage.tsx',
  'src/features/documents/LibraryPage.tsx',
  'src/features/settings/SettingsPage.tsx',
  'src/features/knowledge/KnowledgeGraphPage.tsx',
  'src/components/shell/AppShell.tsx',
  'src/components/shell/SidebarRail.tsx',
  'src/components/shell/TopBar.tsx',
  'src/components/learning/FlipCard.tsx',
  'src/components/learning/RatingBar.tsx',
]

function readSource(relPath: string): string {
  return readFileSync(resolve(__dirname, '../../', relPath), 'utf-8')
}

/**
 * Match hardcoded colour patterns that break theme switching:
 * - bg-white, text-white, bg-black, text-black (excluding bg-white/NN opacity modifiers already gone)
 * - bg-red-*, text-red-*, bg-emerald-*, bg-amber-*, bg-orange-*, bg-blue-* (semantic Tailwind colours)
 * - text-rose-*, text-emerald-*, text-amber-*
 * - bg-surface-container, text-on-surface-variant, text-primary, bg-primary-container (Material tokens)
 *
 * Allowed:
 * - Theme tokens: paper-*, ink-*, line-soft, highlight-*, shadow-*
 * - rgba()/rgb() in inline SVG or Tailwind arbitrary values referencing CSS vars
 * - Comments
 */
const HARDCODED_COLOUR_PATTERN =
  /\b(?:bg-white|text-white|bg-black|text-black|(?:bg|text|border)-(?:red|orange|amber|emerald|rose|blue|green|purple|teal|cyan|violet|fuchsia|lime|yellow|stone|zinc|slate|neutral|gray|grey)-\d{2,3}|(?:bg|text)-(?:surface|on-surface|primary|secondary|tertiary|on-primary|on-secondary|on-tertiary)(?:-[a-z]+)*)\b/

// @acceptance:v4-2-a2
describe('key pages use theme tokens, no hardcoded colours', () => {
  it.each(KEY_SOURCES)('%s has no hardcoded colour classes', (sourcePath) => {
    const src = readSource(sourcePath)
    const lines = src.split('\n')
    const violations: string[] = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      // Skip comments and import lines
      if (/^\s*(\/\/|\/\*|\*|import\s)/.test(line)) continue
      const match = HARDCODED_COLOUR_PATTERN.exec(line)
      if (match) {
        violations.push(`  L${i + 1}: ${match[0]}  →  ${line.trim().slice(0, 90)}`)
      }
    }

    expect(
      violations,
      `${sourcePath} contains hardcoded colour classes:\n${violations.join('\n')}`
    ).toHaveLength(0)
  })

  it('all three themes define the same set of CSS variables', () => {
    const themeIds = Object.keys(appThemes) as AppThemeId[]
    expect(themeIds.length).toBeGreaterThanOrEqual(3)

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

  it('contrast-paper theme has high-contrast ink values', () => {
    const contrast = appThemes['contrast-paper']
    // Ink should be very dark (close to 0,0,0)
    const inkParts = contrast.cssVariables['--ink'].split(' ').map(Number)
    expect(inkParts.every((v) => v <= 30)).toBe(true)
    // Paper should be very light (close to 255,255,255)
    const paperParts = contrast.cssVariables['--paper-base'].split(' ').map(Number)
    expect(paperParts.every((v) => v >= 240)).toBe(true)
  })
})
