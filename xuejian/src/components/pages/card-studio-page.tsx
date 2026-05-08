import { useEffect, useState } from 'react'
import { Clapperboard, Edit3, FileText, Plus, Search, Sparkles, Trash2 } from 'lucide-react'
import { Badge, Button, Card as UiCard, CardContent, Input, WorkspaceEmptyState } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { Card } from '@/types'

export interface CardStudioReadyDocument {
  id: string
  title: string
  meta: string
  cardCountLabel: string
}

export interface CardStudioCardView {
  id: string
  front: string
  back: string
  tags: string[]
  cardType: Card['cardType']
  sourceLabel: string
  state: Card['state']
}

export interface CardStudioRunView {
  id: string
  title: string
  meta: string
  statusLabel: string
  statusTone: 'neutral' | 'warning' | 'success' | 'danger'
}

export interface CardStudioPageProps {
  hasReadyDocuments: boolean
  readyDocuments: CardStudioReadyDocument[]
  selectedDocumentId: string | null
  searchQuery: string
  cardLimitInput: string
  cards: CardStudioCardView[]
  activeRunLabel: string
  activeRunStatusLabel: string | null
  activeRunStatusTone?: 'neutral' | 'warning' | 'success' | 'danger'
  metrics: Array<{ label: string; value: string | number; hint?: string }>
  runs: CardStudioRunView[]
  events: Array<{ id: string; title: string; time: string; detail?: string | null }>
  isBusy?: boolean
  canGenerate?: boolean
  onDocumentSelect: (documentId: string) => void
  onCardLimitChange: (value: string) => void
  onSearchQueryChange: (value: string) => void
  onGenerate: () => void
  onCreateCard: () => void
  onEditCard: (cardId: string) => void
  onDeleteCard: (cardId: string) => void
  onQuickPreviewCard?: (cardId: string) => void
  onRenderVideoCard?: (cardId: string) => void
  onOpenLibrary: () => void
}

const CARDS_PAGE_SIZE = 6

function toneClass(tone: 'neutral' | 'warning' | 'success' | 'danger') {
  if (tone === 'success') return 'bg-chart-1/15 text-chart-1'
  if (tone === 'warning') return 'bg-chart-5/12 text-chart-5'
  if (tone === 'danger') return 'bg-destructive/10 text-destructive'
  return 'bg-muted text-muted-foreground'
}

function stateLabel(state: Card['state']) {
  switch (state) {
    case 'learning':
      return '学习中'
    case 'review':
      return '复习中'
    case 'relearning':
      return '重学中'
    default:
      return '新卡'
  }
}

function typeLabel(type: Card['cardType']) {
  switch (type) {
    case 'cloze':
      return '填空'
    case 'fact':
      return '知识点'
    case 'choice':
      return '选择题'
    case 'image_occlusion':
      return '图像遮挡'
    default:
      return '问答'
  }
}

