import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ThemeProvider } from '@/design-system/ThemeProvider'
import { appThemes, resolveAppTheme } from '@/design-system/themes'
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
    theme: 'default',
    language: 'zh-CN',
    dailyNewCardLimit: 20,
    reviewTimeLimit: 30,
  })
})

afterEach(() => {
  cleanup()
})

describe('theme provider', () => {
  it('keeps the settings page on the official paper theme', async () => {
    const queryClient = createTestQueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <SettingsPage />
        </ThemeProvider>
      </QueryClientProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: '通用' }))

    await screen.findByDisplayValue('default')
    expect(screen.queryByTestId('theme-option-comic-sketch')).not.toBeInTheDocument()
    expect(screen.queryByTestId('theme-option-contrast-paper')).not.toBeInTheDocument()

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('default')
      expect(document.documentElement.style.getPropertyValue('--paper-base')).toBe(
        appThemes.default.cssVariables['--paper-base']
      )
    })
  })

  it('falls back to the default theme when the value is unknown', () => {
    expect(resolveAppTheme('unknown-theme').id).toBe('default')
  })
})
