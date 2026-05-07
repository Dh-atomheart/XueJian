import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { appThemes, resolveAppTheme } from '@/design-system/themes'
import type { ResolvedAppThemeId } from '@/design-system/themes'

const KEY_SOURCES = [
  'src/features/dashboard/HomePage.tsx',
  'src/features/review/ReviewPage.tsx',
  'src/features/documents/ReaderPage.tsx',
  'src/features/documents/LibraryPage.tsx',
  'src/features/cards/BasicCardsPage.tsx',
  'src/features/cards/CardStudioPage.tsx',
  'src/features/knowledge/KnowledgeQaPage.tsx',
  'src/features/settings/SettingsPage.tsx',
  'src/components/shell/AppShell.tsx',
  'src/components/shell/ApiSetupBanner.tsx',
  'src/components/pages/knowledge-qa-page.tsx',
  'src/components/ui/AppFeedbackLayer.tsx',
  'src/components/ui/DetailedPage.tsx',
  'src/components/documents/DocumentList.tsx',
  'src/components/documents/DocumentPreviewPane.tsx',
  'src/components/documents/DocumentStatusBadge.tsx',
  'src/components/documents/ImportDocumentButton.tsx',
  'src/components/documents/PageNavBar.tsx',
  'src/components/documents/TextSelectionPopover.tsx',
  'src/components/documents/PdfViewer/HighlightLayer.tsx',
  'src/components/documents/StickyNotes/StickyNoteCard.tsx',
  'src/components/documents/StickyNotes/StickyNotesPanel.tsx',
  'src/components/documents/StickyNotes/UnlinkedCardNotice.tsx',
  'src/components/cards/CardEditorModal.tsx',
  'src/components/cards/ChoiceCardContent.tsx',
  'src/components/cards/ImageOcclusionCardContent.tsx',
  'src/components/learning/FlipCard.tsx',
  'src/components/learning/RatingBar.tsx',
]

function readSource(relPath: string): string {
  return readFileSync(resolve(__dirname, '../../', relPath), 'utf-8')
}

const HARDCODED_COLOUR_PATTERN =
  /(?:#[0-9a-fA-F]{3,8}\b|rgba\(|\b(?:bg|text|border)-(?:white|black)\b|\b(?:bg|text|border)-(?:red|orange|amber|emerald|rose|blue|green|purple|teal|cyan|violet|fuchsia|lime|yellow|stone|zinc|slate|neutral|gray|grey)-\d{2,3}\b)/

const ALLOWED_HARDCODED_COLOUR_LINES = [
  {
    sourcePath: 'src/features/cards/BasicCardsPage.tsx',
    includes: 'placeholder="#5A7CFF"',
    reason: 'user-entered deck color placeholder',
  },
]

function isAllowedHardcodedColourLine(sourcePath: string, line: string) {
  return ALLOWED_HARDCODED_COLOUR_LINES.some(
    (allow) => allow.sourcePath === sourcePath && line.includes(allow.includes)
  )
}

describe('key pages use theme tokens, no hardcoded colours', () => {
  it.each(KEY_SOURCES)('%s has no hardcoded colour classes', (sourcePath) => {
    const src = readSource(sourcePath)
    const lines = src.split('\n')
    const violations: string[] = []

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      if (/^\s*(\/\/|\/\*|\*|import\s)/.test(line)) continue
      if (isAllowedHardcodedColourLine(sourcePath, line)) continue
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

  it('ships light and dark themes with a stable CSS variable set', () => {
    const themeIds = Object.keys(appThemes) as ResolvedAppThemeId[]
    expect(themeIds).toEqual(['light', 'dark'])

    const baseVars = Object.keys(appThemes.light.cssVariables).sort()
    for (const id of themeIds) {
      const vars = Object.keys(appThemes[id].cssVariables).sort()
      expect(vars, `theme "${id}" has mismatched variables`).toEqual(baseVars)
    }
  })

  it('every theme can be resolved without error', () => {
    const themeIds = Object.keys(appThemes) as ResolvedAppThemeId[]
    for (const id of themeIds) {
      const theme = resolveAppTheme(id)
      expect(theme.id).toBe(id)
      expect(theme.label.length).toBeGreaterThan(0)
    }
  })

  it('theme pairs keep readable text contrast across core surfaces', () => {
    const themeIds = Object.keys(appThemes) as ResolvedAppThemeId[]
    const textVars = ['--text-primary', '--text-secondary', '--text-tertiary'] as const
    const surfaceVars = [
      '--surface-app',
      '--surface-card',
      '--surface-elevated',
      '--surface-reader',
    ] as const

    for (const id of themeIds) {
      for (const textVar of textVars) {
        for (const surfaceVar of surfaceVars) {
          const text = parseRgb(appThemes[id].cssVariables[textVar])
          const surface = parseRgb(appThemes[id].cssVariables[surfaceVar])
          const minimum = textVar === '--text-tertiary' ? 3 : 4.5
          expect(
            contrastRatio(text, surface),
            `${id} ${textVar} on ${surfaceVar} contrast`
          ).toBeGreaterThanOrEqual(minimum)
        }
      }
    }
  })

  it('theme accent colors remain readable against app surfaces', () => {
    const themeIds = Object.keys(appThemes) as ResolvedAppThemeId[]
    const accentVars = ['--success', '--warning', '--danger', '--info'] as const

    for (const id of themeIds) {
      const surface = parseRgb(appThemes[id].cssVariables['--surface-app'])
      for (const accentVar of accentVars) {
        const accent = parseRgb(appThemes[id].cssVariables[accentVar])
        expect(
          contrastRatio(accent, surface),
          `${id} ${accentVar} on app surface contrast`
        ).toBeGreaterThanOrEqual(3)
      }
    }
  })
})

function parseRgb(value: string): [number, number, number] {
  const parts = value.split(' ').map(Number)
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0]
}

function relativeLuminance([r, g, b]: [number, number, number]) {
  const values = [r, g, b].map((channel) => {
    const normalized = channel / 255
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2]
}

function contrastRatio(a: [number, number, number], b: [number, number, number]) {
  const first = relativeLuminance(a)
  const second = relativeLuminance(b)
  const lighter = Math.max(first, second)
  const darker = Math.min(first, second)
  return (lighter + 0.05) / (darker + 0.05)
}
