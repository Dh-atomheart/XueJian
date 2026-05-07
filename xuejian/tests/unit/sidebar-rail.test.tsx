import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AppShell } from '@/components/shell/AppShell'
import { useAppUiStore } from '@/store'

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
  useAppUiStore.setState((state) => ({
    ...state,
    activeNavItem: 'home',
  }))
})

describe('app shell navigation icons', () => {
  it('renders the V1.1 navigation icons with rounded stroke geometry', async () => {
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <AppShell>
          <div>stub</div>
        </AppShell>
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

    expect(screen.queryByTestId('sidebar-nav-profile')).toBeNull()
  })

  it('shows Knowledge shell metadata when the V1.1 route is active', async () => {
    useAppUiStore.setState((state) => ({
      ...state,
      activeNavItem: 'knowledge',
    }))

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <AppShell>
          <div>stub</div>
        </AppShell>
      </QueryClientProvider>
    )

    expect(await screen.findByText('KNOWLEDGE RAG')).toBeInTheDocument()
    expect(screen.getByText('只基于已向量化文档进行学习型问答，并展示可追溯引用。')).toBeInTheDocument()
    expect(screen.queryByText('AI ASSISTANT')).not.toBeInTheDocument()
    expect(screen.getByTestId('sidebar-nav-knowledge')).toBeInTheDocument()
  })
})
