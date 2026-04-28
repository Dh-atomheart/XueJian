import { useMemo } from 'react'
import { HeatmapCalendar } from '@/components/stats'
import { ProfilePage as ProfilePageView } from '@/components/pages/profile-page'
import {
  useDocumentsQuery,
  useMasteryBreakdownQuery,
  usePointsLedgerQuery,
  usePointsSummaryQuery,
  useReviewHeatmapQuery,
  useStudyStatsQuery,
} from '@/queries'
import { useAppUiStore } from '@/store'

export function ProfilePage() {
  const setActiveNavItem = useAppUiStore((state) => state.setActiveNavItem)
  const { data: documents = [] } = useDocumentsQuery()
  const { data: studyStats } = useStudyStatsQuery()
  const { data: mastery } = useMasteryBreakdownQuery()
  const { data: heatmapEntries = [] } = useReviewHeatmapQuery(112)
  const { data: pointsSummary } = usePointsSummaryQuery()
  const { data: pointsLedger = [] } = usePointsLedgerQuery(undefined, 20)

  const totalCards =
    (mastery?.newCards ?? 0) +
    (mastery?.learningCards ?? 0) +
    (mastery?.reviewCards ?? 0) +
    (mastery?.masteredCards ?? 0)
  const masteredCards = mastery?.masteredCards ?? 0
  const masteryRate = totalCards > 0 ? Math.round((masteredCards / totalCards) * 100) : 0
  const totalStudyDays = useMemo(
    () => new Set(heatmapEntries.filter((entry) => entry.count > 0).map((entry) => entry.date)).size,
    [heatmapEntries]
  )

  return (
    <ProfilePageView
      hasData={!(totalCards === 0 && documents.length === 0 && heatmapEntries.length === 0)}
      overview={[
        { label: '学习天数', value: totalStudyDays },
        { label: '文档数量', value: documents.length },
        { label: '总卡片数', value: totalCards },
        { label: '连续记录', value: studyStats?.streakDays ?? 0 },
      ]}
      mastery={[
        { label: '掌握率', value: `${masteryRate}%` },
        { label: '新卡', value: mastery?.newCards ?? 0 },
        { label: '学习中', value: mastery?.learningCards ?? 0 },
        { label: '待复习', value: mastery?.reviewCards ?? 0 },
      ]}
      heatmap={<HeatmapCalendar entries={heatmapEntries} weeks={16} />}
      ledger={pointsLedger.map((entry) => ({
        id: entry.id,
        title: entry.reason ?? entry.transactionType,
        meta: `${new Date(entry.createdAt).toLocaleString('zh-CN')} · ${entry.rating}`,
        pointsLabel: `+${entry.points}`,
      }))}
      quickLinks={[
        {
          label: '继续复习',
          description: `${mastery?.reviewCards ?? 0} 张卡片等待处理`,
          onClick: () => setActiveNavItem('learning'),
        },
        {
          label: '进入文档库',
          description: `${documents.length} 份资料已接入工作台`,
          onClick: () => setActiveNavItem('library'),
        },
        {
          label: '打开知识问答',
          description: '围绕当前资料继续追问和整理',
          onClick: () => setActiveNavItem('knowledge'),
        },
        {
          label: '查看设置',
          description: '检查 AI 配置与学习偏好',
          onClick: () => setActiveNavItem('settings'),
        },
      ]}
      summary={[
        { label: '今日时长', value: `${studyStats?.todayMinutes ?? 0} 分钟` },
        { label: '本周时长', value: `${studyStats?.weekMinutes ?? 0} 分钟` },
        { label: '今日积分', value: `+${pointsSummary?.todayPoints ?? 0}` },
        { label: '待处理复习', value: `${mastery?.reviewCards ?? 0} 张` },
      ]}
      onOpenLibrary={() => setActiveNavItem('library')}
      onOpenReview={() => setActiveNavItem('learning')}
    />
  )
}
