import { useMemo } from 'react'
import { ImportDocumentButton } from '@/components/documents'
import { Button } from '@/components/ui'
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
  const { data: documents = [] } = useDocumentsQuery()
  const { data: apiConfigs = [] } = useApiConfigsQuery()

  const readyDocuments = useMemo(
    () => documents.filter((document) => document.status === 'ready').slice(0, 5),
    [documents]
  )
  const hasApiConfig = hasUsableApiConfig(apiConfigs)
  const reviewCards = dailyStats?.reviewCards ?? 0
  const newCards = dailyStats?.newCards ?? 0
  const totalDue = reviewCards + newCards
  const todayPoints = pointsSummary?.todayPoints ?? 0
  const weeks = chunkHeatmap(heatmapEntries, 9, 7)

  return (
    <div className="h-full">
      <div className="rounded-2xl border border-border/60 bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="flex gap-6">
            <StatsCircle value={reviewCards} label="待复习" />
            <StatsCircle value={newCards} label="新知识" />
            <StatsCircle value={totalDue} label="今日任务" />
            <StatsCircle value={`+${todayPoints}`} label="今日积分" />
            <StatsCircle value={studyStats?.streakDays ?? 0} label="连续天数" />
          </div>
          <div className="flex items-center gap-3">
            <Button className="rounded-lg" onClick={() => setActiveNavItem('learning')}>
              开始复习
            </Button>
            <Button
              variant="outline"
              className="rounded-lg"
              onClick={() => setActiveNavItem('cards')}
            >
              进入卡片工坊
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3 xl:grid-cols-4">
        <div className="space-y-6 lg:col-span-2 xl:col-span-3">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <SectionCard
              title="学习概览"
              action={
                <select className="rounded-md border-0 bg-transparent text-xs text-muted-foreground focus:outline-none">
                  <option>今日</option>
                  <option>本周</option>
                  <option>本月</option>
                </select>
              }
            >
              <div className="grid grid-cols-2 gap-4">
                <Metric label="学习时长（分钟）" value={studyStats?.todayMinutes ?? 0} />
                <Metric label="文档数量" value={documents.length} />
                <Metric label="就绪文档" value={readyDocuments.length} />
                <Metric
                  label="活跃天数"
                  value={`${studyStats?.activeDaysThisWeek ?? 0}/7`}
                />
              </div>
            </SectionCard>

            <SectionCard
              title="学习热力图"
              action={<span className="text-xs text-muted-foreground">过去 63 天</span>}
              testId="home-heatmap-panel"
            >
              <div className="flex gap-1">
                {weeks.map((week, weekIndex) => (
                  <div key={weekIndex} className="flex flex-col gap-1">
                    {week.map((day, dayIndex) => (
                      <div
                        key={`${weekIndex}-${dayIndex}`}
                        className={getHeatmapClass(day?.count ?? 0)}
                        title={day ? `${day.date}: ${day.count}` : ''}
                      />
                    ))}
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
                <span>少</span>
                <div className="h-2.5 w-2.5 rounded-sm bg-muted/50" />
                <div className="h-2.5 w-2.5 rounded-sm bg-chart-1/20" />
                <div className="h-2.5 w-2.5 rounded-sm bg-chart-1/40" />
                <div className="h-2.5 w-2.5 rounded-sm bg-chart-1/60" />
                <div className="h-2.5 w-2.5 rounded-sm bg-chart-1/80" />
                <span>多</span>
              </div>
            </SectionCard>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <SectionCard
              title="最近文档"
              action={
                <button
                  type="button"
                  onClick={() => setActiveNavItem('library')}
                  className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  查看全部
                </button>
              }
              testId="home-recent-documents-panel"
            >
              <div className="space-y-2">
                {readyDocuments.length === 0 ? (
                  <div className="rounded-xl border border-border/50 bg-background/50 p-4 text-sm text-muted-foreground">
                    还没有可阅读的文档，先导入一份 PDF。
                  </div>
                ) : (
                  readyDocuments.map((document) => (
                    <button
                      key={document.id}
                      type="button"
                      onClick={() => openReader(document.id, document.pageCount ?? 1)}
                      className="flex w-full items-center justify-between rounded-xl border border-border/50 bg-background/50 p-3 text-left transition-colors hover:bg-muted/30"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground">
                          <DocumentGlyph />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{document.title}</p>
                          <p className="text-xs text-muted-foreground">
                            PDF · {document.pageCount ?? '--'} 页
                          </p>
                        </div>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <p>ready</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </SectionCard>

            <SectionCard title="快速开始" testId="home-quick-actions-panel">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <QuickAction
                  title="继续复习"
                  description={`${reviewCards} 张卡片待复习`}
                  onClick={() => setActiveNavItem('learning')}
                />
                <QuickAction
                  title="新建卡片"
                  description="从文档启动卡片工作流"
                  onClick={() => setActiveNavItem('cards')}
                />
                <QuickAction
                  title="AI 问答"
                  description="围绕文档提问"
                  onClick={() => setActiveNavItem('knowledge')}
                />
                <QuickAction
                  title="知识图谱"
                  description="查看连接与社区"
                  onClick={() => setActiveNavItem('graph')}
                />
              </div>
              <div className="mt-3 rounded-xl border border-dashed border-border/50 bg-background/50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">导入新材料</p>
                    <p className="text-xs text-muted-foreground">文档导入后将自动进入真实解析流程</p>
                  </div>
                  <ImportDocumentButton
                    onImported={() => setActiveNavItem('library')}
                    showFeedback
                    buttonProps={{ className: 'rounded-lg' }}
                  />
                </div>
              </div>
            </SectionCard>
          </div>
        </div>

        <div className="space-y-4 lg:col-span-1">
          <SmallCard title="桌面便笺">
            <p className="text-sm leading-relaxed text-muted-foreground">
              保持每天的微小进步，长期主义会带来复利。
            </p>
          </SmallCard>

          <SmallCard title="本周信号">
            <SignalRow
              label={`学习时长 ${studyStats?.weekMinutes ?? 0} 分钟`}
              positive={(studyStats?.weekMinutes ?? 0) > 0}
            />
            <SignalRow label={`今日任务 ${totalDue} 项`} positive={totalDue > 0} />
            <SignalRow label={hasApiConfig ? 'AI 能力已就绪' : 'AI 尚未配置'} positive={hasApiConfig} />
          </SmallCard>

          <SmallCard title="工作台状态">
            <WorkbenchRow label="文档库" value={`${documents.length} 份`} />
            <WorkbenchRow label="文档工位" value={`${readyDocuments.length} 份`} />
            <WorkbenchRow label="积分" value={`+${todayPoints}`} />
            <button
              type="button"
              onClick={() => setActiveNavItem(hasApiConfig ? 'cards' : 'settings')}
              className="mt-3 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {hasApiConfig ? '进入工坊中心' : '前往配置 AI'}
            </button>
          </SmallCard>
        </div>
      </div>
    </div>
  )
}

function SectionCard({
  title,
  children,
  action,
  testId,
}: {
  title: string
  children: React.ReactNode
  action?: React.ReactNode
  testId?: string
}) {
  return (
    <section className="rounded-2xl border border-border/60 bg-card p-5" data-testid={testId}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function SmallCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border/60 bg-card p-4">
      <h2 className="mb-3 text-xs font-medium text-foreground">{title}</h2>
      {children}
    </section>
  )
}

function StatsCircle({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-foreground/10 bg-card">
        <span className="text-xl font-semibold tabular-nums text-foreground">{value}</span>
      </div>
      <span className="mt-2 text-xs text-muted-foreground">{label}</span>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  )
}

function QuickAction({
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
      className="flex items-center gap-3 rounded-xl border border-border/50 bg-background/50 p-3 text-left transition-colors hover:bg-muted/30"
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50 text-foreground">
        <ArrowGlyph />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </button>
  )
}

function SignalRow({ label, positive }: { label: string; positive: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className={positive ? 'text-chart-1' : 'text-destructive'}>•</span>
      <span>{label}</span>
    </div>
  )
}

function WorkbenchRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs text-muted-foreground">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}

function getHeatmapClass(count: number) {
  if (count === 0) return 'h-3 w-3 rounded-sm bg-muted/50'
  if (count === 1) return 'h-3 w-3 rounded-sm bg-chart-1/20'
  if (count === 2) return 'h-3 w-3 rounded-sm bg-chart-1/40'
  if (count === 3) return 'h-3 w-3 rounded-sm bg-chart-1/60'
  return 'h-3 w-3 rounded-sm bg-chart-1/80'
}

function chunkHeatmap<T>(items: T[], weekCount: number, daysPerWeek: number) {
  const padded = [...items]

  while (padded.length < weekCount * daysPerWeek) {
    padded.push(undefined as T)
  }

  return Array.from({ length: weekCount }, (_, weekIndex) =>
    padded.slice(weekIndex * daysPerWeek, (weekIndex + 1) * daysPerWeek)
  )
}

function DocumentGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  )
}

function ArrowGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4">
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  )
}
