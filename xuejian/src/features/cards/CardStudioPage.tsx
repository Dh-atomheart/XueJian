import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Input, Panel } from '@/components/ui'
import { cn } from '@/lib/utils'
import {
  cardsQueryKeys,
  documentsQueryKeys,
  orchestrationQueryKeys,
  useCardCandidatesQuery,
  useDocumentAnchorsQuery,
  useDocumentChunksQuery,
  useDocumentsQuery,
  useRecentWorkflowRunsQuery,
  useWorkflowCheckpointQuery,
  useWorkflowEventsQuery,
} from '@/queries'
import { cardsGateway } from '@/services/gateway/cards'
import { useAppUiStore } from '@/store'
import type { CardCandidate, WorkflowEvent, WorkflowRun } from '@/types'

const LIVE_STATUSES = new Set<WorkflowRun['status']>(['queued', 'running'])

export function CardStudioPage() {
  const queryClient = useQueryClient()
  const setActiveNavItem = useAppUiStore((state) => state.setActiveNavItem)
  const { data: documents = [] } = useDocumentsQuery()
  const readyDocuments = useMemo(
    () => documents.filter((document) => document.status === 'ready'),
    [documents]
  )
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [candidateLimitInput, setCandidateLimitInput] = useState('24')

  useEffect(() => {
    if (readyDocuments.length === 0) {
      setSelectedDocumentId(null)
      return
    }

    if (
      !selectedDocumentId ||
      !readyDocuments.some((document) => document.id === selectedDocumentId)
    ) {
      setSelectedDocumentId(readyDocuments[0].id)
    }
  }, [readyDocuments, selectedDocumentId])

  const { data: workflowRuns = [] } = useRecentWorkflowRunsQuery(40, 2_500)
  const runsForDocument = useMemo(() => {
    const cardRuns = workflowRuns.filter((run) => run.workflowType === 'card_generation')
    return selectedDocumentId
      ? cardRuns.filter((run) => extractDocumentIdFromRun(run) === selectedDocumentId)
      : []
  }, [workflowRuns, selectedDocumentId])

  useEffect(() => {
    if (!selectedDocumentId) {
      setSelectedRunId(null)
      return
    }

    if (runsForDocument.length === 0) {
      setSelectedRunId(null)
      return
    }

    if (!selectedRunId || !runsForDocument.some((run) => run.id === selectedRunId)) {
      setSelectedRunId(runsForDocument[0].id)
    }
  }, [runsForDocument, selectedDocumentId, selectedRunId])

  const selectedDocument =
    readyDocuments.find((document) => document.id === selectedDocumentId) ?? null
  const activeRun = runsForDocument.find((run) => run.id === selectedRunId) ?? null
  const pollInterval = activeRun && LIVE_STATUSES.has(activeRun.status) ? 2_000 : false

  const { data: anchors = [] } = useDocumentAnchorsQuery(selectedDocumentId)
  const { data: chunks = [] } = useDocumentChunksQuery(selectedDocumentId)
  const { data: candidates = [] } = useCardCandidatesQuery(
    { workflowRunId: activeRun?.id ?? null, limit: 120 },
    { refetchInterval: pollInterval }
  )
  const { data: checkpoint } = useWorkflowCheckpointQuery(
    activeRun?.id ?? null,
    activeRun?.checkpointRef ?? null,
    { refetchInterval: pollInterval }
  )
  const { data: events = [] } = useWorkflowEventsQuery(activeRun?.id ?? null, 24, {
    refetchInterval: pollInterval,
  })
  const activeRunSummary = (checkpoint?.payload ?? activeRun?.approvalPayload ?? null) as Record<
    string,
    unknown
  > | null
  const generationMode = getCardGenerationMode(activeRunSummary, events)
  const fallbackEvent = events.find((event) => event.eventType === 'fallback') ?? null
  const fallbackReason = getFallbackReason(activeRunSummary)

  const pendingCount = candidates.filter((candidate) => candidate.status === 'pending').length
  const acceptedCount = candidates.filter((candidate) => candidate.status === 'accepted').length
  const rejectedCount = candidates.filter((candidate) => candidate.status === 'rejected').length

  async function invalidateM3Queries() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: cardsQueryKeys.all }),
      queryClient.invalidateQueries({ queryKey: orchestrationQueryKeys.all }),
      queryClient.invalidateQueries({ queryKey: documentsQueryKeys.all }),
    ])
  }

  const startMutation = useMutation({
    mutationFn: ({ documentId, maxCandidates }: { documentId: string; maxCandidates?: number }) =>
      cardsGateway.startGeneration(documentId, maxCandidates),
    onSuccess: async (run) => {
      setSelectedRunId(run.id)
      await invalidateM3Queries()
    },
  })

  const resumeMutation = useMutation({
    mutationFn: (runId: string) => cardsGateway.resumeGeneration(runId),
    onSuccess: async (run) => {
      setSelectedRunId(run.id)
      await invalidateM3Queries()
    },
  })

  const finalizeMutation = useMutation({
    mutationFn: (runId: string) => cardsGateway.finalizeGeneration(runId),
    onSuccess: async () => {
      await invalidateM3Queries()
    },
  })

  const updateCandidateMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string
      data: Partial<Pick<CardCandidate, 'front' | 'back' | 'tags' | 'status'>>
    }) => cardsGateway.updateCandidate(id, data),
    onSuccess: async () => {
      await invalidateM3Queries()
    },
  })

  const bulkStatusMutation = useMutation({
    mutationFn: ({
      workflowRunId,
      ids,
      status,
    }: {
      workflowRunId: string
      ids: string[]
      status: CardCandidate['status']
    }) => cardsGateway.bulkUpdateCandidateStatuses(workflowRunId, ids, status),
    onSuccess: async () => {
      await invalidateM3Queries()
    },
  })

  const isBusy =
    startMutation.isPending ||
    resumeMutation.isPending ||
    finalizeMutation.isPending ||
    updateCandidateMutation.isPending ||
    bulkStatusMutation.isPending

  if (readyDocuments.length === 0) {
    return (
      <Panel variant="panel" className="rounded-[32px] p-8">
        <div className="mx-auto flex min-h-[70vh] max-w-3xl flex-col items-center justify-center gap-6 text-center">
          <div className="inline-flex items-center rounded-full border border-ink/10 bg-white/70 px-3 py-1 text-[11px] uppercase tracking-[0.28em] text-ink-soft">
            卡片工坊
          </div>
          <h1 className="font-display text-4xl leading-tight text-ink">
            先导入并解析文档，才能开始卡片生产。
          </h1>
          <p className="max-w-2xl text-sm leading-7 text-ink-muted">
            这里会把稳定的分块和锚点转成可确认的卡片候选。请先在文档库导入文档，再回来启动和确认卡片流程。
          </p>
          <Button variant="sketch" onClick={() => setActiveNavItem('library')}>
            前往文档库
          </Button>
        </div>
      </Panel>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <Panel variant="panel" className="overflow-hidden rounded-[32px] p-0">
        <div className="grid gap-6 bg-[radial-gradient(circle_at_top_left,rgba(248,225,108,0.18),transparent_35%),linear-gradient(135deg,rgba(255,255,255,0.86),rgba(251,251,249,0.94))] px-6 py-6 lg:grid-cols-[minmax(0,1.3fr)_360px]">
          <div className="space-y-4">
            <div className="inline-flex items-center rounded-full border border-ink/10 bg-white/70 px-3 py-1 text-[11px] uppercase tracking-[0.28em] text-ink-soft">
              可恢复的预设流程
            </div>
            <div className="space-y-3">
              <h1 className="font-display text-4xl leading-tight text-ink">卡片工坊</h1>
              <p className="max-w-2xl text-sm leading-7 text-ink-muted">
                这里会把文档分块生成去重后的卡片候选，在人工确认后再写入正式卡片，避免错误内容直接进入学习流。
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <MetricCard label="已就绪文档" value={`${readyDocuments.length}`} tone="paper" />
              <MetricCard label="锚点数" value={`${anchors.length}`} tone="amber" />
              <MetricCard label="分块数" value={`${chunks.length}`} tone="ink" />
            </div>
          </div>

          <div className="rounded-[28px] border border-ink/10 bg-white/80 p-5 shadow-card">
            <p className="text-xs uppercase tracking-[0.24em] text-ink-soft">启动区</p>
            <div className="mt-4 space-y-3">
              <div>
                <p className="font-ui text-lg text-ink">{selectedDocument?.title}</p>
                <p className="mt-1 text-sm text-ink-soft">
                  {selectedDocument?.pageCount ?? '--'} 页 • {chunks.length} 个分块 •{' '}
                  {anchors.length} 个锚点
                </p>
              </div>
              <Input
                value={candidateLimitInput}
                onChange={(event) => setCandidateLimitInput(event.target.value)}
                inputMode="numeric"
                placeholder="候选卡片上限"
              />
              <Button
                variant="sketch"
                className="w-full justify-center"
                disabled={!selectedDocument || startMutation.isPending}
                onClick={() => {
                  if (!selectedDocument) return
                  startMutation.mutate({
                    documentId: selectedDocument.id,
                    maxCandidates: Number.parseInt(candidateLimitInput, 10) || undefined,
                  })
                }}
              >
                {startMutation.isPending ? '正在启动...' : '生成候选卡片'}
              </Button>
              <Button
                variant="outline"
                className="w-full justify-center"
                disabled={
                  !activeRun || !LIVE_STATUSES.has(activeRun.status) || resumeMutation.isPending
                }
                onClick={() => activeRun && resumeMutation.mutate(activeRun.id)}
              >
                {resumeMutation.isPending ? '正在恢复...' : '从检查点恢复'}
              </Button>
            </div>
          </div>
        </div>
      </Panel>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {readyDocuments.map((document) => (
          <button
            key={document.id}
            onClick={() => setSelectedDocumentId(document.id)}
            className={cn(
              'rounded-[24px] border px-4 py-4 text-left transition-colors',
              selectedDocumentId === document.id
                ? 'border-ink/30 bg-white shadow-card'
                : 'border-line-soft bg-paper-muted/60 hover:border-ink/20 hover:bg-white/80'
            )}
          >
            <p className="truncate font-ui text-sm text-ink">{document.title}</p>
            <p className="mt-2 text-xs uppercase tracking-[0.22em] text-ink-soft">
              {document.pageCount ?? '--'} pages
            </p>
          </button>
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_360px]">
        <Panel variant="paperCard" className="rounded-[30px]">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.26em] text-ink-soft">候选确认队列</p>
              <h2 className="mt-2 font-ui text-xl text-ink">
                {activeRun ? `批次 ${activeRun.id.slice(0, 8)}` : '尚未选择工作流批次'}
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge label={`待确认 ${pendingCount}`} />
              <Badge label={`已接受 ${acceptedCount}`} tone="accepted" />
              <Badge label={`已拒绝 ${rejectedCount}`} tone="rejected" />
            </div>
          </div>

          {activeRun ? (
            <div
              className={cn(
                'mb-4 rounded-[24px] border px-4 py-4',
                generationMode === 'rule_based_fallback'
                  ? 'border-amber-200 bg-amber-50/80'
                  : 'border-emerald-200 bg-emerald-50/70'
              )}
            >
              <p className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                {generationMode === 'rule_based_fallback' ? '降级预览' : '生成模式'}
              </p>
              <h3 className="mt-2 font-ui text-base text-ink">
                {generationMode === 'rule_based_fallback'
                  ? '当前批次来自本地降级候选'
                  : '当前批次来自模型生成流程'}
              </h3>
              <p className="mt-2 text-sm leading-6 text-ink-muted">
                {generationMode === 'rule_based_fallback'
                  ? 'Python 编排不可用时，系统只保留可审阅候选，不会自动入库。请逐条确认内容后，再决定是否保存正式卡片。'
                  : '这批候选已经过生成流程处理，但仍建议在入库前做一次人工确认。'}
              </p>
              {fallbackEvent?.message ? (
                <p className="mt-2 text-xs leading-5 text-ink-soft">{fallbackEvent.message}</p>
              ) : fallbackReason ? (
                <p className="mt-2 text-xs leading-5 text-ink-soft">降级原因：{fallbackReason}</p>
              ) : null}
            </div>
          ) : null}

          <div className="mb-4 flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={!activeRun || pendingCount === 0 || isBusy}
              onClick={() =>
                activeRun &&
                bulkStatusMutation.mutate({
                  workflowRunId: activeRun.id,
                  ids: candidates
                    .filter((candidate) => candidate.status === 'pending')
                    .map((candidate) => candidate.id),
                  status: 'accepted',
                })
              }
            >
              接受全部待确认项
            </Button>
            <Button
              variant="outline"
              disabled={!activeRun || pendingCount === 0 || isBusy}
              onClick={() =>
                activeRun &&
                bulkStatusMutation.mutate({
                  workflowRunId: activeRun.id,
                  ids: candidates
                    .filter((candidate) => candidate.status === 'pending')
                    .map((candidate) => candidate.id),
                  status: 'rejected',
                })
              }
            >
              拒绝全部待确认项
            </Button>
            <Button
              variant="sketch"
              disabled={!activeRun || candidates.length === 0 || isBusy}
              onClick={() => activeRun && finalizeMutation.mutate(activeRun.id)}
            >
              {finalizeMutation.isPending
                ? '正在保存正式卡片...'
                : generationMode === 'rule_based_fallback'
                  ? '确认这些本地候选并入库'
                  : '确认并入库'}
            </Button>
          </div>

          <div className="space-y-4">
            {activeRun ? (
              candidates.length > 0 ? (
                candidates.map((candidate) => (
                  <CandidateCard
                    key={candidate.id}
                    candidate={candidate}
                    busy={isBusy}
                    onSave={(data) => updateCandidateMutation.mutate({ id: candidate.id, data })}
                    onSetStatus={(status) =>
                      updateCandidateMutation.mutate({ id: candidate.id, data: { status } })
                    }
                  />
                ))
              ) : (
                <EmptyState
                  title="当前还没有候选卡片"
                  description="该批次暂时没有产出新的候选，或者全部被去重过滤了。"
                />
              )
            ) : (
              <EmptyState
                title="先选择一个工作流批次"
                description="先选中上方文档，再启动卡片生成，才能看到这一轮候选结果。"
              />
            )}
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel variant="paperCard" className="rounded-[28px]">
            <p className="text-xs uppercase tracking-[0.24em] text-ink-soft">批次列表</p>
            <div className="mt-4 space-y-3">
              {runsForDocument.length === 0 ? (
                <EmptyState
                  title="这份文档还没有生成批次"
                  description="启动一次卡片生成流程后，这里会出现第一轮候选批次。"
                  compact
                />
              ) : (
                runsForDocument.map((run) => (
                  <button
                    key={run.id}
                    onClick={() => setSelectedRunId(run.id)}
                    className={cn(
                      'w-full rounded-[20px] border px-4 py-3 text-left transition-colors',
                      selectedRunId === run.id
                        ? 'border-ink/30 bg-paper-base shadow-card'
                        : 'border-line-soft bg-paper-muted/60 hover:bg-white'
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-ui text-sm text-ink">{run.id.slice(0, 8)}</span>
                      <Badge label={run.status} tone={run.status} />
                    </div>
                    <p className="mt-2 text-xs text-ink-soft">{run.createdAt.toLocaleString()}</p>
                  </button>
                ))
              )}
            </div>
          </Panel>

          <Panel variant="paperCard" className="rounded-[28px]">
            <p className="text-xs uppercase tracking-[0.24em] text-ink-soft">检查点</p>
            <CheckpointSummary checkpoint={activeRunSummary} />
          </Panel>

          <Panel variant="paperCard" className="rounded-[28px]">
            <p className="text-xs uppercase tracking-[0.24em] text-ink-soft">事件流</p>
            <EventFeed events={events} />
          </Panel>
        </div>
      </div>
    </div>
  )
}

function CandidateCard({
  candidate,
  busy,
  onSave,
  onSetStatus,
}: {
  candidate: CardCandidate
  busy: boolean
  onSave: (data: Partial<Pick<CardCandidate, 'front' | 'back' | 'tags'>>) => void
  onSetStatus: (status: CardCandidate['status']) => void
}) {
  const [front, setFront] = useState(candidate.front)
  const [back, setBack] = useState(candidate.back)
  const [tagsInput, setTagsInput] = useState(candidate.tags.join(', '))

  useEffect(() => {
    setFront(candidate.front)
    setBack(candidate.back)
    setTagsInput(candidate.tags.join(', '))
  }, [candidate])

  const dirty =
    front !== candidate.front || back !== candidate.back || tagsInput !== candidate.tags.join(', ')

  return (
    <div className="rounded-[26px] border border-line-soft bg-paper-muted/50 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.22em] text-ink-soft">
            {candidate.sourcePage ? `第 ${candidate.sourcePage} 页` : '整篇文档'} • 置信度{' '}
            {candidate.confidence.toFixed(2)}
          </p>
          <p className="text-sm text-ink-soft">
            {candidate.sourceQuote ?? '当前没有可显示的来源摘录。'}
          </p>
        </div>
        <Badge label={candidate.status} tone={candidate.status} />
      </div>

      <div className="space-y-3">
        <textarea
          value={front}
          onChange={(event) => setFront(event.target.value)}
          aria-label="卡片正面"
          placeholder="请输入卡片正面提示语"
          className="min-h-[78px] w-full rounded-[18px] border border-line-soft bg-white px-3 py-3 text-sm text-ink shadow-paper outline-none"
        />
        <textarea
          value={back}
          onChange={(event) => setBack(event.target.value)}
          aria-label="卡片背面"
          placeholder="请输入卡片背面答案"
          className="min-h-[110px] w-full rounded-[18px] border border-line-soft bg-white px-3 py-3 text-sm text-ink shadow-paper outline-none"
        />
        <Input
          value={tagsInput}
          onChange={(event) => setTagsInput(event.target.value)}
          placeholder="标签，用逗号分隔"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy} onClick={() => onSetStatus('pending')}>
          设为待确认
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => onSetStatus('accepted')}>
          接受
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => onSetStatus('rejected')}>
          拒绝
        </Button>
        <Button
          variant="sketch"
          disabled={!dirty || busy}
          onClick={() =>
            onSave({
              front,
              back,
              tags: tagsInput
                .split(',')
                .map((value) => value.trim())
                .filter(Boolean),
            })
          }
        >
          保存修改
        </Button>
      </div>
    </div>
  )
}

