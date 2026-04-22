import { useMemo } from 'react'
import { HeatmapCalendar, StudyTotalsCard } from '@/components/stats'
import { Button, Panel, RoughUnderline, SketchEmptyState } from '@/components/ui'
import { SketchProgress } from '@/components/ui/Sketch'
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

  if (totalCards === 0 && documents.length === 0 && heatmapEntries.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-8">
        <SketchEmptyState
          illustration="heatmap"
          title="还没有学习记录"
          description="完成一次复习或导入文档后，这里会开始展示你的学习统计、热力图和积分明细。"
          action={
            <Button variant="default" onClick={() => setActiveNavItem('library')}>
              前往文档库
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <header>
        <p className="font-ui text-[11px] uppercase tracking-[0.24em] text-ink-soft">Profile & Stats</p>
        <h1 className="mt-2 font-display text-3xl text-ink">我的</h1>
        <p className="mt-2 text-sm leading-6 text-ink-muted">查看学习统计、掌握进度与积分明细。</p>
      </header>

      <Panel variant="paperCard" className="flex flex-wrap items-center gap-4 rounded-panel p-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-card bg-paper-muted font-display text-xl text-ink">
          笺
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-ui text-lg text-ink">学习者</h2>
          <p className="mt-1 text-sm text-ink-muted">
            已学习 {totalStudyDays} 天 · 连续 {studyStats?.streakDays ?? 0} 天
          </p>
        </div>
        <div className="rounded-full bg-highlight-yellow/20 px-3 py-1 font-ui text-xs text-ink">
          总积分 {pointsSummary?.todayPoints ?? 0}
        </div>
      </Panel>

      <Panel variant="paperCard" className="space-y-5 p-6">
        <div>
          <p className="font-ui text-[11px] uppercase tracking-[0.24em] text-ink-soft">Study Overview</p>
          <h2 className="mt-2 font-ui text-xl text-ink">学习概览</h2>
          <RoughUnderline width={72} color="rgb(var(--ink-soft))" strokeWidth={1} className="mt-1" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" role="list">
          {[
            { label: '总卡片', value: `${totalCards}` },
            { label: '文档数', value: `${documents.length}` },
            {
              label: '学习时长',
              value:
                studyStats?.totalMinutes != null
                  ? studyStats.totalMinutes >= 60
                    ? `${(studyStats.totalMinutes / 60).toFixed(1)}h`
                    : `${studyStats.totalMinutes}m`
                  : '--',
            },
            { label: '连续天数', value: `${studyStats?.streakDays ?? 0}` },
          ].map((item) => (
            <div
              key={item.label}
              role="listitem"
              className="rounded-card border border-line-soft bg-paper-card px-4 py-4"
            >
              <p className="font-ui text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                {item.label}
              </p>
              <p className="mt-3 font-display text-2xl tabular-nums text-ink">{item.value}</p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel variant="paperCard" className="space-y-5 p-6">
        <div>
          <p className="font-ui text-[11px] uppercase tracking-[0.24em] text-ink-soft">Mastery</p>
          <h2 className="mt-2 font-ui text-xl text-ink">掌握进度</h2>
          <RoughUnderline width={72} color="rgb(var(--ink-soft))" strokeWidth={1} className="mt-1" />
        </div>
        <SketchProgress value={masteryRate} label="知识掌握率" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: '新卡片', value: mastery?.newCards ?? 0, tone: 'border-l-highlight-blue' },
            { label: '学习中', value: mastery?.learningCards ?? 0, tone: 'border-l-highlight-yellow' },
            { label: '复习', value: mastery?.reviewCards ?? 0, tone: 'border-l-highlight-green' },
            { label: '已掌握', value: mastery?.masteredCards ?? 0, tone: 'border-l-highlight-green/80' },
          ].map((item) => (
            <div key={item.label} className={`rounded-item bg-paper-muted px-3 py-3 border-l-2 ${item.tone}`}>
              <p className="font-display text-2xl tabular-nums text-ink">{item.value}</p>
              <p className="mt-1 text-xs text-ink-muted">{item.label}</p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel variant="paperCard" className="space-y-5 p-6">
        <div>
          <p className="font-ui text-[11px] uppercase tracking-[0.24em] text-ink-soft">Heatmap</p>
          <h2 className="mt-2 font-ui text-xl text-ink">学习热力图</h2>
          <RoughUnderline width={72} color="rgb(var(--ink-soft))" strokeWidth={1} className="mt-1" />
        </div>
        <HeatmapCalendar entries={heatmapEntries} weeks={16} />
      </Panel>

      <Panel variant="paperCard" className="space-y-5 p-6">
        <div>
          <p className="font-ui text-[11px] uppercase tracking-[0.24em] text-ink-soft">Study Snapshot</p>
          <h2 className="mt-2 font-ui text-xl text-ink">学习节律</h2>
          <RoughUnderline width={72} color="rgb(var(--ink-soft))" strokeWidth={1} className="mt-1" />
        </div>
        <StudyTotalsCard
          todayMinutes={studyStats?.todayMinutes ?? null}
          weekMinutes={studyStats?.weekMinutes ?? null}
          totalMinutes={studyStats?.totalMinutes ?? null}
          streakDays={studyStats?.streakDays ?? null}
        />
      </Panel>

      <Panel variant="paperCard" className="space-y-5 p-6">
        <div>
          <p className="font-ui text-[11px] uppercase tracking-[0.24em] text-ink-soft">Points Ledger</p>
          <h2 className="mt-2 font-ui text-xl text-ink">积分明细</h2>
          <RoughUnderline width={72} color="rgb(var(--ink-soft))" strokeWidth={1} className="mt-1" />
        </div>
        <div role="list" className="space-y-1">
          {pointsLedger.length === 0 ? (
            <p className="text-sm text-ink-muted">还没有积分记录。</p>
          ) : (
            pointsLedger.map((entry) => (
              <div
                key={entry.id}
                role="listitem"
                className="flex items-center justify-between gap-3 border-b border-line-soft/40 py-2 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="font-latin-meta text-xs text-ink-soft">
                    {new Date(entry.createdAt).toLocaleString('zh-CN')}
                  </p>
                  <p className="text-sm text-ink">{entry.reason ?? entry.transactionType}</p>
                </div>
                <div className="text-right">
                  <p className="font-ui text-xs text-ink-muted">{entry.rating}</p>
                  <p className="font-display text-sm tabular-nums text-emerald-700">+{entry.points}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </Panel>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <QuickLinkTile
          title="设置"
          description="配置模型、偏好与本地 API。"
          onClick={() => setActiveNavItem('settings')}
        />
        <QuickLinkTile
          title="卡片工坊"
          description="检查卡片生成结果与导出路径。"
          onClick={() => setActiveNavItem('cards')}
        />
        <QuickLinkTile
          title="文档库"
          description="回到文档输入和阅读工作台。"
          onClick={() => setActiveNavItem('library')}
        />
      </div>
    </div>
  )
}

function QuickLinkTile({
  title,
  description,
  onClick,
}: {
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-card border border-line-soft bg-paper-base/82 p-4 text-left transition hover:-translate-y-[1px] hover:bg-paper-card"
    >
      <p className="font-ui text-sm text-ink">{title}</p>
      <p className="mt-1 text-xs leading-5 text-ink-muted">{description}</p>
    </button>
  )
}
