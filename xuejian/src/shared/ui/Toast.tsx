import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type ToastTone = 'info' | 'success' | 'warning' | 'error'

export function ToastNotice({
  tone = 'info',
  title,
  description,
  action,
  className,
}: {
  tone?: ToastTone
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  const toneClass =
    tone === 'error'
      ? 'border-destructive/25 bg-destructive/10'
      : tone === 'warning'
        ? 'border-themeAccent-warning/30 bg-themeAccent-warning/10'
        : tone === 'success'
          ? 'border-themeAccent-success/25 bg-themeAccent-success/10'
          : 'border-line-soft bg-paper-card'

  return (
    <div className={cn('rounded-lg border px-4 py-3 text-sm text-ink shadow-card', toneClass, className)} role="status">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{title}</p>
          {description ? <p className="mt-1 text-xs leading-5 text-ink-muted">{description}</p> : null}
        </div>
        {action}
      </div>
    </div>
  )
}
