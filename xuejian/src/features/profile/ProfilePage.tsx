import { useMemo } from 'react'
import { HeatmapCalendar, StudyTotalsCard } from '@/components/stats'
import { Button, Panel, SketchEmptyState } from '@/components/ui'
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
      <div className="mx-auto max-w-5xl">
        <SketchEmptyState
          illustration="heatmap"
          title="还没有学习记录"
          description="完成一次复习或导入文档后，这里会开始显示你的学习统计、热力图和积分明细。"
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
    <div className="mx-auto flex w-full max-w-[1420px] flex-col gap-6">
      <Panel variant="paperCard" className="rounded-[32px] p-6 md:p-8">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_340px] xl:items-center">
          <div className="space-y-5">
            <div>
              <p className="font-latin-meta text-[11px] uppercase tracking-[0.34em] text-ink-soft">
                PROFILE & STATS
              </p>
              <h2 className="mt-2 font-display text-3xl text-ink">我的</h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-ink-muted">
                查看累计学习表现、掌握节奏与积分变化。这一页按设计稿收束为“身份概览 + 统计面板”。
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <SummaryTile label="已学习天数" value={`${totalStudyDays}`} />
              <SummaryTile label="已导入文档" value={`${documents.length}`} />
              <SummaryTile label="总卡片数" value={`${totalCards}`} />
              <SummaryTile label="连续天数" value={`${studyStats?.streakDays ?? 0}`} tone="accent" />
            </div>
          </div>

          <div className="rounded-[30px] border border-line-soft/75 bg-paper-base/84 p-6 shadow-paper">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-line-soft bg-paper-card text-[30px] text-ink">
                笺
              </div>
              <div>
                <h3 className="font-ui text-xl text-ink">学习者</h3>
                <p className="mt-1 text-sm text-ink-muted">
                  累计学习 {totalStudyDays} 天，今日积分 {pointsSummary?.todayPoints ?? 0}
                </p>
              </div>
            </div>
            <div className="mt-6">
              <SketchProgress value={masteryRate} label="知识掌握率" />
            </div>
          </div>
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel variant="paperCard" className="rounded-[30px] p-6">
          <div className="mb-5">
            <p className="font-ui text-[11px] uppercase tracking-[0.24em] text-ink-soft">STUDY OVERVIEW</p>
            <h3 className="mt-2 font-ui text-xl text-ink">学习概览</h3>
          </div>
          <StudyTotalsCard
            todayMinutes={studyStats?.todayMinutes ?? null}
            weekMinutes={studyStats?.weekMinutes ?? null}
            totalMinutes={studyStats?.totalMinutes ?? null}
            streakDays={studyStats?.streakDays ?? null}
          />
        </Panel>

        <Panel variant="paperCard" className="rounded-[30px] p-6">
          <div className="mb-5">
            <p className="font-ui text-[11px] uppercase tracking-[0.24em] text-ink-soft">MASTERY</p>
            <h3 className="mt-2 font-ui text-xl text-ink">掌握进度</h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <MasteryTile label="新卡" value={mastery?.newCards ?? 0} />
            <MasteryTile label="学习中" value={mastery?.learningCards ?? 0} />
            <MasteryTile label="待复习" value={mastery?.reviewCards ?? 0} />
            <MasteryTile label="已掌握" value={mastery?.masteredCards ?? 0} tone="accent" />
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
        <Panel variant="paperCard" className="rounded-[30px] p-6">
          <div className="mb-5">
            <p className="font-ui text-[11px] uppercase tracking-[0.24em] text-ink-soft">HEATMAP</p>
            <h3 className="mt-2 font-ui text-xl text-ink">学习热力图</h3>
          </div>
          <HeatmapCalendar entries={heatmapEntries} weeks={16} />
        </Panel>

        <Panel variant="paperCard" className="rounded-[30px] p-6">
          <div className="mb-5">
            <p className="font-ui text-[11px] uppercase tracking-[0.24em] text-ink-soft">POINTS LEDGER</p>
            <h3 className="mt-2 font-ui text-xl text-ink">积分明细</h3>
          </div>
          <div className="space-y-1">
            {pointsLedger.length === 0 ? (
              <p className="text-sm text-ink-muted">还没有积分记录。</p>
            ) : (
              pointsLedger.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between gap-3 border-b border-line-soft/40 py-3 last:border-b-0"
                >
                  <div className="min-w-0">
                    <p className="font-latin-meta text-xs text-ink-soft">
                      {new Date(entry.createdAt).toLocaleString('zh-CN')}
                    </p>
                    <p className="truncate text-sm text-ink">{entry.reason ?? entry.transactionType}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-ui text-xs text-ink-muted">{entry.rating}</p>
                    <p className="font-display text-base text-emerald-700">+{entry.points}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>
    </div>
  )
}

function SummaryTile({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string
  tone?: 'default' | 'accent'
}) {
  return (
    <div
      className={
        tone === 'accent'
          ? 'rounded-[24px] border border-highlight-green/45 bg-highlight-green/16 px-4 py-4 shadow-paper'
          : 'rounded-[24px] border border-line-soft/75 bg-paper-base/82 px-4 py-4 shadow-paper'
      }
    >
      <p className="font-ui text-[10px] uppercase tracking-[0.24em] text-ink-soft">{label}</p>
      <p className="mt-3 font-display text-3xl text-ink">{value}</p>
    </div>
  )
}

function MasteryTile({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: number
  tone?: 'default' | 'accent'
}) {
  return (
    <div
      className={
        tone === 'accent'
          ? 'rounded-[22px] border border-highlight-yellow/45 bg-highlight-yellow/14 px-4 py-4'
          : 'rounded-[22px] border border-line-soft/70 bg-paper-base/78 px-4 py-4'
      }
    >
      <p className="font-display text-3xl text-ink">{value}</p>
      <p className="mt-2 text-sm text-ink-muted">{label}</p>
    </div>
  )
}
