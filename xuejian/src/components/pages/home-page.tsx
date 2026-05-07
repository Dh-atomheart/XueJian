import type { ComponentType } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  FolderOpen,
  Layers3,
  Library,
  Plus,
  RefreshCcw,
  AlertCircle,
  Upload,
} from 'lucide-react'
import {
  Card,
  CardContent,
} from '@/components/ui/card'
import {
  EmptyState,
  ErrorState,
  SkeletonBlock,
  SkeletonDocRow,
} from '@/components/ui/state-views'
import { HeatmapCalendar, type HeatmapEntry } from '@/components/stats/HeatmapCalendar'
import { cn } from '@/lib/utils'
import type { DashboardSummary } from '@/types'

export interface HomePageDocument {
  id: string
  title: string
  subtitle: string
  pageCountLabel: string
  statusLabel: string
  statusTone: 'ready' | 'processing' | 'error'
}

export interface HomePageProps {
  metrics: Array<{ value: number | string; label: string; hint: string }>
  heatmap: HeatmapEntry[]
  documentProgress: DashboardSummary['documentProgress']
  groupProgress: DashboardSummary['groupProgress']
  recentDocuments: HomePageDocument[]
  alerts?: Array<{ id: string; title: string; detail: string; tone: 'warning' | 'danger'; actionLabel?: string; onAction?: () => void }>
  isLoading?: boolean
  isError?: boolean
  errorMessage?: string
  quickActions: Array<{
    label: string
    description: string
    icon: ComponentType<{ className?: string }>
    onClick: () => void
    primary?: boolean
  }>
  onRetry: () => void
  onOpenLibrary: () => void
  onOpenDocument: (id: string) => void
}

function PageHeader() {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">Study Dashboard</p>
      <h1 className="font-ui text-2xl font-medium text-ink" data-testid="app-shell-page-title">
        今日学习工作台
      </h1>
      <p className="max-w-3xl text-sm leading-6 text-ink-muted">
        从待复习卡片、最近文档和掌握进度开始，快速判断今天下一步该做什么。
      </p>
    </div>
  )
}

function MetricGrid({ metrics }: Pick<HomePageProps, 'metrics'>) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="home-metrics">
      {metrics.map((item) => (
        <div
          key={item.label}
          className="rounded-lg border border-line-soft bg-paper-card/92 px-4 py-4"
        >
          <p className="text-[11px] uppercase tracking-[0.16em] text-ink-soft">{item.label}</p>
          <p className="mt-2 font-ui text-2xl font-medium tabular-nums text-ink">{item.value}</p>
          <p className="mt-2 text-xs leading-5 text-ink-muted">{item.hint}</p>
        </div>
      ))}
    </section>
  )
}

function QuickActionsPanel({ quickActions }: Pick<HomePageProps, 'quickActions'>) {
  return (
    <section
      className="grid gap-3 md:grid-cols-3"
      data-testid="home-quick-actions-panel"
      aria-label="首页快捷操作"
    >
      {quickActions.map((action) => {
        const Icon = action.icon
        return (
          <button
            key={action.label}
            type="button"
            onClick={action.onClick}
            className={cn(
              'flex min-h-[88px] items-center gap-3 rounded-lg border px-4 py-3 text-left transition hover:border-ink/20',
              action.primary
                ? 'border-ink/15 bg-ink text-paper-card hover:bg-ink/90'
                : 'border-line-soft bg-paper-card/88 text-ink hover:bg-paper-muted'
            )}
          >
            <span
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                action.primary ? 'bg-paper-card/12' : 'bg-paper-muted'
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-ui text-sm font-medium">{action.label}</span>
              <span
                className={cn(
                  'mt-1 line-clamp-2 block text-xs leading-5',
                  action.primary ? 'text-paper-card/74' : 'text-ink-muted'
                )}
              >
                {action.description}
              </span>
            </span>
          </button>
        )
      })}
    </section>
  )
}

