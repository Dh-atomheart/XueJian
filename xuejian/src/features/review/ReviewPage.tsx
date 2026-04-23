import { useCallback, useEffect, useState } from 'react'
import { CardContentRenderer } from '@/components/cards/CardContentRenderer'
import { ChoiceCardContent } from '@/components/cards/ChoiceCardContent'
import { ClozeCardContent } from '@/components/cards/ClozeCardContent'
import { ImageOcclusionCardContent } from '@/components/cards/ImageOcclusionCardContent'
import { Button, Panel } from '@/components/ui'
import { cn } from '@/lib/utils'
import { useAppUiStore } from '@/store'
import { useLearningSessionStore } from '@/store/learning'
import { useDailyStatsQuery, useDueCardsQuery, useSubmitReviewMutation } from '@/queries/learning'
import type { ReviewRating } from '@/services/learning'

type StudyPhase = 'intro' | 'studying' | 'complete'

const RATING_META: Array<{
  key: ReviewRating
  label: string
  hint: string
  activeClass: string
}> = [
  { key: 'again', label: 'Again', hint: '1', activeClass: 'border-line-soft bg-highlight-pink/20 text-ink' },
  { key: 'hard', label: 'Hard', hint: '2', activeClass: 'border-line-soft bg-highlight-yellow/20 text-ink' },
  { key: 'good', label: 'Good', hint: '3', activeClass: 'border-line-soft bg-highlight-green/20 text-ink' },
  { key: 'easy', label: 'Easy', hint: '4', activeClass: 'border-line-soft bg-highlight-blue/20 text-ink' },
]

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

  const handleFlip = useCallback(() => {
    if (!isFlipped) {
      flipCard()
    }
  }, [flipCard, isFlipped])

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
    [advanceCard, currentCard, submitReview]
  )

  useEffect(() => {
    if (phase === 'studying' && isSessionDone) {
      resetSession()
      setPhase('complete')
    }
  }, [isSessionDone, phase, resetSession])

  useEffect(() => {
    if (phase !== 'studying') return

    const handler = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        event.preventDefault()
        handleFlip()
      }

      if (isFlipped && !submitReview.isPending) {
        if (event.key === '1') handleRating('again')
        if (event.key === '2') handleRating('hard')
        if (event.key === '3') handleRating('good')
        if (event.key === '4') handleRating('easy')
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleFlip, handleRating, isFlipped, phase, submitReview.isPending])

  if (phase === 'intro') {
    return (
      <div className="mx-auto flex min-h-[76vh] w-full max-w-6xl items-center justify-center" data-testid="review-page-intro">
        <Panel variant="paperCard" className="w-full max-w-5xl rounded-[34px] p-8 md:p-10">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_320px] lg:items-center">
            <div className="space-y-5">
              <p className="font-latin-meta text-[11px] uppercase tracking-[0.34em] text-ink-soft">
                SPACE REVIEW
              </p>
              <h1 className="font-display text-4xl text-ink md:text-5xl">复习中</h1>
              <p className="max-w-2xl text-sm leading-7 text-ink-muted">
                按今天的到期卡片开始学习。首屏保持设计稿的单一焦点，不在这里堆叠太多面板。
              </p>

              <div className="flex flex-wrap gap-6">
                <IntroMetric label="本次会话" value={dueCards.length} />
                <IntroMetric label="今日复习" value={dailyStats?.reviewCards ?? 0} />
                <IntroMetric label="新卡知识" value={dailyStats?.newCards ?? 0} />
              </div>

              <div className="flex flex-wrap gap-3">
                {dueCards.length > 0 ? (
                  <Button
                    className="rounded-full px-6"
                    data-testid="review-start-session"
                    onClick={handleStart}
                  >
                    开始学习
                  </Button>
                ) : (
                  <Button variant="outline" className="rounded-full px-6" onClick={() => setActiveNavItem('home')}>
                    返回首页
                  </Button>
                )}
                <Button variant="ghost" className="rounded-full px-6" onClick={() => setActiveNavItem('settings')}>
                  学习设置
                </Button>
              </div>
            </div>

            <div className="rounded-[30px] border border-line-soft/80 bg-paper-base/86 p-6 shadow-paper">
              <p className="font-ui text-[11px] uppercase tracking-[0.24em] text-ink-soft">SESSION NOTE</p>
              <p className="mt-3 font-ui text-lg text-ink">
                {isLoadingDue
                  ? '正在加载今日卡片...'
                  : dueCards.length > 0
                    ? '先完成到期复习，再判断是否继续吸收新知识。'
                    : '今天的到期卡片已清空。'}
              </p>
              <p className="mt-2 text-sm leading-6 text-ink-muted">
                使用空格翻卡，使用 1-4 快速评分。学习会话保持轻量，不打断你的节奏。
              </p>
            </div>
          </div>
        </Panel>
      </div>
    )
  }

  if (phase === 'complete') {
    const ratingCounts = { again: 0, hard: 0, good: 0, easy: 0 }
    results.forEach((result) => {
      ratingCounts[result.rating] += 1
    })

    return (
      <div className="mx-auto flex min-h-[76vh] w-full max-w-5xl items-center justify-center" data-testid="review-page-complete">
        <Panel variant="paperCard" className="w-full rounded-[34px] p-8 md:p-10 text-center">
          <p className="font-latin-meta text-[11px] uppercase tracking-[0.34em] text-ink-soft">
            SESSION COMPLETE
          </p>
          <h1 className="mt-4 font-display text-4xl text-ink">学习完成</h1>
          <p className="mt-3 text-sm leading-7 text-ink-muted">本次共完成 {results.length} 张卡片。</p>

          <div className="mt-8 grid gap-4 sm:grid-cols-4">
            {RATING_META.map((item) => (
              <div key={item.key} className={cn('rounded-[24px] border px-4 py-5', item.activeClass)}>
                <p className="font-display text-3xl">{ratingCounts[item.key]}</p>
                <p className="mt-2 font-ui text-xs uppercase tracking-[0.18em]">{item.label}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 flex justify-center gap-3">
            <Button className="rounded-full px-6" onClick={() => setActiveNavItem('home')}>
              返回首页
            </Button>
            <Button variant="outline" className="rounded-full px-6" onClick={() => setActiveNavItem('profile')}>
              查看统计
            </Button>
          </div>
        </Panel>
      </div>
    )
  }

  const progress = queue.length > 0 ? ((currentIndex + 1) / queue.length) * 100 : 0

  return (
    <div className="mx-auto flex min-h-[78vh] w-full max-w-6xl flex-col gap-5" data-testid="review-page-studying">
      <Panel variant="paperCard" className="rounded-[28px] px-5 py-4 md:px-6">
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => setPhase('intro')}
            data-testid="review-back-to-intro"
            className="rounded-full border border-line-soft px-3 py-2 text-sm text-ink-muted transition hover:text-ink"
            aria-label="退出学习会话"
            title="退出学习会话"
          >
            返回
          </button>

          <div className="min-w-[180px] flex-1">
            <div className="mb-2 flex items-center justify-between text-xs text-ink-soft">
              <span>SESSION PROGRESS</span>
              <span>
                {Math.min(currentIndex + 1, queue.length)} / {queue.length}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-paper-muted">
              <div className="h-full rounded-full bg-ink/75 transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <div className="rounded-full border border-line-soft bg-paper-base/78 px-4 py-2 text-sm text-ink-muted">
            空格翻卡，1-4 评分
          </div>
        </div>
      </Panel>

      <div className="grid flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_240px]">
        <main className="flex min-h-[560px] items-center justify-center">
          {currentCard ? (
            <div
              role="button"
              tabIndex={0}
              className="w-full text-left"
              onClick={handleFlip}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  handleFlip()
                }
              }}
              data-testid="review-current-card"
            >
              <Panel
                variant="paperCard"
                className={cn(
                  'min-h-[520px] rounded-[34px] px-8 py-10 md:px-12',
                  isFlipped ? 'bg-paper-base/92' : 'bg-paper-card'
                )}
              >
                <div className="flex h-full flex-col justify-between gap-6">
                  <div>
                    <p className="font-latin-meta text-[11px] uppercase tracking-[0.32em] text-ink-soft">
                      {isFlipped ? 'ANSWER' : 'QUESTION'}
                    </p>
                    <div className="mt-8 text-lg leading-8 text-ink md:text-[1.32rem] md:leading-10">
                      {currentCard.cardType === 'cloze' ? (
                        <ClozeCardContent content={currentCard.front} revealed={isFlipped} />
                      ) : currentCard.cardType === 'choice' ? (
                        <>
                          <ChoiceCardContent content={currentCard.front} revealed={isFlipped} />
                          {isFlipped && currentCard.back ? (
                            <div className="mt-6 border-t border-line-soft/50 pt-4">
                              <p className="mb-2 text-xs uppercase tracking-[0.22em] text-ink-soft">解析</p>
                              <CardContentRenderer content={currentCard.back} />
                            </div>
                          ) : null}
                        </>
                      ) : currentCard.cardType === 'image_occlusion' ? (
                        <>
                          <ImageOcclusionCardContent content={currentCard.front} revealed={isFlipped} />
                          {isFlipped && currentCard.back ? (
                            <div className="mt-6 border-t border-line-soft/50 pt-4">
                              <p className="mb-2 text-xs uppercase tracking-[0.22em] text-ink-soft">解析</p>
                              <CardContentRenderer content={currentCard.back} />
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <CardContentRenderer content={isFlipped ? currentCard.back : currentCard.front} />
                      )}
                    </div>
                  </div>

                  {!isFlipped ? (
                    <div className="rounded-[24px] border border-dashed border-line-soft px-5 py-4 text-center text-sm text-ink-muted">
                      点击卡片或按空格显示答案
                    </div>
                  ) : null}
                </div>
              </Panel>
            </div>
          ) : null}
        </main>

        <aside className="space-y-4">
          <Panel variant="paperCard" className="rounded-[28px] p-5">
            <p className="font-ui text-[11px] uppercase tracking-[0.24em] text-ink-soft">QUEUE</p>
            <div className="mt-4 flex justify-center">
              <div className="flex h-28 w-28 items-center justify-center rounded-full border border-line-soft bg-paper-base/82 shadow-paper">
                <span className="font-display text-4xl leading-none text-ink">
                  {queue.length - Math.min(currentIndex, queue.length)}
                </span>
              </div>
            </div>
            <p className="mt-4 text-center text-sm leading-6 text-ink-muted">剩余待处理卡片</p>
          </Panel>

          {isFlipped ? (
            <Panel variant="paperCard" className="rounded-[28px] p-4">
              <p className="font-ui text-[11px] uppercase tracking-[0.24em] text-ink-soft">RATE CARD</p>
              <div className="mt-4 grid gap-3">
                {RATING_META.map((rating) => (
                  <button
                    key={rating.key}
                    type="button"
                    onClick={() => handleRating(rating.key)}
                    disabled={submitReview.isPending}
                    data-testid={`review-rate-${rating.key}`}
                    className={cn(
                      'rounded-[20px] border px-4 py-4 text-left transition',
                      rating.activeClass,
                      submitReview.isPending && 'cursor-not-allowed opacity-60'
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-ui text-sm uppercase tracking-[0.16em]">{rating.label}</span>
                      <span className="font-display text-xl">{rating.hint}</span>
                    </div>
                  </button>
                ))}
              </div>
            </Panel>
          ) : (
            <Panel variant="paperCard" className="rounded-[28px] p-5">
              <p className="font-ui text-[11px] uppercase tracking-[0.24em] text-ink-soft">REMINDER</p>
              <p className="mt-3 text-sm leading-7 text-ink-muted">
                先完整回忆，再翻看答案。评分越准确，后续复习节奏越稳定。
              </p>
            </Panel>
          )}
        </aside>
      </div>
    </div>
  )
}

function IntroMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[24px] border border-line-soft/75 bg-paper-base/82 px-5 py-5 shadow-paper">
      <p className="font-ui text-[10px] uppercase tracking-[0.24em] text-ink-soft">{label}</p>
      <p className="mt-3 font-display text-4xl text-ink">{value}</p>
    </div>
  )
}
