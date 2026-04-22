import { useState, useEffect, useCallback } from 'react'
import { SketchButton, SketchCircle } from '@/components/ui/Sketch'
import { CardContentRenderer } from '@/components/cards/CardContentRenderer'
import { ClozeCardContent } from '@/components/cards/ClozeCardContent'
import { ChoiceCardContent } from '@/components/cards/ChoiceCardContent'
import { ImageOcclusionCardContent } from '@/components/cards/ImageOcclusionCardContent'
import { useDueCardsQuery, useDailyStatsQuery, useSubmitReviewMutation } from '@/queries/learning'
import { useLearningSessionStore } from '@/store/learning'
import { useAppUiStore } from '@/store'
import { cn } from '@/lib/utils'
import type { ReviewRating } from '@/services/learning'

type StudyPhase = 'intro' | 'studying' | 'complete'

export function ReviewPage() {
  const [phase, setPhase] = useState<StudyPhase>('intro')
  const [results, setResults] = useState<{ cardId: string; rating: ReviewRating }[]>([])
  const setActiveNavItem = useAppUiStore((state) => state.setActiveNavItem)

  const { data: dueCards = [], isLoading: isLoadingDue } = useDueCardsQuery()
  const { data: dailyStats } = useDailyStatsQuery()
  const submitReview = useSubmitReviewMutation()

  const { queue, currentIndex, isFlipped, loadQueue, flipCard, advanceCard, resetSession } =
    useLearningSessionStore()

  const currentCard = queue[currentIndex]
  const isSessionDone = currentIndex >= queue.length && queue.length > 0

  const handleStart = () => {
    loadQueue(dueCards)
    setPhase('studying')
    setResults([])
  }

  const handleFlip = () => {
    if (!isFlipped) {
      flipCard()
    }
  }

  const handleRating = useCallback(
    (rating: ReviewRating) => {
      if (!currentCard) return

      submitReview.mutate(
        { card: currentCard, rating },
        {
          onSuccess: () => {
            setResults((prev) => [...prev, { cardId: currentCard.id, rating }])
            advanceCard()
          },
        }
      )
    },
    [currentCard, submitReview, advanceCard]
  )

  // Detect session completion
  useEffect(() => {
    if (phase === 'studying' && isSessionDone) {
      resetSession()
      setPhase('complete')
    }
  }, [phase, isSessionDone, resetSession])

  // Keyboard shortcuts
  useEffect(() => {
    if (phase !== 'studying') return
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault()
        handleFlip()
      }
      if (isFlipped && !submitReview.isPending) {
        if (e.key === '1') handleRating('again')
        if (e.key === '2') handleRating('hard')
        if (e.key === '3') handleRating('good')
        if (e.key === '4') handleRating('easy')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [phase, isFlipped, handleRating, submitReview.isPending])

  // Intro screen
  if (phase === 'intro') {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-[80vh] px-6 animate-fade-in"
        data-testid="review-page-intro"
      >
        <div className="text-center max-w-md">
          <p className="text-xs tracking-[0.3em] text-ink-muted uppercase mb-4 font-ui">
            Study Session
          </p>
          <h1 className="text-3xl font-display font-semibold mb-4">开始学习</h1>
          {isLoadingDue ? (
            <p className="text-sm text-ink-muted animate-pulse mb-8">加载待复习卡片...</p>
          ) : (
            <p className="text-sm text-ink-muted mb-2">今日有 {dueCards.length} 张卡片等待复习</p>
          )}

          <div className="flex justify-center gap-6 my-8">
            <div className="text-center">
              <SketchCircle size={64} className="text-ink/70 mx-auto">
                <span className="text-lg font-semibold">{dailyStats?.reviewCards ?? 0}</span>
              </SketchCircle>
              <p className="text-xs text-ink-muted mt-2">复习</p>
            </div>
            <div className="text-center">
              <SketchCircle size={64} className="text-ink/70 mx-auto">
                <span className="text-lg font-semibold">{dailyStats?.newCards ?? 0}</span>
              </SketchCircle>
              <p className="text-xs text-ink-muted mt-2">新卡片</p>
            </div>
          </div>

          {dueCards.length > 0 ? (
            <SketchButton onClick={handleStart}>开始学习</SketchButton>
          ) : (
            <div>
              <p className="text-sm text-ink-muted mb-4">
                {isLoadingDue ? '' : '暂无待复习卡片！'}
              </p>
              <SketchButton variant="outline" onClick={() => setActiveNavItem('home')}>
                返回首页
              </SketchButton>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Complete screen
  if (phase === 'complete') {
    const ratingCounts = { again: 0, hard: 0, good: 0, easy: 0 }
    results.forEach((r) => {
      ratingCounts[r.rating]++
    })

    return (
      <div
        className="flex flex-col items-center justify-center min-h-[80vh] px-6 animate-fade-in"
        data-testid="review-page-complete"
      >
        <div className="text-center max-w-md">
          <div className="text-5xl mb-6">✓</div>
          <h1 className="text-2xl font-display font-semibold mb-2">学习完成</h1>
          <p className="text-sm text-ink-muted mb-8">完成了 {results.length} 张卡片</p>

          <div className="grid grid-cols-4 gap-4 mb-8">
            <div className="p-3 rounded-lg border border-line-soft/60 text-center">
              <p className="text-lg font-semibold text-red-600">{ratingCounts.again}</p>
              <p className="text-xs text-ink-muted">忘了</p>
            </div>
            <div className="p-3 rounded-lg border border-line-soft/60 text-center">
              <p className="text-lg font-semibold text-orange-600">{ratingCounts.hard}</p>
              <p className="text-xs text-ink-muted">困难</p>
            </div>
            <div className="p-3 rounded-lg border border-line-soft/60 text-center">
              <p className="text-lg font-semibold text-green-600">{ratingCounts.good}</p>
              <p className="text-xs text-ink-muted">一般</p>
            </div>
            <div className="p-3 rounded-lg border border-line-soft/60 text-center">
              <p className="text-lg font-semibold text-blue-600">{ratingCounts.easy}</p>
              <p className="text-xs text-ink-muted">简单</p>
            </div>
          </div>

          <div className="flex gap-3 justify-center">
            <SketchButton onClick={() => setActiveNavItem('home')}>返回首页</SketchButton>
            <SketchButton variant="outline" onClick={() => setActiveNavItem('settings')}>
              查看统计
            </SketchButton>
          </div>
        </div>
      </div>
    )
  }

  // Study screen
  return (
    <div className="min-h-[80vh] flex flex-col" data-testid="review-page-studying">
      {/* Progress header */}
      <header className="p-4 border-b border-line-soft">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <button
            onClick={() => setPhase('intro')}
            aria-label="退出学习会话"
            title="退出学习会话"
            className="p-2 hover:bg-paper-muted rounded-lg transition-colors"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
          <div className="flex-1 mx-4">
            <div className="h-2 bg-paper-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-ink/70 transition-all duration-300"
                style={{ width: `${((currentIndex + 1) / queue.length) * 100}%` }}
              />
            </div>
          </div>
          <span className="text-sm text-ink-muted">
            {currentIndex + 1} / {queue.length}
          </span>
        </div>
      </header>

      {/* Card area */}
      <main className="flex-1 flex items-center justify-center p-6">
        {currentCard && (
          <div
            onClick={handleFlip}
            className="w-full max-w-lg cursor-pointer"
            data-testid="review-current-card"
          >
            <div
              className={cn(
                'relative min-h-[300px] p-8 rounded-xl border border-line-soft/60 bg-paper-card shadow-sm transition-all duration-500',
                isFlipped && 'bg-paper-muted/30'
              )}
              style={{
                transform: isFlipped ? 'rotateX(180deg)' : 'rotateX(0)',
                transformStyle: 'preserve-3d',
              }}
            >
              <div style={{ transform: isFlipped ? 'rotateX(180deg)' : 'rotateX(0)' }}>
                <p className="text-xs text-ink-muted mb-4 uppercase tracking-wider">
                  {isFlipped ? 'Answer' : 'Question'}
                </p>
                {currentCard.cardType === 'cloze' ? (
                  <ClozeCardContent content={currentCard.front} revealed={isFlipped} />
                ) : currentCard.cardType === 'choice' ? (
                  <>
                    <ChoiceCardContent content={currentCard.front} revealed={isFlipped} />
                    {isFlipped && currentCard.back && (
                      <div className="mt-4 pt-3 border-t border-line-soft/40">
                        <p className="text-xs text-ink-muted mb-1">解析</p>
                        <CardContentRenderer content={currentCard.back} />
                      </div>
                    )}
                  </>
                ) : currentCard.cardType === 'image_occlusion' ? (
                  <>
                    <ImageOcclusionCardContent content={currentCard.front} revealed={isFlipped} />
                    {isFlipped && currentCard.back ? (
                      <div className="mt-4 pt-3 border-t border-line-soft/40">
                        <p className="text-xs text-ink-muted mb-1">解析</p>
                        <CardContentRenderer content={currentCard.back} />
                      </div>
                    ) : null}
                  </>
                ) : (
                  <CardContentRenderer content={isFlipped ? currentCard.back : currentCard.front} />
                )}
              </div>
              {!isFlipped && (
                <div className="absolute bottom-6 left-0 right-0 text-center">
                  <p className="text-xs text-ink-muted">点击卡片或按空格键显示答案</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Rating buttons */}
      {isFlipped && (
        <footer className="p-6 border-t border-line-soft animate-fade-in">
          <div className="max-w-lg mx-auto">
            <p className="text-xs text-ink-muted text-center mb-4">你记住了吗？</p>
            <div className="grid grid-cols-4 gap-3">
              {[
                { key: 'again' as const, label: '忘了', color: 'text-red-600', hint: '1' },
                { key: 'hard' as const, label: '困难', color: 'text-orange-600', hint: '2' },
                { key: 'good' as const, label: '一般', color: 'text-green-600', hint: '3' },
                { key: 'easy' as const, label: '简单', color: 'text-blue-600', hint: '4' },
              ].map((rating) => (
                <button
                  key={rating.key}
                  onClick={() => handleRating(rating.key)}
                  disabled={submitReview.isPending}
                  data-testid={`review-rate-${rating.key}`}
                  className={cn(
                    'py-4 px-2 rounded-lg border border-line-soft/60 hover:bg-paper-muted/50 transition-all',
                    'flex flex-col items-center gap-1',
                    submitReview.isPending && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <span className={cn('font-medium', rating.color)}>{rating.label}</span>
                  <span className="text-xs text-ink-muted">{rating.hint}</span>
                </button>
              ))}
            </div>
          </div>
        </footer>
      )}
    </div>
  )
}
