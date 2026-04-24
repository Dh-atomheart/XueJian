import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProfilePage } from '@/features/profile/ProfilePage'

vi.mock('@/components/stats', () => ({
  HeatmapCalendar: () => <div>Heatmap Calendar</div>,
  StudyTotalsCard: () => <div>Study Totals</div>,
}))

vi.mock('@/queries', async () => {
  const actual = await vi.importActual<typeof import('@/queries')>('@/queries')
  return {
    ...actual,
    useDocumentsQuery: vi.fn(),
    useMasteryBreakdownQuery: vi.fn(),
    usePointsLedgerQuery: vi.fn(),
    usePointsSummaryQuery: vi.fn(),
    useReviewHeatmapQuery: vi.fn(),
    useStudyStatsQuery: vi.fn(),
  }
})

import * as queries from '@/queries'

const mockedQueries = vi.mocked(queries)

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedQueries.useDocumentsQuery.mockReturnValue({
    data: [{ id: 'doc-1', title: 'Memory', status: 'ready' }],
  } as ReturnType<typeof queries.useDocumentsQuery>)
  mockedQueries.useStudyStatsQuery.mockReturnValue({
    data: { todayMinutes: 25, weekMinutes: 130, totalMinutes: 800, streakDays: 6, activeDaysThisWeek: 4 },
  } as ReturnType<typeof queries.useStudyStatsQuery>)
  mockedQueries.useMasteryBreakdownQuery.mockReturnValue({
    data: { newCards: 10, learningCards: 20, reviewCards: 8, masteredCards: 30 },
  } as ReturnType<typeof queries.useMasteryBreakdownQuery>)
  mockedQueries.useReviewHeatmapQuery.mockReturnValue({
    data: [{ date: '2026-04-20', count: 4 }],
  } as ReturnType<typeof queries.useReviewHeatmapQuery>)
  mockedQueries.usePointsSummaryQuery.mockReturnValue({
    data: { todayPoints: 18 },
  } as ReturnType<typeof queries.usePointsSummaryQuery>)
  mockedQueries.usePointsLedgerQuery.mockReturnValue({
    data: [
      {
        id: 'ledger-1',
        points: 12,
        transactionType: 'review',
        rating: 'good',
        reason: '完成复习',
        createdAt: new Date('2026-04-22T12:00:00.000Z'),
      },
    ],
  } as ReturnType<typeof queries.usePointsLedgerQuery>)
})

describe('ProfilePage', () => {
  it('renders the migrated detailed-page structure', () => {
    renderWithProviders(<ProfilePage />)

    expect(screen.getByTestId('profile-page')).toBeInTheDocument()
    expect(screen.getByTestId('profile-metrics')).toBeInTheDocument()
    expect(screen.getByTestId('profile-heatmap')).toBeInTheDocument()
    expect(screen.getByTestId('profile-ledger')).toBeInTheDocument()
    expect(screen.getByText('推荐动作')).toBeInTheDocument()
  })
})
