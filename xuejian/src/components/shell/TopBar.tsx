import { Button, Divider } from '@/components/ui'
import { cn } from '@/lib/utils'
import { useAppUiStore, type NavItemId } from '@/store'
import { useDailyStatsQuery } from '@/queries'

const PAGE_TITLES: Record<NavItemId, string> = {
  home: '首页',
  library: '文档库',
  cards: '卡片工坊',
  learning: '学习',
  knowledge: '知识问答',
  settings: '设置',
}

export function TopBar() {
  const activeNavItem = useAppUiStore((state) => state.activeNavItem)
  const reader = useAppUiStore((state) => state.reader)
  const isFeedbackPanelOpen = useAppUiStore((state) => state.isFeedbackPanelOpen)
  const toggleFeedbackPanel = useAppUiStore((state) => state.toggleFeedbackPanel)
  const errorCount = useAppUiStore((state) =>
    state.feedbackLog.reduce((count, entry) => count + (entry.level === 'error' ? 1 : 0), 0)
  )
  const { data: dailyStats } = useDailyStatsQuery()

  const totalDue = (dailyStats?.newCards ?? 0) + (dailyStats?.reviewCards ?? 0)
  const pageTitle = reader.documentId ? '阅读' : PAGE_TITLES[activeNavItem]

  return (
    <header className="app-top-bar flex h-12 items-center justify-between border-b border-line-soft bg-paper-muted px-4">
      {/* 左侧标题区域 */}
      <div className="flex items-center gap-3">
        <h1 className="font-ui text-base text-ink">{pageTitle}</h1>
        <Divider orientation="vertical" className="h-5" />
        <span className="font-body text-sm text-ink-muted">学笺</span>
      </div>

      {/* 右侧状态区域 */}
      <div className="flex items-center gap-3">
        {totalDue > 0 && (
          <div className="text-xs text-ink-soft">
            待复习: <span className="tabular-nums text-ink">{totalDue}</span> 张
          </div>
        )}
        <Button
          variant={isFeedbackPanelOpen ? 'outline' : 'ghost'}
          size="sm"
          data-testid="topbar-feedback-trigger"
          aria-controls="app-feedback-drawer"
          aria-expanded={isFeedbackPanelOpen}
          title={isFeedbackPanelOpen ? '收起运行日志' : '打开运行日志'}
          className="gap-2 rounded-full"
          onClick={toggleFeedbackPanel}
        >
          <span>运行日志</span>
          <span
            className={cn(
              'rounded-full border px-2 py-0.5 text-[11px] leading-none',
              errorCount > 0
                ? 'border-rose-200 bg-rose-100 text-rose-700'
                : isFeedbackPanelOpen
                  ? 'border-ink/10 bg-paper-muted text-ink'
                  : 'border-line-soft bg-paper-base/70 text-ink-soft'
            )}
          >
            {errorCount > 0 ? `${errorCount} 错误` : isFeedbackPanelOpen ? '已打开' : '查看'}
          </span>
        </Button>
      </div>
    </header>
  )
}
