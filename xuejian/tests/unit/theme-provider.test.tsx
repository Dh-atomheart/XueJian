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
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
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
  // @acceptance:v4-2-a1
  it('applies the selected theme from settings page', async () => {
    const queryClient = createTestQueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <SettingsPage />
        </ThemeProvider>
      </QueryClientProvider>
    )

    await screen.findByText('主题包')

    fireEvent.click(screen.getByTestId('theme-option-comic-sketch'))

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('comic-sketch')
      expect(document.documentElement.style.getPropertyValue('--paper-base')).toBe(
        appThemes['comic-sketch'].cssVariables['--paper-base']
      )
    })
  })

  // @acceptance:v4-2-a4
  it('falls back to the default theme when the value is unknown', () => {
    expect(resolveAppTheme('unknown-theme').id).toBe('default')
  })
})