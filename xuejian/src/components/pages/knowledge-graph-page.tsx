import { type ReactNode } from 'react'
import {
  ArrowRight,
  ExternalLink,
  Hand,
  Maximize2,
  MessageSquare,
  Network,
  RefreshCcw,
  Search,
  Wand2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  TaskProgress,
} from '@/components/ui'
import { cn } from '@/lib/utils'

// ─── Node type config ────────────────────────────────────────────────────────

export const NODE_TYPE_CONFIG: Record<string, { label: string; colorClass: string; bgClass: string }> = {
  concept: { label: '概念', colorClass: 'text-chart-2', bgClass: 'bg-chart-2' },
  theory: { label: '理论', colorClass: 'text-chart-1', bgClass: 'bg-chart-1' },
  method: { label: '方法', colorClass: 'text-chart-3', bgClass: 'bg-chart-3' },
  event: { label: '事件', colorClass: 'text-chart-4', bgClass: 'bg-chart-4' },
  person: { label: '人物', colorClass: 'text-chart-5', bgClass: 'bg-chart-5' },
  formula: { label: '公式', colorClass: 'text-purple-500', bgClass: 'bg-purple-500' },
  term: { label: '术语', colorClass: 'text-rose-500', bgClass: 'bg-rose-500' },
  document: { label: '文档', colorClass: 'text-muted-foreground', bgClass: 'bg-muted' },
}

// ─── Legend ──────────────────────────────────────────────────────────────────

