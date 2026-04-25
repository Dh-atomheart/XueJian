import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('app shell layout CSS', () => {
  it('does not reserve a double-sided scrollbar gutter for the main shell area', () => {
    const cssPath = path.resolve(__dirname, '../../src/index.css')
    const css = readFileSync(cssPath, 'utf8')

    expect(css).toContain('.app-shell-main')
    expect(css).toContain('scrollbar-gutter: stable;')
    expect(css).not.toContain('scrollbar-gutter: stable both-edges;')
  })

  it('does not force overlay roots into the app shell stacking context', () => {
    const cssPath = path.resolve(__dirname, '../../src/index.css')
    const css = readFileSync(cssPath, 'utf8')

    expect(css).toContain('.app-shell-frame > :not([data-app-overlay-root])')
    expect(css).not.toContain('.app-shell-frame > * {')
  })

  it('keeps the sidebar fixed-height and uses the main area as the page scroll container', () => {
    const shellPath = path.resolve(__dirname, '../../src/components/shell/AppShell.tsx')
    const source = readFileSync(shellPath, 'utf8')

    expect(source).toContain('app-shell-frame paper-texture flex h-screen overflow-hidden')
    expect(source).toContain('app-sidebar-rail hidden h-screen w-[230px] shrink-0 overflow-hidden')
    expect(source).toContain('app-shell-main min-h-0 flex-1 overflow-x-hidden')
    expect(source).toContain("reader.documentId ? 'overflow-hidden' : 'overflow-y-auto'")
  })

  it('removes page-level vertical scrolling from home-sized workspaces', () => {
    const podcast = readFileSync(
      path.resolve(__dirname, '../../src/features/podcast/PodcastPage.tsx'),
      'utf8'
    )
    const knowledge = readFileSync(
      path.resolve(__dirname, '../../src/features/knowledge/KnowledgeQaPage.tsx'),
      'utf8'
    )

    expect(podcast).not.toContain('overflow-y-auto p-6')
    expect(knowledge).not.toContain('overflow-y-auto p-6')
  })
})
