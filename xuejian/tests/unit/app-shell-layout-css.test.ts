import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('app shell layout CSS', () => {
  it('keeps the initial boot screen from showing a browser-style scrollbar', () => {
    const htmlPath = path.resolve(__dirname, '../../index.html')
    const html = readFileSync(htmlPath, 'utf8')

    expect(html).toContain('#xuejian-boot-shell')
    expect(html).toContain('scrollbar-gutter: auto;')
    expect(html).toContain('scrollbar-width: none;')
    expect(html).toContain('#xuejian-boot-shell::-webkit-scrollbar')
    expect(html).toContain('height: 100vh;')
    expect(html).toContain('max-height: 100vh;')
  })

  it('does not show browser-style scrollbars in the main shell area', () => {
    const cssPath = path.resolve(__dirname, '../../src/index.css')
    const css = readFileSync(cssPath, 'utf8')

    expect(css).toContain('.app-shell-main')
    expect(css).toContain('scrollbar-gutter: auto;')
    expect(css).toContain('scrollbar-width: none;')
    expect(css).toContain('.app-shell-main *::-webkit-scrollbar')
    expect(css).toContain('width: 0;')
    expect(css).toContain('height: 0;')
  })

  it('does not force overlay roots into the app shell stacking context', () => {
    const cssPath = path.resolve(__dirname, '../../src/index.css')
    const css = readFileSync(cssPath, 'utf8')

    expect(css).toContain('.app-shell-frame > :not([data-app-overlay-root])')
    expect(css).not.toContain('.app-shell-frame > * {')
  })

  it('keeps the sidebar fixed-height, hides the unfinished agent panel, and uses the main area as the page scroll container', () => {
    const shellPath = path.resolve(__dirname, '../../src/components/shell/AppShell.tsx')
    const source = readFileSync(shellPath, 'utf8')

    expect(source).toContain('app-shell app-shell-frame paper-texture flex h-dvh')
    expect(source).toContain('hidden h-full w-[212px] shrink-0')
    expect(source).toContain('app-shell-main min-h-0 flex-1 basis-0 overflow-hidden')
    expect(source).not.toContain('<AgentPanel />')
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