export function Legend() {
  return (
    <Card className="absolute left-4 top-4 z-10 border-border/50 bg-card/95 backdrop-blur">
      <CardContent className="p-3">
        <h4 className="mb-2 text-xs font-medium text-foreground">图例</h4>
        <div className="space-y-1.5">
          {Object.entries(NODE_TYPE_CONFIG).map(([type, cfg]) => (
            <div key={type} className="flex items-center gap-2">
              <div className={cn('h-2.5 w-2.5 rounded-full opacity-80', cfg.bgClass)} />
              <span className="text-xs text-muted-foreground">{cfg.label}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 border-t border-border/30 pt-2">
          <p className="mb-1 text-xs text-muted-foreground">关系强度</p>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground">弱</span>
            <div className="h-0.5 flex-1 rounded bg-gradient-to-r from-border to-foreground/50" />
            <span className="text-[10px] text-muted-foreground">强</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Graph Controls ──────────────────────────────────────────────────────────

export function GraphControls({
  onZoomIn,
  onZoomOut,
  onReset,
}: {
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
}) {
  return (
    <Card className="absolute bottom-4 left-4 z-10 border-border/50 bg-card/95 backdrop-blur">
      <CardContent className="flex flex-col items-center gap-1 p-1.5">
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="平移" onClick={onReset}>
          <Hand className="h-4 w-4" />
        </Button>
        <div className="h-px w-6 bg-border/40" />
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onZoomIn}>
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onZoomOut}>
          <ZoomOut className="h-4 w-4" />
        </Button>
        <div className="h-px w-6 bg-border/40" />
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onReset}>
          <RefreshCcw className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  )
}

// ─── Building Overlay ────────────────────────────────────────────────────────

export function BuildingOverlay({ progress }: { progress: number }) {
  const steps = [
    { label: '解析文档概念', done: progress > 20 },
    { label: '提取知识实体', done: progress > 45 },
    { label: '建立概念关联', done: progress > 70 },
    { label: '优化图谱布局', done: progress > 90 },
  ]

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-xl bg-background/80 backdrop-blur-sm">
      <div className="w-80 space-y-5">
        <div className="text-center">
          <Network className="mx-auto mb-3 h-8 w-8 animate-pulse text-muted-foreground" strokeWidth={1.5} />
          <p className="text-sm font-medium text-foreground">AI 正在构建知识图谱</p>
          <p className="mt-1 text-xs text-muted-foreground">正在分析你的文档，提取概念与关系…</p>
        </div>

        <div className="space-y-2">
          {steps.map((step, idx) => (
            <div key={idx} className="flex items-center gap-3">
              <div
                className={cn(
                  'h-4 w-4 shrink-0 rounded-full border-2 transition-all',
                  step.done
                    ? 'border-chart-1 bg-chart-1'
                    : progress > idx * 25 - 5
                      ? 'animate-pulse border-foreground/40 bg-transparent'
                      : 'border-border bg-transparent'
                )}
              />
              <span className={cn('text-xs transition-colors', step.done ? 'text-foreground' : 'text-muted-foreground')}>
                {step.label}
              </span>
            </div>
          ))}
        </div>

        <TaskProgress label="" progress={progress} subLabel={`已完成 ${Math.round(progress)}%`} />
      </div>
    </div>
  )
}

// ─── Node Detail Panel ───────────────────────────────────────────────────────

export interface NodeDetailView {
  id: string
  label: string
  type: string
  definition?: string | null
  aliases?: string[]
  sourceCount?: number
  edgeCount?: number
  relatedNodes?: Array<{ id: string; label: string; type: string; relation: string }>
}

export function NodeDetailPanel({
  node,
  onClose,
  onAskQuestion,
  onViewCards,
  onSelectRelatedNode,
}: {
  node: NodeDetailView
  onClose: () => void
  onAskQuestion?: (nodeId: string) => void
  onViewCards?: (nodeId: string) => void
  onSelectRelatedNode?: (nodeId: string) => void
}) {
  const cfg = NODE_TYPE_CONFIG[node.type] ?? NODE_TYPE_CONFIG.concept

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-border/30 px-5 py-4">
        <div>
          <Badge variant="secondary" className={cn('rounded-md font-normal', cfg.bgClass, cfg.colorClass)}>
            {cfg.label}
          </Badge>
          <h3 className="mt-2 text-lg font-medium text-foreground">{node.label}</h3>
        </div>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Definition */}
      <div className="px-5 py-4">
        {node.definition ? (
          <p className="text-sm leading-relaxed text-muted-foreground">{node.definition}</p>
        ) : (
          <p className="text-sm italic text-muted-foreground">暂无定义</p>
        )}
        {node.aliases && node.aliases.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {node.aliases.map((alias) => (
              <Badge key={alias} variant="outline" className="rounded-md text-xs">
                {alias}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 px-5 pb-4">
        <div className="rounded-lg border border-border/40 bg-background/50 p-3 text-center">
          <p className="text-lg font-semibold text-foreground">{node.sourceCount ?? 0}</p>
          <p className="text-xs text-muted-foreground">来源片段</p>
        </div>
        <div className="rounded-lg border border-border/40 bg-background/50 p-3 text-center">
          <p className="text-lg font-semibold text-foreground">{node.edgeCount ?? 0}</p>
          <p className="text-xs text-muted-foreground">关联关系</p>
        </div>
      </div>

      {/* Related nodes */}
      {node.relatedNodes && node.relatedNodes.length > 0 ? (
        <div className="flex-1 overflow-y-auto px-5 pb-4">
          <h4 className="mb-3 text-sm font-medium text-foreground">关联节点</h4>
          <div className="space-y-2">
            {node.relatedNodes.map((related) => {
              const relCfg = NODE_TYPE_CONFIG[related.type] ?? NODE_TYPE_CONFIG.concept
              return (
                <button
                  key={related.id}
                  type="button"
                  onClick={() => onSelectRelatedNode?.(related.id)}
                  className="flex w-full items-center gap-3 rounded-lg border border-border/40 bg-background/50 p-3 text-left transition-colors hover:bg-muted/30"
                >
                  <div className={cn('h-2.5 w-2.5 shrink-0 rounded-full', relCfg.bgClass)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{related.label}</p>
                    <p className="text-xs text-muted-foreground">{related.relation}</p>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      {/* Actions */}
      <div className="mt-auto space-y-2 border-t border-border/30 px-5 py-4">
        {onAskQuestion ? (
          <Button variant="outline" className="w-full gap-2 rounded-lg" onClick={() => onAskQuestion(node.id)}>
            <MessageSquare className="h-4 w-4" />
            基于此提问
          </Button>
        ) : null}
        {onViewCards ? (
          <Button variant="outline" className="w-full gap-2 rounded-lg" onClick={() => onViewCards(node.id)}>
            <ExternalLink className="h-4 w-4" />
            在卡片工坊中查看
          </Button>
        ) : null}
      </div>

      {/* Meta */}
      <div className="px-5 pb-4 text-[11px] text-muted-foreground/60">
        <p>节点 ID: {node.id.toUpperCase()}</p>
      </div>
    </div>
  )
}

// ─── Page Header ─────────────────────────────────────────────────────────────

export function PageHeader({
  searchQuery,
  onSearchQueryChange,
  onBuildClick,
  onFullscreen,
}: {
  searchQuery: string
  onSearchQueryChange: (value: string) => void
  onBuildClick: () => void
  onFullscreen?: () => void
}) {
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-border/40 bg-background px-6 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">KNOWLEDGE GRAPH</p>
        </div>
        <h1 className="text-xl font-medium leading-tight text-foreground" data-testid="app-shell-page-title">
          知识图谱
        </h1>
      </div>

      {/* Search */}
      <div className="relative w-56">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          placeholder="搜索节点或概念…"
          className="h-8 rounded-lg border-border/50 bg-card pl-9 text-sm"
        />
      </div>

      {/* Build button */}
      <Button variant="outline" size="sm" className="h-8 gap-2 rounded-lg border-border/50" onClick={onBuildClick}>
        <Wand2 className="h-4 w-4" />
        构建图谱
      </Button>

      {onFullscreen ? (
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onFullscreen}>
          <Maximize2 className="h-4 w-4" />
        </Button>
      ) : null}
    </div>
  )
}

// ─── Main Layout ─────────────────────────────────────────────────────────────

export function KnowledgeGraphPageLayout({
  statsBar,
  buildPanel,
  viewTabs,
  searchBar,
  stageHint,
  graphStage,
  detailRail,
}: {
  statsBar?: ReactNode
  buildPanel: ReactNode
  viewTabs?: Array<{ id: string; label: string; active: boolean; onClick: () => void }>
  searchBar?: ReactNode
  stageHint?: ReactNode
  graphStage: ReactNode
  detailRail: ReactNode
}) {
  return (
    <div
      className="mx-auto flex h-full w-full max-w-[1520px] flex-col gap-5"
      data-testid="knowledge-graph-page"
    >
      <div className="max-w-3xl">
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          KNOWLEDGE GRAPH
        </p>
        <h1 className="mt-1 text-2xl font-medium text-foreground" data-testid="app-shell-page-title">
          知识图谱
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          把构建入口、社区轨道、搜索探索、图谱舞台和节点详情收束到同一套工作台中，
          继续承接真实的构建、编辑、来源追踪与社区控制能力。
        </p>
      </div>

      {statsBar}

      <div className="grid min-h-0 flex-1 gap-5 xl:grid-cols-[300px_minmax(0,1fr)_360px]">
        <aside className="space-y-5">{buildPanel}</aside>

        <section className="flex min-h-0 flex-col gap-4">
          <div className="rounded-[28px] border border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(248,245,238,0.92))] px-5 py-4 shadow-[0_24px_70px_-40px_rgba(120,101,76,0.35)]">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              {viewTabs && viewTabs.length > 0 ? (
                <div className="inline-flex rounded-full border border-border/60 bg-background/70 p-1">
                  {viewTabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={tab.onClick}
                      className={cn(
                        'rounded-full px-4 py-2 text-sm transition-colors',
                        tab.active
                          ? 'bg-foreground text-background shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="flex flex-1 flex-col gap-3 xl:flex-row xl:items-center xl:justify-end">
                {searchBar}
                {stageHint ? (
                  <div className="rounded-full border border-border/50 bg-background/65 px-3 py-1.5 text-xs text-muted-foreground">
                    {stageHint}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1">{graphStage}</div>
        </section>

        <aside className="space-y-5">{detailRail}</aside>
      </div>
    </div>
  )
}
