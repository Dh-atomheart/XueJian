import { useCallback, useEffect, useMemo, useState } from 'react'
import { CardCandidatePanel } from '@/components/cards/CardCandidatePanel'
import { CardContentRenderer } from '@/components/cards/CardContentRenderer'
import { CardEditorModal } from '@/components/cards/CardEditorModal'
import { ImageOcclusionCardContent } from '@/components/cards/ImageOcclusionCardContent'
import { Button, Panel } from '@/components/ui'
import { SketchButton } from '@/components/ui/Sketch'
import {
  useBulkUpdateCardCandidateStatusesMutation,
  useCardCandidatesQuery,
  useCardsQuery,
  useCreateCardMutation,
  useFinalizeCardGenerationMutation,
  useResumeCardGenerationMutation,
  useUpdateCardCandidateMutation,
  useUpdateCardMutation,
} from '@/queries/cards'
import { useRecentWorkflowRunsQuery, useWorkflowEventsQuery } from '@/queries/orchestration'
import { cardsGateway } from '@/services/gateway/cards'
import { cn } from '@/lib/utils'
import type { Card, CardCandidate, WorkflowEvent, WorkflowRun } from '@/types'

type ViewMode = 'grid' | 'list'
type FilterStatus = 'all' | 'new' | 'learning' | 'review' | 'relearning'

type WorkflowRunSummary = {
  documentTitle: string | null
  phase: string | null
  generationMode: string | null
  fallbackReason: string | null
  chunkCursor: number
  totalChunks: number
  generatedCount: number
  duplicateCount: number
  pendingCount: number
  acceptedCount: number
  rejectedCount: number
}

const STATE_LABELS: Record<Card['state'], string> = {
  new: '新卡片',
  learning: '学习中',
  review: '复习',
  relearning: '重学',
}

const WORKFLOW_STATUS_LABELS: Record<WorkflowRun['status'], string> = {
  queued: '排队中',
  running: '生成中',
  waiting_confirmation: '等待人工确认',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
}

const WORKFLOW_STATUS_TONES: Record<WorkflowRun['status'], string> = {
  queued: 'border-ink/10 bg-paper-card text-ink-muted',
  running: 'border-sky-200 bg-sky-50 text-sky-700',
  waiting_confirmation: 'border-highlight-yellow/40 bg-highlight-yellow/10 text-ink',
  completed: 'border-highlight-green/40 bg-highlight-green/10 text-ink',
  failed: 'border-rose-200 bg-rose-50 text-rose-700',
  cancelled: 'border-line-soft bg-paper-muted/60 text-ink-muted',
}

const CANDIDATE_CARD_TYPES: Card['cardType'][] = ['qa', 'cloze', 'fact', 'choice']

