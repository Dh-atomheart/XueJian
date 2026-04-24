import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CardStudioPage as CardStudioPageView, type CardStudioTab } from '@/components/pages/card-studio-page'
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
import type { CardCandidate, WorkflowRun } from '@/types'

const LIVE_STATUSES = new Set<WorkflowRun['status']>(['queued', 'running'])

export function CardStudioPage() {
  const queryClient = useQueryClient()
  const setActiveNavItem = useAppUiStore((state) => state.setActiveNavItem)
  const { data: documents = [] } = useDocumentsQuery()
  const readyDocuments = useMemo(
    () => documents.filter((document) => document.status === 'ready'),
    [documents]
  )

  const [tab, setTab] = useState<CardStudioTab>('create')
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [candidateLimitInput, setCandidateLimitInput] = useState('24')
  const [searchQuery, setSearchQuery] = useState('')
  const [candidateDrafts, setCandidateDrafts] = useState<
    Record<string, { front: string; back: string; tags: string[] }>
  >({})

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
    if (!selectedDocumentId || runsForDocument.length === 0) {
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

  useEffect(() => {
    if (tab === 'create' && (runsForDocument.length > 0 || candidates.length > 0)) {
      setTab('library')
    }
  }, [tab, candidates.length, runsForDocument.length])

  const pendingCount = candidates.filter((candidate) => candidate.status === 'pending').length
  const acceptedCount = candidates.filter((candidate) => candidate.status === 'accepted').length
  const rejectedCount = candidates.filter((candidate) => candidate.status === 'rejected').length

  async function invalidateCardQueries() {
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
      setTab('library')
      await invalidateCardQueries()
    },
  })

  const resumeMutation = useMutation({
    mutationFn: (runId: string) => cardsGateway.resumeGeneration(runId),
    onSuccess: async (run) => {
      setSelectedRunId(run.id)
      await invalidateCardQueries()
    },
  })

  const finalizeMutation = useMutation({
    mutationFn: (runId: string) => cardsGateway.finalizeGeneration(runId),
    onSuccess: async () => {
      await invalidateCardQueries()
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
      await invalidateCardQueries()
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
      await invalidateCardQueries()
    },
  })

  const isBusy =
    startMutation.isPending ||
    resumeMutation.isPending ||
    finalizeMutation.isPending ||
    updateCandidateMutation.isPending ||
    bulkStatusMutation.isPending

  const candidateViews = candidates.map((candidate) => {
    const draft = candidateDrafts[candidate.id]
    return {
      id: candidate.id,
      sourceLabel: candidate.sourcePage ? `P.${candidate.sourcePage}` : 'Document',
      sourceQuote: candidate.sourceQuote,
      front: draft?.front ?? candidate.front,
      back: draft?.back ?? candidate.back,
      tags: draft?.tags ?? candidate.tags,
      confidenceLabel: `Confidence ${candidate.confidence.toFixed(2)}`,
      status: candidate.status,
    }
  })

  return (
    <CardStudioPageView
      tab={tab}
      hasReadyDocuments={readyDocuments.length > 0}
      readyDocuments={readyDocuments.map((document) => ({
        id: document.id,
        title: document.title,
        meta: `${document.pageCount ?? '--'} pages`,
        cardCountLabel: `${runsForDocument.length} runs`,
      }))}
      selectedDocumentId={selectedDocumentId}
      searchQuery={searchQuery}
      candidateLimitInput={candidateLimitInput}
      candidates={candidateViews}
      activeRunLabel={activeRun ? `Run ${activeRun.id.slice(0, 8)}` : 'No active batch'}
      activeRunStatusLabel={activeRun?.status ?? null}
      activeRunStatusTone={activeRun ? statusTone(activeRun.status) : 'neutral'}
      pendingCount={pendingCount}
      acceptedCount={acceptedCount}
      rejectedCount={rejectedCount}
      metrics={[
        { label: 'Ready docs', value: readyDocuments.length, hint: 'Documents that can start generation' },
        { label: 'Anchors', value: anchors.length, hint: 'Reference anchors for the selected document' },
        { label: 'Chunks', value: chunks.length, hint: 'Chunk coverage for candidate generation' },
      ]}
      runs={runsForDocument.map((run) => ({
        id: run.id,
        title: run.id.slice(0, 8),
        meta: run.createdAt.toLocaleString(),
        statusLabel: run.status,
        statusTone: statusTone(run.status),
      }))}
      checkpoint={
        checkpoint?.payload
          ? [
              { label: 'Phase', value: String(checkpoint.payload['phase'] ?? 'unknown') },
              { label: 'Generated', value: String(checkpoint.payload['generatedCount'] ?? '--') },
              {
                label: 'Chunk cursor',
                value: `${String(checkpoint.payload['chunkCursor'] ?? '--')}/${String(checkpoint.payload['totalChunks'] ?? '--')}`,
              },
            ]
          : []
      }
      events={events.map((event) => ({
        id: `${event.runId}-${event.createdAt.toISOString()}-${event.eventType}`,
        title: event.eventType,
        time: event.createdAt.toLocaleTimeString(),
        detail: event.message,
      }))}
      isBusy={isBusy}
      canGenerate={Boolean(selectedDocument)}
      canResume={Boolean(activeRun && LIVE_STATUSES.has(activeRun.status))}
      canFinalize={Boolean(activeRun && candidates.length > 0)}
      onTabChange={setTab}
      onDocumentSelect={setSelectedDocumentId}
      onCandidateLimitChange={setCandidateLimitInput}
      onSearchQueryChange={setSearchQuery}
      onGenerate={() => {
        if (!selectedDocument) return
        startMutation.mutate({
          documentId: selectedDocument.id,
          maxCandidates: Number.parseInt(candidateLimitInput, 10) || undefined,
        })
      }}
      onResume={() => activeRun && resumeMutation.mutate(activeRun.id)}
      onFinalize={() => {
        if (!activeRun) return
        Object.entries(candidateDrafts).forEach(([id, draft]) => {
          updateCandidateMutation.mutate({ id, data: draft })
        })
        finalizeMutation.mutate(activeRun.id)
      }}
      onBulkAccept={() => {
        if (!activeRun) return
        bulkStatusMutation.mutate({
          workflowRunId: activeRun.id,
          ids: candidates.filter((candidate) => candidate.status === 'pending').map((candidate) => candidate.id),
          status: 'accepted',
        })
      }}
      onBulkReject={() => {
        if (!activeRun) return
        bulkStatusMutation.mutate({
          workflowRunId: activeRun.id,
          ids: candidates.filter((candidate) => candidate.status === 'pending').map((candidate) => candidate.id),
          status: 'rejected',
        })
      }}
      onOpenLibrary={() => setActiveNavItem('library')}
      onOpenSettings={() => setActiveNavItem('settings')}
      onRunSelect={(runId) => {
        setSelectedRunId(runId)
        setTab('library')
      }}
      onCandidateUpdate={(candidateId, patch) => {
        setCandidateDrafts((prev) => {
          const currentCandidate = candidates.find((item) => item.id === candidateId)
          if (!currentCandidate) return prev
          const base = prev[candidateId] ?? {
            front: currentCandidate.front,
            back: currentCandidate.back,
            tags: currentCandidate.tags,
          }
          return {
            ...prev,
            [candidateId]: {
              front: patch.front ?? base.front,
              back: patch.back ?? base.back,
              tags: patch.tags ?? base.tags,
            },
          }
        })

        if (patch.status) {
          updateCandidateMutation.mutate({ id: candidateId, data: { status: patch.status } })
        }
      }}
    />
  )
}

function extractDocumentIdFromRun(run: WorkflowRun) {
  const value = run.approvalPayload?.['documentId']
  return typeof value === 'string' ? value : null
}

function statusTone(status: WorkflowRun['status']): 'neutral' | 'warning' | 'success' | 'danger' {
  if (status === 'completed') return 'success'
  if (status === 'failed' || status === 'cancelled') return 'danger'
  if (status === 'queued' || status === 'running' || status === 'waiting_confirmation') {
    return 'warning'
  }
  return 'neutral'
}
