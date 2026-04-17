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

    if (!selectedDocumentId || !readyDocuments.some((document) => document.id === selectedDocumentId)) {
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
            M3 Card Foundry
          </div>
          <h1 className="font-display text-4xl leading-tight text-ink">
            Card generation needs parsed documents first.
          </h1>
          <p className="max-w-2xl text-sm leading-7 text-ink-muted">
            M3 turns stable chunks and anchors into review-ready card candidates. Import a PDF in
            the Library first, then come back here to run the checkpointed workflow.
          </p>
          <Button variant="sketch" onClick={() => setActiveNavItem('library')}>
            Open Library
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
              Checkpointed Preset Workflow
            </div>
            <div className="space-y-3">
              <h1 className="font-display text-4xl leading-tight text-ink">Card Foundry</h1>
              <p className="max-w-2xl text-sm leading-7 text-ink-muted">
                This desk turns document chunks into deduped card candidates, pauses for human
                review, and promotes accepted candidates into durable cards.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <MetricCard label="Ready documents" value={`${readyDocuments.length}`} tone="paper" />
              <MetricCard label="Anchors" value={`${anchors.length}`} tone="amber" />
              <MetricCard label="Chunks" value={`${chunks.length}`} tone="ink" />
            </div>
          </div>

          <div className="rounded-[28px] border border-ink/10 bg-white/80 p-5 shadow-card">
            <p className="text-xs uppercase tracking-[0.24em] text-ink-soft">Launch rail</p>
            <div className="mt-4 space-y-3">
              <div>
                <p className="font-ui text-lg text-ink">{selectedDocument?.title}</p>
                <p className="mt-1 text-sm text-ink-soft">
                  {selectedDocument?.pageCount ?? '--'} pages • {chunks.length} chunks • {anchors.length}{' '}
                  anchors
                </p>
              </div>
              <Input
                value={candidateLimitInput}
                onChange={(event) => setCandidateLimitInput(event.target.value)}
                inputMode="numeric"
                placeholder="Candidate limit"
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
                {startMutation.isPending ? 'Launching...' : 'Generate candidates'}
              </Button>
              <Button
                variant="outline"
                className="w-full justify-center"
                disabled={!activeRun || !LIVE_STATUSES.has(activeRun.status) || resumeMutation.isPending}
                onClick={() => activeRun && resumeMutation.mutate(activeRun.id)}
              >
                {resumeMutation.isPending ? 'Resuming...' : 'Resume from checkpoint'}
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
              <p className="text-xs uppercase tracking-[0.26em] text-ink-soft">Review queue</p>
              <h2 className="mt-2 font-ui text-xl text-ink">
                {activeRun ? `Run ${activeRun.id.slice(0, 8)}` : 'No workflow selected'}
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge label={`Pending ${pendingCount}`} />
              <Badge label={`Accepted ${acceptedCount}`} tone="accepted" />
              <Badge label={`Rejected ${rejectedCount}`} tone="rejected" />
            </div>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={!activeRun || pendingCount === 0 || isBusy}
              onClick={() =>
                activeRun &&
                bulkStatusMutation.mutate({
                  workflowRunId: activeRun.id,
                  ids: candidates.filter((candidate) => candidate.status === 'pending').map((candidate) => candidate.id),
                  status: 'accepted',
                })
              }
            >
              Accept all pending
            </Button>
            <Button
              variant="outline"
              disabled={!activeRun || pendingCount === 0 || isBusy}
              onClick={() =>
                activeRun &&
                bulkStatusMutation.mutate({
                  workflowRunId: activeRun.id,
                  ids: candidates.filter((candidate) => candidate.status === 'pending').map((candidate) => candidate.id),
                  status: 'rejected',
                })
              }
            >
              Reject all pending
            </Button>
            <Button
              variant="sketch"
              disabled={!activeRun || candidates.length === 0 || isBusy}
              onClick={() => activeRun && finalizeMutation.mutate(activeRun.id)}
            >
              {finalizeMutation.isPending ? 'Saving cards...' : 'Confirm accepted cards'}
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
                  title="No candidates yet"
                  description="The selected run has not produced any new candidates yet, or everything was deduplicated."
                />
              )
            ) : (
              <EmptyState
                title="Select a workflow run"
                description="Pick a document above and launch card generation to start a new batch."
              />
            )}
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel variant="paperCard" className="rounded-[28px]">
            <p className="text-xs uppercase tracking-[0.24em] text-ink-soft">Runs</p>
            <div className="mt-4 space-y-3">
              {runsForDocument.length === 0 ? (
                <EmptyState
                  title="No runs for this document"
                  description="Launch the preset workflow to create the first candidate batch."
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
            <p className="text-xs uppercase tracking-[0.24em] text-ink-soft">Checkpoint</p>
            <CheckpointSummary checkpoint={checkpoint?.payload ?? null} />
          </Panel>

          <Panel variant="paperCard" className="rounded-[28px]">
            <p className="text-xs uppercase tracking-[0.24em] text-ink-soft">Event feed</p>
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
            {candidate.sourcePage ? `Page ${candidate.sourcePage}` : 'Document'} • confidence{' '}
            {candidate.confidence.toFixed(2)}
          </p>
          <p className="text-sm text-ink-soft">{candidate.sourceQuote ?? 'No source quote available'}</p>
        </div>
        <Badge label={candidate.status} tone={candidate.status} />
      </div>

      <div className="space-y-3">
        <textarea
          value={front}
          onChange={(event) => setFront(event.target.value)}
          className="min-h-[78px] w-full rounded-[18px] border border-line-soft bg-white px-3 py-3 text-sm text-ink shadow-paper outline-none"
        />
        <textarea
          value={back}
          onChange={(event) => setBack(event.target.value)}
          className="min-h-[110px] w-full rounded-[18px] border border-line-soft bg-white px-3 py-3 text-sm text-ink shadow-paper outline-none"
        />
        <Input value={tagsInput} onChange={(event) => setTagsInput(event.target.value)} placeholder="tags, comma, separated" />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy} onClick={() => onSetStatus('pending')}>
          Pending
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => onSetStatus('accepted')}>
          Accept
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => onSetStatus('rejected')}>
          Reject
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
          Save edits
        </Button>
      </div>
    </div>
  )
}

