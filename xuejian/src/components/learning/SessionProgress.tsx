interface SessionProgressProps {
  reviewed: number
  total: number
}

export function SessionProgress({ reviewed, total }: SessionProgressProps) {
  const remaining = Math.max(0, total - reviewed)
  const ratio = total > 0 ? reviewed / total : 0

  return (
    <div className="flex items-center gap-4 px-6 py-3">
      <div className="flex items-center gap-2 font-ui text-sm text-ink-muted">
        <span className="tabular-nums text-ink">{reviewed}</span>
        <span>/</span>
        <span className="tabular-nums">{total}</span>
      </div>

      <div className="flex-1">
        <div className="h-1.5 overflow-hidden rounded-full bg-paper-muted">
          <div
            className="h-full rounded-full bg-ink/20 transition-all duration-500 ease-out"
            style={{ width: `${Math.min(100, ratio * 100)}%` }}
          />
        </div>
      </div>

      <span className="font-ui text-xs text-ink-soft">
        剩余 {remaining} 张
      </span>
    </div>
  )
}
