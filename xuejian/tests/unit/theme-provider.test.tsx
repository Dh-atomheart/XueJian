import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '@/design-system/ThemeProvider'
import { appThemes, resolveAppTheme, resolveAppThemeId } from '@/design-system/themes'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { settingsGateway } from '@/services/gateway/settings'

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

beforeEach(async () => {
  await settingsGateway.update({
    theme: 'light',
    language: 'zh-CN',
    dailyNewCardLimit: 20,
    reviewTimeLimit: 30,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  cleanup()
})

describe('theme provider', () => {
  it('applies the light theme and renders theme choices as a select', async () => {
    const queryClient = createTestQueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <SettingsPage />
        </ThemeProvider>
      </QueryClientProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: '通用' }))

    const themeSelect = await screen.findByTestId('settings-theme-select')
    expect(themeSelect).toHaveValue('light')
    expect(screen.getByRole('option', { name: 'Light' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Dark' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'System' })).toBeInTheDocument()

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('light')
      expect(document.documentElement.dataset.themePreference).toBe('light')
      expect(document.documentElement.classList.contains('dark')).toBe(false)
      expect(document.documentElement.style.getPropertyValue('--paper-base')).toBe(
        appThemes.light.cssVariables['--paper-base']
      )
    })
  })

  it('normalizes legacy default to light and falls back to light for unknown values', () => {
    expect(resolveAppThemeId('default')).toBe('light')
    expect(resolveAppTheme('unknown-theme').id).toBe('light')
  })

  it('resolves system theme from OS preference changes', async () => {
    let matches = true
    const listeners = new Set<() => void>()

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: () => ({
        get matches() {
          return matches
        },
        media: '(prefers-color-scheme: dark)',
        onchange: null,
        addEventListener: (_event: string, listener: () => void) => listeners.add(listener),
        removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    })

    await settingsGateway.update({ theme: 'system' })
    const queryClient = createTestQueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <div>Theme host</div>
        </ThemeProvider>
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(document.documentElement.dataset.themePreference).toBe('system')
      expect(document.documentElement.dataset.theme).toBe('dark')
      expect(document.documentElement.classList.contains('dark')).toBe(true)
      expect(document.documentElement.style.getPropertyValue('--paper-base')).toBe(
        appThemes.dark.cssVariables['--paper-base']
      )
    })

    matches = false
    act(() => {
      listeners.forEach((listener) => listener())
    })

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('light')
      expect(document.documentElement.classList.contains('dark')).toBe(false)
      expect(document.documentElement.style.getPropertyValue('--paper-base')).toBe(
        appThemes.light.cssVariables['--paper-base']
      )
    })
  })
})
