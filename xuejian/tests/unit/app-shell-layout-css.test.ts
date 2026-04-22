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
})