export function CardStudioPage(props: CardStudioPageProps) {
  const [currentPage, setCurrentPage] = useState(1)
  const filteredCards = props.cards.filter((card) => {
    const haystack = `${card.front} ${card.back} ${card.tags.join(' ')}`.toLowerCase()
    return haystack.includes(props.searchQuery.trim().toLowerCase())
  })
  const totalPages = Math.max(1, Math.ceil(filteredCards.length / CARDS_PAGE_SIZE))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const pageStartIndex = (safeCurrentPage - 1) * CARDS_PAGE_SIZE
  const pagedCards = filteredCards.slice(pageStartIndex, pageStartIndex + CARDS_PAGE_SIZE)
  const visibleStart = filteredCards.length === 0 ? 0 : pageStartIndex + 1
  const visibleEnd = Math.min(filteredCards.length, pageStartIndex + pagedCards.length)

  useEffect(() => {
    setCurrentPage(1)
  }, [props.searchQuery, props.selectedDocumentId])

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages))
  }, [totalPages])

  if (!props.hasReadyDocuments) {
    return (
      <div className="mx-auto w-full max-w-6xl" data-testid="card-studio-page">
        <UiCard className="border-border/50 bg-card">
          <CardContent className="p-6">
            <WorkspaceEmptyState
              data-testid="card-studio-empty-state"
              title="先导入并解析文档，才能开始生成卡片。"
              description="Agent 会自动从可用文档中生成正式卡片；生成后你只需要维护卡片内容。"
              action={
                <Button variant="outline" data-testid="card-studio-open-library" onClick={props.onOpenLibrary}>
                  前往文档库
                </Button>
              }
            />
          </CardContent>
        </UiCard>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6" data-testid="card-studio-page">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">CARD STUDIO</p>
          <h1 className="mt-1 text-2xl font-medium text-foreground" data-testid="app-shell-page-title">
            卡片工作台
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Agent 负责生成与筛选，用户只维护最终进入学习系统的卡片。
          </p>
        </div>
        <UiCard className="border-border/50 bg-card">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted/50">
              <Sparkles className="h-4 w-4 text-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{props.activeRunLabel}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">最近一次自动生成任务</p>
            </div>
            {props.activeRunStatusLabel ? (
              <Badge className={cn('ml-2 rounded-md border-0 font-normal', toneClass(props.activeRunStatusTone ?? 'neutral'))}>
                {props.activeRunStatusLabel}
              </Badge>
            ) : null}
          </CardContent>
        </UiCard>
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        {props.metrics.map((metric) => (
          <UiCard key={metric.label} className="border-border/50 bg-card">
            <CardContent className="p-5">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{metric.label}</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{metric.value}</p>
              {metric.hint ? <p className="mt-1 text-xs text-muted-foreground">{metric.hint}</p> : null}
            </CardContent>
          </UiCard>
        ))}
      </section>

      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-5">
          <UiCard className="border-border/50 bg-card">
            <CardContent className="p-5">
              <h2 className="text-sm font-medium text-foreground">生成来源</h2>
              <div className="mt-4 space-y-2">
                {props.readyDocuments.map((doc) => (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => props.onDocumentSelect(doc.id)}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors',
                      props.selectedDocumentId === doc.id
                        ? 'border-foreground/20 bg-card shadow-sm'
                        : 'border-border/50 bg-background/50 hover:border-border hover:bg-muted/30'
                    )}
                  >
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-foreground">{doc.title}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {doc.meta} · {doc.cardCountLabel}
                      </span>
                    </span>
                  </button>
                ))}
              </div>

              <label className="mt-5 block">
                <span className="text-xs text-muted-foreground">目标生成数量</span>
                <Input
                  value={props.cardLimitInput}
                  onChange={(event) => props.onCardLimitChange(event.target.value)}
                  inputMode="numeric"
                  className="mt-2 h-9 rounded-lg border-border/50"
                />
              </label>

              <Button
                className="mt-4 w-full gap-2 rounded-lg"
                onClick={props.onGenerate}
                disabled={!props.canGenerate || props.isBusy}
                data-testid="card-studio-start-generation"
              >
                <Sparkles className="h-4 w-4" />
                让 Agent 生成卡片
              </Button>
            </CardContent>
          </UiCard>

          <UiCard className="border-border/50 bg-card">
            <CardContent className="p-5">
              <h2 className="text-sm font-medium text-foreground">任务记录</h2>
              <div className="mt-4 space-y-2" data-testid="card-studio-run-list">
                {props.runs.length === 0 ? (
                  <p className="text-xs leading-5 text-muted-foreground">还没有生成任务。</p>
                ) : (
                  props.runs.slice(0, 5).map((run) => (
                    <div key={run.id} className="rounded-lg border border-border/40 bg-background/50 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-foreground">{run.title}</p>
                        <Badge className={cn('rounded-md border-0 font-normal', toneClass(run.statusTone))}>
                          {run.statusLabel}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{run.meta}</p>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </UiCard>
        </aside>

        <main className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={props.searchQuery}
                onChange={(event) => props.onSearchQueryChange(event.target.value)}
                placeholder="搜索正式卡片..."
                className="h-9 rounded-lg border-border/50 bg-card pl-9 text-sm"
              />
            </div>
            <Button className="h-9 gap-2 rounded-lg" onClick={props.onCreateCard} data-testid="card-studio-create-card">
              <Plus className="h-4 w-4" />
              新建卡片
            </Button>
          </div>

          {props.cards.length === 0 ? (
            <UiCard className="border-border/50 bg-card">
              <CardContent className="p-8">
                <WorkspaceEmptyState
                  title="还没有正式卡片"
                  description="启动生成后，Agent 会把通过质量门槛的结果直接写入这里。"
                />
              </CardContent>
            </UiCard>
          ) : filteredCards.length === 0 ? (
            <UiCard className="border-border/50 bg-card">
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                没有匹配的卡片。
              </CardContent>
            </UiCard>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" data-testid="card-studio-card-list">
              {pagedCards.map((card) => (
                <UiCard key={card.id} data-testid={`card-studio-card-${card.id}`} className="border-border/50 bg-card">
                  <CardContent className="space-y-4 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary" className="rounded-md font-normal">{typeLabel(card.cardType)}</Badge>
                          <Badge variant="secondary" className="rounded-md font-normal">{stateLabel(card.state)}</Badge>
                          <span className="min-w-0 max-w-[14rem] truncate text-xs text-muted-foreground" title={card.sourceLabel}>
                            {card.sourceLabel}
                          </span>
                        </div>
                        <h3 className="mt-3 line-clamp-2 text-sm font-medium leading-6 text-foreground">{card.front}</h3>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        {props.onQuickPreviewCard ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => props.onQuickPreviewCard?.(card.id)}
                          data-testid={`card-studio-quick-preview-${card.id}`}
                          title="快速演示"
                        >
                          <Sparkles className="h-4 w-4" />
                        </Button>
                        ) : null}
                        {props.onRenderVideoCard ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => props.onRenderVideoCard?.(card.id)}
                          data-testid={`card-studio-render-video-${card.id}`}
                          title="生成高质量视频"
                        >
                          <Clapperboard className="h-4 w-4" />
                        </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => props.onEditCard(card.id)}
                          data-testid={`card-studio-edit-card-${card.id}`}
                        >
                          <Edit3 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-destructive"
                          onClick={() => props.onDeleteCard(card.id)}
                          data-testid={`card-studio-delete-card-${card.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <p className="line-clamp-4 text-sm leading-6 text-muted-foreground">{card.back}</p>
                    {card.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {card.tags.map((tag) => (
                          <span key={tag} className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </CardContent>
                </UiCard>
              ))}
              </div>
              <CardStudioPagination
                currentPage={safeCurrentPage}
                totalPages={totalPages}
                visibleStart={visibleStart}
                visibleEnd={visibleEnd}
                totalItems={filteredCards.length}
                onPageChange={setCurrentPage}
              />
            </div>
          )}

          {props.events.length > 0 ? (
            <UiCard className="border-border/50 bg-card" data-testid="card-studio-events-panel">
              <CardContent className="p-5">
                <h2 className="text-sm font-medium text-foreground">最近事件</h2>
                <div className="mt-4 grid gap-2">
                  {props.events.slice(0, 4).map((event) => (
                    <div key={event.id} className="flex items-start justify-between gap-3 rounded-lg border border-border/40 bg-background/50 p-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{event.title}</p>
                        {event.detail ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{event.detail}</p> : null}
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">{event.time}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </UiCard>
          ) : null}
        </main>
      </div>
    </div>
  )
}

function CardStudioPagination({
  currentPage,
  totalPages,
  visibleStart,
  visibleEnd,
  totalItems,
  onPageChange,
}: {
  currentPage: number
  totalPages: number
  visibleStart: number
  visibleEnd: number
  totalItems: number
  onPageChange: (page: number) => void
}) {
  if (totalItems <= CARDS_PAGE_SIZE) return null

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/50 bg-card px-3 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <span>
        显示 {visibleStart}-{visibleEnd} / {totalItems}
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-8 rounded-lg"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1}
        >
          上一页
        </Button>
        <span className="min-w-16 text-center">
          第 {currentPage} / {totalPages} 页
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-8 rounded-lg"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage >= totalPages}
        >
          下一页
        </Button>
      </div>
    </div>
  )
}
