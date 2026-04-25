import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ReviewPage } from '@/features/review/ReviewPage'
import { useAppUiStore } from '@/store'
import { useLearningSessionStore } from '@/store/learning'
import type { Card } from '@/types'

const {
  useDueCardsQueryMock,
  useDailyStatsQueryMock,
  useSubmitReviewMutationMock,
  usePointsSummaryQueryMock,
} = vi.hoisted(() => ({
  useDueCardsQueryMock: vi.fn(),
  useDailyStatsQueryMock: vi.fn(),
  useSubmitReviewMutationMock: vi.fn(),
  usePointsSummaryQueryMock: vi.fn(),
}))

vi.mock('@/queries/learning', async () => {
  const actual = await vi.importActual<typeof import('@/queries/learning')>('@/queries/learning')
  return {
    ...actual,
    useDueCardsQuery: useDueCardsQueryMock,
    useDailyStatsQuery: useDailyStatsQueryMock,
    useSubmitReviewMutation: useSubmitReviewMutationMock,
  }
})

vi.mock('@/queries/points', () => ({
  usePointsSummaryQuery: usePointsSummaryQueryMock,
}))

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    groupId: null,
    title: null,
    cardType: 'qa',
    clusterId: null,
    exportGuid: null,
    documentId: null,
    anchorId: null,
    front: 'Review question',
    back: 'Review answer',
    sourcePage: null,
    sourceParagraph: null,
    sourceCoordinates: null,
    tags: [],
    difficulty: 0.3,
    stability: 1,
    retrievability: null,
    state: 'new',
    nextReview: null,
    createdAt: new Date('2026-04-21T00:00:00.000Z'),
    updatedAt: new Date('2026-04-21T00:00:00.000Z'),
    ...overrides,
  }
}

describe('ReviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useLearningSessionStore.getState().resetSession()
    useAppUiStore.setState({ activeNavItem: 'home' })

    useDueCardsQueryMock.mockReturnValue({
      data: [makeCard()],
      isLoading: false,
    })
    useDailyStatsQueryMock.mockReturnValue({
      data: { newCards: 1, reviewCards: 1, correctRate: null },
    })
    usePointsSummaryQueryMock.mockReturnValue({
      data: { todayPoints: 10 },
    })
    useSubmitReviewMutationMock.mockReturnValue({
      isPending: false,
      mutate: vi.fn((_payload: unknown, options?: { onSuccess?: () => void }) => {
        options?.onSuccess?.()
      }),
    })
  })

  it('starts a study session and completes it through keyboard shortcuts', async () => {
    render(<ReviewPage />)

    expect(screen.getByTestId('review-page-intro')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('review-start-session'))

    expect(screen.getByTestId('review-page-studying')).toBeInTheDocument()

    fireEvent.keyDown(window, { code: 'Space' })
    expect(screen.getByTestId('review-rate-good')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: '3', code: 'Digit3' })

    await waitFor(() => {
      expect(screen.getByTestId('review-page-complete')).toBeInTheDocument()
    })
  })

  it('shows choice-card explanation after reveal', async () => {
    useDueCardsQueryMock.mockReturnValue({
      data: [
        makeCard({
          cardType: 'choice',
          front: '?> Which option is correct?\n- Wrong option\n- [x] Correct option',
          back: 'This is the explanation for the choice card.',
        }),
      ],
      isLoading: false,
    })

    render(<ReviewPage />)
    fireEvent.click(screen.getByTestId('review-start-session'))
    fireEvent.click(screen.getByTestId('review-current-card'))

    expect(await screen.findByText('This is the explanation for the choice card.')).toBeInTheDocument()
  })
})
