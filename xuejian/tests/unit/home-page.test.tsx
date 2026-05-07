import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HomePage } from '@/features/dashboard/HomePage'
import { useAppUiStore } from '@/store'

const { useDashboardSummaryQueryMock, useDocumentsQueryMock } = vi.hoisted(() => ({
  useDashboardSummaryQueryMock: vi.fn(),
  useDocumentsQueryMock: vi.fn(),
}))

vi.mock('@/queries', async () => {
  const actual = await vi.importActual<typeof import('@/queries')>('@/queries')
  return {
    ...actual,
    useDashboardSummaryQuery: useDashboardSummaryQueryMock,
    useDocumentsQuery: useDocumentsQueryMock,
  }
})

vi.mock('@/queries/dashboard', async () => {
  const actual = await vi.importActual<typeof import('@/queries/dashboard')>('@/queries/dashboard')
  return {
    ...actual,
    useDashboardSummaryQuery: useDashboardSummaryQueryMock,
  }
})

vi.mock('@/queries/documents', async () => {
  const actual = await vi.importActual<typeof import('@/queries/documents')>('@/queries/documents')
  return {
    ...actual,
    useDocumentsQuery: useDocumentsQueryMock,
  }
})

describe('HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    useAppUiStore.setState((state) => ({
      ...state,
      activeNavItem: 'home',
    }))

    useDashboardSummaryQueryMock.mockReturnValue({
      data: {
        todayCompletedCount: 3,
        todayNewDueCount: 2,
        todayReviewDueCount: 4,
        todayStudyMinutes: 8,
        totalStudyMinutes: 125,
        streakDays: 5,
        heatmap: [{ date: '2026-04-17', count: 3 }],
        documentProgress: [
          {
            id: '22222222-2222-4222-8222-222222222222',
            title: 'M4 Reader Mock Notes.pdf',
            learnedCards: 1,
            totalCards: 2,
            progressPercent: 50,
          },
        ],
        groupProgress: [
          {
            id: '10101010-1010-4010-8010-101010101010',
            name: 'Reader Notes',
            color: '#3B82F6',
            learnedCards: 1,
            totalCards: 1,
            progressPercent: 100,
          },
        ],
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })
    useDocumentsQueryMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })
  })

  it('shows the M11 dashboard metrics and progress panels', () => {
    render(<HomePage />)

    expect(screen.getByTestId('home-dashboard')).toBeInTheDocument()
    expect(screen.getByText('今日完成')).toBeInTheDocument()
    expect(screen.getByText('今日待学')).toBeInTheDocument()
    expect(screen.getByText('累计时长')).toBeInTheDocument()
    expect(screen.getByText('连续天数')).toBeInTheDocument()
    expect(screen.getByTestId('home-heatmap-panel')).toBeInTheDocument()
    expect(screen.getByTestId('home-document-progress-panel')).toHaveTextContent(
      'M4 Reader Mock Notes.pdf'
    )
    expect(screen.getByTestId('home-group-progress-panel')).toHaveTextContent('Reader Notes')
  })

  it('keeps only MVP dashboard actions visible', () => {
    render(<HomePage />)

    const quickActionsPanel = screen.getByTestId('home-quick-actions-panel')

    expect(within(quickActionsPanel).getByRole('button', { name: /开始复习/ })).toBeInTheDocument()
    expect(within(quickActionsPanel).getByRole('button', { name: /导入文档/ })).toBeInTheDocument()
    expect(within(quickActionsPanel).getByRole('button', { name: /管理卡片/ })).toBeInTheDocument()

    expect(screen.queryByText('AI 问答')).not.toBeInTheDocument()
    expect(screen.queryByText('积分')).not.toBeInTheDocument()
  })

  it('shows loading and error states', () => {
    useDashboardSummaryQueryMock.mockReturnValueOnce({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })

    const { rerender } = render(<HomePage />)
    expect(screen.getByTestId('home-dashboard-loading')).toBeInTheDocument()

    useDashboardSummaryQueryMock.mockReturnValueOnce({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('boom'),
      refetch: vi.fn(),
    })

    rerender(<HomePage />)
    expect(screen.getByTestId('home-dashboard-error')).toBeInTheDocument()
  })
})
