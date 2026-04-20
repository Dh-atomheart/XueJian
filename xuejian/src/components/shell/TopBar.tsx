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
    <header className="app-top-bar flex h-[68px] items-center justify-between border-b border-line-soft/85 bg-paper-muted/88 px-4 backdrop-blur sm:px-5 md:h-[74px] md:px-6 lg:px-8">
      <div className="min-w-0">
        <p className="font-ui text-[10px] uppercase tracking-[0.28em] text-ink-soft">Study Center</p>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="truncate font-display text-[1.45rem] leading-none text-ink md:text-[1.7rem]">
            {pageTitle}
          </h1>
          <Divider orientation="vertical" className="hidden h-5 sm:block" />
          <span className="hidden font-ui text-[11px] uppercase tracking-[0.22em] text-ink-soft sm:inline">
            学笺
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-3">
        {totalDue > 0 && (
          <div className="hidden items-center gap-2 rounded-full border border-line-soft bg-paper-card/80 px-3 py-1 text-xs text-ink-soft sm:flex">
            <span className="font-ui uppercase tracking-[0.18em] text-[10px]">Due</span>
            <span>
              <span className="tabular-nums text-ink">{totalDue}</span> 张待复习
            </span>
          </div>
        )}
        <Button
          variant={isFeedbackPanelOpen ? 'outline' : 'ghost'}
          size="sm"
          data-testid="topbar-feedback-trigger"
          aria-controls="app-feedback-drawer"
          aria-expanded={isFeedbackPanelOpen}
          title={isFeedbackPanelOpen ? '收起运行日志' : '打开运行日志'}
          className="gap-2 rounded-full border border-line-soft/70 bg-paper-card/72 px-2.5 shadow-paper hover:bg-paper-card"
          onClick={toggleFeedbackPanel}
        >
          <span className="hidden sm:inline">运行日志</span>
          <span className="sm:hidden">日志</span>
          <span
            className={cn(
              'rounded-full border px-2 py-0.5 text-[11px] leading-none',
              errorCount > 0
                ? 'border-highlight-pink/40 bg-highlight-pink/10 text-ink-muted'
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
