import { CheckCircle2, Clock3, Layers, RefreshCcw, Search, Wand2, XCircle } from 'lucide-react'
import { Badge, Button, Card, CardContent, EmptySearchResults, Input, WorkspaceEmptyState } from '@/components/ui'
import { cn } from '@/lib/utils'

export type CardStudioTab = 'library' | 'create'

export interface CardStudioReadyDocument {
  id: string
  title: string
  meta: string
  cardCountLabel: string
}

export interface CardStudioCandidateView {
  id: string
  sourceLabel: string
  sourceQuote: string | null
  front: string
  back: string
  tags: string[]
  confidenceLabel: string
  status: 'pending' | 'accepted' | 'rejected'
}

export interface CardStudioRunView {
  id: string
  title: string
  meta: string
  statusLabel: string
  statusTone: 'neutral' | 'warning' | 'success' | 'danger'
}

export interface CardStudioPageProps {
  tab: CardStudioTab
  hasReadyDocuments: boolean
  readyDocuments: CardStudioReadyDocument[]
  selectedDocumentId: string | null
  searchQuery: string
  candidateLimitInput: string
  candidates: CardStudioCandidateView[]
  activeRunLabel: string
  activeRunStatusLabel: string | null
  activeRunStatusTone?: 'neutral' | 'warning' | 'success' | 'danger'
  pendingCount: number
  acceptedCount: number
  rejectedCount: number
  metrics: Array<{ label: string; value: string | number; hint?: string }>
  runs: CardStudioRunView[]
  checkpoint: Array<{ label: string; value: string | number }>
  events: Array<{ id: string; title: string; time: string; detail?: string | null }>
  isBusy?: boolean
  canGenerate?: boolean
  canResume?: boolean
  canFinalize?: boolean
  onTabChange: (tab: CardStudioTab) => void
  onDocumentSelect: (documentId: string) => void
  onCandidateLimitChange: (value: string) => void
  onSearchQueryChange: (value: string) => void
  onGenerate: () => void
  onResume: () => void
  onFinalize: () => void
  onBulkAccept: () => void
  onBulkReject: () => void
  onOpenLibrary: () => void
  onOpenSettings: () => void
  onRunSelect: (runId: string) => void
  onCandidateUpdate: (
    candidateId: string,
    patch: Partial<Pick<CardStudioCandidateView, 'front' | 'back' | 'tags' | 'status'>>
  ) => void
}

function toneClass(tone: 'neutral' | 'warning' | 'success' | 'danger') {
  if (tone === 'success') return 'bg-chart-1/15 text-chart-1'
  if (tone === 'warning') return 'bg-chart-5/12 text-chart-5'
  if (tone === 'danger') return 'bg-destructive/10 text-destructive'
  return 'bg-muted text-muted-foreground'
}

function candidateToneClass(status: CardStudioCandidateView['status']) {
  if (status === 'accepted') return 'bg-chart-1/15 text-chart-1'
  if (status === 'rejected') return 'bg-destructive/10 text-destructive'
  return 'bg-chart-5/12 text-chart-5'
}

