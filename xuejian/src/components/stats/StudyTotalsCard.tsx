import { cn } from '@/lib/utils'

interface StudyTotalsCardProps {
  /** Today's study minutes. Pass `null` when the data is not yet available. */
  todayMinutes: number | null
  /** Current week's study minutes. */
  weekMinutes: number | null
  /** All-time study minutes. */
  totalMinutes: number | null
  /** Consecutive learning streak in days. */
  streakDays?: number | null
  className?: string
}

/**
 * Displays learning-time totals in a paper card layout. Numbers stay in
 * `font-display tabular-nums` to preserve a documentary rhythm; missing
 * data shows `--` rather than collapsing the row to keep layout stable.
 */
export function StudyTotalsCard({
  todayMinutes,
  weekMinutes,
  totalMinutes,
  streakDays,
  className,
}: StudyTotalsCardProps) {
  return (
    <div className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-4', className)}>
      <Metric label="今日学习" value={formatMinutes(todayMinutes)} unit="分钟" />
      <Metric label="本周累计" value={formatMinutes(weekMinutes)} unit="分钟" />
      <Metric label="总时长" value={formatTotal(totalMinutes)} unit={totalUnit(totalMinutes)} />
      <Metric
        label="连续天数"
        value={streakDays != null ? `${streakDays}` : '--'}
        unit={streakDays && streakDays > 0 ? '天' : ''}
      />
    </div>
  )
}

function Metric({
  label,
  value,
  unit,
}: {
  label: string
  value: string
  unit: string
}) {
  return (
    <div className="rounded-card border border-line-soft bg-paper-card/80 px-4 py-4">
      <p className="font-ui text-[11px] uppercase tracking-[0.22em] text-ink-soft">
        {label}
      </p>
      <div className="mt-3 flex items-baseline gap-1">
        <span className="font-display text-2xl tabular-nums text-ink">{value}</span>
        {unit ? <span className="font-ui text-xs text-ink-muted">{unit}</span> : null}
      </div>
    </div>
  )
}

function formatMinutes(value: number | null): string {
  if (value == null) return '--'
  if (value <= 0) return '0'
  return `${Math.round(value)}`
}

function formatTotal(value: number | null): string {
  if (value == null) return '--'
  if (value < 60) return `${Math.round(value)}`
  const hours = value / 60
  if (hours < 100) return hours.toFixed(1)
  return `${Math.round(hours)}`
}

function totalUnit(value: number | null): string {
  if (value == null) return '分钟'
  return value < 60 ? '分钟' : '小时'
}
