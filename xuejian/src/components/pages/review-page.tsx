import { BookOpen, CheckCircle2, RotateCcw } from 'lucide-react'
import { Badge, Button, Card, CardContent, EmptyState } from '@/components/ui'
import { cn } from '@/lib/utils'
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

function PageHeader({ todayPoints, currentIndex, totalCards, progressPercent, showProgress }: { todayPoints: number; currentIndex: number; totalCards: number; progressPercent: number; showProgress: boolean }) {
  return (
    <div className="mb-6 flex items-center justify-between">
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">SPACED REVIEW</p>
        <h1 className="mt-1 text-2xl font-medium text-foreground" data-testid="app-shell-page-title">
          复习
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">恢复参考编码里的 PageHeader、FlipCard、评分条和键盘提示结构。</p>
      </div>
      <div className="flex items-center gap-6">
        {showProgress ? (
          <div className="text-right">
            <p className="text-xs text-muted-foreground">本次会话进度</p>
            <div className="mt-1 flex items-center gap-3">
              <div className="h-2 w-32 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-foreground/70 transition-all duration-300" style={{ width: `${progressPercent}%` }} />
              </div>
              <span className="text-sm font-medium tabular-nums">
                {Math.min(currentIndex + 1, totalCards)} / {totalCards}
              </span>
            </div>
          </div>
        ) : null}
        <div className="text-right">
          <p className="text-xs text-muted-foreground">今日积分</p>
          <p className="text-xl font-semibold text-chart-1">+{todayPoints}</p>
        </div>
      </div>
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
    <div className="mx-auto w-full max-w-3xl cursor-pointer perspective-1000" onClick={onFlip} data-testid="review-current-card">
      <Card className="relative min-h-[400px] border-border/50 bg-card shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05),0_4px_16px_-4px_rgba(0,0,0,0.05)] transition-all duration-500">
        <CardContent className="flex min-h-[400px] flex-col p-8">
          <div className="flex items-center justify-between">
            <Badge variant="secondary" className="rounded-md bg-chart-5/10 px-3 py-1 font-normal text-chart-5">
              {card.documentTitle} · {card.pageLabel}
            </Badge>
            <span className="text-sm text-muted-foreground">
              卡片 {currentIndex + 1} / {totalCards}
            </span>
          </div>
          <div className="flex flex-1 items-center justify-center py-12">
            {!isFlipped ? (
              <h2 className="text-center text-2xl font-medium leading-relaxed text-foreground">{card.front}</h2>
            ) : (
              <div className="text-center">
                <p className="text-lg leading-relaxed text-muted-foreground">{card.back}</p>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{isFlipped ? '选择评分推进下一张卡片' : '点击卡片或按空格查看答案'}</span>
            <RotateCcw className="h-4 w-4" />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function RatingButton({
  label,
  hotkey,
  variant,
  onClick,
  disabled,
}: {
  label: string
  hotkey: string
  variant: 'again' | 'hard' | 'good' | 'easy'
  onClick: () => void
  disabled?: boolean
}) {
  const variants = {
    again: 'border-destructive/20 hover:bg-destructive/5 hover:border-destructive/40',
    hard: 'border-chart-5/20 hover:bg-chart-5/5 hover:border-chart-5/40',
    good: 'border-chart-1/20 hover:bg-chart-1/5 hover:border-chart-1/40',
    easy: 'border-chart-3/20 hover:bg-chart-3/5 hover:border-chart-3/40',
  }
  return (
    <Button
      variant="outline"
      className={cn('h-auto flex-1 flex-col gap-1 rounded-xl py-4 transition-all', variants[variant], disabled && 'pointer-events-none opacity-50')}
      onClick={onClick}
      disabled={disabled}
      data-testid={`review-rate-${variant}`}
    >
      <span className="text-sm font-medium">{label}</span>
      <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
        <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px]">{hotkey}</kbd>
      </div>
    </Button>
  )
}

function KeyboardHints() {
  return (
    <div className="mt-6 flex items-center justify-center gap-6 text-xs text-muted-foreground">
      <span><kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px]">1</kbd> Again</span>
      <span><kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px]">2</kbd> Hard</span>
      <span><kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px]">3</kbd> Good</span>
      <span><kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px]">4</kbd> Easy</span>
      <span><kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px]">Space</kbd> 翻卡</span>
    </div>
  )
}

