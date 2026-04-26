import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AnimationPreviewModal } from '@/components/cards'
import { CardCandidatePanel } from '@/components/cards/CardCandidatePanel'
import { CardEditorModal, type CardEditorDraft } from '@/components/cards/CardEditorModal'
import { Card, CardContent, Button } from '@/components/ui'
import { CardStudioPage as CardStudioPageView } from '@/components/pages/card-studio-page'
import { reportAppError, reportFeedback } from '@/lib/appFeedback'
import {
  cardsQueryKeys,
  documentsQueryKeys,
  orchestrationQueryKeys,
  useBulkUpdateCardCandidateStatusesMutation,
  useCardCandidatesQuery,
  useCardsQuery,
  useFinalizeCardGenerationMutation,
  useRecentWorkflowRunsQuery,
  useUpdateCardCandidateMutation,
  useDocumentsQuery,
  useWorkflowEventsQuery,
} from '@/queries'
import { cardsGateway, type CardCandidateFilters, type CreateCardInput, type UpdateCardInput } from '@/services/gateway/cards'
import { useAppUiStore } from '@/store'
import type { Card as CardEntity, CardCandidate, WorkflowRun } from '@/types'

const LIVE_STATUSES = new Set<WorkflowRun['status']>(['queued', 'running'])

type EditorState =
  | { mode: 'create' }
  | { mode: 'edit-card'; card: CardEntity }
  | { mode: 'edit-candidate'; candidate: CardCandidate }
  | null

type FinalizeSummary = {
  createdCount: number
  skippedDuplicates: number
  rejectedCount: number
  highlightsCreated: number
  highlightsUnlinked: number
}

type AnimationModalState =
  | { cardId: string; cardFront: string; mode: 'quick_preview' | 'video_render' }
  | null

