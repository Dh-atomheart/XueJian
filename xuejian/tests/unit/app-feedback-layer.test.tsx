import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppFeedbackLayer } from '@/components/ui'
import { useAppUiStore } from '@/store'

vi.mock('@/queries', () => ({
  hasUsableApiConfig: () => false,
  useDailyStatsQuery: () => ({
    data: {
      newCards: 0,
      reviewCards: 0,
    },
  }),
  useApiConfigsQuery: () => ({
    data: [],
    isLoading: false,
  }),
}))

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

function resetUiState() {
  useAppUiStore.setState({
    activeNavItem: 'home',
    activeSettingsSection: 'ai',
    isContextRailOpen: true,
    feedbackLog: [],
    activeNotices: [],
    isFeedbackPanelOpen: false,
    reader: {
      documentId: null,
      currentPage: 1,
      totalPages: 1,
      scale: 1,
      selectedHighlightId: null,
      hoveredHighlightId: null,
      selectedCardId: null,
      annotationScope: 'page',
      annotationFilterTags: [],
      isLinkingMode: false,
      linkingCardId: null,
    },
  })
}

afterEach(() => {
  cleanup()
  resetUiState()
  vi.clearAllMocks()
})

describe('app feedback layer', () => {
  it('marks feedback overlays so the shell does not treat them as layout columns', () => {
    resetUiState()
    useAppUiStore.setState({
      activeNotices: [
        {
          id: 'notice-1',
          level: 'warning',
          scope: '布局',
          title: '测试通知',
          detail: '用于验证 overlay root 标记',
          createdAt: new Date('2026-04-22T23:10:00.000Z'),
        },
      ],
      isFeedbackPanelOpen: true,
    })

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <AppFeedbackLayer />
      </QueryClientProvider>
    )

    expect(screen.getByText('测试通知').closest('[data-app-overlay-root]')).toHaveAttribute(
      'data-app-overlay-root',
      'feedback-notices'
    )
    expect(screen.getByText('最近的提示与错误').closest('[data-app-overlay-root]')).toHaveAttribute(
      'data-app-overlay-root',
      'feedback-drawer'
    )
  })
})
