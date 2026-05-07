import { useState } from 'react'
import { BookOpen, CheckCircle2, Pause, RotateCcw } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
} from '@/shared/ui'
import { ReviewFeedbackButtons } from '@/components/learning'
import type { ReviewRating } from '@/services/learning'

export interface ReviewCardView {
  id: string
  front: string
  back: string
  documentTitle: string
  pageLabel: string
}

export interface ReviewPageProps {
  mode: 'intro' | 'studying' | 'complete' | 'empty'
  currentCard: ReviewCardView | null
  currentIndex: number
  totalCards: number
  reviewedCount: number
  progressPercent: number
  todayPoints: number
  isFlipped: boolean
  isSubmitting?: boolean
  dueCount: number
  reviewCount: number
  newCardCount: number
  ratingCounts?: Record<ReviewRating, number>
  onStart: () => void
  onFlip: () => void
  onRate: (rating: ReviewRating) => void
  onBackHome: () => void
  onOpenCards: () => void
  onOpenSettings: () => void
  onBackToIntro: () => void
}

function PageHeader({
  currentIndex,
  totalCards,
  progressPercent,
  showProgress,
}: {
  currentIndex: number
  totalCards: number
  progressPercent: number
  showProgress: boolean
}) {
  return (
    <div className="mb-6 flex items-center justify-between gap-4">
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-ink-soft">Spaced Review</p>
        <h1 className="mt-1 text-2xl font-medium text-ink" data-testid="app-shell-page-title">
          今日复习
        </h1>
        <p className="mt-1 text-sm text-ink-muted">一次只看一张卡片，翻面后再给出反馈。</p>
      </div>
      {showProgress ? (
        <div className="min-w-[190px] text-right">
          <p className="text-xs text-ink-muted">队列进度</p>
          <div className="mt-1 flex items-center gap-3">
            <div className="h-2 w-32 overflow-hidden rounded-full bg-paper-muted">
              <div
                className="h-full rounded-full bg-highlight-green transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="text-sm font-medium tabular-nums text-ink">
              {Math.min(currentIndex + 1, totalCards)} / {totalCards}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function FlipCard({
  card,
  isFlipped,
  onFlip,
  currentIndex,
  totalCards,
}: {
  card: ReviewCardView
  isFlipped: boolean
  onFlip: () => void
  currentIndex: number
  totalCards: number
}) {
  return (
    <button
      type="button"
      className="mx-auto block w-full max-w-3xl text-left"
      onClick={onFlip}
      data-testid="review-current-card"
    >
      <Card className="min-h-[390px] border-line-soft bg-paper-card transition hover:border-ink/20">
        <CardContent className="flex min-h-[390px] flex-col p-7">
          <div className="flex items-center justify-between gap-3">
            <Badge variant="secondary" className="rounded-md px-3 py-1 font-normal">
              {card.documentTitle} · {card.pageLabel}
            </Badge>
            <span className="text-sm text-ink-muted">
              卡片 {currentIndex + 1} / {totalCards}
            </span>
          </div>
          <div className="flex flex-1 items-center justify-center py-12">
            {!isFlipped ? (
              <h2 className="text-center text-2xl font-medium leading-relaxed text-ink">
                {card.front}
              </h2>
            ) : (
              <p className="text-center text-lg leading-relaxed text-ink-muted">{card.back}</p>
            )}
          </div>
          <div className="flex items-center justify-between text-xs text-ink-soft">
            <span>{isFlipped ? '选择记忆反馈进入下一张。' : '点击卡片或按空格翻面。'}</span>
            <RotateCcw className="h-4 w-4" />
          </div>
        </CardContent>
      </Card>
    </button>
  )
}

export function ReviewPage(props: ReviewPageProps) {
  const [pauseConfirmOpen, setPauseConfirmOpen] = useState(false)

  if (props.mode === 'empty') {
    return (
      <div className="flex h-full flex-col p-6">
        <PageHeader currentIndex={0} totalCards={0} progressPercent={0} showProgress={false} />
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            icon={BookOpen}
            title="今天没有待复习卡片"
            description="导入文档并创建 Basic 卡后，系统会按间隔重复安排复习。"
            action={{ label: '管理卡片', onClick: props.onOpenCards }}
          />
        </div>
      </div>
    )
  }

  if (props.mode === 'complete') {
    return (
      <div className="flex h-full flex-col p-6" data-testid="review-page-complete">
        <PageHeader currentIndex={props.reviewedCount} totalCards={props.totalCards} progressPercent={100} showProgress={false} />
        <div className="flex flex-1 flex-col items-center justify-center gap-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-highlight-green/45 bg-highlight-green/14">
            <CheckCircle2 className="h-8 w-8 text-ink" />
          </div>
          <div className="text-center">
            <h2 className="text-xl font-medium text-ink">今日复习已完成</h2>
            <p className="mt-2 text-sm text-ink-muted">学习记录已保存，下一次复习会自动进入队列。</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={props.onOpenCards}>
              <BookOpen className="h-4 w-4" />
              查看卡片
            </Button>
            <Button onClick={props.onBackHome}>返回首页</Button>
          </div>
        </div>
      </div>
    )
  }

  if (props.mode === 'intro') {
    return (
      <div className="flex h-full flex-col p-6" data-testid="review-page-intro">
        <PageHeader currentIndex={0} totalCards={props.totalCards} progressPercent={0} showProgress={false} />
        <div className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card>
            <CardContent className="space-y-6 p-5">
              <div>
                <h3 className="text-base font-medium text-ink">今日队列</h3>
                <p className="mt-1 text-sm text-ink-muted">建议一次完成当前队列，减少上下文切换。</p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Stat label="待复习" value={props.dueCount} />
                <Stat label="复习卡" value={props.reviewCount} />
                <Stat label="新卡" value={props.newCardCount} />
              </div>
              <div className="flex gap-3">
                <Button onClick={props.onStart} data-testid="review-start-session">
                  开始复习
                </Button>
                <Button variant="outline" onClick={props.onOpenSettings}>
                  学习设置
                </Button>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-4 p-5">
              <h3 className="text-sm font-medium text-ink">复习反馈</h3>
              <p className="text-sm leading-relaxed text-ink-muted">
                翻面后选择 忘记 / 模糊 / 记得 / 熟练。快捷键为 1-4，空格用于翻面。
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (!props.currentCard) return null

  return (
    <div className="flex h-full flex-col p-6" data-testid="review-page-studying">
      <PageHeader
        currentIndex={props.currentIndex}
        totalCards={props.totalCards}
        progressPercent={props.progressPercent}
        showProgress
      />
      <div className="flex-1 py-6">
        <FlipCard
          card={props.currentCard}
          isFlipped={props.isFlipped}
          onFlip={props.onFlip}
          currentIndex={props.currentIndex}
          totalCards={props.totalCards}
        />
      </div>
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-4 flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => setPauseConfirmOpen(true)}>
            <Pause className="h-4 w-4" />
            暂停
          </Button>
        </div>
        <ReviewFeedbackButtons
          className="w-full"
          onRate={props.onRate}
          disabled={!props.isFlipped || props.isSubmitting}
          data-testid="review-toolbar"
        />
      </div>
      <Dialog open={pauseConfirmOpen} onOpenChange={setPauseConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>暂停本次复习？</DialogTitle>
            <DialogDescription>
              已提交的反馈会保留；当前未评分卡片会回到队列，稍后可以继续复习。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPauseConfirmOpen(false)}>
              继续复习
            </Button>
            <Button
              onClick={() => {
                setPauseConfirmOpen(false)
                props.onBackToIntro()
              }}
            >
              暂停
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-line-soft bg-paper-base/70 px-4 py-3">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{value}</p>
    </div>
  )
}
