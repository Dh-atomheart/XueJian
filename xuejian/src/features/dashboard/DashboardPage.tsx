import { useMemo } from 'react'
import { Button, Panel, SketchEmptyState } from '@/components/ui'
import { HeatmapCalendar, StudyTotalsCard, type HeatmapEntry } from '@/components/stats'
import { DocumentStatusBadge, ImportDocumentButton } from '@/components/documents'
import {
  useDailyStatsQuery,
  useRecentDocumentsQuery,
  useApiConfigsQuery,
  useReviewLogsQuery,
} from '@/queries'
import { usePointsSummaryQuery } from '@/queries/points'
import { useAppUiStore } from '@/store'
import type { ReviewLog } from '@/types'

export function DashboardPage() {
  const setActiveNavItem = useAppUiStore((state) => state.setActiveNavItem)
  const openReader = useAppUiStore((state) => state.openReader)
  const { data: recentDocuments = [], isLoading: isLoadingDocuments } = useRecentDocumentsQuery(5)
  const { data: dailyStats } = useDailyStatsQuery()
  const { data: apiConfigs = [] } = useApiConfigsQuery()
  const { data: pointsSummary } = usePointsSummaryQuery()
  const { data: reviewLogs = [] } = useReviewLogsQuery({ limit: 500 })

  const totalDue = (dailyStats?.newCards ?? 0) + (dailyStats?.reviewCards ?? 0)
  const hasApiConfig = apiConfigs.length > 0
  const hasDocuments = recentDocuments.length > 0

  const heatmapEntries = useMemo(() => buildHeatmapEntries(reviewLogs), [reviewLogs])
  const studyTotals = useMemo(() => computeStudyTotals(reviewLogs), [reviewLogs])

  // First-use: no API config yet
  if (!hasApiConfig && !hasDocuments) {
    return <FirstUseView onGoSettings={() => setActiveNavItem('settings')} />
  }

  // Empty: has config but no documents
  if (hasApiConfig && !hasDocuments) {
    return (
      <EmptyWorkspaceView
        onGoLibrary={() => setActiveNavItem('library')}
        onImported={() => setActiveNavItem('library')}
      />
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* 今日学习任务 — 最重要的信息 */}
      <Panel variant="paperCard" className="rounded-[24px] p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="font-ui text-xs uppercase tracking-[0.24em] text-ink-soft">今日学习</p>
            <div className="flex items-end gap-3">
              <span className="font-display text-5xl tabular-nums leading-none text-ink">
                {totalDue}
              </span>
              <span className="mb-1 font-body text-sm text-ink-muted">张卡片待复习</span>
            </div>
            {dailyStats && (
              <div className="mt-1 flex gap-4 text-sm text-ink-muted">
                <span>
                  新卡 <span className="tabular-nums text-ink">{dailyStats.newCards}</span>
                </span>
                <span>
                  复习 <span className="tabular-nums text-ink">{dailyStats.reviewCards}</span>
                </span>
                {(pointsSummary?.todayPoints ?? 0) > 0 && (
                  <span>
                    积分{' '}
                    <span className="tabular-nums text-ink">+{pointsSummary!.todayPoints}</span>
                  </span>
                )}
              </div>
            )}
          </div>
          <Button
            variant="default"
            size="lg"
            className="shrink-0"
            onClick={() => setActiveNavItem('learning')}
            disabled={totalDue === 0}
          >
            {totalDue > 0 ? '开始学习' : '今日已完成'}
          </Button>
        </div>
      </Panel>

      {/* 快速动作 + 最近文档 */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.6fr)]">
        {/* 最近文档 */}
        <Panel variant="paperCard" className="rounded-[24px] p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-ui text-base text-ink">最近文档</h2>
            <Button variant="ghost" size="sm" onClick={() => setActiveNavItem('library')}>
              查看全部
            </Button>
          </div>

          {isLoadingDocuments ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="flex animate-pulse items-center gap-3 rounded-xl bg-paper-muted p-3"
                >
                  <div className="h-4 w-32 rounded bg-paper-soft" />
                  <div className="ml-auto h-4 w-16 rounded bg-paper-soft" />
                </div>
              ))}
            </div>
          ) : (
            <ul className="space-y-2">
              {recentDocuments.map((doc) => (
                <li key={doc.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-transparent px-3 py-3 text-left transition hover:border-line-soft hover:bg-paper-muted/60"
                    onClick={() => {
                      if (doc.status === 'ready') {
                        openReader(doc.id, doc.pageCount ?? 1)
                      } else {
                        setActiveNavItem('library')
                      }
                    }}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-ui text-sm text-ink">{doc.title}</p>
                      <p className="mt-0.5 text-xs text-ink-soft">
                        {doc.fileType.toUpperCase()} · {doc.pageCount ?? '--'} 页
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <DocumentStatusBadge status={doc.status} />
                      {doc.status === 'ready' && (
                        <span className="font-ui text-xs text-ink-muted">继续阅读 →</span>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* 快速开始侧栏 */}
        <div className="space-y-4">
          <Panel variant="paperCard" className="rounded-[24px] p-5">
            <h3 className="mb-3 font-ui text-sm text-ink">快速开始</h3>
            <div className="space-y-2">
              <Button
                variant="sketch"
                className="w-full justify-start"
                onClick={() => setActiveNavItem('learning')}
              >
                <LearnIcon className="mr-2 h-4 w-4" />
                进入学习
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => setActiveNavItem('library')}
              >
                <BookIcon className="mr-2 h-4 w-4" />
                文档库
              </Button>
              <ImportDocumentButton
                onImported={() => setActiveNavItem('library')}
                showFeedback
                idleLabel="导入文档"
                buttonProps={{
                  variant: 'outline',
                  className: 'w-full justify-start',
                }}
              />
            </div>
          </Panel>

          <Panel variant="paperCard" className="rounded-[24px] p-5">
            <h3 className="mb-3 font-ui text-sm text-ink">学习概览</h3>
            <StudyTotalsCard
              todayMinutes={studyTotals.todayMinutes}
              weekMinutes={studyTotals.weekMinutes}
              totalMinutes={studyTotals.totalMinutes}
              streakDays={studyTotals.streakDays}
              className="grid-cols-2 sm:grid-cols-2 lg:grid-cols-2"
            />
          </Panel>
        </div>
      </div>

      {/* 学习热力图 */}
      <Panel variant="paperCard" className="rounded-[24px] p-6">
        <HeatmapCalendar entries={heatmapEntries} weeks={16} />
      </Panel>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Heatmap + totals derivation                                        */
/* ------------------------------------------------------------------ */

const MINUTES_PER_REVIEW = 0.5

function buildHeatmapEntries(logs: ReviewLog[]): HeatmapEntry[] {
  const counts = new Map<string, number>()
  for (const log of logs) {
    const iso = toIsoLocalDate(log.reviewedAt)
    counts.set(iso, (counts.get(iso) ?? 0) + 1)
  }
  return Array.from(counts.entries()).map(([date, count]) => ({ date, count }))
}

interface StudyTotals {
  todayMinutes: number | null
  weekMinutes: number | null
  totalMinutes: number | null
  streakDays: number | null
}

function computeStudyTotals(logs: ReviewLog[]): StudyTotals {
  if (logs.length === 0) {
    return { todayMinutes: null, weekMinutes: null, totalMinutes: null, streakDays: null }
  }

  const today = startOfLocalDay(new Date())
  const todayIso = toIsoLocalDate(today)
  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() - 6)

  let todayCount = 0
  let weekCount = 0
  const activeDays = new Set<string>()

  for (const log of logs) {
    const iso = toIsoLocalDate(log.reviewedAt)
    activeDays.add(iso)
    if (iso === todayIso) todayCount += 1
    const logDay = startOfLocalDay(log.reviewedAt)
    if (logDay >= weekStart && logDay <= today) weekCount += 1
  }

  return {
    todayMinutes: Math.round(todayCount * MINUTES_PER_REVIEW),
    weekMinutes: Math.round(weekCount * MINUTES_PER_REVIEW),
    totalMinutes: Math.round(logs.length * MINUTES_PER_REVIEW),
    streakDays: computeStreak(activeDays, today),
  }
}

function computeStreak(activeDays: Set<string>, today: Date): number {
  let streak = 0
  const cursor = new Date(today)
  while (activeDays.has(toIsoLocalDate(cursor))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

function startOfLocalDay(input: Date): Date {
  const d = new Date(input)
  d.setHours(0, 0, 0, 0)
  return d
}

function toIsoLocalDate(input: Date): string {
  const d = startOfLocalDay(input)
  const y = d.getFullYear()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${day}`
}

/* ------------------------------------------------------------------ */
/* 首次使用视图 */
/* ------------------------------------------------------------------ */

function FirstUseView({ onGoSettings }: { onGoSettings: () => void }) {
  return (
    <div className="flex h-full items-center justify-center px-4">
      <SketchEmptyState
        illustration="book"
        title="欢迎使用学笺"
        description="这是你的本地学习工作台。开始之前请先配置一个 AI 模型，所有 API Key 只会保存在本地密钥库里，不会上云。"
        className="max-w-md"
        size="lg"
        action={
          <Button variant="default" onClick={onGoSettings}>
            前往设置，配置模型
          </Button>
        }
        secondaryAction={
          <span className="font-ui text-xs text-ink-soft">
            配置完成后即可导入 PDF 开始学习
          </span>
        }
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 空工作台视图 */
/* ------------------------------------------------------------------ */

function EmptyWorkspaceView({
  onGoLibrary,
  onImported,
}: {
  onGoLibrary: () => void
  onImported: () => void
}) {
  return (
    <div className="flex h-full items-center justify-center px-4">
      <SketchEmptyState
        illustration="note"
        title="准备开始"
        description="模型已配置好。导入第一份文档，系统会自动解析并生成学习卡片。"
        className="max-w-md"
        size="lg"
        action={
          <ImportDocumentButton
            onImported={onImported}
            showFeedback
            buttonProps={{ variant: 'default' }}
          />
        }
        secondaryAction={
          <Button variant="ghost" size="sm" onClick={onGoLibrary}>
            前往文档库
          </Button>
        }
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 小图标 */
/* ------------------------------------------------------------------ */

function LearnIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  )
}

function BookIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  )
}
