import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CenteredLoading, ErrorState } from '@/shared/ui'
import { ReviewPage as ReviewPageView } from '@/components/pages/review-page'
import { getErrorMessage, reportAppError } from '@/lib/appFeedback'
import { useStudyQueueQuery, useSubmitStudyReviewMutation } from '@/queries/study'
import { useAppUiStore } from '@/store'
import { useLearningSessionStore } from '@/store/learning'
import type { ReviewRating } from '@/services/learning'
import type { StudyQueueItem } from '@/types'

type ReviewMode = 'intro' | 'studying' | 'complete' | 'empty'

function getStateLabel(state: StudyQueueItem['state']) {
  switch (state) {
    case 'new':
      return '新卡片'
    case 'learning':
      return '学习中'
    case 'relearning':
      return '重新学习'
    default:
      return '复习中'
  }
}

export function ReviewPage() {
  const [mode, setMode] = useState<ReviewMode>('intro')
  const [ratingCounts, setRatingCounts] = useState<Record<ReviewRating, number>>({
    again: 0,
    hard: 0,
    good: 0,
    easy: 0,
  })
  const cardStartedAtRef = useRef<number | null>(null)

  const setActiveNavItem = useAppUiStore((state) => state.setActiveNavItem)
  const setAgentContext = useAppUiStore((state) => state.setAgentContext)
  const clearAgentContext = useAppUiStore((state) => state.clearAgentContext)
  const { data, isLoading, isError, error, refetch } = useStudyQueueQuery()
  const submitReview = useSubmitStudyReviewMutation()
  const dailyQueue = data ?? []

  const {
    queue,
    currentIndex,
    isFlipped,
    reviewedCount,
    loadQueue,
    flipCard,
    advanceCard,
    resetSession,
  } = useLearningSessionStore()

  const queueErrorMessage = useMemo(
    () => getErrorMessage(error, '复习队列暂时无法加载，请稍后重试。'),
    [error]
  )

  useEffect(() => {
    if (!isError) return
    reportAppError('复习', error, {
      title: '复习队列加载失败',
      fallbackDetail: '复习队列暂时无法加载，请稍后重试。',
      showToast: false,
    })
  }, [error, isError])

  const currentCard = queue[currentIndex] ?? null
  const progressPercent =
    queue.length > 0 ? (Math.min(currentIndex + 1, queue.length) / queue.length) * 100 : 0
  const reviewCount = dailyQueue.filter((card) => card.state !== 'new').length
  const newCardCount = dailyQueue.filter((card) => card.state === 'new').length

  const handleRate = useCallback(
    async (rating: ReviewRating) => {
      if (!currentCard) return
      const startedAt = cardStartedAtRef.current ?? Date.now()
      const durationMs = Math.max(0, Date.now() - startedAt)
      submitReview.mutate(
        {
          cardId: currentCard.id,
          rating,
          startedAt: new Date(startedAt).toISOString(),
          durationMs,
        },
        {
          onSuccess: () => {
            setRatingCounts((state) => ({ ...state, [rating]: state[rating] + 1 }))
            advanceCard()
          },
          onError: (cause) => {
            reportAppError('复习', cause, {
              title: '提交复习反馈失败',
              fallbackDetail: '本次评分没有保存成功，请稍后重试。',
              showToast: true,
            })
          },
        }
      )
    },
    [advanceCard, currentCard, submitReview]
  )

  useEffect(() => {
    if (mode === 'studying' && currentCard) {
      cardStartedAtRef.current = Date.now()
    }
  }, [currentCard?.id, mode])

  useEffect(() => {
    if (mode === 'studying' && queue.length > 0 && currentIndex >= queue.length) {
      resetSession()
      setMode('complete')
    }
  }, [currentIndex, mode, queue.length, resetSession])

  useEffect(() => {
    if (mode !== 'studying') return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        event.preventDefault()
        if (!isFlipped) flipCard()
      }
      if (!isFlipped || submitReview.isPending) return
      if (event.key === '1') void handleRate('again')
      if (event.key === '2') void handleRate('hard')
      if (event.key === '3') void handleRate('good')
      if (event.key === '4') void handleRate('easy')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [flipCard, handleRate, isFlipped, mode, submitReview.isPending])

  useEffect(() => {
    if (mode === 'studying' && currentCard) {
      setAgentContext({ activeReviewSessionId: currentCard.id })
    } else {
      setAgentContext({ activeReviewSessionId: null })
    }
  }, [mode, currentCard, setAgentContext])

  useEffect(() => {
    return () => {
      clearAgentContext()
    }
  }, [clearAgentContext])

  const handleStart = useCallback(() => {
    if (dailyQueue.length === 0) {
      setMode('empty')
      return
    }
    loadQueue(dailyQueue)
    setRatingCounts({ again: 0, hard: 0, good: 0, easy: 0 })
    setMode('studying')
  }, [dailyQueue, loadQueue])

  const resolvedMode: ReviewMode = useMemo(() => {
    if (mode === 'complete') return 'complete'
    if (mode === 'studying') return currentCard ? 'studying' : 'complete'
    if (mode === 'intro' && dailyQueue.length === 0) return 'empty'
    return mode
  }, [currentCard, dailyQueue.length, mode])

  if (isLoading) {
    return (
      <div className="flex h-full flex-col p-6" data-testid="review-page-loading">
        <div className="flex flex-1 items-center justify-center">
          <CenteredLoading label="正在加载复习队列..." />
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex h-full flex-col p-6" data-testid="review-page-error">
        <div className="flex flex-1 items-center justify-center">
          <ErrorState
            title="复习队列加载失败"
            description={queueErrorMessage}
            onRetry={() => {
              void refetch()
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <ReviewPageView
      mode={resolvedMode}
      currentCard={
        currentCard
          ? {
              id: currentCard.id,
              front: currentCard.front,
              back: currentCard.back,
              documentTitle: currentCard.title,
              pageLabel: getStateLabel(currentCard.state),
            }
          : null
      }
      currentIndex={currentIndex}
      totalCards={queue.length || dailyQueue.length}
      reviewedCount={reviewedCount}
      progressPercent={progressPercent}
      todayPoints={0}
      isFlipped={isFlipped}
      isSubmitting={submitReview.isPending}
      dueCount={dailyQueue.length}
      reviewCount={reviewCount}
      newCardCount={newCardCount}
      ratingCounts={ratingCounts}
      onStart={handleStart}
      onFlip={flipCard}
      onRate={handleRate}
      onBackHome={() => setActiveNavItem('home')}
      onOpenCards={() => setActiveNavItem('cards')}
      onOpenSettings={() => setActiveNavItem('settings')}
      onBackToIntro={() => {
        resetSession()
        setMode('intro')
      }}
    />
  )
}
