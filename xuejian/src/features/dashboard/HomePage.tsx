import { useMemo } from 'react'
import { HomePage as HomePageView, homePageIcons } from '@/components/pages/home-page'
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
  const { data: heatmapEntries = [] } = useReviewHeatmapQuery(63)
  const { data: documents = [], isLoading: isDocumentsLoading } = useDocumentsQuery()
  const { data: apiConfigs = [] } = useApiConfigsQuery()

  const readyDocuments = useMemo(
    () => documents.filter((document) => document.status === 'ready').slice(0, 5),
    [documents]
  )

  const reviewCards = dailyStats?.reviewCards ?? 0
  const newCards = dailyStats?.newCards ?? 0
  const todayPoints = pointsSummary?.todayPoints ?? 0
  const hasApiConfig = hasUsableApiConfig(apiConfigs)

  return (
    <HomePageView
      stats={[
        { value: reviewCards, label: '待复习' },
        { value: newCards, label: '新知识' },
        { value: reviewCards + newCards, label: '今日任务' },
        { value: `+${todayPoints}`, label: '今日积分' },
        { value: studyStats?.streakDays ?? 0, label: '连续天数' },
      ]}
      overview={[
        { label: '学习时长', value: `${studyStats?.todayMinutes ?? 0} 分钟` },
        { label: '文档数量', value: documents.length },
        { label: '待复习卡片', value: reviewCards + newCards },
        { label: '本周时长', value: `${studyStats?.weekMinutes ?? 0} 分钟` },
      ]}
      heatmap={chunkHeatmap(heatmapEntries, 9, 7)}
      recentDocuments={readyDocuments.map((document) => ({
        id: document.id,
        title: document.title,
        subtitle: `${document.fileType.toUpperCase()} 文档`,
        pageCountLabel: `${document.pageCount ?? '--'} 页`,
        statusLabel: '已就绪',
        statusTone: 'ready' as const,
      }))}
      isDocumentsLoading={isDocumentsLoading}
      hasDocuments={documents.length > 0}
      quickActions={[
        { label: '继续复习', description: `${reviewCards} 张卡片待处理`, icon: homePageIcons.review, onClick: () => setActiveNavItem('learning') },
        { label: '上传文档', description: '接入新的 PDF 资料', icon: homePageIcons.upload, onClick: () => setActiveNavItem('library') },
        { label: '卡片工坊', description: '整理与审核候选卡片', icon: homePageIcons.cards, onClick: () => setActiveNavItem('cards') },
        { label: 'AI 问答', description: hasApiConfig ? '基于文档进行提问' : '先配置 AI 后接通', icon: homePageIcons.qa, onClick: () => setActiveNavItem(hasApiConfig ? 'knowledge' : 'settings') },
        { label: '知识图谱', description: '查看概念关系网络', icon: homePageIcons.graph, onClick: () => setActiveNavItem('graph') },
      ]}
      weeklySignals={[
        { label: `本周学习 ${studyStats?.weekMinutes ?? 0} 分钟`, trend: 'up' },
        { label: `连续学习 ${studyStats?.streakDays ?? 0} 天`, trend: 'neutral' },
        { label: `${readyDocuments.length} 份文档已可继续处理`, trend: readyDocuments.length > 0 ? 'up' : 'down' },
      ]}
      workbenchStatus={[
        { label: '文档库', value: `${documents.length} 份`, tone: 'default' },
        { label: 'AI 能力', value: hasApiConfig ? '已配置' : '未配置', tone: hasApiConfig ? 'active' : 'warn' },
        { label: '卡片复习', value: `${reviewCards + newCards} 项`, tone: reviewCards + newCards > 0 ? 'active' : 'default' },
      ]}
      onOpenLibrary={() => setActiveNavItem('library')}
      onOpenReview={() => setActiveNavItem('learning')}
      onOpenCards={() => setActiveNavItem('cards')}
      onOpenDocument={(id) => {
        const document = documents.find((item) => item.id === id)
        if (!document) return
        openReader(document.id, document.pageCount ?? 1)
      }}
    />
  )
}

function chunkHeatmap<T>(items: T[], weekCount: number, daysPerWeek: number) {
  const padded = [...items]
  while (padded.length < weekCount * daysPerWeek) padded.push(undefined as T)
  return Array.from({ length: weekCount }, (_, weekIndex) =>
    padded.slice(weekIndex * daysPerWeek, (weekIndex + 1) * daysPerWeek)
  )
}
