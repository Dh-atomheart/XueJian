import type { HTMLAttributes, ReactNode } from 'react'
import { Panel } from './Panel'
import { cn } from '@/lib/utils'

export function PageHeaderBlock({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow: string
  title: string
  description?: string
  actions?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-5 rounded-[28px] border border-line-soft/80 bg-paper-card/90 px-5 py-5 shadow-card md:px-6 md:py-6 xl:flex-row xl:items-end xl:justify-between',
        className
      )}
    >
      <div className="space-y-2">
        <p className="font-latin-meta text-[11px] uppercase tracking-[0.28em] text-ink-soft">
          {eyebrow}
        </p>
        <h1 className="font-ui text-[1.9rem] font-medium leading-tight text-ink md:text-[2.25rem]">
          {title}
        </h1>
        {description ? (
          <p className="max-w-3xl text-sm leading-7 text-ink-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </div>
  )
}

export function PageToolbar({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn(
        'flex flex-col gap-3 rounded-[24px] border border-line-soft/80 bg-paper-muted/60 px-4 py-4 md:flex-row md:flex-wrap md:items-center md:justify-between',
        className
      )}
    >
      {children}
    </div>
  )
}

export function PageSectionCard({
  title,
  description,
  eyebrow,
  headerSlot,
  children,
  className,
  contentClassName,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  title?: string
  description?: string
  eyebrow?: string
  headerSlot?: ReactNode
  contentClassName?: string
}) {
  return (
    <Panel
      {...props}
      variant="paperCard"
      className={cn('rounded-[28px] border-line-soft/80 bg-paper-card/90 p-0', className)}
    >
      {(title || description || eyebrow || headerSlot) && (
        <div className="flex flex-col gap-3 border-b border-line-soft/70 px-5 py-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            {eyebrow ? (
              <p className="font-latin-meta text-[10px] uppercase tracking-[0.24em] text-ink-soft">
                {eyebrow}
              </p>
            ) : null}
            {title ? <h2 className="font-ui text-lg font-medium text-ink">{title}</h2> : null}
            {description ? (
              <p className="text-sm leading-6 text-ink-muted">{description}</p>
            ) : null}
          </div>
          {headerSlot ? <div className="flex flex-wrap items-center gap-2">{headerSlot}</div> : null}
        </div>
      )}
      <div className={cn('px-5 py-4', contentClassName)}>{children}</div>
    </Panel>
  )
}

export function MetricStrip({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={cn('grid gap-3 md:grid-cols-3', className)}>{children}</div>
}

export function MetricTile({
  label,
  value,
  hint,
  className,
}: {
  label: string
  value: ReactNode
  hint?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'rounded-[22px] border border-line-soft/80 bg-paper-base/85 px-4 py-4',
        className
      )}
    >
      <p className="font-latin-meta text-[10px] uppercase tracking-[0.24em] text-ink-soft">
        {label}
      </p>
      <div className="mt-2 font-ui text-2xl font-medium text-ink">{value}</div>
      {hint ? <p className="mt-2 text-xs leading-5 text-ink-muted">{hint}</p> : null}
    </div>
  )
}

export function DetailSidebarCard({
  title,
  children,
  eyebrow,
  className,
  'data-testid': dataTestId,
}: {
  title: string
  children: ReactNode
  eyebrow?: string
  className?: string
  'data-testid'?: string
}) {
  return (
    <Panel
      data-testid={dataTestId}
      variant="paperCard"
      className={cn('rounded-[24px] border-line-soft/80 bg-paper-card/88 p-4', className)}
    >
      <div className="space-y-1 border-b border-line-soft/70 pb-3">
        {eyebrow ? (
          <p className="font-latin-meta text-[10px] uppercase tracking-[0.24em] text-ink-soft">
            {eyebrow}
          </p>
        ) : null}
        <h3 className="font-ui text-sm font-medium text-ink">{title}</h3>
      </div>
      <div className="pt-3">{children}</div>
    </Panel>
  )
}

export function EntityListItem({
  title,
  meta,
  status,
  active = false,
  onClick,
  children,
  className,
  'data-testid': dataTestId,
}: {
  title: string
  meta?: string
  status?: ReactNode
  active?: boolean
  onClick?: () => void
  children?: ReactNode
  className?: string
  'data-testid'?: string
}) {
  const classes = cn(
    'block w-full rounded-[18px] border px-4 py-3 text-left transition-colors',
    active
      ? 'border-ink/20 bg-paper-base shadow-card'
      : 'border-line-soft bg-paper-muted/45 hover:border-ink/20 hover:bg-paper-base/90',
    className
  )

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-ui text-sm text-ink">{title}</p>
          {meta ? <p className="mt-1 text-xs leading-5 text-ink-soft">{meta}</p> : null}
        </div>
        {status ? <div className="shrink-0">{status}</div> : null}
      </div>
      {children ? <div className="mt-3">{children}</div> : null}
    </>
  )

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes} data-testid={dataTestId}>
        {content}
      </button>
    )
  }

  return (
    <div className={classes} data-testid={dataTestId}>
      {content}
    </div>
  )
}

export function InlineStatusPill({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger'
  className?: string
}) {
  const toneClasses =
    tone === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : tone === 'warning'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : tone === 'danger'
          ? 'border-rose-200 bg-rose-50 text-rose-700'
          : tone === 'info'
            ? 'border-sky-200 bg-sky-50 text-sky-700'
            : 'border-line-soft bg-paper-muted text-ink-soft'

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 font-ui text-xs',
        toneClasses,
        className
      )}
    >
      {children}
    </span>
  )
}

export function WorkspaceEmptyState({
  title,
  description,
  action,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div
      {...props}
      className={cn(
        'flex min-h-[240px] flex-col items-center justify-center rounded-[24px] border border-dashed border-line-soft bg-paper-muted/35 px-6 py-10 text-center',
        className
      )}
    >
      <div className="max-w-xl space-y-3">
        <p className="font-ui text-lg font-medium text-ink">{title}</p>
        <p className="text-sm leading-7 text-ink-muted">{description}</p>
      </div>
      {action ? <div className="mt-5 flex flex-wrap justify-center gap-3">{action}</div> : null}
    </div>
  )
}

export function StickyActionBar({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn(
        'sticky bottom-0 z-10 rounded-[22px] border border-line-soft/80 bg-paper-card/95 px-4 py-3 shadow-paper backdrop-blur',
        className
      )}
    >
      {children}
    </div>
  )
}
