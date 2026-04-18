import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, SketchEmptyState } from '@/components/ui'
import { FlipCard, RatingBar, SessionProgress } from '@/components/learning'
import { AnimationPreviewModal } from '@/components/cards/AnimationPreviewModal'
import { useDailyStatsQuery, useDueCardsQuery, useSubmitReviewMutation } from '@/queries'
import { useLearningSessionStore } from '@/store/learning'
import { useAppUiStore } from '@/store'
import { previewScheduling, type ReviewRating } from '@/services/learning'
import { useAppThemeId } from '@/design-system/useAppThemeId'

export function ReviewPage() {
  const { data: dueCards = [], isLoading } = useDueCardsQuery()
  const { data: dailyStats } = useDailyStatsQuery()
  const submitReview = useSubmitReviewMutation()
  const setActiveNavItem = useAppUiStore((state) => state.setActiveNavItem)
  const themeId = useAppThemeId()
  const flipVariant = themeId === 'comic-sketch' ? 'sketch' : 'default'

  const queue = useLearningSessionStore((state) => state.queue)
  const currentIndex = useLearningSessionStore((state) => state.currentIndex)
  const isFlipped = useLearningSessionStore((state) => state.isFlipped)
  const reviewedCount = useLearningSessionStore((state) => state.reviewedCount)
  const loadQueue = useLearningSessionStore((state) => state.loadQueue)
  const flipCard = useLearningSessionStore((state) => state.flipCard)
  const advanceCard = useLearningSessionStore((state) => state.advanceCard)
  const resetSession = useLearningSessionStore((state) => state.resetSession)

  const [animationCardId, setAnimationCardId] = useState<string | null>(null)

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
      <div className="flex h-full items-center justify-center px-4">
        <SketchEmptyState
          illustration="cards"
          title="今日没有待复习的卡片"
          description="所有卡片都温习过了，或者还没有生成过卡片。先去文档库导入资料，生成卡片再来这里复习。"
          className="max-w-md"
          action={
            <Button variant="default" onClick={() => setActiveNavItem('library')}>
              前往文档库
            </Button>
          }
          secondaryAction={
            <Button variant="ghost" onClick={() => setActiveNavItem('home')}>
              返回首页
            </Button>
          }
        />
      </div>
    )
  }

  // Session complete state
  if (isSessionComplete) {
    return (
      <div className="flex h-full items-center justify-center px-4">
        <SketchEmptyState
          illustration="note"
          title="今日学习完成"
          description={`本次复习 ${reviewedCount} 张卡片，明天再回来巩固。`}
          className="max-w-md"
          action={
            <Button
              variant="default"
              onClick={() => {
                resetSession()
              }}
            >
              再来一轮
            </Button>
          }
          secondaryAction={
            <Button
              variant="outline"
              onClick={() => {
                resetSession()
                setActiveNavItem('home')
              }}
            >
              返回首页
            </Button>
          }
        />
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
      {currentCard && (
        <FlipCard
          card={currentCard}
          isFlipped={isFlipped}
          onFlip={flipCard}
          variant={flipVariant}
        />
      )}

      {/* Animation preview shortcut */}
      {currentCard && (
        <div className="flex justify-center pb-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-ink-soft"
            onClick={() => setAnimationCardId(currentCard.id)}
          >
            ✨ 知识动画
          </Button>
        </div>
      )}

      {/* Bottom: rating bar */}
      {isFlipped && currentCard && (
        <div className="border-t border-line-soft/60 bg-paper-base/80 backdrop-blur-sm">
          <div className="mx-auto max-w-xl">
            <RatingBar onRate={handleRate} disabled={submitReview.isPending} previews={previews} />
          </div>
        </div>
      )}

      {/* Animation preview modal */}
      {animationCardId && currentCard && (
        <AnimationPreviewModal
          cardId={animationCardId}
          cardFront={currentCard.front}
          onClose={() => setAnimationCardId(null)}
        />
      )}
    </div>
  )
}