function EventFeed({ events }: { events: WorkflowEvent[] }) {
  if (events.length === 0) {
    return <EmptyState title="No events yet" description="Run activity will appear here." compact />
  }

  return (
    <div className="mt-4 space-y-3">
      {events.map((event) => (
        <div key={`${event.runId}-${event.createdAt.toISOString()}-${event.eventType}`} className="rounded-[18px] border border-line-soft bg-paper-muted/50 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="font-ui text-sm text-ink">{event.eventType}</span>
            <span className="text-xs text-ink-soft">{event.createdAt.toLocaleTimeString()}</span>
          </div>
          {event.message ? <p className="mt-2 text-sm text-ink-soft">{event.message}</p> : null}
        </div>
      ))}
    </div>
  )
}

function CheckpointSummary({ checkpoint }: { checkpoint: Record<string, unknown> | null }) {
  if (!checkpoint) {
    return <EmptyState title="No checkpoint" description="Checkpoint payload appears after a run starts." compact />
  }

  const phase = typeof checkpoint['phase'] === 'string' ? checkpoint['phase'] : 'unknown'
  const generatedCount = typeof checkpoint['generatedCount'] === 'number' ? checkpoint['generatedCount'] : '--'
  const totalChunks = typeof checkpoint['totalChunks'] === 'number' ? checkpoint['totalChunks'] : '--'
  const chunkCursor = typeof checkpoint['chunkCursor'] === 'number' ? checkpoint['chunkCursor'] : '--'

  return (
    <div className="mt-4 grid gap-3">
      <MetricCard label="Phase" value={String(phase)} tone="paper" compact />
      <MetricCard label="Generated" value={String(generatedCount ?? '--')} tone="amber" compact />
      <MetricCard label="Chunk cursor" value={`${chunkCursor}/${totalChunks}`} tone="ink" compact />
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
        : tone === 'pending' || tone === 'running' || tone === 'queued' || tone === 'waiting_confirmation'
          ? 'border-amber-200 bg-amber-50 text-amber-800'
          : 'border-line-soft bg-paper-muted text-ink-soft'

  return <span className={cn('rounded-full border px-2.5 py-1 text-xs font-medium capitalize', classes)}>{label}</span>
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
    <div className={cn('rounded-[24px] border border-dashed border-line-soft bg-paper-muted/30 px-4 py-8 text-center', compact && 'py-5')}>
      <p className="font-ui text-sm text-ink">{title}</p>
      <p className="mt-2 text-sm text-ink-soft">{description}</p>
    </div>
  )
}

function extractDocumentIdFromRun(run: WorkflowRun) {
  const value = run.approvalPayload?.['documentId']
  return typeof value === 'string' ? value : null
}