function EventFeed({ events }: { events: WorkflowEvent[] }) {
  if (events.length === 0) {
    return (
      <EmptyState title="当前还没有事件" description="工作流启动后，这里会显示处理记录。" compact />
    )
  }

  return (
    <div className="mt-4 space-y-3">
      {events.map((event) => {
        const view = describeWorkflowEvent(event)
        const metrics = extractEventMetrics(event.payload)

        return (
          <div
            key={`${event.runId}-${event.createdAt.toISOString()}-${event.eventType}`}
            className={cn('rounded-[18px] border px-4 py-3', view.containerClass)}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-ui text-sm text-ink">{view.label}</span>
              <span className="text-xs text-ink-soft">{event.createdAt.toLocaleTimeString()}</span>
            </div>
            {event.message ? <p className="mt-2 text-sm text-ink-soft">{event.message}</p> : null}
            {metrics.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {metrics.map((metric) => (
                  <span
                    key={metric.label}
                    className="rounded-full border border-ink/10 bg-white/70 px-2.5 py-1 text-[11px] text-ink-soft"
                  >
                    {metric.label} {metric.value}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function CheckpointSummary({ checkpoint }: { checkpoint: Record<string, unknown> | null }) {
  if (!checkpoint) {
    return (
      <EmptyState
        title="当前还没有检查点"
        description="工作流开始后，这里会显示最近一次恢复状态。"
        compact
      />
    )
  }

  const phase = typeof checkpoint['phase'] === 'string' ? checkpoint['phase'] : 'unknown'
  const generatedCount =
    typeof checkpoint['generatedCount'] === 'number' ? checkpoint['generatedCount'] : '--'
  const totalChunks =
    typeof checkpoint['totalChunks'] === 'number' ? checkpoint['totalChunks'] : '--'
  const chunkCursor =
    typeof checkpoint['chunkCursor'] === 'number' ? checkpoint['chunkCursor'] : '--'

  return (
    <div className="mt-4 grid gap-3">
      <MetricCard label="阶段" value={String(phase)} tone="paper" compact />
      <MetricCard label="已生成" value={String(generatedCount ?? '--')} tone="amber" compact />
      <MetricCard label="分块游标" value={`${chunkCursor}/${totalChunks}`} tone="ink" compact />
    </div>
  )
}

function MetricCard({
  label,
  value,
  tone,
  compact = false,
}: {
  label: string
  value: string
  tone: 'paper' | 'amber' | 'ink'
  compact?: boolean
}) {
  const toneClasses =
    tone === 'amber'
      ? 'bg-[#fff6d5] border-[#f3df87]'
      : tone === 'ink'
        ? 'bg-[#f4f1ea] border-[#d8d0c4]'
        : 'bg-white border-line-soft'

  return (
    <div className={cn('rounded-[22px] border px-4 py-4', toneClasses, compact && 'px-3 py-3')}>
      <p className="text-[11px] uppercase tracking-[0.24em] text-ink-soft">{label}</p>
      <p className="mt-2 font-ui text-xl text-ink">{value}</p>
    </div>
  )
}

function Badge({
  label,
  tone = 'default',
}: {
  label: string
  tone?: 'default' | 'pending' | 'accepted' | 'rejected' | WorkflowRun['status']
}) {
  const classes =
    tone === 'accepted' || tone === 'completed'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : tone === 'rejected' || tone === 'failed' || tone === 'cancelled'
        ? 'border-rose-200 bg-rose-50 text-rose-700'
        : tone === 'pending' ||
            tone === 'running' ||
            tone === 'queued' ||
            tone === 'waiting_confirmation'
          ? 'border-amber-200 bg-amber-50 text-amber-800'
          : 'border-line-soft bg-paper-muted text-ink-soft'

  return (
    <span className={cn('rounded-full border px-2.5 py-1 text-xs font-medium capitalize', classes)}>
      {label}
    </span>
  )
}

function EmptyState({
  title,
  description,
  compact = false,
}: {
  title: string
  description: string
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-[24px] border border-dashed border-line-soft bg-paper-muted/30 px-4 py-8 text-center',
        compact && 'py-5'
      )}
    >
      <p className="font-ui text-sm text-ink">{title}</p>
      <p className="mt-2 text-sm text-ink-soft">{description}</p>
    </div>
  )
}

function extractDocumentIdFromRun(run: WorkflowRun) {
  const value = run.approvalPayload?.['documentId']
  return typeof value === 'string' ? value : null
}

function getCardGenerationMode(
  summary: Record<string, unknown> | null,
  events: WorkflowEvent[]
): 'model' | 'rule_based_fallback' | 'unknown' {
  const summaryMode = summary?.['generationMode']
  if (summaryMode === 'model' || summaryMode === 'rule_based_fallback') {
    return summaryMode
  }

  return events.some((event) => event.eventType === 'fallback') ? 'rule_based_fallback' : 'unknown'
}

function getFallbackReason(summary: Record<string, unknown> | null) {
  const value = summary?.['fallbackReason']
  return typeof value === 'string' && value.trim() ? value : null
}

function describeWorkflowEvent(event: WorkflowEvent) {
  switch (event.eventType) {
    case 'fallback':
      return {
        label: '本地降级',
        containerClass: 'border-amber-200 bg-amber-50/80',
      }
    case 'completed':
      return {
        label: '已完成',
        containerClass: 'border-emerald-200 bg-emerald-50/80',
      }
    case 'failed':
      return {
        label: '已失败',
        containerClass: 'border-rose-200 bg-rose-50/80',
      }
    case 'waiting_confirmation':
      return {
        label: '等待确认',
        containerClass: 'border-amber-200 bg-amber-50/70',
      }
    case 'progress':
      return {
        label: '处理中',
        containerClass: 'border-line-soft bg-paper-muted/50',
      }
    case 'started':
      return {
        label: '已启动',
        containerClass: 'border-line-soft bg-paper-muted/50',
      }
    case 'queued':
      return {
        label: '已排队',
        containerClass: 'border-line-soft bg-paper-muted/50',
      }
    default:
      return {
        label: event.eventType,
        containerClass: 'border-line-soft bg-paper-muted/50',
      }
  }
}

function extractEventMetrics(payload: Record<string, unknown> | null) {
  if (!payload) {
    return []
  }

  const metrics = [
    ['已生成', payload['generatedCount']],
    ['待确认', payload['pendingCount']],
    ['去重', payload['duplicateCount']],
  ] as const

  return metrics.flatMap(([label, value]) =>
    typeof value === 'number' ? [{ label, value: String(value) }] : []
  )
}