function Header({
  activeRunLabel,
  activeRunStatusLabel,
  activeRunStatusTone = 'neutral',
}: Pick<CardStudioPageProps, 'activeRunLabel' | 'activeRunStatusLabel' | 'activeRunStatusTone'>) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">CARD STUDIO</p>
        <h1 className="mt-1 text-2xl font-medium text-foreground" data-testid="app-shell-page-title">
          卡片工坊
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          采用参考编码的双模式骨架，把生成工作台、候选审核、批次轨迹和状态视图收拢到一套页面语义里。
        </p>
      </div>
      <Card className="border-border/50 bg-card">
        <CardContent className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted/50">
            <Layers className="h-4 w-4 text-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{activeRunLabel}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">当前工作流与候选库状态</p>
          </div>
          {activeRunStatusLabel ? (
            <Badge className={cn('ml-2 rounded-md border-0 font-normal', toneClass(activeRunStatusTone))}>
              {activeRunStatusLabel}
            </Badge>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

function Tabs({ tab, onTabChange }: Pick<CardStudioPageProps, 'tab' | 'onTabChange'>) {
  return (
    <div className="mt-6 flex items-center justify-between gap-4" data-testid="card-studio-toolbar">
      <div className="flex gap-6 border-b border-border/30">
        {[
          { id: 'create' as const, label: '生成卡片' },
          { id: 'library' as const, label: '候选库' },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onTabChange(item.id)}
            className={cn(
              'relative pb-3 text-sm font-medium transition-colors',
              tab === item.id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {item.label}
            {tab === item.id ? <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" /> : null}
          </button>
        ))}
      </div>
    </div>
  )
}

function Metrics({ metrics }: Pick<CardStudioPageProps, 'metrics'>) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {metrics.map((metric) => (
        <Card key={metric.label} className="border-border/50 bg-card">
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{metric.label}</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{metric.value}</p>
            {metric.hint ? <p className="mt-1 text-xs text-muted-foreground">{metric.hint}</p> : null}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function DocumentSelector({
  readyDocuments,
  selectedDocumentId,
  onDocumentSelect,
}: Pick<CardStudioPageProps, 'readyDocuments' | 'selectedDocumentId' | 'onDocumentSelect'>) {
  return (
    <Card className="border-border/50 bg-card">
      <CardContent className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-medium text-foreground">文档选择</h3>
          <span className="text-xs text-muted-foreground">{readyDocuments.length} 份已就绪文档</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {readyDocuments.map((doc) => (
            <button
              key={doc.id}
              type="button"
              onClick={() => onDocumentSelect(doc.id)}
              data-testid={`card-studio-document-${doc.id}`}
              className={cn(
                'rounded-xl border p-4 text-left transition-all',
                selectedDocumentId === doc.id
                  ? 'border-foreground/20 bg-card shadow-sm'
                  : 'border-border/40 bg-card/50 hover:border-border hover:bg-card'
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{doc.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{doc.meta}</p>
                </div>
                <Badge variant="secondary" className="rounded-md font-normal">
                  {doc.cardCountLabel}
                </Badge>
              </div>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function CreatePanel({
  candidateLimitInput,
  canGenerate,
  canResume,
  isBusy,
  onCandidateLimitChange,
  onGenerate,
  onResume,
}: Pick<
  CardStudioPageProps,
  'candidateLimitInput' | 'canGenerate' | 'canResume' | 'isBusy' | 'onCandidateLimitChange' | 'onGenerate' | 'onResume'
>) {
  return (
    <Card className="border-border/50 bg-card">
      <CardContent className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div>
          <p className="text-sm font-medium text-foreground">生成工作台</p>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">
            这里承接真实的卡片生成工作流。先选定一份已完成解析的文档，再设定候选数量，系统会把文档块转换成可审阅的候选卡片。
          </p>
        </div>
        <div className="space-y-3">
          <Input
            value={candidateLimitInput}
            onChange={(event) => onCandidateLimitChange(event.target.value)}
            inputMode="numeric"
            placeholder="候选卡片上限"
          />
          <Button
            className="w-full justify-center rounded-lg"
            disabled={!canGenerate || isBusy}
            onClick={onGenerate}
            data-testid="card-studio-start-generation"
          >
            <Wand2 className="h-4 w-4" />
            生成候选卡片
          </Button>
          <Button
            variant="outline"
            className="w-full justify-center rounded-lg"
            disabled={!canResume || isBusy}
            onClick={onResume}
            data-testid="card-studio-resume-generation"
          >
            <RefreshCcw className="h-4 w-4" />
            从检查点恢复
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function CandidateCard({
  candidate,
  onCandidateUpdate,
  isBusy,
}: {
  candidate: CardStudioCandidateView
  onCandidateUpdate: CardStudioPageProps['onCandidateUpdate']
  isBusy?: boolean
}) {
  return (
    <Card data-testid={`card-studio-candidate-${candidate.id}`} className="border-border/50 bg-card">
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{candidate.sourceLabel}</p>
            <p className="text-sm leading-6 text-muted-foreground">{candidate.sourceQuote ?? '暂无来源摘录。'}</p>
          </div>
          <Badge className={cn('rounded-md border-0 font-normal', candidateToneClass(candidate.status))}>
            {candidate.status}
          </Badge>
        </div>
        <div className="grid gap-3">
          <label className="grid gap-1.5">
            <span className="text-xs text-muted-foreground">正面</span>
            <textarea
              aria-label="卡片正面"
              value={candidate.front}
              onChange={(event) => onCandidateUpdate(candidate.id, { front: event.target.value })}
              className="min-h-[86px] rounded-xl border border-border/50 bg-background/50 px-3 py-3 text-sm outline-none focus:border-ring"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs text-muted-foreground">背面</span>
            <textarea
              aria-label="卡片背面"
              value={candidate.back}
              onChange={(event) => onCandidateUpdate(candidate.id, { back: event.target.value })}
              className="min-h-[110px] rounded-xl border border-border/50 bg-background/50 px-3 py-3 text-sm outline-none focus:border-ring"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs text-muted-foreground">标签</span>
            <Input
              value={candidate.tags.join(', ')}
              onChange={(event) =>
                onCandidateUpdate(candidate.id, {
                  tags: event.target.value
                    .split(',')
                    .map((value) => value.trim())
                    .filter(Boolean),
                })
              }
              placeholder="使用逗号分隔标签"
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" disabled={isBusy} onClick={() => onCandidateUpdate(candidate.id, { status: 'accepted' })}>
            <CheckCircle2 className="h-4 w-4" />
            接受
          </Button>
          <Button variant="outline" disabled={isBusy} onClick={() => onCandidateUpdate(candidate.id, { status: 'rejected' })}>
            <XCircle className="h-4 w-4" />
            拒绝
          </Button>
          <Button variant="ghost" disabled={isBusy} onClick={() => onCandidateUpdate(candidate.id, { status: 'pending' })}>
            <Clock3 className="h-4 w-4" />
            设为待确认
          </Button>
          <div className="ml-auto text-xs text-muted-foreground">{candidate.confidenceLabel}</div>
        </div>
      </CardContent>
    </Card>
  )
}

function LibraryPanel({
  searchQuery,
  candidates,
  pendingCount,
  acceptedCount,
  rejectedCount,
  canResume,
  canFinalize,
  isBusy,
  onSearchQueryChange,
  onResume,
  onBulkAccept,
  onBulkReject,
  onFinalize,
  onCandidateUpdate,
}: Pick<
  CardStudioPageProps,
  | 'searchQuery'
  | 'candidates'
  | 'pendingCount'
  | 'acceptedCount'
  | 'rejectedCount'
  | 'canResume'
  | 'canFinalize'
  | 'isBusy'
  | 'onSearchQueryChange'
  | 'onResume'
  | 'onBulkAccept'
  | 'onBulkReject'
  | 'onFinalize'
  | 'onCandidateUpdate'
>) {
  const filtered = candidates.filter((candidate) => {
    const haystack = `${candidate.front} ${candidate.back} ${candidate.tags.join(' ')}`.toLowerCase()
    return haystack.includes(searchQuery.trim().toLowerCase())
  })

  return (
    <div className="space-y-4">
      <Card className="border-border/50 bg-card">
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(event) => onSearchQueryChange(event.target.value)}
                placeholder="搜索候选卡片内容或标签"
                className="h-10 rounded-lg border-border/50 bg-card pl-9"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="rounded-md font-normal">{pendingCount} 待确认</Badge>
              <Badge variant="secondary" className="rounded-md font-normal">{acceptedCount} 已接受</Badge>
              <Badge variant="secondary" className="rounded-md font-normal">{rejectedCount} 已拒绝</Badge>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={onResume} disabled={!canResume} data-testid="card-studio-resume-generation">
              从检查点恢复
            </Button>
            <Button variant="outline" onClick={onBulkAccept} disabled={pendingCount === 0} data-testid="card-studio-bulk-accept">
              接受全部待确认项
            </Button>
            <Button variant="outline" onClick={onBulkReject} disabled={pendingCount === 0} data-testid="card-studio-bulk-reject">
              拒绝全部待确认项
            </Button>
            <Button onClick={onFinalize} disabled={!canFinalize} data-testid="card-studio-finalize-generation">
              确认并入库
            </Button>
          </div>
        </CardContent>
      </Card>

      {candidates.length === 0 ? (
        <WorkspaceEmptyState title="当前还没有候选卡片" description="启动一次真实生成流程后，这里会出现当前批次的候选卡片。" />
      ) : filtered.length === 0 ? (
        <EmptySearchResults query={searchQuery} />
      ) : (
        <div className="space-y-4" data-testid="card-studio-candidate-list">
          {filtered.map((candidate) => (
            <CandidateCard key={candidate.id} candidate={candidate} onCandidateUpdate={onCandidateUpdate} isBusy={isBusy} />
          ))}
        </div>
      )}
    </div>
  )
}

function SideRail({
  runs,
  checkpoint,
  events,
  onRunSelect,
}: Pick<CardStudioPageProps, 'runs' | 'checkpoint' | 'events' | 'onRunSelect'>) {
  return (
    <div className="space-y-5">
      <Card className="border-border/50 bg-card" data-testid="card-studio-run-list">
        <CardContent className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-medium text-foreground">批次列表</h3>
            <span className="text-xs text-muted-foreground">{runs.length} 个批次</span>
          </div>
          {runs.length === 0 ? (
            <WorkspaceEmptyState className="min-h-[220px]" title="还没有可用批次" description="启动一次真实生成后，这里会出现候选批次与回查入口。" />
          ) : (
            <div className="space-y-2">
              {runs.map((run) => (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => onRunSelect(run.id)}
                  className="flex w-full items-center justify-between rounded-xl border border-border/40 bg-background/50 px-4 py-3 text-left transition-colors hover:bg-muted/30"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{run.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{run.meta}</p>
                  </div>
                  <Badge className={cn('rounded-md border-0 font-normal', toneClass(run.statusTone))}>
                    {run.statusLabel}
                  </Badge>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card" data-testid="card-studio-checkpoint-panel">
        <CardContent className="p-5">
          <h3 className="mb-4 text-sm font-medium text-foreground">检查点</h3>
          {checkpoint.length === 0 ? (
            <WorkspaceEmptyState className="min-h-[180px]" title="暂无检查点" description="工作流运行后，这里会显示最近一次恢复状态。" />
          ) : (
            <div className="grid gap-3">
              {checkpoint.map((item) => (
                <div key={item.label} className="rounded-lg border border-border/40 bg-background/50 p-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{item.label}</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{item.value}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card" data-testid="card-studio-events-panel">
        <CardContent className="p-5">
          <h3 className="mb-4 text-sm font-medium text-foreground">事件流</h3>
          {events.length === 0 ? (
            <WorkspaceEmptyState className="min-h-[180px]" title="还没有事件" description="生成启动后，这里会同步记录处理轨迹。" />
          ) : (
            <div className="space-y-3">
              {events.map((event) => (
                <div key={event.id} className="rounded-lg border border-border/40 bg-background/50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-foreground">{event.title}</span>
                    <span className="text-xs text-muted-foreground">{event.time}</span>
                  </div>
                  {event.detail ? <p className="mt-2 text-xs leading-5 text-muted-foreground">{event.detail}</p> : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export function CardStudioPage(props: CardStudioPageProps) {
  if (!props.hasReadyDocuments) {
    return (
      <div className="mx-auto w-full max-w-6xl" data-testid="card-studio-page">
        <Card className="border-border/50 bg-card">
          <CardContent className="p-6">
            <WorkspaceEmptyState
              data-testid="card-studio-empty-state"
              title="先导入并解析文档，才能开始卡片生产。"
              description="这里会把稳定的分块和锚点转成可确认的卡片候选。请先在文档库导入文档，再回来启动和确认卡片流程。"
              action={
                <Button variant="outline" data-testid="card-studio-open-library" onClick={props.onOpenLibrary}>
                  前往文档库
                </Button>
              }
            />
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6" data-testid="card-studio-page">
      <Header
        activeRunLabel={props.activeRunLabel}
        activeRunStatusLabel={props.activeRunStatusLabel}
        activeRunStatusTone={props.activeRunStatusTone}
      />
      <Tabs tab={props.tab} onTabChange={props.onTabChange} />
      <Metrics metrics={props.metrics} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          {props.tab === 'create' ? (
            <>
              <DocumentSelector
                readyDocuments={props.readyDocuments}
                selectedDocumentId={props.selectedDocumentId}
                onDocumentSelect={props.onDocumentSelect}
              />
              <CreatePanel
                candidateLimitInput={props.candidateLimitInput}
                canGenerate={props.canGenerate}
                canResume={props.canResume}
                isBusy={props.isBusy}
                onCandidateLimitChange={props.onCandidateLimitChange}
                onGenerate={props.onGenerate}
                onResume={props.onResume}
              />
            </>
          ) : (
            <LibraryPanel
              searchQuery={props.searchQuery}
              candidates={props.candidates}
              pendingCount={props.pendingCount}
              acceptedCount={props.acceptedCount}
              rejectedCount={props.rejectedCount}
              canResume={props.canResume}
              canFinalize={props.canFinalize}
              isBusy={props.isBusy}
              onSearchQueryChange={props.onSearchQueryChange}
              onResume={props.onResume}
              onBulkAccept={props.onBulkAccept}
              onBulkReject={props.onBulkReject}
              onFinalize={props.onFinalize}
              onCandidateUpdate={props.onCandidateUpdate}
            />
          )}
        </div>
        <SideRail runs={props.runs} checkpoint={props.checkpoint} events={props.events} onRunSelect={props.onRunSelect} />
      </div>
    </div>
  )
}
