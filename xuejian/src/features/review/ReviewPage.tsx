import { useCallback, useEffect, useMemo, useState } from 'react'
import { ReviewPage as ReviewPageView } from '@/components/pages/review-page'
import { useDailyStatsQuery, useDueCardsQuery, useSubmitReviewMutation } from '@/queries/learning'
import { useAppUiStore } from '@/store'
import { useLearningSessionStore } from '@/store/learning'
import type { ReviewRating } from '@/services/learning'

type ReviewMode = 'intro' | 'studying' | 'complete' | 'empty'

export function ReviewPage() {
  const [mode, setMode] = useState<ReviewMode>('intro')
  const [ratingCounts, setRatingCounts] = useState<Record<ReviewRating, number>>({
    again: 0,
    hard: 0,
    good: 0,
    easy: 0,
  })

  const setActiveNavItem = useAppUiStore((state) => state.setActiveNavItem)
  const { data: dueCards = [] } = useDueCardsQuery()
  const { data: dailyStats } = useDailyStatsQuery()
  const submitReview = useSubmitReviewMutation()

  const { queue, currentIndex, isFlipped, reviewedCount, loadQueue, flipCard, advanceCard, resetSession } =
    useLearningSessionStore()

  const currentCard = queue[currentIndex] ?? null
  const progressPercent = queue.length > 0 ? ((Math.min(currentIndex + 1, queue.length)) / queue.length) * 100 : 0

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
  }, [flipCard, isFlipped, mode, submitReview.isPending])

  const handleStart = useCallback(() => {
    if (dueCards.length === 0) {
      setMode('empty')
      return
    }
    loadQueue(dueCards)
    setRatingCounts({ again: 0, hard: 0, good: 0, easy: 0 })
    setMode('studying')
  }, [dueCards, loadQueue])

  const handleRate = useCallback(
    async (rating: ReviewRating) => {
      if (!currentCard) return
      submitReview.mutate(
        { card: currentCard, rating },
        {
          onSuccess: () => {
            setRatingCounts((state) => ({ ...state, [rating]: state[rating] + 1 }))
            advanceCard()
          },
        }
      )
    },
    [advanceCard, currentCard, submitReview]
  )

  const resolvedMode: ReviewMode = useMemo(() => {
    if (mode === 'complete') return 'complete'
    if (mode === 'studying') return currentCard ? 'studying' : 'complete'
    if (mode === 'intro' && dueCards.length === 0) return 'empty'
    return mode
  }, [currentCard, dueCards.length, mode])

  return (
    <ReviewPageView
      mode={resolvedMode}
      currentCard={
        currentCard
          ? {
              id: currentCard.id,
              front: currentCard.front,
              back: currentCard.back,
              documentTitle: currentCard.title ?? '学习卡片',
              pageLabel: `第 ${currentCard.sourcePage ?? 1} 页`,
            }
          : null
      }
      currentIndex={currentIndex}
      totalCards={queue.length || dueCards.length}
      reviewedCount={reviewedCount}
      progressPercent={progressPercent}
      todayPoints={(dailyStats?.reviewCards ?? 0) * 3}
      isFlipped={isFlipped}
      isSubmitting={submitReview.isPending}
      dueCount={dueCards.length}
      reviewCount={dailyStats?.reviewCards ?? 0}
      newCardCount={dailyStats?.newCards ?? 0}
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
