import { useCallback, useEffect, useMemo } from 'react'
import { Button, Panel } from '@/components/ui'
import { FlipCard, RatingBar, SessionProgress } from '@/components/learning'
import { useDailyStatsQuery, useDueCardsQuery, useSubmitReviewMutation } from '@/queries'
import { useLearningSessionStore } from '@/store/learning'
import { useAppUiStore } from '@/store'
import { previewScheduling, type ReviewRating } from '@/services/learning'

export function ReviewPage() {
  const { data: dueCards = [], isLoading } = useDueCardsQuery()
  const { data: dailyStats } = useDailyStatsQuery()
  const submitReview = useSubmitReviewMutation()
  const setActiveNavItem = useAppUiStore((state) => state.setActiveNavItem)

  const queue = useLearningSessionStore((state) => state.queue)
  const currentIndex = useLearningSessionStore((state) => state.currentIndex)
  const isFlipped = useLearningSessionStore((state) => state.isFlipped)
  const reviewedCount = useLearningSessionStore((state) => state.reviewedCount)
  const loadQueue = useLearningSessionStore((state) => state.loadQueue)
  const flipCard = useLearningSessionStore((state) => state.flipCard)
  const advanceCard = useLearningSessionStore((state) => state.advanceCard)
  const resetSession = useLearningSessionStore((state) => state.resetSession)

  useEffect(() => {
    if (dueCards.length > 0 && queue.length === 0) {
      loadQueue(dueCards)
    }
  }, [dueCards, queue.length, loadQueue])

  const currentCard = queue[currentIndex] ?? null
  const isSessionComplete = queue.length > 0 && currentIndex >= queue.length

  const previews = useMemo(() => {
    if (!currentCard) return undefined
    return previewScheduling(currentCard)
  }, [currentCard])

  const handleRate = useCallback(
    (rating: ReviewRating) => {
      if (!currentCard || submitReview.isPending) return
      submitReview.mutate({ card: currentCard, rating }, { onSuccess: () => advanceCard() })
    },
    [currentCard, submitReview, advanceCard]
  )

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="space-y-3 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-ink/10 border-t-ink/40" />
          <p className="font-ui text-sm text-ink-muted">加载学习任务…</p>
        </div>
      </div>
    )
  }

  // Empty state - no cards due today
  if (dueCards.length === 0 && queue.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <Panel variant="paperCard" className="max-w-sm rounded-[24px] p-8 text-center">
          <div className="mb-4 text-4xl">🎉</div>
          <h2 className="mb-2 font-display text-xl text-ink">今日无待复习卡片</h2>
          <p className="mb-6 font-body text-sm leading-relaxed text-ink-muted">
            所有卡片已复习完毕，或者还没有生成过卡片。可以去文档库上传 PDF 并生成卡片。
          </p>
          <Button variant="outline" onClick={() => setActiveNavItem('library')}>
            前往文档库
          </Button>
        </Panel>
      </div>
    )
  }

  // Session complete state
  if (isSessionComplete) {
    return (
      <div className="flex h-full items-center justify-center">
        <Panel variant="paperCard" className="max-w-sm rounded-[24px] p-8 text-center">
          <div className="mb-4 text-4xl">✅</div>
          <h2 className="mb-2 font-display text-xl text-ink">今日学习完成</h2>
          <p className="mb-2 font-body text-sm text-ink-muted">本次复习 {reviewedCount} 张卡片</p>
          <div className="mt-6 flex justify-center gap-3">
            <Button
              variant="outline"
              onClick={() => {
                resetSession()
                setActiveNavItem('home')
              }}
            >
              返回首页
            </Button>
            <Button
              variant="default"
              onClick={() => {
                resetSession()
              }}
            >
              再来一轮
            </Button>
          </div>
        </Panel>
      </div>
    )
  }

  // Active review state
  return (
    <div className="flex h-full flex-col">
      {/* Top: progress */}
      <div className="border-b border-line-soft/60">
        <div className="mx-auto max-w-xl">
          <SessionProgress reviewed={reviewedCount} total={queue.length} />
        </div>
        {dailyStats && (
          <div className="mx-auto flex max-w-xl items-center gap-4 px-6 pb-2">
            <span className="font-ui text-xs text-ink-soft">新卡 {dailyStats.newCards}</span>
            <span className="font-ui text-xs text-ink-soft">复习 {dailyStats.reviewCards}</span>
          </div>
        )}
      </div>

      {/* Center: card stage */}
      {currentCard && <FlipCard card={currentCard} isFlipped={isFlipped} onFlip={flipCard} />}

      {/* Bottom: rating bar */}
      {isFlipped && currentCard && (
        <div className="border-t border-line-soft/60 bg-paper-base/80 backdrop-blur-sm">
          <div className="mx-auto max-w-xl">
            <RatingBar onRate={handleRate} disabled={submitReview.isPending} previews={previews} />
          </div>
        </div>
      )}
    </div>
  )
}
