import { useMemo } from 'react'
import { cn } from '@/lib/utils'

export interface HeatmapEntry {
  /** ISO date string `YYYY-MM-DD` (local day). */
  date: string
  /** Number of reviews (or events) on that day. */
  count: number
}

interface HeatmapCalendarProps {
  entries: HeatmapEntry[]
  /** Number of trailing weeks to display. Default 16 (~4 months). */
  weeks?: number
  /** Max count used to normalise the color scale. If omitted, uses max in entries. */
  maxCount?: number
  className?: string
  /**
   * Optional renderer for custom tooltip content. Falls back to
   * `YYYY-MM-DD · 复习 N 次`.
   */
  getTooltip?: (entry: HeatmapEntry, isoDate: string) => string
}

/**
 * GitHub-style learning heatmap. Presentational: callers pass aggregated entries.
 *
 * Visuals obey foundation rules:
 * - paper-soft base for empty cells
 * - highlight-green color ramp for activity
 * - hairline separation via rounded corners + gap
 * - `comic-sketch` theme adds a 0.5px ink outline on filled cells via CSS
 */
export function HeatmapCalendar({
  entries,
  weeks = 16,
  maxCount,
  className,
  getTooltip,
}: HeatmapCalendarProps) {
  const { grid, totals, resolvedMax } = useMemo(() => {
    const lookup = new Map<string, number>()
    for (const entry of entries) {
      lookup.set(entry.date, (lookup.get(entry.date) ?? 0) + entry.count)
    }

    const today = startOfLocalDay(new Date())
    // Walk back so the final column ends on today.
    const totalDays = weeks * 7
    const dayOffset = today.getDay() // 0=Sun .. 6=Sat
    const endDate = today
    const startDate = new Date(endDate)
    startDate.setDate(endDate.getDate() - (totalDays - 1) - dayOffset)

    const cells: { date: string; count: number; isFuture: boolean }[] = []
    let total = 0
    let activeDays = 0

    const cursor = new Date(startDate)
    for (let i = 0; i < totalDays + dayOffset; i++) {
      const iso = toIsoDate(cursor)
      const count = lookup.get(iso) ?? 0
      const isFuture = cursor > today
      cells.push({ date: iso, count, isFuture })
      if (!isFuture) {
        total += count
        if (count > 0) activeDays += 1
      }
      cursor.setDate(cursor.getDate() + 1)
    }

    // Split into 7-row x N-col grid
    const rows: { date: string; count: number; isFuture: boolean }[][] = Array.from(
      { length: 7 },
      () => []
    )
    cells.forEach((cell, index) => {
      rows[index % 7].push(cell)
    })

    const max = maxCount ?? Math.max(1, ...cells.map((c) => c.count))

    return {
      grid: rows,
      totals: { total, activeDays },
      resolvedMax: max,
    }
  }, [entries, weeks, maxCount])

  return (
    <div className={cn('space-y-3', className)} data-testid="heatmap-calendar">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="font-ui text-xs uppercase tracking-[0.22em] text-ink-soft">
            学习热力图
          </p>
          <p className="mt-1 font-body text-xs text-ink-muted">
            最近 {weeks} 周 · {totals.activeDays} 活跃日 ·{' '}
            <span className="tabular-nums text-ink">{totals.total}</span> 次复习
          </p>
        </div>
        <Legend />
      </div>

      <div className="flex gap-[3px] overflow-x-auto pb-1">
        <div className="flex shrink-0 flex-col justify-between py-[2px] pr-2 text-[10px] font-latin text-ink-soft/80">
          <span>一</span>
          <span>三</span>
          <span>五</span>
          <span>日</span>
        </div>
        <div className="flex min-w-0 gap-[3px]">
          {transposeColumns(grid).map((column, colIdx) => (
            <div key={colIdx} className="flex flex-col gap-[3px]">
              {column.map((cell, rowIdx) => (
                <HeatCell
                  key={`${colIdx}-${rowIdx}`}
                  cell={cell}
                  max={resolvedMax}
                  tooltip={
                    cell.isFuture
                      ? ''
                      : getTooltip
                        ? getTooltip({ date: cell.date, count: cell.count }, cell.date)
                        : defaultTooltip(cell.date, cell.count)
                  }
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function HeatCell({
  cell,
  max,
  tooltip,
}: {
  cell: { date: string; count: number; isFuture: boolean }
  max: number
  tooltip: string
}) {
  const level = cell.isFuture ? -1 : computeLevel(cell.count, max)
  const levelClass = LEVEL_CLASSES[Math.max(0, level)]

  return (
    <span
      title={tooltip}
      aria-label={tooltip}
      data-level={level}
      className={cn(
        'heatmap-cell block h-[11px] w-[11px] rounded-[3px] transition-transform duration-150',
        cell.isFuture ? 'bg-transparent' : levelClass,
        !cell.isFuture && 'hover:scale-110'
      )}
    />
  )
}

function Legend() {
  return (
    <div className="flex items-center gap-1.5 text-[10px] font-latin text-ink-soft">
      <span>少</span>
      {[0, 1, 2, 3, 4].map((lvl) => (
        <span
          key={lvl}
          className={cn('block h-[10px] w-[10px] rounded-[2px]', LEVEL_CLASSES[lvl])}
        />
      ))}
      <span>多</span>
    </div>
  )
}

const LEVEL_CLASSES: Record<number, string> = {
  0: 'bg-paper-soft',
  1: 'bg-highlight-green/40',
  2: 'bg-highlight-green/60',
  3: 'bg-highlight-green/80',
  4: 'bg-highlight-green',
}

function computeLevel(count: number, max: number): number {
  if (count <= 0) return 0
  if (max <= 1) return 4
  const ratio = count / max
  if (ratio < 0.25) return 1
  if (ratio < 0.5) return 2
  if (ratio < 0.8) return 3
  return 4
}

function transposeColumns<T>(rows: T[][]): T[][] {
  const cols = Math.max(...rows.map((r) => r.length))
  const result: T[][] = Array.from({ length: cols }, () => [])
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < 7; r++) {
      const cell = rows[r][c]
      if (cell !== undefined) {
        result[c].push(cell)
      }
    }
  }
  return result
}

function startOfLocalDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function toIsoDate(date: Date): string {
  const y = date.getFullYear()
  const m = `${date.getMonth() + 1}`.padStart(2, '0')
  const d = `${date.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${d}`
}

function defaultTooltip(date: string, count: number): string {
  if (count <= 0) return `${date} · 无学习记录`
  return `${date} · 复习 ${count} 次`
}
