import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SidebarRail } from '@/components/shell/SidebarRail'

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

afterEach(() => {
  cleanup()
})

// @acceptance:v4-4-a3
describe('sidebar rail icons', () => {
  it('renders all navigation icons with rounded stroke geometry', async () => {
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <SidebarRail />
      </QueryClientProvider>
    )

    const buttonIds = ['home', 'library', 'cards', 'learning', 'knowledge', 'settings']

    for (const buttonId of buttonIds) {
      const button = await screen.findByTestId(`sidebar-nav-${buttonId}`)
      const icon = button.querySelector('svg')

      expect(icon).not.toBeNull()
      expect(icon).toHaveAttribute('stroke-linecap', 'round')
      expect(icon).toHaveAttribute('stroke-linejoin', 'round')
    }
  })
})