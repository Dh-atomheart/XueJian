import { useMemo } from 'react'
import {
  HomeHeatmapPanel,
  HomeInsightRail,
  HomeQuickActionsPanel,
  HomeRecentDocumentsPanel,
  HomeStudyOverviewPanel,
  HomeTaskHero,
} from '@/components/home'
import { SketchEmptyState, Button } from '@/components/ui'
import {
  hasUsableApiConfig,
  useApiConfigsQuery,
  useDailyStatsQuery,
  useDocumentsQuery,
  usePointsSummaryQuery,
  useReviewHeatmapQuery,
  useStudyStatsQuery,
} from '@/queries'
import { useAppUiStore } from '@/store'

export function HomePage() {
  const setActiveNavItem = useAppUiStore((state) => state.setActiveNavItem)
  const openReader = useAppUiStore((state) => state.openReader)

  const { data: dailyStats } = useDailyStatsQuery()
  const { data: studyStats } = useStudyStatsQuery()
  const { data: pointsSummary } = usePointsSummaryQuery()
  const { data: heatmapEntries = [] } = useReviewHeatmapQuery(112)
  const { data: documents = [], isLoading: isLoadingDocuments } = useDocumentsQuery()
  const { data: apiConfigs = [] } = useApiConfigsQuery()

  const readyDocuments = useMemo(
    () => documents.filter((document) => document.status === 'ready'),
    [documents]
  )
  const recentDocuments = useMemo(() => readyDocuments.slice(0, 4), [readyDocuments])

  const reviewCards = dailyStats?.reviewCards ?? 0
  const newCards = dailyStats?.newCards ?? 0
  const totalDue = reviewCards + newCards
  const todayPoints = pointsSummary?.todayPoints ?? 0
  const hasApiConfig = hasUsableApiConfig(apiConfigs)
  const hasAnyContent = documents.length > 0 || totalDue > 0

  if (!hasAnyContent && !isLoadingDocuments) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8">
        <SketchEmptyState
          illustration="book"
          title="还没有学习任务"
          description="导入第一份文档后，学笺会开始解析内容、生成卡片，并把今日学习中心填充起来。"
          action={
            <Button variant="default" onClick={() => setActiveNavItem('library')}>
              前往文档库
            </Button>
          }
        />
        <HomeQuickActionsPanel
          onGoLearning={() => setActiveNavItem('learning')}
          onGoLibrary={() => setActiveNavItem('library')}
          onGoCards={() => setActiveNavItem('cards')}
          onGoKnowledge={() => setActiveNavItem('knowledge')}
          onImported={() => setActiveNavItem('library')}
        />
      </div>
    )
  }

  return (
    <div className="flex h-full w-full overflow-hidden">
      <div className="mx-auto flex h-full w-full max-w-[1380px] gap-6 overflow-y-auto p-6">
      <div className="min-w-0 flex-1 space-y-6 pb-6">
        <HomeTaskHero
          totalDue={totalDue}
          reviewCards={reviewCards}
          newCards={newCards}
          todayPoints={todayPoints}
          onStartLearning={() => setActiveNavItem('learning')}
        />

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <HomeStudyOverviewPanel
            todayMinutes={studyStats?.todayMinutes ?? null}
            weekMinutes={studyStats?.weekMinutes ?? null}
            totalMinutes={studyStats?.totalMinutes ?? null}
            streakDays={studyStats?.streakDays ?? null}
          />
          <HomeHeatmapPanel entries={heatmapEntries} />
          <HomeRecentDocumentsPanel
            documents={recentDocuments}
            isLoading={isLoadingDocuments}
            onViewAll={() => setActiveNavItem('library')}
            onOpenDocument={(document) => openReader(document.id, document.pageCount ?? 1)}
          />
          <HomeQuickActionsPanel
            onGoLearning={() => setActiveNavItem('learning')}
            onGoLibrary={() => setActiveNavItem('library')}
            onGoCards={() => setActiveNavItem('cards')}
            onGoKnowledge={() => setActiveNavItem('knowledge')}
            onImported={() => setActiveNavItem('library')}
          />
        </div>
      </div>

      <HomeInsightRail
        className="shrink-0"
        hasApiConfig={hasApiConfig}
        totalDue={totalDue}
        recentDocumentsCount={readyDocuments.length}
        activeDays={studyStats?.activeDaysThisWeek ?? 0}
        weekMinutes={studyStats?.weekMinutes ?? null}
        streakDays={studyStats?.streakDays ?? null}
        todayPoints={todayPoints}
        onGoSettings={() => setActiveNavItem('settings')}
      />
      </div>
    </div>
  )
}
