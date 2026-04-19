import { useEffect, useMemo } from 'react'
import { Button } from './Button'
import { Panel } from './Panel'
import { cn } from '@/lib/utils'
import { useAppUiStore, type AppFeedbackEntry } from '@/store'

const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

export function AppFeedbackLayer() {
  const notices = useAppUiStore((state) => state.activeNotices)
  const feedbackLog = useAppUiStore((state) => state.feedbackLog)
  const isFeedbackPanelOpen = useAppUiStore((state) => state.isFeedbackPanelOpen)
  const dismissNotice = useAppUiStore((state) => state.dismissNotice)
  const setFeedbackPanelOpen = useAppUiStore((state) => state.setFeedbackPanelOpen)
  const clearFeedbackLog = useAppUiStore((state) => state.clearFeedbackLog)

  const errorCount = useMemo(
    () => feedbackLog.filter((entry) => entry.level === 'error').length,
    [feedbackLog]
  )
  const otherCount = feedbackLog.length - errorCount

  useEffect(() => {
    if (notices.length === 0) {
      return
    }

    const timers = notices.map((notice) =>
      window.setTimeout(() => dismissNotice(notice.id), notice.level === 'error' ? 6500 : 4200)
    )

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [dismissNotice, notices])

  useEffect(() => {
    if (!isFeedbackPanelOpen) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setFeedbackPanelOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isFeedbackPanelOpen, setFeedbackPanelOpen])

  return (
    <>
      <div className="pointer-events-none fixed inset-x-4 top-4 z-[80] flex justify-end">
        <div className="flex w-full max-w-[22rem] flex-col gap-2">
          {notices.map((notice) => (
            <Panel
              key={notice.id}
              variant="paperCard"
              className={cn(
                'pointer-events-auto rounded-[20px] border px-4 py-3 shadow-card backdrop-blur',
                notice.level === 'error'
                  ? 'border-rose-200 bg-rose-50/95'
                  : notice.level === 'warning'
                    ? 'border-amber-200 bg-amber-50/95'
                    : 'border-emerald-200 bg-emerald-50/95'
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-ink-soft">
                    {notice.scope}
                  </p>
                  <p className="font-ui text-sm text-ink">{notice.title}</p>
                  {notice.detail ? (
                    <p className="text-xs leading-5 text-ink-muted break-all">{notice.detail}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => dismissNotice(notice.id)}
                  className="rounded-full px-2 py-1 text-xs text-ink-soft hover:bg-black/5 hover:text-ink"
                  aria-label="关闭提示"
                >
                  关闭
                </button>
              </div>
            </Panel>
          ))}
        </div>
      </div>

      {isFeedbackPanelOpen ? (
        <div className="fixed inset-0 z-[70] flex justify-end">
          <button
            type="button"
            data-testid="app-feedback-backdrop"
            className="absolute inset-0 bg-[rgba(26,20,10,0.16)] backdrop-blur-[2px]"
            onClick={() => setFeedbackPanelOpen(false)}
            aria-label="关闭运行日志抽屉"
          />
          <Panel
            id="app-feedback-drawer"
            data-testid="app-feedback-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="运行日志"
            variant="paperCard"
            className="relative z-10 flex h-full w-full max-w-[min(30rem,100vw)] flex-col overflow-hidden rounded-none border-l border-line-soft bg-[radial-gradient(circle_at_top_left,rgba(248,225,108,0.14),transparent_30%),linear-gradient(180deg,rgba(255,251,245,0.98),rgba(250,246,240,0.98))] p-0 shadow-card md:rounded-l-[32px]"
          >
            <div className="border-b border-line-soft bg-white/65 px-5 py-5 backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-ink-soft">
                    运行日志
                  </p>
                  <div className="space-y-1">
                    <h2 className="font-ui text-lg text-ink">错误、警告与最近提示</h2>
                    <p className="max-w-[22rem] text-xs leading-5 text-ink-muted">
                      这里保留最近的系统反馈，便于回看失败原因和处理轨迹。
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="收起运行日志"
                  onClick={() => setFeedbackPanelOpen(false)}
                >
                  收起
                </Button>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                <FeedbackStat label="全部" value={feedbackLog.length} tone="neutral" />
                <FeedbackStat label="错误" value={errorCount} tone="error" />
                <FeedbackStat label="其他" value={otherCount} tone="info" />
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-xs text-ink-soft">新记录按时间倒序展示，可在问题处理后手动清空。</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => clearFeedbackLog()}
                  disabled={feedbackLog.length === 0}
                >
                  清空日志
                </Button>
              </div>
            </div>

            {feedbackLog.length === 0 ? (
              <div className="flex flex-1 items-center justify-center px-8 text-center">
                <div className="max-w-sm space-y-3">
                  <p className="font-ui text-base text-ink">当前还没有日志记录。</p>
                  <p className="text-sm leading-6 text-ink-soft">
                    当模型调用、文档处理或界面交互产生提示时，这里会自动沉淀最近的反馈。
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto px-4 py-4">
                <div className="space-y-3">
                  {feedbackLog.map((entry) => (
                    <FeedbackLogCard key={entry.id} entry={entry} />
                  ))}
                </div>
              </div>
            )}
          </Panel>
        </div>
      ) : null}
    </>
  )
}

function FeedbackLogCard({ entry }: { entry: AppFeedbackEntry }) {
  const accentClass =
    entry.level === 'error'
      ? 'border-rose-200 bg-rose-50/80'
      : entry.level === 'warning'
        ? 'border-amber-200 bg-amber-50/80'
        : 'border-emerald-200 bg-emerald-50/80'
  const badgeClass =
    entry.level === 'error'
      ? 'border-rose-200 bg-rose-100 text-rose-700'
      : entry.level === 'warning'
        ? 'border-amber-200 bg-amber-100 text-amber-700'
        : 'border-emerald-200 bg-emerald-100 text-emerald-700'

  return (
    <div className={cn('rounded-[24px] border px-4 py-4', accentClass)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('rounded-full border px-2 py-0.5 text-[10px]', badgeClass)}>
              {entry.level === 'error' ? '错误' : entry.level === 'warning' ? '警告' : '提示'}
            </span>
            <p className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">{entry.scope}</p>
          </div>
          <p className="mt-1 font-ui text-sm text-ink">{entry.title}</p>
        </div>
        <span className="rounded-full bg-white/70 px-2.5 py-1 text-xs text-ink-soft">
          {timeFormatter.format(entry.createdAt)}
        </span>
      </div>

      {entry.detail ? (
        <p className="mt-2 text-xs leading-5 text-ink-muted break-all">{entry.detail}</p>
      ) : null}
    </div>
  )
}

function FeedbackStat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'neutral' | 'error' | 'info'
}) {
  const toneClass =
    tone === 'error'
      ? 'border-rose-200 bg-rose-100/80 text-rose-700'
      : tone === 'info'
        ? 'border-emerald-200 bg-emerald-100/80 text-emerald-700'
        : 'border-line-soft bg-paper-base/80 text-ink'

  return (
    <div className={cn('rounded-[18px] border px-3 py-3', toneClass)}>
      <p className="text-[10px] uppercase tracking-[0.22em]">{label}</p>
      <p className="mt-2 font-ui text-lg leading-none">{value}</p>
    </div>
  )
}