export function CardStudioPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [flippedCards, setFlippedCards] = useState<Set<string>>(new Set())
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [editingCard, setEditingCard] = useState<Card | null>(null)
  const [editingCandidate, setEditingCandidate] = useState<CardCandidate | null>(null)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [showLowQualityCandidates, setShowLowQualityCandidates] = useState(false)
  const [importStatus, setImportStatus] = useState<string | null>(null)

  const { data: cards = [], isLoading, refetch } = useCardsQuery({}, { enabled: true })
  const { data: recentRuns = [] } = useRecentWorkflowRunsQuery(8, 5_000)
  const createCard = useCreateCardMutation()
  const updateCard = useUpdateCardMutation()
  const updateCandidate = useUpdateCardCandidateMutation()
  const bulkUpdateCandidateStatuses = useBulkUpdateCardCandidateStatusesMutation()
  const resumeGeneration = useResumeCardGenerationMutation()
  const finalizeGeneration = useFinalizeCardGenerationMutation()

  const cardGenerationRuns = useMemo(
    () => recentRuns.filter((run) => run.workflowType === 'card_generation'),
    [recentRuns]
  )

  const preferredRunId = useMemo(
    () =>
      cardGenerationRuns.find((run) =>
        ['queued', 'running', 'waiting_confirmation', 'failed'].includes(run.status)
      )?.id ??
      cardGenerationRuns[0]?.id ??
      null,
    [cardGenerationRuns]
  )

  useEffect(() => {
    if (!preferredRunId) {
      if (selectedRunId) {
        setSelectedRunId(null)
      }
      return
    }

    if (!selectedRunId || !cardGenerationRuns.some((run) => run.id === selectedRunId)) {
      setSelectedRunId(preferredRunId)
    }
  }, [cardGenerationRuns, preferredRunId, selectedRunId])

  const selectedRun = useMemo(
    () => cardGenerationRuns.find((run) => run.id === selectedRunId) ?? null,
    [cardGenerationRuns, selectedRunId]
  )

  const isWorkflowPolling = selectedRun?.status === 'queued' || selectedRun?.status === 'running'
  const { data: candidates = [] } = useCardCandidatesQuery(
    { workflowRunId: selectedRunId, limit: 120 },
    { refetchInterval: isWorkflowPolling ? 3_000 : false }
  )
  const { data: workflowEvents = [] } = useWorkflowEventsQuery(selectedRunId, 6, {
    refetchInterval: isWorkflowPolling ? 3_000 : false,
  })

  const workflowSummary = useMemo(() => readWorkflowRunSummary(selectedRun), [selectedRun])

  const candidateCounts = useMemo(
    () => ({
      total: candidates.length,
      pending: candidates.filter((candidate) => candidate.status === 'pending').length,
      accepted: candidates.filter((candidate) => candidate.status === 'accepted').length,
      rejected: candidates.filter((candidate) => candidate.status === 'rejected').length,
    }),
    [candidates]
  )

  const hiddenLowQualityCount = useMemo(
    () =>
      candidates.filter(
        (candidate) =>
          candidate.status === 'pending' && candidate.visibilityBucket === 'hidden_low_quality'
      ).length,
    [candidates]
  )

  const reviewCandidates = useMemo(() => {
    const sorted = [...candidates].sort((left, right) => compareCandidates(right, left))

    if (showLowQualityCandidates) {
      return sorted
    }

    return sorted.filter(
      (candidate) =>
        candidate.status !== 'pending' || candidate.visibilityBucket !== 'hidden_low_quality'
    )
  }, [candidates, showLowQualityCandidates])

  const effectivePendingCount =
    candidateCounts.total > 0 ? candidateCounts.pending : workflowSummary.pendingCount
  const effectiveAcceptedCount =
    candidateCounts.total > 0 ? candidateCounts.accepted : workflowSummary.acceptedCount
  const effectiveRejectedCount =
    candidateCounts.total > 0 ? candidateCounts.rejected : workflowSummary.rejectedCount

  const filteredCards = useMemo(() => {
    return cards.filter((card) => {
      const matchesStatus = filterStatus === 'all' || card.state === filterStatus
      const matchesSearch =
        !searchQuery ||
        card.front.toLowerCase().includes(searchQuery.toLowerCase()) ||
        card.back.toLowerCase().includes(searchQuery.toLowerCase())
      return matchesStatus && matchesSearch
    })
  }, [cards, filterStatus, searchQuery])

  const groups = useMemo(() => {
    const groupMap = new Map<string, { id: string; name: string; count: number }>()
    for (const card of cards) {
      if (!card.groupId) {
        continue
      }

      const existing = groupMap.get(card.groupId)
      if (existing) {
        existing.count += 1
      } else {
        groupMap.set(card.groupId, { id: card.groupId, name: card.groupId, count: 1 })
      }
    }
    return Array.from(groupMap.values())
  }, [cards])

  const statusFilters: { key: FilterStatus; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: 'new', label: '新卡片' },
    { key: 'learning', label: '学习中' },
    { key: 'review', label: '复习' },
    { key: 'relearning', label: '重学' },
  ]

  const statusColors: Record<string, string> = {
    new: 'bg-blue-100 text-blue-700',
    learning: 'bg-amber-100 text-amber-700',
    review: 'bg-green-100 text-green-700',
    relearning: 'bg-purple-100 text-purple-700',
  }

  const reviewBusy =
    updateCandidate.isPending ||
    bulkUpdateCandidateStatuses.isPending ||
    resumeGeneration.isPending ||
    finalizeGeneration.isPending

  const latestWorkflowEvent = workflowEvents[0] ?? null

  const toggleFlip = (id: string) => {
    setFlippedCards((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const closeEditor = useCallback(() => {
    setIsEditorOpen(false)
    setEditingCard(null)
    setEditingCandidate(null)
  }, [])

  const handleImportApkg = useCallback(async () => {
    try {
      setImportStatus('正在导入...')
      const result = await cardsGateway.importApkg()
      setImportStatus(
        `导入成功: ${result.importedCount} 张卡片 (跳过 ${result.skippedDuplicates} 重复)`
      )
      refetch()
      setTimeout(() => setImportStatus(null), 4_000)
    } catch {
      setImportStatus('导入失败，请确保编排服务已启动')
      setTimeout(() => setImportStatus(null), 4_000)
    }
  }, [refetch])

  const handleExportApkg = useCallback(async () => {
    try {
      setImportStatus('正在导出...')
      const result = await cardsGateway.pickAndExportApkg()
      if (result) {
        setImportStatus(`导出成功: ${result.cardCount} 张卡片`)
      } else {
        setImportStatus(null)
      }
      setTimeout(() => setImportStatus(null), 4_000)
    } catch {
      setImportStatus('导出失败，请确保编排服务已启动')
      setTimeout(() => setImportStatus(null), 4_000)
    }
  }, [])

  const handleExportCsv = useCallback(async () => {
    try {
      setImportStatus('正在导出 CSV...')
      const result = await cardsGateway.pickAndExportCsv()
      if (result) {
        setImportStatus(`导出成功: ${result.cardCount} 张卡片`)
      } else {
        setImportStatus(null)
      }
      setTimeout(() => setImportStatus(null), 4_000)
    } catch {
      setImportStatus('导出 CSV 失败')
      setTimeout(() => setImportStatus(null), 4_000)
    }
  }, [])

  const renderCardContent = useCallback((card: Card, isFlipped: boolean, compact = false) => {
    if (card.cardType === 'image_occlusion') {
      return (
        <>
          <ImageOcclusionCardContent content={card.front} revealed={isFlipped} compact={compact} />
          {isFlipped && card.back ? (
            <div className="mt-3 border-t border-line-soft/40 pt-3">
              <CardContentRenderer content={card.back} compact={compact} />
            </div>
          ) : null}
        </>
      )
    }

    return <CardContentRenderer content={isFlipped ? card.back : card.front} compact={compact} />
  }, [])

  const handleSaveCard = useCallback(
    async (data: {
      front: string
      back: string
      tags: string[]
      cardType: Card['cardType']
      mediaFilePaths: string[]
    }) => {
      try {
        if (editingCandidate) {
          await updateCandidate.mutateAsync({
            id: editingCandidate.id,
            data: {
              front: data.front,
              back: data.back,
              tags: data.tags,
              cardType:
                data.cardType === 'image_occlusion' ? editingCandidate.cardType : data.cardType,
            },
          })
          closeEditor()
          setImportStatus('候选已更新，等待你的最终确认')
          setTimeout(() => setImportStatus(null), 4_000)
          return
        }

        const actionLabel = editingCard ? '更新' : '创建'
        const savedCard = editingCard
          ? await updateCard.mutateAsync({
              id: editingCard.id,
              data: {
                front: data.front,
                back: data.back,
                tags: data.tags,
                cardType: data.cardType,
              },
            })
          : await createCard.mutateAsync({
              front: data.front,
              back: data.back,
              tags: data.tags,
              cardType: data.cardType,
            })

        let partialUploadFailure = false
        if (data.mediaFilePaths.length > 0) {
          try {
            await Promise.all(
              data.mediaFilePaths.map((filePath) =>
                cardsGateway.uploadCardMedia(savedCard.id, filePath)
              )
            )
          } catch {
            partialUploadFailure = true
          }
        }

        await refetch()
        closeEditor()
        setImportStatus(
          partialUploadFailure
            ? `卡片${actionLabel}成功，但部分媒体上传失败`
            : `卡片${actionLabel}成功`
        )
        setTimeout(() => setImportStatus(null), 4_000)
      } catch {
        setImportStatus(
          editingCandidate ? '候选更新失败' : `卡片${editingCard ? '更新' : '创建'}失败`
        )
        setTimeout(() => setImportStatus(null), 4_000)
      }
    },
    [closeEditor, createCard, editingCandidate, editingCard, refetch, updateCandidate, updateCard]
  )

  const handleAcceptCandidate = useCallback(
    async (candidate: CardCandidate) => {
      try {
        await updateCandidate.mutateAsync({ id: candidate.id, data: { status: 'accepted' } })
        setImportStatus('候选已接受')
        setTimeout(() => setImportStatus(null), 4_000)
      } catch {
        setImportStatus('接受候选失败')
        setTimeout(() => setImportStatus(null), 4_000)
      }
    },
    [updateCandidate]
  )

  const handleRejectCandidate = useCallback(
    async (candidate: CardCandidate) => {
      try {
        await updateCandidate.mutateAsync({ id: candidate.id, data: { status: 'rejected' } })
        setImportStatus('候选已丢弃')
        setTimeout(() => setImportStatus(null), 4_000)
      } catch {
        setImportStatus('丢弃候选失败')
        setTimeout(() => setImportStatus(null), 4_000)
      }
    },
    [updateCandidate]
  )

  const handleBulkUpdateCandidates = useCallback(
    async (selectedCandidates: CardCandidate[], status: 'accepted' | 'rejected') => {
      if (!selectedRun) {
        return
      }

      try {
        await bulkUpdateCandidateStatuses.mutateAsync({
          workflowRunId: selectedRun.id,
          ids: selectedCandidates.map((candidate) => candidate.id),
          status,
        })
        setImportStatus(status === 'accepted' ? '已批量接受候选' : '已批量丢弃候选')
        setTimeout(() => setImportStatus(null), 4_000)
      } catch {
        setImportStatus(status === 'accepted' ? '批量接受失败' : '批量丢弃失败')
        setTimeout(() => setImportStatus(null), 4_000)
      }
    },
    [bulkUpdateCandidateStatuses, selectedRun]
  )

  const handleFinalizeGeneration = useCallback(async () => {
    if (!selectedRun) {
      return
    }

    try {
      const result = await finalizeGeneration.mutateAsync(selectedRun.id)
      await refetch()
      closeEditor()
      setImportStatus(
        `已完成入库: 新建 ${result.createdCount} 张卡片，跳过 ${result.skippedDuplicates} 张重复候选`
      )
      setTimeout(() => setImportStatus(null), 4_000)
    } catch {
      setImportStatus('完成入库失败，请先处理所有待确认候选')
      setTimeout(() => setImportStatus(null), 4_000)
    }
  }, [closeEditor, finalizeGeneration, refetch, selectedRun])

  const handleResumeGeneration = useCallback(async () => {
    if (!selectedRun) {
      return
    }

    try {
      await resumeGeneration.mutateAsync(selectedRun.id)
      setImportStatus('已从最近断点恢复生成')
      setTimeout(() => setImportStatus(null), 4_000)
    } catch {
      setImportStatus('恢复生成失败')
      setTimeout(() => setImportStatus(null), 4_000)
    }
  }, [resumeGeneration, selectedRun])

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center min-h-[60vh]"
        data-testid="card-studio-loading"
      >
        <p className="text-sm text-ink-muted animate-pulse">加载卡片中...</p>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 animate-fade-in" data-testid="card-studio-page">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs tracking-[0.3em] text-ink-muted uppercase mb-2 font-ui">
            Flashcard Library
          </p>
          <h1 className="text-2xl font-display font-semibold mb-2">牌库</h1>
          <p className="text-sm text-ink-muted">管理和浏览你的知识卡片 · {cards.length} 张</p>
        </div>
        <div className="flex items-center gap-2">
          <SketchButton onClick={handleImportApkg}>导入 APKG</SketchButton>
          <SketchButton onClick={handleExportApkg}>导出 APKG</SketchButton>
          <SketchButton onClick={handleExportCsv}>导出 CSV</SketchButton>
          <SketchButton
            onClick={() => {
              setEditingCard(null)
              setEditingCandidate(null)
              setIsEditorOpen(true)
            }}
          >
            + 新建卡片
          </SketchButton>
        </div>
      </div>

      {importStatus ? (
        <div
          className="mb-4 px-4 py-2 rounded-lg border border-line-soft/60 bg-paper-muted/50 text-sm text-ink-muted animate-fade-in"
          data-testid="card-studio-status"
        >
          {importStatus}
        </div>
      ) : null}

      <Panel
        variant="panel"
        className="mb-6 overflow-hidden rounded-[28px] bg-[radial-gradient(circle_at_top_right,rgb(var(--highlight-yellow)/0.22),transparent_32%),linear-gradient(180deg,rgb(var(--paper-muted)/0.92),rgb(var(--paper-base)/0.96))]"
        data-testid="card-studio-review-workflow"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-[0.26em] text-ink-soft">Review Batch</p>
            <div>
              <h2 className="font-display text-xl text-ink">候选审阅与最终入库</h2>
              <p className="mt-1 text-sm leading-6 text-ink-muted">
                卡片候选已经接入工作流批次视图。你可以在这里批量接受、编辑、丢弃，并在待确认清空后完成正式入库。
              </p>
            </div>
          </div>

          {cardGenerationRuns.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {cardGenerationRuns.map((run) => {
                const runSummary = readWorkflowRunSummary(run)
                const isSelected = run.id === selectedRunId

                return (
                  <button
                    key={run.id}
                    type="button"
                    onClick={() => setSelectedRunId(run.id)}
                    data-testid={`card-studio-workflow-run-${run.id}`}
                    className={cn(
                      'min-w-[180px] rounded-[18px] border px-3 py-2 text-left transition-colors',
                      isSelected
                        ? 'border-ink/20 bg-paper-card shadow-card'
                        : 'border-line-soft/60 bg-paper-base/70 hover:border-line-soft'
                    )}
                  >
                    <p className="truncate text-sm font-medium text-ink">
                      {runSummary.documentTitle ?? run.threadId}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-ink-soft">
                      <span>{WORKFLOW_STATUS_LABELS[run.status]}</span>
                      <span>·</span>
                      <span>{runSummary.pendingCount} 待确认</span>
                    </div>
                  </button>
                )
              })}
            </div>
          ) : null}
        </div>

        {selectedRun ? (
          <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-4">
                <WorkflowMetric
                  label="当前状态"
                  value={WORKFLOW_STATUS_LABELS[selectedRun.status]}
                  detail={workflowSummary.phase ?? '未记录阶段'}
                />
                <WorkflowMetric
                  label="待确认"
                  value={`${effectivePendingCount}`}
                  detail={`${effectiveAcceptedCount} 已接受 · ${effectiveRejectedCount} 已丢弃`}
                />
                <WorkflowMetric
                  label="生成进度"
                  value={`${workflowSummary.chunkCursor}/${Math.max(workflowSummary.totalChunks, workflowSummary.chunkCursor, 1)}`}
                  detail={`${workflowSummary.generatedCount} 候选 · ${workflowSummary.duplicateCount} 重复`}
                />
                <WorkflowMetric
                  label="生成模式"
                  value={formatGenerationMode(workflowSummary.generationMode)}
                  detail={workflowSummary.fallbackReason ?? '标准模型路径'}
                />
              </div>

              {workflowSummary.fallbackReason ? (
                <div className="rounded-[22px] border border-highlight-yellow/40 bg-highlight-yellow/10 px-4 py-3 text-sm text-ink-muted">
                  当前批次走了显式降级路径：{workflowSummary.fallbackReason}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm text-ink-muted">
                  <span
                    className={cn(
                      'rounded-full border px-2 py-1 text-xs font-medium',
                      WORKFLOW_STATUS_TONES[selectedRun.status]
                    )}
                  >
                    {WORKFLOW_STATUS_LABELS[selectedRun.status]}
                  </span>
                  {hiddenLowQualityCount > 0 ? (
                    <button
                      type="button"
                      onClick={() => setShowLowQualityCandidates((prev) => !prev)}
                      className="text-xs text-ink-muted transition-colors hover:text-ink"
                    >
                      {showLowQualityCandidates
                        ? '隐藏低质量候选'
                        : `展开 ${hiddenLowQualityCount} 条低质量候选`}
                    </button>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  {selectedRun.status === 'failed' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleResumeGeneration()}
                      disabled={reviewBusy}
                    >
                      从最近断点恢复
                    </Button>
                  ) : null}

                  <Button
                    variant="sketch"
                    size="sm"
                    onClick={() => void handleFinalizeGeneration()}
                    disabled={
                      reviewBusy ||
                      selectedRun.status !== 'waiting_confirmation' ||
                      effectivePendingCount > 0
                    }
                    data-testid="card-studio-finalize-generation"
                  >
                    完成入库
                  </Button>
                </div>
              </div>

              {candidates.length > 0 ? (
                <CardCandidatePanel
                  candidates={reviewCandidates}
                  busy={reviewBusy}
                  onAccept={(candidate) => void handleAcceptCandidate(candidate)}
                  onReject={(candidate) => void handleRejectCandidate(candidate)}
                  onEdit={(candidate) => {
                    setEditingCard(null)
                    setEditingCandidate(candidate)
                    setIsEditorOpen(true)
                  }}
                  onBulkAccept={(selectedCandidates) =>
                    void handleBulkUpdateCandidates(selectedCandidates, 'accepted')
                  }
                  onBulkReject={(selectedCandidates) =>
                    void handleBulkUpdateCandidates(selectedCandidates, 'rejected')
                  }
                  emptyHint={
                    showLowQualityCandidates || hiddenLowQualityCount === 0
                      ? '当前没有可确认的候选，等待下一次生成或完成入库。'
                      : '默认已隐藏低质量候选，可以手动展开继续审阅。'
                  }
                />
              ) : (
                <div className="rounded-[24px] border border-dashed border-line-soft/70 bg-paper-card/60 px-5 py-10 text-center text-sm text-ink-muted">
                  {selectedRun.status === 'queued' || selectedRun.status === 'running'
                    ? '当前批次仍在生成中，候选会自动出现在这里。'
                    : '当前批次还没有候选。可以查看右侧事件流判断是空结果、失败还是等待恢复。'}
                </div>
              )}
            </div>

            <Panel variant="paperCard" className="rounded-[24px] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                    Workflow Log
                  </p>
                  <h3 className="mt-1 font-display text-lg text-ink">
                    {workflowSummary.documentTitle ?? '当前工作流'}
                  </h3>
                </div>
                <span className="text-xs text-ink-muted">
                  {formatWorkflowTimestamp(selectedRun.updatedAt)}
                </span>
              </div>

              <div className="mt-4 rounded-[18px] border border-line-soft/60 bg-paper-muted/35 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-ink-soft">最近事件</p>
                {latestWorkflowEvent ? (
                  <p className="mt-2 text-sm leading-6 text-ink-muted">
                    {describeWorkflowEvent(latestWorkflowEvent)}
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-ink-muted">当前批次还没有事件日志。</p>
                )}
              </div>

              <div className="mt-4 space-y-3">
                {workflowEvents.length > 0 ? (
                  workflowEvents.map((event) => (
                    <div
                      key={`${event.runId}-${event.createdAt.toISOString()}-${event.eventType}`}
                      className="border-l border-line-soft pl-3"
                    >
                      <p className="text-xs uppercase tracking-[0.18em] text-ink-soft">
                        {event.eventType}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-ink-muted">
                        {event.message ?? '没有额外事件说明'}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-ink-muted">暂无事件。</p>
                )}
              </div>
            </Panel>
          </div>
        ) : (
          <div className="mt-5 rounded-[24px] border border-dashed border-line-soft/70 bg-paper-card/60 px-5 py-10 text-center text-sm text-ink-muted">
            暂时还没有文档生成批次。导入文档并完成解析、向量化后，候选会自动进入这里等待人工确认。
          </div>
        )}
      </Panel>

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {statusFilters.map((filter) => (
            <button
              key={filter.key}
              onClick={() => setFilterStatus(filter.key)}
              data-testid={`card-studio-filter-${filter.key}`}
              className={cn(
                'px-3 py-1.5 text-xs rounded-full border transition-all whitespace-nowrap',
                filterStatus === filter.key
                  ? 'border-ink/30 bg-paper-muted/80 font-medium'
                  : 'border-line-soft/60 hover:border-line-soft text-ink-muted'
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="搜索卡片..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            data-testid="card-studio-search"
            className="px-3 py-2 bg-paper-muted/50 border border-line-soft/60 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ink/10 transition-all w-48"
          />
          <button
            onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
            data-testid="card-studio-view-toggle"
            className="p-2 border border-line-soft/60 rounded-lg hover:bg-paper-muted/50 transition-colors"
          >
            {viewMode === 'grid' ? (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            ) : (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {groups.length > 0 ? (
        <div className="flex gap-3 mb-6 overflow-x-auto pb-2">
          {groups.map((group) => (
            <div
              key={group.id}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-line-soft/60 text-sm whitespace-nowrap"
            >
              <div className="w-3 h-3 rounded-full bg-ink/20" />
              <span>{group.name}</span>
              <span className="text-xs text-ink-muted">{group.count}</span>
            </div>
          ))}
        </div>
      ) : null}

      {filteredCards.length > 0 ? (
        <div
          className={cn(
            viewMode === 'grid'
              ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'
              : 'space-y-3'
          )}
        >
          {filteredCards.map((card, index) => {
            const isFlipped = flippedCards.has(card.id)

            if (viewMode === 'list') {
              return (
                <div
                  key={card.id}
                  onClick={() => toggleFlip(card.id)}
                  data-testid={`card-studio-card-${card.id}`}
                  className="p-4 rounded-lg border border-line-soft/60 hover:bg-paper-muted/30 transition-colors cursor-pointer animate-slide-in"
                  style={{ animationDelay: `${index * 30}ms` }}
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-1">
                      {renderCardContent(card, isFlipped, true)}
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-xs text-ink-muted">
                          {isFlipped ? '答案' : '问题'} · 点击翻转
                        </p>
                        {card.tags.length > 0 ? (
                          <span className="text-xs text-ink-muted">
                            · {card.tags.slice(0, 3).join(', ')}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <span
                      className={cn(
                        'px-2 py-0.5 text-xs rounded-full',
                        statusColors[card.state] || 'bg-paper-muted text-ink-muted'
                      )}
                    >
                      {STATE_LABELS[card.state] ?? card.state}
                    </span>
                  </div>
                </div>
              )
            }

            return (
              <div
                key={card.id}
                onClick={() => toggleFlip(card.id)}
                data-testid={`card-studio-card-${card.id}`}
                className="cursor-pointer animate-slide-in"
                style={{ animationDelay: `${index * 50}ms`, perspective: '600px' }}
              >
                <div
                  className={cn(
                    'relative min-h-[180px] p-5 rounded-xl border border-line-soft/60 transition-all duration-500',
                    isFlipped ? 'bg-paper-muted/30' : 'bg-paper-card hover:shadow-sm'
                  )}
                  style={{
                    transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0)',
                    transformStyle: 'preserve-3d',
                  }}
                >
                  <div style={{ transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0)' }}>
                    <div className="flex items-center justify-between mb-3">
                      <span
                        className={cn(
                          'px-2 py-0.5 text-xs rounded-full',
                          statusColors[card.state] || 'bg-paper-muted text-ink-muted'
                        )}
                      >
                        {STATE_LABELS[card.state] ?? card.state}
                      </span>
                      {card.cardType !== 'qa' ? (
                        <span className="text-xs text-ink-muted">{card.cardType}</span>
                      ) : null}
                    </div>
                    {renderCardContent(card, isFlipped, true)}
                    <div className="flex items-center justify-between mt-4">
                      <p className="text-xs text-ink-muted">{isFlipped ? 'Answer' : 'Question'}</p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(event) => {
                            event.stopPropagation()
                            setEditingCandidate(null)
                            setEditingCard(card)
                            setIsEditorOpen(true)
                          }}
                          data-testid={`card-studio-edit-${card.id}`}
                          className="text-xs text-ink-muted hover:text-ink transition-colors"
                        >
                          编辑
                        </button>
                        {card.tags.length > 0 ? (
                          <p className="text-xs text-ink-muted truncate max-w-[120px]">
                            {card.tags.slice(0, 2).join(', ')}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-center py-16 text-ink-muted">
          <p className="text-sm mb-2">没有找到匹配的卡片</p>
          <p className="text-xs">尝试调整筛选条件或上传文档生成卡片</p>
        </div>
      )}

      {isEditorOpen ? (
        <CardEditorModal
          card={editingCard}
          initialDraft={
            editingCandidate
              ? {
                  front: editingCandidate.front,
                  back: editingCandidate.back,
                  tags: editingCandidate.tags,
                  cardType: editingCandidate.cardType,
                }
              : null
          }
          allowedCardTypes={editingCandidate ? CANDIDATE_CARD_TYPES : undefined}
          title={editingCandidate ? '编辑候选卡片' : undefined}
          submitLabel={editingCandidate ? '保存候选' : undefined}
          isSaving={reviewBusy || createCard.isPending || updateCard.isPending}
          onClose={closeEditor}
          onSave={handleSaveCard}
        />
      ) : null}
    </div>
  )
}

function WorkflowMetric({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="rounded-[20px] border border-line-soft/60 bg-paper-card/70 px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">{label}</p>
      <p className="mt-2 font-display text-xl text-ink">{value}</p>
      <p className="mt-1 text-xs leading-5 text-ink-muted">{detail}</p>
    </div>
  )
}

function readWorkflowRunSummary(run: WorkflowRun | null): WorkflowRunSummary {
  const payload = run?.approvalPayload
  return {
    documentTitle: asString(payload?.documentTitle),
    phase: asString(payload?.phase),
    generationMode: asString(payload?.generationMode),
    fallbackReason: asString(payload?.fallbackReason),
    chunkCursor: asNumber(payload?.chunkCursor),
    totalChunks: asNumber(payload?.totalChunks),
    generatedCount: asNumber(payload?.generatedCount),
    duplicateCount: asNumber(payload?.duplicateCount),
    pendingCount: asNumber(payload?.pendingCount),
    acceptedCount: asNumber(payload?.acceptedCount),
    rejectedCount: asNumber(payload?.rejectedCount),
  }
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function compareCandidates(left: CardCandidate, right: CardCandidate) {
  const leftScore = left.scoreOverall ?? left.confidence * 100
  const rightScore = right.scoreOverall ?? right.confidence * 100
  if (leftScore !== rightScore) {
    return leftScore - rightScore
  }

  if (left.status !== right.status) {
    return left.status.localeCompare(right.status)
  }

  return left.createdAt.getTime() - right.createdAt.getTime()
}

function formatGenerationMode(mode: string | null) {
  if (mode === 'fallback_rule') {
    return '规则降级'
  }
  if (mode === 'fallback_fts5_only') {
    return 'FTS5 降级'
  }
  if (mode === 'rule_based_fallback') {
    return '本地规则降级'
  }
  return '标准模型'
}

function formatWorkflowTimestamp(value: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value)
}

function describeWorkflowEvent(event: WorkflowEvent) {
  if (event.message) {
    return event.message
  }

  if (event.eventType === 'progress' && typeof event.progress === 'number') {
    return `当前已推进到 ${Math.round(event.progress * 100)}%`
  }

  return '工作流状态已更新'
}
