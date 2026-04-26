import { BookOpen, Layers, Mic, Sparkles, TrendingUp } from 'lucide-react'
import { Button, Card, CardContent, EmptyState } from '@/components/ui'
export interface ProfileOverviewMetric {
  label: string
  value: string | number
}

export interface ProfileQuickLink {
  label: string
  description: string
  onClick: () => void
}

export interface ProfileLedgerItem {
  id: string
  title: string
  meta: string
  pointsLabel: string
}

export interface ProfilePageProps {
  hasData: boolean
  overview: ProfileOverviewMetric[]
  mastery: Array<{ label: string; value: number | string }>
  heatmap: React.ReactNode
  ledger: ProfileLedgerItem[]
  quickLinks: ProfileQuickLink[]
  summary: Array<{ label: string; value: string }>
  onOpenLibrary: () => void
  onOpenReview: () => void
}

function Header() {
  return (
    <div className="mb-6">
      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        LEARNING PROFILE
      </p>
      <h1 className="mt-1 text-2xl font-medium text-foreground" data-testid="app-shell-page-title">
        我的
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        以参考编码的总览页结构重组学习概览、掌握度、热力图、积分流水和跨页快捷入口。
      </p>
    </div>
  )
}

function StudyOverviewPanel({ overview }: { overview: ProfileOverviewMetric[] }) {
  return (
    <Card className="border-border/50 bg-card">
      <CardContent className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-medium text-foreground">学习概览</h3>
          <Sparkles className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="grid grid-cols-2 gap-4" data-testid="profile-metrics">
          {overview.map((item) => (
            <div key={item.label}>
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                {item.value}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function MasteryProgressPanel({
  mastery,
}: {
  mastery: Array<{ label: string; value: number | string }>
}) {
  return (
    <Card className="border-border/50 bg-card">
      <CardContent className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-medium text-foreground">掌握进度</h3>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {mastery.map((item) => (
            <div
              key={item.label}
              className="rounded-xl border border-border/40 bg-background/50 p-4"
            >
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                {item.label}
              </p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{item.value}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function HeatmapPanel({ heatmap }: { heatmap: React.ReactNode }) {
  return (
    <Card className="border-border/50 bg-card" data-testid="profile-heatmap">
      <CardContent className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-medium text-foreground">学习热力图</h3>
          <span className="text-xs text-muted-foreground">过去若干周</span>
        </div>
        {heatmap}
      </CardContent>
    </Card>
  )
}

function PointsLedgerPanel({ ledger }: { ledger: ProfileLedgerItem[] }) {
  return (
    <Card className="border-border/50 bg-card" data-testid="profile-ledger">
      <CardContent className="p-5">
        <h3 className="mb-4 text-sm font-medium text-foreground">积分台账</h3>
        {ledger.length === 0 ? (
          <EmptyState
            title="还没有积分记录"
            description="完成一次复习、问答或资料导入后，这里会开始累计积分流水。"
          />
        ) : (
          <div className="space-y-3">
            {ledger.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-4 rounded-xl border border-border/40 bg-background/50 p-4"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.meta}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">积分</p>
                  <p className="text-lg font-semibold text-chart-1">{item.pointsLabel}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function QuickLinksPanel({ quickLinks }: { quickLinks: ProfileQuickLink[] }) {
  const icons = [Layers, Mic, BookOpen, Sparkles]
  return (
    <Card className="border-border/50 bg-card">
      <CardContent className="p-5">
        <h3 className="mb-4 text-sm font-medium text-foreground">推荐动作</h3>
        <div className="space-y-3">
          {quickLinks.map((item, index) => {
            const Icon = icons[index % icons.length]
            return (
              <button
                key={item.label}
                type="button"
                onClick={item.onClick}
                className="flex w-full items-start gap-3 rounded-xl border border-border/40 bg-background/50 p-4 text-left transition-colors hover:bg-muted/30"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted/50">
                  <Icon className="h-4 w-4 text-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.description}</p>
                </div>
              </button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

function SummaryRail({ summary }: { summary: Array<{ label: string; value: string }> }) {
  return (
    <Card className="border-border/50 bg-card">
      <CardContent className="p-5">
        <h3 className="mb-4 text-sm font-medium text-foreground">当前状态</h3>
        <div className="space-y-3">
          {summary.map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between gap-3 border-b border-border/40 pb-3 last:border-b-0 last:pb-0"
            >
              <span className="text-sm text-muted-foreground">{item.label}</span>
              <span className="text-sm font-medium text-foreground">{item.value}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export function ProfilePage(props: ProfilePageProps) {
  if (!props.hasData) {
    return (
      <div className="mx-auto box-border max-w-5xl p-6" data-testid="profile-page">
        <EmptyState
          title="还没有形成学习画像"
          description="完成一次复习，或先导入一份文档。这里会开始累计热力图、掌握度和积分台账。"
          action={{ label: '前往文档库', onClick: props.onOpenLibrary }}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto box-border flex w-full max-w-[1440px] flex-col gap-5 p-6" data-testid="profile-page">
      <Header />
      <div className="flex flex-wrap gap-3">
        <Button onClick={props.onOpenReview} className="rounded-lg">
          继续复习
        </Button>
        <Button variant="outline" onClick={props.onOpenLibrary} className="rounded-lg">
          文档库
        </Button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <StudyOverviewPanel overview={props.overview} />
          <MasteryProgressPanel mastery={props.mastery} />
          <HeatmapPanel heatmap={props.heatmap} />
          <PointsLedgerPanel ledger={props.ledger} />
        </div>
        <div className="space-y-5 xl:sticky xl:top-6 xl:h-fit">
          <SummaryRail summary={props.summary} />
          <QuickLinksPanel quickLinks={props.quickLinks} />
        </div>
      </div>
    </div>
  )
}
