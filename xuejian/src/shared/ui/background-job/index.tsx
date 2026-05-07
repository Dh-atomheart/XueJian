import { AlertCircle, CheckCircle2, CircleDashed, Loader2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '../Button'

export type BackgroundJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'

export interface BackgroundJobView {
  id: string
  status: BackgroundJobStatus
  progressCurrent?: number | null
  progressTotal?: number | null
  progressMessage?: string | null
  errorMessage?: string | null
  cancelRequestedAt?: Date | string | null
}

const STATUS_META: Record<
  BackgroundJobStatus,
  {
    label: string
    tone: 'neutral' | 'info' | 'success' | 'danger'
    icon: typeof CircleDashed
  }
> = {
  queued: { label: '排队中', tone: 'neutral', icon: CircleDashed },
  running: { label: '生成中', tone: 'info', icon: Loader2 },
  succeeded: { label: '已完成', tone: 'success', icon: CheckCircle2 },
  failed: { label: '失败', tone: 'danger', icon: AlertCircle },
  cancelled: { label: '已取消', tone: 'neutral', icon: XCircle },
}

export function isBackgroundJobLive(status: BackgroundJobStatus | string | null | undefined) {
  return status === 'queued' || status === 'running'
}

export function getBackgroundJobProgress(job: Pick<BackgroundJobView, 'progressCurrent' | 'progressTotal'>) {
  if (job.progressCurrent == null || job.progressTotal == null || job.progressTotal <= 0) {
    return null
  }

  const current = Math.max(0, job.progressCurrent)
  const total = Math.max(1, job.progressTotal)
  return {
    current,
    total,
    percent: Math.min(100, Math.max(0, (current / total) * 100)),
    label: `${current}/${total}`,
  }
}

export function getBackgroundJobStatusLabel(status: BackgroundJobStatus) {
  return STATUS_META[status].label
}

export function BackgroundJobBadge({
  status,
  cancellable,
  className,
}: {
  status: BackgroundJobStatus
  cancellable?: boolean
  className?: string
}) {
  const meta = STATUS_META[status]
  const Icon = meta.icon
  const toneClass =
    meta.tone === 'success'
      ? 'border-themeAccent-success/25 bg-themeAccent-success/10 text-ink'
      : meta.tone === 'danger'
        ? 'border-destructive/25 bg-destructive/10 text-destructive'
        : meta.tone === 'info'
          ? 'border-themeAccent-info/25 bg-themeAccent-info/10 text-ink'
          : 'border-line-soft bg-paper-muted text-ink-muted'

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
        toneClass,
        className
      )}
    >
      <Icon className={cn('h-3.5 w-3.5', status === 'running' && 'animate-spin')} aria-hidden="true" />
      {meta.label}
      {cancellable ? <span className="text-ink-soft">可取消</span> : null}
    </span>
  )
}

export function BackgroundJobProgress({
  job,
  className,
}: {
  job: Pick<BackgroundJobView, 'progressCurrent' | 'progressTotal'>
  className?: string
}) {
  const progress = getBackgroundJobProgress(job)
  if (!progress) return null

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between text-xs text-ink-muted">
        <span>进度</span>
        <span className="tabular-nums">{progress.label}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-paper-muted">
        <div
          className="h-full rounded-full bg-themeAccent-primary transition-all duration-300"
          style={{ width: `${progress.percent}%` }}
        />
      </div>
    </div>
  )
}

export function BackgroundJobPanel({
  job,
  title = '后台任务',
  description,
  onCancel,
  onRetry,
  onOpenResult,
  isCancelling,
  isRetrying,
  cancelButtonTestId,
  retryButtonTestId,
  openButtonTestId,
  className,
}: {
  job: BackgroundJobView
  title?: string
  description?: string
  onCancel?: (jobId: string) => void
  onRetry?: (jobId: string) => void
  onOpenResult?: (jobId: string) => void
  isCancelling?: boolean
  isRetrying?: boolean
  cancelButtonTestId?: string
  retryButtonTestId?: string
  openButtonTestId?: string
  className?: string
}) {
  const live = isBackgroundJobLive(job.status)
  const cancelRequested = Boolean(job.cancelRequestedAt)
  const cancellable = live && Boolean(onCancel)
  const message = job.errorMessage ?? job.progressMessage ?? description

  return (
    <div className={cn('rounded-lg border border-line-soft bg-paper-card p-4', className)} data-testid="background-job-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-ui text-sm font-medium text-ink">{title}</p>
            <BackgroundJobBadge status={job.status} cancellable={cancellable && !cancelRequested} />
          </div>
          {message ? <p className="text-xs leading-5 text-ink-muted">{message}</p> : null}
          {cancelRequested ? <p className="text-xs leading-5 text-ink-muted">取消请求已提交，正在等待任务停止。</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {job.status === 'failed' && onRetry ? (
            <Button
              variant="outline"
              size="sm"
              isLoading={isRetrying}
              onClick={() => onRetry(job.id)}
              data-testid={retryButtonTestId}
            >
              重试
            </Button>
          ) : null}
          {job.status === 'succeeded' && onOpenResult ? (
            <Button variant="outline" size="sm" onClick={() => onOpenResult(job.id)} data-testid={openButtonTestId}>
              查看结果
            </Button>
          ) : null}
          {cancellable ? (
            <Button
              variant="destructive"
              size="sm"
              isLoading={isCancelling || cancelRequested}
              loadingLabel={cancelRequested ? '取消中' : '提交中'}
              disabled={cancelRequested}
              onClick={() => onCancel?.(job.id)}
              data-testid={cancelButtonTestId}
            >
              取消任务
            </Button>
          ) : null}
        </div>
      </div>
      <BackgroundJobProgress job={job} className="mt-3" />
    </div>
  )
}
