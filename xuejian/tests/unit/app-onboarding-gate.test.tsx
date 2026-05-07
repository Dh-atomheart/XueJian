import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiConfigGateway } from '@/services/gateway/models'
import { useAppUiStore } from '@/store'

vi.mock('@/features/dashboard', () => ({
  HomePage: () => <div>Home Page</div>,
}))

vi.mock('@/features/cards', () => ({
  CardStudioPage: () => <div>Cards Page</div>,
}))

vi.mock('@/features/documents', () => ({
  LibraryPage: () => <div>Library Page</div>,
  ReaderPage: ({ documentId }: { documentId: string }) => <div>Reader {documentId}</div>,
}))

vi.mock('@/features/knowledge', () => ({
  KnowledgeQaPage: () => <div>Knowledge Page</div>,
}))

vi.mock('@/features/review', () => ({
  ReviewPage: () => <div>Review Page</div>,
}))

vi.mock('@/features/settings', () => ({
  SettingsPage: ({ forcedOnboarding = false }: { forcedOnboarding?: boolean }) => (
    <div>{forcedOnboarding ? 'Settings Guided Setup' : 'Settings Page'}</div>
  ),
}))

vi.mock('@/components/documents', () => ({
  StickyNotesPanel: () => <div>Sticky Notes</div>,
}))

import App from '@/App'

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
  vi.restoreAllMocks()
  delete (window as Window & { __TAURI__?: unknown }).__TAURI__
  useAppUiStore.setState((state) => ({
    ...state,
    activeNavItem: 'home',
  }))
})

// @acceptance:v4-4-a1
describe('app onboarding gate', () => {
  it('keeps first-run users on home and leaves navigation available', async () => {
    ;(window as Window & { __TAURI__?: unknown }).__TAURI__ = {}

    vi.spyOn(apiConfigGateway, 'list').mockResolvedValue([])

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <App />
      </QueryClientProvider>
    )

    await screen.findByText('Home Page')

    expect(screen.getByTestId('sidebar-nav-home')).not.toBeDisabled()
    expect(screen.getByTestId('sidebar-nav-library')).not.toBeDisabled()
    expect(screen.getByTestId('sidebar-nav-cards')).not.toBeDisabled()
    expect(screen.getByTestId('sidebar-nav-learning')).not.toBeDisabled()
    expect(screen.getByTestId('sidebar-nav-knowledge')).not.toBeDisabled()
    expect(screen.getByTestId('sidebar-nav-settings')).not.toBeDisabled()
  })

  it('renders the Knowledge page from the formal V1.1 navigation item', async () => {
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <App />
      </QueryClientProvider>
    )

    fireEvent.click(await screen.findByTestId('sidebar-nav-knowledge'))

    expect(await screen.findByText('Knowledge Page')).toBeInTheDocument()
  })
})
