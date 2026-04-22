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

  return (
    <>
      <div className="pointer-events-none fixed right-4 top-4 z-[80] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2">
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

      {isFeedbackPanelOpen ? (
        <div className="fixed inset-y-16 right-4 z-[70] w-[min(28rem,calc(100vw-2rem))]">
          <Panel
            variant="paperCard"
            className="flex h-full flex-col overflow-hidden rounded-[28px] border border-line-soft bg-paper-base/95 p-0 shadow-card backdrop-blur"
          >
            <div className="flex items-center justify-between gap-3 border-b border-line-soft px-5 py-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-ink-soft">运行日志</p>
                <h2 className="mt-1 font-ui text-base text-ink">最近的提示与错误</h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-line-soft bg-paper-muted px-2.5 py-1 text-xs text-ink-soft">
                  错误 {errorCount}
                </span>
                <Button variant="ghost" size="sm" onClick={() => clearFeedbackLog()}>
                  清空
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setFeedbackPanelOpen(false)}>
                  收起
                </Button>
              </div>
            </div>

            {feedbackLog.length === 0 ? (
              <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-ink-soft">
                当前还没有日志记录。
              </div>
            ) : (
              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {feedbackLog.map((entry) => (
                  <FeedbackLogCard key={entry.id} entry={entry} />
                ))}
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

  return (
    <div className={cn('rounded-[22px] border px-4 py-3', accentClass)}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">{entry.scope}</p>
          <p className="mt-1 font-ui text-sm text-ink">{entry.title}</p>
        </div>
        <span className="text-xs text-ink-soft">{timeFormatter.format(entry.createdAt)}</span>
      </div>

      {entry.detail ? (
        <p className="mt-2 text-xs leading-5 text-ink-muted break-all">{entry.detail}</p>
      ) : null}
    </div>
  )
}