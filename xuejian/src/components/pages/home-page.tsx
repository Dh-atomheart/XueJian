import { ArrowRight, Check, FileText, FolderOpen, MessageSquare, Pen, Plus, RefreshCcw, Sparkles, TrendingUp, Upload } from 'lucide-react'
import { Button, Card, CardContent, EmptyState, SkeletonDocRow } from '@/components/ui'
import { HeatmapCalendar, type HeatmapEntry } from '@/components/stats'
import { useStickyNote } from '@/hooks/useStickyNote'
import { useCallback, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

export interface HomePageDocument {
  id: string
  title: string
  subtitle: string
  pageCountLabel: string
  statusLabel: string
  statusTone: 'ready' | 'processing' | 'error'
}

export interface HomePageProps {
  stats: Array<{ value: number | string; label: string }>
  overview: Array<{ label: string; value: string | number }>
  heatmap: HeatmapEntry[]
  recentDocuments: HomePageDocument[]
  isDocumentsLoading?: boolean
  hasDocuments?: boolean
  quickActions: Array<{ label: string; description: string; icon: React.ComponentType<{ className?: string }>; onClick: () => void }>
  weeklySignals: Array<{ label: string; trend: 'up' | 'down' | 'neutral' }>
  workbenchStatus: Array<{ label: string; value: string; tone: 'default' | 'active' | 'warn' }>
  onOpenLibrary: () => void
  onOpenReview: () => void
  onOpenCards: () => void
  onOpenDocument: (id: string) => void
}

function PageHeader() {
  return (
    <div className="mb-6">
      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">STUDY CENTER</p>
      <h1 className="mt-1 text-2xl font-medium text-foreground" data-testid="app-shell-page-title">
        今日学习中心
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">按参考编码的首页结构重建：总览、热力、最近文档、快捷入口和右侧信息轨。</p>
    </div>
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

function HeroStats({ stats, onOpenReview, onOpenCards }: Pick<HomePageProps, 'stats' | 'onOpenReview' | 'onOpenCards'>) {
  return (
    <Card className="border-border/50 bg-card">
      <CardContent className="flex flex-col gap-5 p-6">
        <div className="flex flex-wrap gap-6">
          {stats.map((item) => (
            <StatsCircle key={item.label} value={item.value} label={item.label} />
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          <Button className="rounded-lg" onClick={onOpenReview}>
            进入复习
          </Button>
          <Button variant="outline" className="rounded-lg" onClick={onOpenCards}>
            打开卡片工坊
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function StudyOverviewPanel({ overview }: Pick<HomePageProps, 'overview'>) {
  return (
    <Card className="border-border/50 bg-card">
      <CardContent className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-medium text-foreground">学习概览</h3>
          <span className="text-xs text-muted-foreground">今日</span>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {overview.map((item) => (
            <div key={item.label}>
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{item.value}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function HeatmapPanel({ heatmap }: Pick<HomePageProps, 'heatmap'>) {
  return (
    <Card className="border-border/50 bg-card">
      <CardContent className="p-5">
        <HeatmapCalendar entries={heatmap} weeks={16} />
      </CardContent>
    </Card>
  )
}

function DocumentStatusBadge({ tone, label }: { tone: HomePageDocument['statusTone']; label: string }) {
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-[10px] font-medium',
        tone === 'ready' && 'bg-chart-1/15 text-chart-1',
        tone === 'processing' && 'bg-chart-5/15 text-chart-5',
        tone === 'error' && 'bg-destructive/15 text-destructive'
      )}
    >
      {label}
    </span>
  )
}

function RecentDocumentsPanel({
  recentDocuments,
  isDocumentsLoading,
  onOpenLibrary,
  onOpenDocument,
}: Pick<HomePageProps, 'recentDocuments' | 'isDocumentsLoading' | 'onOpenLibrary' | 'onOpenDocument'>) {
  return (
    <Card className="border-border/50 bg-card">
      <CardContent className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-medium text-foreground">最近文档</h3>
          <button onClick={onOpenLibrary} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            查看全部 <ArrowRight className="h-3 w-3" />
          </button>
        </div>
        {isDocumentsLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <SkeletonDocRow key={i} />
            ))}
          </div>
        ) : recentDocuments.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title="还没有已接通的文档"
            description="上传第一份 PDF 后，这里会展示最近可继续处理的资料。"
            action={{ label: '上传文档', onClick: onOpenLibrary }}
          />
        ) : (
          <div className="space-y-2" data-testid="home-recent-documents-panel">
            {recentDocuments.map((doc) => (
              <button
                key={doc.id}
                className="flex w-full items-center justify-between rounded-lg border border-border/50 bg-background/50 p-3 text-left transition-colors hover:bg-muted/30"
                onClick={() => onOpenDocument(doc.id)}
              >
                <div className="flex items-center gap-3">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{doc.title}</p>
                    <p className="text-xs text-muted-foreground">{doc.subtitle}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <DocumentStatusBadge tone={doc.statusTone} label={doc.statusLabel} />
                  <span className="text-xs text-muted-foreground">{doc.pageCountLabel}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function QuickActionsPanel({ quickActions }: Pick<HomePageProps, 'quickActions'>) {
  return (
    <Card className="border-border/50 bg-card" data-testid="home-quick-actions-panel">
      <CardContent className="p-5">
        <h3 className="mb-4 text-sm font-medium text-foreground">快速开始</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {quickActions.map((action) => {
            const Icon = action.icon
            return (
              <button
                key={action.label}
                onClick={action.onClick}
                className="flex items-center gap-3 rounded-lg border border-border/50 bg-background/50 p-3 text-left transition-colors hover:bg-muted/30"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50">
                  <Icon className="h-4 w-4 text-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{action.label}</p>
                  <p className="text-xs text-muted-foreground">{action.description}</p>
                </div>
              </button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

function DeskNotePanel() {
  const { note, saveNote } = useStickyNote()
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const startEditing = useCallback(() => {
    setDraft(note)
    setIsEditing(true)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.select()
    })
  }, [note])

  const finishEditing = useCallback(() => {
    saveNote(draft)
    setIsEditing(false)
  }, [draft, saveNote])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        finishEditing()
      }
      if (e.key === 'Escape') {
        setIsEditing(false)
      }
    },
    [finishEditing]
  )

  return (
    <Card className="border-border/50 bg-chart-2/10">
      <CardContent className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-medium text-foreground">桌面便笺</h3>
          <Sparkles className="h-3.5 w-3.5 text-chart-2" />
        </div>
        {isEditing ? (
          <div className="space-y-2">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={finishEditing}
              onKeyDown={handleKeyDown}
              className="w-full resize-none rounded-lg border border-border/50 bg-background/80 p-2 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-chart-2/50"
              rows={3}
              placeholder="写下你的学习目标..."
            />
            <div className="flex justify-end">
              <button
                onClick={finishEditing}
                className="flex items-center gap-1 rounded-md bg-chart-2/20 px-2 py-1 text-xs text-chart-2 hover:bg-chart-2/30"
              >
                <Check className="h-3 w-3" />
                保存
              </button>
            </div>
          </div>
        ) : (
          <>
            <p
              className="cursor-pointer text-sm leading-relaxed text-muted-foreground italic"
              onClick={startEditing}
              title="点击编辑"
            >
              {note.split('\n').map((line, i) => (
                <span key={i}>
                  {i > 0 && <br />}
                  {line || <br />}
                </span>
              ))}
            </p>
            <div className="mt-3 flex justify-end">
              <button onClick={startEditing}>
                <Pen className="h-4 w-4 text-muted-foreground/50 hover:text-muted-foreground/80" />
              </button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function WeeklySignalsPanel({ weeklySignals }: Pick<HomePageProps, 'weeklySignals'>) {
  return (
    <Card className="border-border/50 bg-card">
      <CardContent className="p-4">
        <h3 className="mb-3 text-xs font-medium text-foreground">本周信号</h3>
        <div className="space-y-2">
          {weeklySignals.map((signal) => (
            <div key={signal.label} className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">•</span>
              <span className="flex-1 text-xs text-muted-foreground">{signal.label}</span>
              {signal.trend === 'down' ? <TrendingUp className="h-3 w-3 rotate-180 text-destructive" /> : null}
              {signal.trend === 'up' ? <TrendingUp className="h-3 w-3 text-chart-1" /> : null}
              {signal.trend === 'neutral' ? <div className="h-2 w-2 rounded-full bg-chart-1" /> : null}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function WorkbenchStatusPanel({ workbenchStatus }: Pick<HomePageProps, 'workbenchStatus'>) {
  return (
    <Card className="border-border/50 bg-card">
      <CardContent className="p-4">
        <h3 className="mb-3 text-xs font-medium text-foreground">工作台状态</h3>
        <div className="space-y-2">
          {workbenchStatus.map((item) => (
            <div key={item.label} className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{item.label}</span>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px]',
                  item.tone === 'active' && 'bg-chart-1/15 text-chart-1',
                  item.tone === 'warn' && 'bg-chart-2/15 text-chart-2',
                  item.tone === 'default' && 'bg-muted text-muted-foreground'
                )}
              >
                {item.value}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export function HomePage(props: HomePageProps) {
  return (
    <div className="h-full p-6">
      <PageHeader />
      <HeroStats stats={props.stats} onOpenReview={props.onOpenReview} onOpenCards={props.onOpenCards} />
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3 xl:grid-cols-4">
        <div className="space-y-6 lg:col-span-2 xl:col-span-3">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <StudyOverviewPanel overview={props.overview} />
            <HeatmapPanel heatmap={props.heatmap} />
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <RecentDocumentsPanel
              recentDocuments={props.recentDocuments}
              isDocumentsLoading={props.isDocumentsLoading}
              onOpenLibrary={props.onOpenLibrary}
              onOpenDocument={props.onOpenDocument}
            />
            <QuickActionsPanel quickActions={props.quickActions} />
          </div>
        </div>
        <div className="space-y-4 lg:col-span-1">
          <DeskNotePanel />
          <WeeklySignalsPanel weeklySignals={props.weeklySignals} />
          <WorkbenchStatusPanel workbenchStatus={props.workbenchStatus} />
        </div>
      </div>
    </div>
  )
}

export const homePageIcons = {
  review: RefreshCcw,
  upload: Upload,
  cards: Plus,
  qa: MessageSquare,
}
