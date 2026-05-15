import { useMemo } from 'react'
import { HomePage as HomePageView, homePageIcons } from '@/components/pages/home-page'
import { getErrorMessage } from '@/lib/appFeedback'
import { useDashboardSummaryQuery } from '@/queries/dashboard'
import { useDocumentsQuery } from '@/queries/documents'
import { useAppUiStore } from '@/store'

function formatMinutes(minutes: number) {
  if (minutes <= 0) return '0 分钟'
  if (minutes < 1) return '<1 分钟'

  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours <= 0) return `${minutes} 分钟`
  return rest > 0 ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`
}

export function HomePage() {
  const setActiveNavItem = useAppUiStore((state) => state.setActiveNavItem)
  const openReader = useAppUiStore((state) => state.openReader)

  const dashboardQuery = useDashboardSummaryQuery(63, 6)
  const documentsQuery = useDocumentsQuery()
  const dashboard = dashboardQuery.data
  const documents = documentsQuery.data ?? []

  const readyDocuments = useMemo(
    () => documents.filter((document) => document.status === 'ready').slice(0, 5),
    [documents]
  )
  const failedDocuments = useMemo(
    () => documents.filter((document) => document.status === 'error').slice(0, 3),
    [documents]
  )

  const todayDue = (dashboard?.todayNewDueCount ?? 0) + (dashboard?.todayReviewDueCount ?? 0)
  const reviewDueCount = dashboard?.todayReviewDueCount ?? 0

  return (
    <HomePageView
      isLoading={dashboardQuery.isLoading || documentsQuery.isLoading}
      isError={dashboardQuery.isError || documentsQuery.isError}
      errorMessage={getErrorMessage(
        dashboardQuery.error ?? documentsQuery.error,
        '学习统计暂时不可用，请稍后重试。'
      )}
      onRetry={() => {
        void dashboardQuery.refetch()
        void documentsQuery.refetch()
      }}
      metrics={[
        {
          value: dashboard?.todayCompletedCount ?? 0,
          label: '今日完成',
          hint: '来自今日学习事件记录。',
        },
        {
          value: todayDue,
          label: '今日待学',
          hint: `${dashboard?.todayNewDueCount ?? 0} 张新卡，${dashboard?.todayReviewDueCount ?? 0} 张复习卡`,
        },
        {
          value: formatMinutes(dashboard?.totalStudyMinutes ?? 0),
          label: '累计时长',
          hint: `今天 ${formatMinutes(dashboard?.todayStudyMinutes ?? 0)}`,
        },
        {
          value: dashboard?.streakDays ?? 0,
          label: '连续天数',
          hint: '连续有学习记录的天数。',
        },
      ]}
      heatmap={dashboard?.heatmap ?? []}
      documentProgress={dashboard?.documentProgress ?? []}
      groupProgress={dashboard?.groupProgress ?? []}
      recentDocuments={readyDocuments.map((document) => ({
        id: document.id,
        title: document.title,
        subtitle: `${document.fileType.toUpperCase()} 文档`,
        pageCountLabel: `${document.pageCount ?? '--'} 页`,
        statusLabel: '可阅读',
        statusTone: 'ready' as const,
      }))}
      alerts={[
        ...failedDocuments.map((document) => ({
          id: `parse-${document.id}`,
          title: `解析失败：${document.title}`,
          detail: '该文档暂时不能生成可靠卡片。请前往文档页查看失败原因或重试解析。',
          tone: 'danger' as const,
          actionLabel: '查看文档',
          onAction: () => setActiveNavItem('library'),
        })),
        ...(reviewDueCount >= 100
          ? [
              {
                id: 'review-backlog',
                title: '待复习卡片堆积',
                detail: `当前有 ${reviewDueCount} 张复习卡到期，建议先完成复习再新增卡片。`,
                tone: 'warning' as const,
                actionLabel: '开始复习',
                onAction: () => setActiveNavItem('learning'),
              },
            ]
          : []),
      ]}
      quickActions={[
        {
          label: '开始复习',
          description: todayDue > 0 ? `${todayDue} 张卡片等待复习` : '今日队列已清空',
          icon: homePageIcons.review,
          primary: true,
          onClick: () => setActiveNavItem('learning'),
        },
        {
          label: '导入文档',
          description: '添加 PDF 并准备生成学习卡片',
          icon: homePageIcons.upload,
          onClick: () => setActiveNavItem('library'),
        },
        {
          label: '管理卡片',
          description: '查看卡片、分组和来源',
          icon: homePageIcons.cards,
          onClick: () => setActiveNavItem('cards'),
        },
      ]}
      onOpenLibrary={() => setActiveNavItem('library')}
      onOpenDocument={(id) => {
        const document = documents.find((item) => item.id === id)
        if (!document) return
        openReader(document.id, document.pageCount ?? 1)
      }}
    />
  )
}
