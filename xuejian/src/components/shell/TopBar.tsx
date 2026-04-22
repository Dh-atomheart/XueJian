import { Button, Divider } from '@/components/ui'
import { useAppUiStore, type NavItemId } from '@/store'
import { useDailyStatsQuery } from '@/queries'

const PAGE_TITLES: Record<NavItemId, string> = {
  home: '首页',
  library: '文档库',
  cards: '卡片工坊',
  learning: '学习',
  knowledge: '知识问答',
  podcast: '播客工坊',
  graph: '知识图谱',
  settings: '设置',
}

export function TopBar() {
  const activeNavItem = useAppUiStore((state) => state.activeNavItem)
  const reader = useAppUiStore((state) => state.reader)
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
        <Button variant="ghost" size="sm" onClick={toggleFeedbackPanel}>
          错误日志{errorCount > 0 ? ` (${errorCount})` : ''}
        </Button>
      </div>
    </header>
  )
}
