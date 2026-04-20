import { useDailyStatsQuery } from '@/queries'

interface StudyStatsCardProps {
  className?: string
}

export function StudyStatsCard({ className }: StudyStatsCardProps) {
  const { data: stats, isLoading } = useDailyStatsQuery()

  if (isLoading) {
    return (
      <div className={className}>
        <div className="animate-pulse space-y-3">
          <div className="h-3 w-20 rounded bg-paper-muted" />
          <div className="h-8 w-12 rounded bg-paper-muted" />
        </div>
      </div>
    )
  }

  const newCards = stats?.newCards ?? 0
  const reviewCards = stats?.reviewCards ?? 0
  const correctRate = stats?.correctRate ?? null
  const total = newCards + reviewCards

  return (
    <div className={className}>
      <div className="flex items-end gap-6">
        <div>
          <p className="font-ui text-xs text-ink-soft">今日待学</p>
          <p className="mt-1 font-display text-3xl tabular-nums text-ink">{total}</p>
        </div>
        <div className="mb-1 flex gap-4 text-sm text-ink-muted">
          <span>
            新卡 <span className="tabular-nums text-ink">{newCards}</span>
          </span>
          <span>
            复习 <span className="tabular-nums text-ink">{reviewCards}</span>
          </span>
          {correctRate !== null && (
            <span>
              正确率 <span className="tabular-nums text-ink">{Math.round(correctRate * 100)}%</span>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