function HeatmapPanel({ heatmap }: Pick<HomePageProps, 'heatmap'>) {
  return (
    <Card data-testid="home-heatmap-panel">
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-ui text-sm font-medium text-ink">学习热力图</h2>
          <span className="text-xs text-ink-soft">最近 16 周</span>
        </div>
        <HeatmapCalendar
          entries={heatmap}
          weeks={16}
          getTooltip={(entry, date) =>
            entry.count > 0 ? `${date}：学习 ${entry.count} 次` : `${date}：暂无学习记录`
          }
        />
      </CardContent>
    </Card>
  )
}

function ProgressPanel({
  title,
  emptyTitle,
  items,
  getName,
  getAccent,
  testId,
}: {
  title: string
  emptyTitle: string
  items: Array<{
    id: string
    learnedCards: number
    totalCards: number
    progressPercent: number
    title?: string
    name?: string
    color?: string | null
  }>
  getName: (item: (typeof items)[number]) => string
  getAccent?: (item: (typeof items)[number]) => string | null | undefined
  testId: string
}) {
  return (
    <Card data-testid={testId}>
      <CardContent className="p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-ui text-sm font-medium text-ink">{title}</h2>
          <span className="text-xs text-ink-soft">已学 / 总数</span>
        </div>

        {items.length === 0 ? (
          <EmptyState
            icon={Layers3}
            title={emptyTitle}
            description="导入文档并生成卡片后，这里会显示掌握进度。"
            className="py-8"
          />
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id} className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full bg-highlight-green"
                      style={getAccent ? { backgroundColor: getAccent(item) ?? undefined } : undefined}
                    />
                    <p className="truncate text-sm text-ink">{getName(item) || '未命名'}</p>
                  </div>
                  <span className="shrink-0 font-latin text-xs tabular-nums text-ink-soft">
                    {item.learnedCards}/{item.totalCards}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-paper-muted">
                  <div
                    className="h-full rounded-full bg-highlight-green transition-all"
                    style={{ width: `${item.progressPercent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function DocumentStatusBadge({ tone, label }: { tone: HomePageDocument['statusTone']; label: string }) {
  return (
    <span
      className={cn(
        'rounded-md px-2 py-0.5 text-[10px] font-medium',
        tone === 'ready' && 'bg-highlight-green/18 text-ink',
        tone === 'processing' && 'bg-highlight-yellow/24 text-ink',
        tone === 'error' && 'bg-destructive/12 text-destructive'
      )}
    >
      {label}
    </span>
  )
}

function RecentDocumentsPanel({
  recentDocuments,
  onOpenLibrary,
  onOpenDocument,
}: Pick<HomePageProps, 'recentDocuments' | 'onOpenLibrary' | 'onOpenDocument'>) {
  return (
    <Card data-testid="home-recent-documents-panel">
      <CardContent className="p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-ui text-sm font-medium text-ink">最近文档</h2>
          <button
            type="button"
            onClick={onOpenLibrary}
            className="flex items-center gap-1 text-xs text-ink-soft hover:text-ink"
          >
            查看全部 <ArrowRight className="h-3 w-3" />
          </button>
        </div>

        {recentDocuments.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title="还没有可阅读的文档"
            description="导入 PDF 后，可以在这里继续阅读并生成卡片。"
            action={{ label: '导入文档', onClick: onOpenLibrary }}
            className="py-8"
          />
        ) : (
          <div className="space-y-2">
            {recentDocuments.map((doc) => (
              <button
                key={doc.id}
                type="button"
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-line-soft bg-paper-base/70 p-3 text-left transition hover:border-ink/20"
                onClick={() => onOpenDocument(doc.id)}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <FileText className="h-4 w-4 shrink-0 text-ink-soft" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{doc.title}</p>
                    <p className="truncate text-xs text-ink-muted">{doc.subtitle}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <DocumentStatusBadge tone={doc.statusTone} label={doc.statusLabel} />
                  <span className="text-xs text-ink-soft">{doc.pageCountLabel}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function AlertsPanel({ alerts }: { alerts: NonNullable<HomePageProps['alerts']> }) {
  if (alerts.length === 0) return null

  return (
    <section className="space-y-2" data-testid="home-alerts-panel" aria-label="学习异常提醒">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className={cn(
            'flex items-start justify-between gap-3 rounded-lg border px-4 py-3',
            alert.tone === 'danger'
              ? 'border-destructive/25 bg-destructive/7'
              : 'border-highlight-yellow/40 bg-highlight-yellow/12'
          )}
        >
          <div className="flex min-w-0 gap-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">{alert.title}</p>
              <p className="mt-1 text-xs leading-5 text-ink-muted">{alert.detail}</p>
            </div>
          </div>
          {alert.actionLabel && alert.onAction ? (
            <button
              type="button"
              onClick={alert.onAction}
              className="shrink-0 rounded-md border border-line-soft bg-paper-card px-2.5 py-1.5 text-xs text-ink-muted hover:text-ink"
            >
              {alert.actionLabel}
            </button>
          ) : null}
        </div>
      ))}
    </section>
  )
}

function LoadingDashboard() {
  return (
    <div className="h-full overflow-auto p-5" data-testid="home-dashboard-loading">
      <div className="space-y-4">
        <SkeletonBlock className="h-20" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <SkeletonBlock key={item} className="h-28" />
          ))}
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <SkeletonBlock className="h-56" />
          <div className="space-y-2">
            <SkeletonDocRow />
            <SkeletonDocRow />
            <SkeletonDocRow />
          </div>
        </div>
      </div>
    </div>
  )
}

export function HomePage(props: HomePageProps) {
  if (props.isLoading) {
    return <LoadingDashboard />
  }

  if (props.isError) {
    return (
      <div className="flex h-full items-center justify-center p-6" data-testid="home-dashboard-error">
        <ErrorState
          title="学习仪表盘加载失败"
          description={props.errorMessage ?? '无法读取学习统计，请稍后重试。'}
          onRetry={props.onRetry}
        />
      </div>
    )
  }

  const hasAnyProgress = props.documentProgress.length > 0 || props.groupProgress.length > 0
  const alerts = props.alerts ?? []

  return (
    <div className="h-full overflow-auto p-5" data-testid="home-dashboard">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <PageHeader />
        <QuickActionsPanel quickActions={props.quickActions} />
        <AlertsPanel alerts={alerts} />
        <MetricGrid metrics={props.metrics} />

        <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <div className="min-w-0 space-y-4">
            <HeatmapPanel heatmap={props.heatmap} />
            <div className="grid min-w-0 gap-4 lg:grid-cols-2">
              <ProgressPanel
                title="文档掌握进度"
                emptyTitle="暂无文档进度"
                items={props.documentProgress}
                getName={(item) => item.title ?? ''}
                testId="home-document-progress-panel"
              />
              <ProgressPanel
                title="分组掌握进度"
                emptyTitle="暂无分组进度"
                items={props.groupProgress}
                getName={(item) => item.name ?? ''}
                getAccent={(item) => item.color}
                testId="home-group-progress-panel"
              />
            </div>
          </div>

          <div className="min-w-0 space-y-4">
            <RecentDocumentsPanel
              recentDocuments={props.recentDocuments}
              onOpenLibrary={props.onOpenLibrary}
              onOpenDocument={props.onOpenDocument}
            />

            <Card className={cn(!hasAnyProgress && 'bg-paper-muted/70')}>
              <CardContent className="flex items-start gap-3 p-4">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-highlight-green" />
                <div>
                  <p className="text-sm font-medium text-ink">
                    {hasAnyProgress ? '学习记录正在同步' : '从第一份文档开始'}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-ink-muted">
                    {hasAnyProgress
                      ? 'Reader、卡片和复习记录会汇总到这里，方便检查长期趋势。'
                      : '导入文档并生成 Basic 卡片后，首页会显示热力图、最近文档和掌握进度。'}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

export const homePageIcons = {
  review: RefreshCcw,
  upload: Upload,
  cards: Plus,
  library: Library,
}