export function CardStudioPage() {
  const queryClient = useQueryClient()
  const setActiveNavItem = useAppUiStore((state) => state.setActiveNavItem)
  const preferredCardStudioDocumentId = useAppUiStore(
    (state) => state.preferredCardStudioDocumentId
  )
  const setPreferredCardStudioDocumentId = useAppUiStore(
    (state) => state.setPreferredCardStudioDocumentId
  )
  const { data: documents = [] } = useDocumentsQuery()
  const readyDocuments = useMemo(
    () => documents.filter((document) => document.status === 'ready' || document.status === 'parsed'),
    [documents]
  )

  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null)
  const [cardLimitInput, setCardLimitInput] = useState('24')
  const [searchQuery, setSearchQuery] = useState('')
  const [editorState, setEditorState] = useState<EditorState>(null)
  const [animationModalState, setAnimationModalState] = useState<AnimationModalState>(null)
  const [finalizeSummary, setFinalizeSummary] = useState<FinalizeSummary | null>(null)

  useEffect(() => {
    if (readyDocuments.length === 0) {
      setSelectedDocumentId(null)
      return
    }

    if (
      preferredCardStudioDocumentId &&
      readyDocuments.some((document) => document.id === preferredCardStudioDocumentId)
    ) {
      setSelectedDocumentId(preferredCardStudioDocumentId)
      setPreferredCardStudioDocumentId(null)
      return
    }

    if (!selectedDocumentId || !readyDocuments.some((document) => document.id === selectedDocumentId)) {
      setSelectedDocumentId(readyDocuments[0].id)
    }
  }, [
    preferredCardStudioDocumentId,
    readyDocuments,
    selectedDocumentId,
    setPreferredCardStudioDocumentId,
  ])

  useEffect(() => {
    setFinalizeSummary(null)
  }, [selectedDocumentId])

  const { data: cards = [] } = useCardsQuery(
    { documentId: selectedDocumentId, limit: 500 },
    { enabled: Boolean(selectedDocumentId) }
  )
  const { data: workflowRuns = [] } = useRecentWorkflowRunsQuery(20, 2_500)
  const runsForDocument = useMemo(() => {
    const cardRuns = workflowRuns.filter((run) => run.workflowType === 'card_generation')
    return selectedDocumentId
      ? cardRuns.filter((run) => extractDocumentIdFromRun(run) === selectedDocumentId)
      : cardRuns
  }, [workflowRuns, selectedDocumentId])
  const activeRun = runsForDocument[0] ?? null
  const pollInterval = activeRun && LIVE_STATUSES.has(activeRun.status) ? 2_000 : false
  const { data: events = [] } = useWorkflowEventsQuery(activeRun?.id ?? null, 24, {
    refetchInterval: pollInterval,
  })

  const candidateFilters: CardCandidateFilters = activeRun?.id
    ? { workflowRunId: activeRun.id, limit: 200 }
    : selectedDocumentId
      ? { documentId: selectedDocumentId, status: 'pending', limit: 200 }
      : {}
  const { data: candidates = [] } = useCardCandidatesQuery(candidateFilters, {
    refetchInterval: pollInterval,
  })

  const pendingCandidates = useMemo(
    () => candidates.filter((candidate) => candidate.status === 'pending'),
    [candidates]
  )
  const acceptedCandidates = useMemo(
    () => candidates.filter((candidate) => candidate.status === 'accepted'),
    [candidates]
  )
  const rejectedCandidates = useMemo(
    () => candidates.filter((candidate) => candidate.status === 'rejected'),
    [candidates]
  )
  const fallbackCandidates = useMemo(
    () =>
      candidates.filter(
        (candidate) =>
          candidate.generationMode !== 'llm' || Boolean(candidate.fallbackReason)
      ),
    [candidates]
  )

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
    onSuccess: async () => {
      setFinalizeSummary(null)
      await invalidateCardQueries()
    },
    onError: (cause) => {
      const detail = cause instanceof Error ? cause.message : String(cause)
      reportAppError('卡片生成', cause, {
        title: detail.includes('no parsed chunks')
          ? '文档尚未解析成功，请回到文档库重试解析'
          : '卡片生成启动失败',
        showToast: true,
      })
    },
  })

  const createMutation = useMutation({
    mutationFn: (data: CreateCardInput) => cardsGateway.create(data),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCardInput }) => cardsGateway.update(id, data),
    onSuccess: async () => {
      setEditorState(null)
      await invalidateCardQueries()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => cardsGateway.delete(id),
    onSuccess: invalidateCardQueries,
  })

  const updateCandidateMutation = useUpdateCardCandidateMutation()
  const bulkUpdateCandidateStatusesMutation = useBulkUpdateCardCandidateStatusesMutation()
  const finalizeGenerationMutation = useFinalizeCardGenerationMutation()

  const isBusy =
    startMutation.isPending ||
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending ||
    updateCandidateMutation.isPending ||
    bulkUpdateCandidateStatusesMutation.isPending ||
    finalizeGenerationMutation.isPending

  function handleEditorSave(data: CardEditorDraft & { mediaFilePaths: string[] }) {
    if (editorState?.mode === 'edit-card') {
      updateMutation.mutate({
        id: editorState.card.id,
        data: {
          front: data.front,
          back: data.back,
          tags: data.tags,
          cardType: data.cardType,
        },
      })
      return
    }

    if (editorState?.mode === 'edit-candidate') {
      const nextCardType =
        data.cardType === 'image_occlusion' ? 'qa' : data.cardType
      updateCandidateMutation.mutate({
        id: editorState.candidate.id,
        data: {
          front: data.front,
          back: data.back,
          tags: data.tags,
          cardType: nextCardType,
        },
      })
      setEditorState(null)
      return
    }

    createMutation.mutate(
      {
        front: data.front,
        back: data.back,
        tags: data.tags,
        cardType: data.cardType,
        documentId: selectedDocumentId,
      },
      {
        onSuccess: async (card) => {
          if (data.mediaFilePaths.length > 0) {
            await Promise.all(
              data.mediaFilePaths.map((filePath) => cardsGateway.uploadCardMedia(card.id, filePath))
            )
          }
          setEditorState(null)
          await invalidateCardQueries()
        },
      }
    )
  }

  async function handleUpdateCandidateStatus(
    candidate: CardCandidate,
    status: CardCandidate['status']
  ) {
    await updateCandidateMutation.mutateAsync({
      id: candidate.id,
      data: { status },
    })
  }

  async function handleFinalizeAcceptedCandidates() {
    if (!activeRun || !selectedDocumentId) {
      return
    }

    try {
      const result = await finalizeGenerationMutation.mutateAsync(activeRun.id)
      const highlightResult = await cardsGateway.batchCreateHighlightsForRun(
        activeRun.id,
        selectedDocumentId
      )
      setFinalizeSummary({
        createdCount: result.createdCount,
        skippedDuplicates: result.skippedDuplicates,
        rejectedCount: result.rejectedCount,
        highlightsCreated: highlightResult.created,
        highlightsUnlinked: highlightResult.unlinked,
      })
      await invalidateCardQueries()
      reportFeedback({
        scope: '卡片工坊',
        title: '候选卡片已入库',
        detail: `新增 ${result.createdCount} 张正式卡片，并创建 ${highlightResult.created} 条阅读高亮。`,
        level: 'info',
      })
    } catch (cause) {
      reportAppError('卡片工坊', cause, {
        title: '候选卡片入库失败',
        fallbackDetail: '请检查候选状态后重试。',
        showToast: true,
      })
    }
  }

  const canFinalize =
    Boolean(activeRun) && acceptedCandidates.length > 0 && pendingCandidates.length === 0

  return (
    <>
      <div className="space-y-6">
        <CardStudioPageView
          hasReadyDocuments={readyDocuments.length > 0}
          readyDocuments={readyDocuments.map((document) => ({
            id: document.id,
            title: document.title,
            meta: `${document.pageCount ?? '--'} pages`,
            cardCountLabel: `${cards.filter((card) => card.documentId === document.id).length} cards`,
          }))}
          selectedDocumentId={selectedDocumentId}
          searchQuery={searchQuery}
          cardLimitInput={cardLimitInput}
          cards={cards.map((card) => ({
            id: card.id,
            front: card.front,
            back: card.back,
            tags: card.tags,
            cardType: card.cardType,
            state: card.state,
            sourceLabel: card.sourcePage ? `P.${card.sourcePage}` : 'Manual',
          }))}
          activeRunLabel={activeRun ? `Run ${activeRun.id.slice(0, 8)}` : 'No recent run'}
          activeRunStatusLabel={activeRun?.status ?? null}
          activeRunStatusTone={activeRun ? statusTone(activeRun.status) : 'neutral'}
          metrics={[
            { label: 'Ready docs', value: readyDocuments.length, hint: 'Documents available for generation' },
            { label: 'Cards', value: cards.length, hint: 'Formal cards for the selected document' },
            { label: 'Runs', value: runsForDocument.length, hint: 'Agent generation attempts' },
          ]}
          runs={runsForDocument.map((run) => ({
            id: run.id,
            title: run.id.slice(0, 8),
            meta: run.createdAt.toLocaleString(),
            statusLabel: run.status,
            statusTone: statusTone(run.status),
          }))}
          events={events.map((event) => ({
            id: `${event.runId}-${event.createdAt.toISOString()}-${event.eventType}`,
            title: event.eventType,
            time: event.createdAt.toLocaleTimeString(),
            detail: event.message,
          }))}
          isBusy={isBusy}
          canGenerate={Boolean(selectedDocumentId)}
          onDocumentSelect={(documentId) => {
            setSelectedDocumentId(documentId)
            setPreferredCardStudioDocumentId(null)
          }}
          onCardLimitChange={setCardLimitInput}
          onSearchQueryChange={setSearchQuery}
          onGenerate={() => {
            if (!selectedDocumentId) return
            startMutation.mutate({
              documentId: selectedDocumentId,
              maxCandidates: Number.parseInt(cardLimitInput, 10) || undefined,
            })
          }}
          onCreateCard={() => setEditorState({ mode: 'create' })}
          onEditCard={(cardId) => {
            const card = cards.find((item) => item.id === cardId)
            if (card) setEditorState({ mode: 'edit-card', card })
          }}
          onDeleteCard={(cardId) => deleteMutation.mutate(cardId)}
          onQuickPreviewCard={(cardId) => {
            const card = cards.find((item) => item.id === cardId)
            if (!card) return
            setAnimationModalState({ cardId, cardFront: card.front, mode: 'quick_preview' })
          }}
          onRenderVideoCard={(cardId) => {
            const card = cards.find((item) => item.id === cardId)
            if (!card) return
            setAnimationModalState({ cardId, cardFront: card.front, mode: 'video_render' })
          }}
          onOpenLibrary={() => setActiveNavItem('library')}
        />

        {activeRun ? (
          <div className="mx-auto w-full max-w-7xl space-y-4" data-testid="card-studio-candidate-review">
            <Card className="border-border/50 bg-card">
              <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">候选审阅闭环</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    先审阅候选卡片，再统一入库并创建文档高亮。这样阅读器、卡片和复习才能保持同一来源定位。
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span data-testid="card-studio-pending-count">待审阅 {pendingCandidates.length}</span>
                    <span data-testid="card-studio-accepted-count">已接受 {acceptedCandidates.length}</span>
                    <span data-testid="card-studio-rejected-count">已拒绝 {rejectedCandidates.length}</span>
                  </div>
                </div>
                <div className="flex flex-col items-start gap-2 lg:items-end">
                  <Button
                    onClick={() => void handleFinalizeAcceptedCandidates()}
                    disabled={!canFinalize || isBusy}
                    data-testid="card-studio-finalize-generation"
                  >
                    确认入库并生成高亮
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    {pendingCandidates.length > 0
                      ? '还有待审阅候选，请先接受或拒绝。'
                      : acceptedCandidates.length === 0
                        ? '至少接受一张候选卡片后才能入库。'
                        : '入库后会同步创建阅读高亮。'}
                  </p>
                </div>
              </CardContent>
            </Card>

            {finalizeSummary ? (
              <Card className="border-border/50 bg-card" data-testid="card-studio-finalize-summary">
                <CardContent className="grid gap-3 p-5 text-sm md:grid-cols-4">
                  <div>
                    <p className="text-xs text-muted-foreground">正式卡片</p>
                    <p className="mt-1 text-xl font-semibold text-foreground">
                      +{finalizeSummary.createdCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">重复跳过</p>
                    <p className="mt-1 text-xl font-semibold text-foreground">
                      {finalizeSummary.skippedDuplicates}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">高亮已创建</p>
                    <p className="mt-1 text-xl font-semibold text-foreground">
                      {finalizeSummary.highlightsCreated}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">未能定位</p>
                    <p className="mt-1 text-xl font-semibold text-foreground">
                      {finalizeSummary.highlightsUnlinked}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {fallbackCandidates.length > 0 ? (
              <Card className="border-amber-200/70 bg-amber-50" data-testid="card-studio-fallback-summary">
                <CardContent className="p-5 text-sm text-amber-900">
                  <p className="font-medium">Fallback generation detected</p>
                  <p className="mt-2">
                    {fallbackCandidates.length} candidate(s) came from fallback logic. Review them
                    as degraded output rather than treating them as proof that the orchestration
                    chain is healthy.
                  </p>
                </CardContent>
              </Card>
            ) : null}

            <CardCandidatePanel
              candidates={candidates}
              busy={isBusy}
              onAccept={(candidate) => {
                void handleUpdateCandidateStatus(candidate, 'accepted')
              }}
              onReject={(candidate) => {
                void handleUpdateCandidateStatus(candidate, 'rejected')
              }}
              onEdit={(candidate) => setEditorState({ mode: 'edit-candidate', candidate })}
              onBulkAccept={(selectedCandidates) => {
                if (!activeRun) return
                void bulkUpdateCandidateStatusesMutation.mutateAsync({
                  workflowRunId: activeRun.id,
                  ids: selectedCandidates.map((candidate) => candidate.id),
                  status: 'accepted',
                })
              }}
              onBulkReject={(selectedCandidates) => {
                if (!activeRun) return
                void bulkUpdateCandidateStatusesMutation.mutateAsync({
                  workflowRunId: activeRun.id,
                  ids: selectedCandidates.map((candidate) => candidate.id),
                  status: 'rejected',
                })
              }}
              emptyHint="当前运行还没有待审阅候选。可以重新触发生成，或直接维护正式卡片。"
            />
          </div>
        ) : null}
      </div>

      {editorState ? (
        <CardEditorModal
          card={editorState.mode === 'edit-card' ? editorState.card : null}
          initialDraft={
            editorState.mode === 'edit-candidate'
              ? {
                  front: editorState.candidate.front,
                  back: editorState.candidate.back,
                  tags: editorState.candidate.tags,
                  cardType: editorState.candidate.cardType,
                }
              : null
          }
          title={editorState.mode === 'edit-candidate' ? '编辑候选卡片' : undefined}
          submitLabel={editorState.mode === 'edit-candidate' ? '保存候选修改' : undefined}
          allowedCardTypes={
            editorState.mode === 'edit-candidate'
              ? ['qa', 'cloze', 'fact', 'choice']
              : ['qa', 'cloze', 'fact', 'choice', 'image_occlusion']
          }
          onSave={handleEditorSave}
          onClose={() => setEditorState(null)}
          isSaving={
            createMutation.isPending ||
            updateMutation.isPending ||
            updateCandidateMutation.isPending
          }
        />
      ) : null}

      {animationModalState ? (
        <AnimationPreviewModal
          cardId={animationModalState.cardId}
          cardFront={animationModalState.cardFront}
          initialMode={animationModalState.mode}
          onClose={() => setAnimationModalState(null)}
        />
      ) : null}
    </>
  )
}

function extractDocumentIdFromRun(run: WorkflowRun) {
  const value = run.approvalPayload?.['documentId']
  return typeof value === 'string' ? value : null
}

function statusTone(status: WorkflowRun['status']): 'neutral' | 'warning' | 'success' | 'danger' {
  if (status === 'completed') return 'success'
  if (status === 'failed' || status === 'cancelled') return 'danger'
  if (status === 'queued' || status === 'running') {
    return 'warning'
  }
  return 'neutral'
}
