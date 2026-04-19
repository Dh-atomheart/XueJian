import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiConfigGateway } from '@/services/gateway/models'

vi.mock('@/features/dashboard', () => ({
  DashboardPage: () => <div>Dashboard Page</div>,
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
    <div>{forcedOnboarding ? '先完成模型密钥配置，再进入其他功能' : 'Settings Page'}</div>
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
})

// @acceptance:v4-4-a1
describe('app setup guidance', () => {
  it('keeps the dashboard browsable even when no usable model config exists', async () => {
    ;(window as Window & { __TAURI__?: unknown }).__TAURI__ = {}

    vi.spyOn(apiConfigGateway, 'list').mockResolvedValue([])

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <App />
      </QueryClientProvider>
    )

    await screen.findByText('Dashboard Page')
    await screen.findByText('AI 功能需先配置模型')

    expect(screen.getByTestId('sidebar-nav-home')).not.toBeDisabled()
    expect(screen.getByTestId('sidebar-nav-library')).not.toBeDisabled()
    expect(screen.getByTestId('sidebar-nav-cards')).not.toBeDisabled()
    expect(screen.getByTestId('sidebar-nav-learning')).not.toBeDisabled()
    expect(screen.getByTestId('sidebar-nav-knowledge')).not.toBeDisabled()
    expect(screen.getByTestId('sidebar-nav-settings')).not.toBeDisabled()
  })
})
