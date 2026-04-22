import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TopBar } from '@/components/shell/TopBar'
import { AppFeedbackLayer } from '@/components/ui'
import { useAppUiStore } from '@/store'

vi.mock('@/queries', () => ({
  useDailyStatsQuery: () => ({
    data: {
      newCards: 0,
      reviewCards: 0,
    },
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
      selectedCardId: null,
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

  it('opens from the top bar, clears logs, and closes the drawer', () => {
    resetUiState()
    useAppUiStore.setState({
      feedbackLog: [
        {
          id: 'feedback-1',
          level: 'error',
          scope: '同步',
          title: '保存失败',
          detail: '网络连接中断',
          createdAt: new Date('2026-04-19T11:30:00.000Z'),
        },
        {
          id: 'feedback-2',
          level: 'info',
          scope: '文档导入',
          title: '已完成解析',
          detail: '生成了 24 个锚点',
          createdAt: new Date('2026-04-19T11:25:00.000Z'),
        },
      ],
    })

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <>
          <TopBar />
          <AppFeedbackLayer />
        </>
      </QueryClientProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: /错误日志/ }))

    expect(screen.getByText('最近的提示与错误')).toBeInTheDocument()
    expect(screen.getByText('保存失败')).toBeInTheDocument()
    expect(screen.getByText('网络连接中断')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '清空' }))

    expect(screen.getByText('当前还没有日志记录。')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '收起' }))

    expect(screen.queryByText('最近的提示与错误')).not.toBeInTheDocument()
  })
})
