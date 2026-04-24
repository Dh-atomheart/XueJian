import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { KnowledgeQaPage as KnowledgeQaPageView } from '@/components/pages/knowledge-qa-page'
import { useStartKnowledgeQaMutation, useKnowledgeSearchQuery } from '@/queries/knowledge'
import { useDocumentsQuery, useOrchestrationServiceHealthQuery } from '@/queries'
import { getErrorMessage, reportAppError, reportFeedback } from '@/lib/appFeedback'
import { useAppUiStore } from '@/store'
import { isTauriEnvironment } from '@/services/gateway'
import { orchestrationGateway } from '@/services/gateway/orchestration'
import type { ChunkSearchResult, WorkflowEvent } from '@/types'

type TurnState = {
  id: string
  question: string
  answer: string | null
  citations: Array<{
    id: string
    documentId: string
    documentTitle: string
    page: number | null
    snippet: string
    relevance: number | null
  }>
  status: 'pending' | 'answered' | 'error'
  errorMessage?: string | null
  documentTitleCache: Map<string, string>
  workflowRunId: string | null
}

const KNOWLEDGE_POLL_INTERVAL_MS = 1_800

export function KnowledgeQaPage() {
  const [question, setQuestion] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([])
  const [turns, setTurns] = useState<TurnState[]>([])
  const [isRestartingService, setIsRestartingService] = useState(false)
  const reportedWorkflowFailuresRef = useRef(new Set<string>())

  const { data: documents = [] } = useDocumentsQuery()
  const { data: orchestrationHealth } = useOrchestrationServiceHealthQuery()
  const { data: searchResults = [] } = useKnowledgeSearchQuery(
    searchQuery,
    selectedDocIds,
    searchQuery.length > 0
  )
  const startQaMutation = useStartKnowledgeQaMutation()
  const openReader = useAppUiStore((state) => state.openReader)
  const setActiveNavItem = useAppUiStore((state) => state.setActiveNavItem)

  const documentTitleLookup = useMemo(() => {
    const map = new Map<string, string>()
    for (const document of documents) {
      map.set(document.id, document.title)
    }
    return map
  }, [documents])

  const shouldWarnOrchestration =
    isTauriEnvironment() &&
    orchestrationHealth != null &&
    (!orchestrationHealth.endpoint ||
      orchestrationHealth.status === 'stopped' ||
      !orchestrationHealth.protocolCompatible)

  useEffect(() => {
    const pendingTurns = turns.filter(
      (turn) => turn.status === 'pending' && turn.workflowRunId != null
    )

    if (pendingTurns.length === 0) {
      return
    }

    let cancelled = false
    const timer = window.setTimeout(() => {
      void Promise.all(
        pendingTurns.map(async (turn) => {
          const workflowRunId = turn.workflowRunId
          if (!workflowRunId) {
            return null
          }

          try {
            const run = await orchestrationGateway.getRun(workflowRunId)
            if (!run) {
              return null
            }

            if (run.status === 'failed' || run.status === 'cancelled') {
              const failedMessage = run.errorMessage ?? 'Knowledge QA workflow failed'

              if (!reportedWorkflowFailuresRef.current.has(run.id)) {
                reportedWorkflowFailuresRef.current.add(run.id)
                reportFeedback({
                  scope: '知识问答',
                  title: '知识问答后台流程失败',
                  detail: failedMessage,
                  level: 'error',
                  showToast: false,
                })
              }

              return {
                turnId: turn.id,
                status: 'error' as const,
                errorMessage: failedMessage,
              }
            }

            if (run.status !== 'completed') {
              return null
            }

            const events = await orchestrationGateway.listEvents(run.id, 20)
            const result = extractKnowledgeQaResult(events, turn.documentTitleCache)

            return {
              turnId: turn.id,
              status: 'answered' as const,
              answer: result.answer,
              citations: result.citations,
              errorMessage: null,
            }
          } catch (error) {
            return {
              turnId: turn.id,
              status: 'error' as const,
              errorMessage: getErrorMessage(error, 'Failed to read knowledge QA result'),
            }
          }
        })
      ).then((updates) => {
        if (cancelled) return

        const updateMap = new Map(
          updates
            .filter((update): update is NonNullable<typeof update> => update != null)
            .map((update) => [update.turnId, update])
        )

        if (updateMap.size === 0) return

        setTurns((prev) =>
          prev.map((turn) => {
            const update = updateMap.get(turn.id)
            return update ? { ...turn, ...update } : turn
          })
        )
      })
    }, KNOWLEDGE_POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [turns])

  const handleRestartService = useCallback(async () => {
    setIsRestartingService(true)

    try {
      const restarted = await orchestrationGateway.restart()

      if (restarted.status !== 'healthy' && restarted.status !== 'degraded') {
        throw new Error(restarted.errorMessage ?? `Current service state: ${restarted.status}`)
      }

      reportFeedback({
        scope: '知识问答',
        title: '知识问答服务已重启',
        detail: restarted.endpoint ? `Service endpoint: ${restarted.endpoint}` : 'Service restored',
        level: 'info',
        showToast: true,
      })
    } catch (error) {
      reportAppError('知识问答', error, {
        title: '知识问答服务重启失败',
        showToast: true,
      })
    } finally {
      setIsRestartingService(false)
    }
  }, [])

  const handleAsk = useCallback(
    async (rawQuestion?: string) => {
      const q = (rawQuestion ?? question).trim()
      if (!q || startQaMutation.isPending || isRestartingService) return

      const turnId = `turn-${Date.now()}`
      const pendingTurn: TurnState = {
        id: turnId,
        question: q,
        answer: null,
        citations: [],
        status: 'pending',
        documentTitleCache: new Map(documentTitleLookup),
        workflowRunId: null,
      }

      setTurns((prev) => [pendingTurn, ...prev])
      setSearchQuery(q)
      setQuestion('')

      try {
        if (shouldWarnOrchestration) {
          await handleRestartService()
        }

        const run = await startQaMutation.mutateAsync({
          question: q,
          documentIds: selectedDocIds.length > 0 ? selectedDocIds : undefined,
        })

        setTurns((prev) =>
          prev.map((turn) =>
            turn.id === turnId
              ? {
                  ...turn,
                  workflowRunId: run.id,
                }
              : turn
          )
        )
      } catch (error) {
        const detail = reportAppError('知识问答', error, {
          title: '知识问答启动失败',
          showToast: true,
        })

        setTurns((prev) =>
          prev.map((turn) =>
            turn.id === turnId
              ? {
                  ...turn,
                  status: 'error',
                  errorMessage: detail,
                }
              : turn
          )
        )
      }
    },
    [
      documentTitleLookup,
      handleRestartService,
      isRestartingService,
      question,
      selectedDocIds,
      shouldWarnOrchestration,
      startQaMutation,
    ]
  )

  const toggleDoc = useCallback((docId: string) => {
    setSelectedDocIds((prev) =>
      prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId]
    )
  }, [])

  const handleRetry = useCallback(
    (turnId: string) => {
      const turn = turns.find((item) => item.id === turnId)
      if (!turn) return
      void handleAsk(turn.question)
    },
    [handleAsk, turns]
  )

  const latestCitations = turns.flatMap((turn) => turn.citations).slice(0, 6)

  return (
    <KnowledgeQaPageView
      question={question}
      documents={documents.map((doc) => ({ id: doc.id, title: doc.title }))}
      selectedDocumentIds={selectedDocIds}
      turns={turns.map((turn) => ({
        id: turn.id,
        question: turn.question,
        answer: turn.answer,
        status: turn.status,
        errorMessage: turn.errorMessage ?? null,
        citations: turn.citations.map((citation) => ({
          id: citation.id,
          documentId: citation.documentId,
          documentTitle: citation.documentTitle ?? 'Document',
          pageLabel: citation.page != null ? `P.${citation.page}` : 'Unknown page',
          snippet: citation.snippet,
        })),
      }))}
      citations={latestCitations.map((citation) => ({
        id: citation.id,
        documentId: citation.documentId,
        documentTitle: citation.documentTitle ?? 'Document',
        pageLabel: citation.page != null ? `P.${citation.page}` : 'Unknown page',
        snippet: citation.snippet,
      }))}
      searchResults={searchResults.map((chunk: ChunkSearchResult) => ({
        id: chunk.id,
        documentId: chunk.documentId,
        documentTitle: documentTitleLookup.get(chunk.documentId) ?? 'Document',
        pageLabel: `P.${chunk.pageStart ?? '?'}-${chunk.pageEnd ?? '?'}`,
        snippet: chunk.snippet || chunk.content,
      }))}
      isSubmitting={startQaMutation.isPending || isRestartingService}
      hasConfiguration
      serviceWarningTitle={shouldWarnOrchestration ? '知识问答服务当前不可用或协议不兼容' : null}
      serviceWarningMessage={orchestrationHealth?.errorMessage ?? null}
      isRestartingService={isRestartingService}
      onQuestionChange={setQuestion}
      onSubmit={() => {
        void handleAsk()
      }}
      onRetryQuestion={handleRetry}
      onToggleDocument={toggleDoc}
      onClearDocuments={() => setSelectedDocIds([])}
      onUsePrompt={setQuestion}
      onOpenCitation={(documentId) => openReader(documentId)}
      onRestartService={() => {
        void handleRestartService()
      }}
      onOpenSettings={() => setActiveNavItem('settings')}
    />
  )
}

function extractKnowledgeQaResult(
  events: WorkflowEvent[],
  documentTitleCache: Map<string, string>
) {
  const completedEvent = events.find(
    (event) => event.eventType === 'completed' && event.payload != null
  )
  const payload = completedEvent?.payload
  const answerPayload =
    payload && typeof payload === 'object' && payload['answer'] && typeof payload['answer'] === 'object'
      ? (payload['answer'] as Record<string, unknown>)
      : null

  const answer =
    answerPayload && typeof answerPayload['answer'] === 'string' && answerPayload['answer'].trim()
      ? answerPayload['answer']
      : 'Answer generated, but no displayable body was returned.'

  const citations = Array.isArray(answerPayload?.['citations'])
    ? answerPayload['citations'].flatMap((citation, index) =>
        normalizeKnowledgeCitation(citation, index, documentTitleCache)
      )
    : []

  return { answer, citations }
}

function normalizeKnowledgeCitation(
  rawCitation: unknown,
  index: number,
  documentTitleCache: Map<string, string>
) {
  if (!rawCitation || typeof rawCitation !== 'object') {
    return []
  }

  const citation = rawCitation as Record<string, unknown>
  const documentId = typeof citation['documentId'] === 'string' ? citation['documentId'] : null
  const snippetCandidate =
    typeof citation['snippet'] === 'string'
      ? citation['snippet']
      : typeof citation['quote'] === 'string'
        ? citation['quote']
        : ''

  if (!documentId || !snippetCandidate) {
    return []
  }

  return [
    {
      id: `${documentId}-${index}`,
      documentId,
      documentTitle: documentTitleCache.get(documentId) ?? 'Document',
      page: typeof citation['page'] === 'number' ? citation['page'] : null,
      snippet: snippetCandidate,
      relevance:
        typeof citation['relevanceScore'] === 'number' ? citation['relevanceScore'] : null,
    },
  ]
}