export function ReviewPage(props: ReviewPageProps) {
  if (props.mode === 'empty') {
    return (
      <div className="flex h-full flex-col p-6">
        <PageHeader todayPoints={props.todayPoints} currentIndex={0} totalCards={0} progressPercent={0} showProgress={false} />
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            icon={BookOpen}
            title="暂无待复习卡片"
            description="上传文档并生成卡片后，系统会在这里安排到期复习。"
            action={{ label: '去卡片工坊', onClick: props.onOpenCards }}
          />
        </div>
      </div>
    )
  }

  if (props.mode === 'complete') {
    return (
      <div className="flex h-full flex-col p-6" data-testid="review-page-complete">
        <PageHeader todayPoints={props.todayPoints} currentIndex={props.reviewedCount} totalCards={props.totalCards} progressPercent={100} showProgress={false} />
        <div className="flex flex-1 flex-col items-center justify-center gap-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-chart-1/30 bg-chart-1/10">
            <CheckCircle2 className="h-8 w-8 text-chart-1" />
          </div>
          <div className="text-center">
            <h2 className="text-xl font-medium text-foreground">本轮复习已完成</h2>
            <p className="mt-2 text-sm text-muted-foreground">今日复习卡片已全部处理完，可以回到首页或继续查看卡片库。</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" className="gap-2 rounded-lg" onClick={props.onOpenCards}>
              <BookOpen className="h-4 w-4" />
              查看卡片库
            </Button>
            <Button className="rounded-lg" onClick={props.onBackHome}>
              返回首页
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (props.mode === 'intro') {
    return (
      <div className="flex h-full flex-col p-6" data-testid="review-page-intro">
        <PageHeader todayPoints={props.todayPoints} currentIndex={0} totalCards={props.totalCards} progressPercent={0} showProgress={false} />
        <div className="grid flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="border-border/50 bg-card">
            <CardContent className="space-y-6 p-6">
              <div>
                <h3 className="text-base font-medium text-foreground">本次会话</h3>
                <p className="mt-1 text-sm text-muted-foreground">在开始前，只展示最必要的总览信息。</p>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">待复习</p>
                  <p className="mt-1 text-2xl font-semibold">{props.dueCount}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">今日已复习</p>
                  <p className="mt-1 text-2xl font-semibold">{props.reviewCount}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">今日新卡</p>
                  <p className="mt-1 text-2xl font-semibold">{props.newCardCount}</p>
                </div>
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
          <Card className="border-border/50 bg-card">
            <CardContent className="space-y-4 p-6">
              <h3 className="text-sm font-medium text-foreground">键盘提示</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">空格翻卡，1-4 快速评分。开始后页面会收束成单卡片主舞台。</p>
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
        todayPoints={props.todayPoints}
        currentIndex={props.currentIndex}
        totalCards={props.totalCards}
        progressPercent={props.progressPercent}
        showProgress
      />
      <div className="flex-1 py-8">
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
          <Button variant="ghost" size="sm" onClick={props.onBackToIntro}>
            返回总览
          </Button>
        </div>
        <div className="flex gap-4" data-testid="review-toolbar">
          <RatingButton label="Again" hotkey="1" variant="again" onClick={() => props.onRate('again')} disabled={!props.isFlipped || props.isSubmitting} />
          <RatingButton label="Hard" hotkey="2" variant="hard" onClick={() => props.onRate('hard')} disabled={!props.isFlipped || props.isSubmitting} />
          <RatingButton label="Good" hotkey="3" variant="good" onClick={() => props.onRate('good')} disabled={!props.isFlipped || props.isSubmitting} />
          <RatingButton label="Easy" hotkey="4" variant="easy" onClick={() => props.onRate('easy')} disabled={!props.isFlipped || props.isSubmitting} />
        </div>
        <KeyboardHints />
      </div>
    </div>
  )
}
