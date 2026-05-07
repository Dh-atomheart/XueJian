import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ReviewPage } from '@/features/review/ReviewPage'
import { useAppUiStore } from '@/store'
import { useLearningSessionStore } from '@/store/learning'
import type { StudyQueueItem } from '@/types'

const { useStudyQueueQueryMock, useSubmitStudyReviewMutationMock } = vi.hoisted(() => ({
  useStudyQueueQueryMock: vi.fn(),
  useSubmitStudyReviewMutationMock: vi.fn(),
}))

vi.mock('@/queries/study', async () => {
  const actual = await vi.importActual<typeof import('@/queries/study')>('@/queries/study')
  return {
    ...actual,
    useStudyQueueQuery: useStudyQueueQueryMock,
    useSubmitStudyReviewMutation: useSubmitStudyReviewMutationMock,
  }
})

function makeStudyQueueItem(overrides: Partial<StudyQueueItem> = {}): StudyQueueItem {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    groupId: '10101010-1010-4010-8010-101010101010',
    title: '学习卡片',
    front: 'Review question',
    back: 'Review answer',
    state: 'new',
    dueAt: new Date('2026-04-21T00:00:00.000Z'),
    ...overrides,
  }
}

describe('ReviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useLearningSessionStore.getState().resetSession()
    useAppUiStore.setState({ activeNavItem: 'home' })

    useStudyQueueQueryMock.mockReturnValue({
      data: [makeStudyQueueItem()],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })
    useSubmitStudyReviewMutationMock.mockReturnValue({
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
    useStudyQueueQueryMock.mockReturnValue({
      data: [
        makeStudyQueueItem({
          front: '?> Which option is correct?\n- Wrong option\n- [x] Correct option',
          back: 'This is the explanation for the choice card.',
        }),
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })

    render(<ReviewPage />)
    fireEvent.click(screen.getByTestId('review-start-session'))
    fireEvent.click(screen.getByTestId('review-current-card'))

    expect(
      await screen.findByText('This is the explanation for the choice card.')
    ).toBeInTheDocument()
  })

  it('shows loading state while fetching the study queue', () => {
    useStudyQueueQueryMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })

    render(<ReviewPage />)

    expect(screen.getByTestId('review-page-loading')).toBeInTheDocument()
    expect(screen.getByText('正在加载复习队列...')).toBeInTheDocument()
  })

  it('shows error state and retries when loading the study queue fails', () => {
    const refetch = vi.fn()
    useStudyQueueQueryMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('复习服务不可用'),
      refetch,
    })

    render(<ReviewPage />)

    expect(screen.getByTestId('review-page-error')).toBeInTheDocument()
    expect(screen.getByText('复习服务不可用')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '重试' }))

    expect(refetch).toHaveBeenCalledTimes(1)
  })
})
