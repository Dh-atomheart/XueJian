import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { KnowledgeQaPage as KnowledgeQaPageView } from '@/components/pages/knowledge-qa-page'
import {
  knowledgeQueryKeys,
  useCancelKnowledgeQaMessageMutation,
  useKnowledgeQaConversationQuery,
  useKnowledgeQaConversationsQuery,
  useKnowledgeSearchQuery,
  useSendKnowledgeQaMessageMutation,
} from '@/queries/knowledge'
import {
  apiConfigQueryKeys,
  useDocumentsQuery,
  useOrchestrationServiceHealthQuery,
} from '@/queries'
import { getErrorMessage, reportAppError, reportFeedback } from '@/lib/appFeedback'
import { useAppUiStore } from '@/store'
import { isTauriEnvironment } from '@/services/gateway'
import { embeddingProfileGateway } from '@/services/gateway/models'
import { orchestrationGateway } from '@/services/gateway/orchestration'
import type { ChunkSearchResult, KnowledgeQaMessage, WorkflowEvent } from '@/types'

type TurnState = {
  id: string
  question: string
  answer: string | null
  answerMode?: 'grounded' | 'no_relevant_content' | 'excerpt_fallback'
  retrievalStatus?: 'ready' | 'embedding_missing' | 'embedding_stale' | 'embedding_failed' | 'no_hits'
  citations: Array<{
    id: string
    documentId: string
    documentTitle: string
    page: number | null
    snippet: string
    relevance: number | null
  }>
  status: 'pending' | 'answered' | 'error' | 'cancelled'
  errorMessage?: string | null
  documentTitleCache: Map<string, string>
  workflowRunId: string | null
  assistantMessageId: string | null
}

const KNOWLEDGE_POLL_INTERVAL_MS = 1_800

type RetrievalStatus = NonNullable<TurnState['retrievalStatus']>
type AnswerMode = NonNullable<TurnState['answerMode']>
type QaDocument = {
  id: string
  title: string
  status: 'ready' | 'embedding_stale'
}

function isKnowledgeQaDocument(document: { id: string; title: string; status: string }): document is QaDocument {
  return document.status === 'ready' || document.status === 'embedding_stale'
}

export function KnowledgeQaPage() {
  const [question, setQuestion] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [turns, setTurns] = useState<TurnState[]>([])
  const [isRestartingService, setIsRestartingService] = useState(false)
  const reportedWorkflowFailuresRef = useRef(new Set<string>())
  const queryClient = useQueryClient()

  const { data: documents = [] } = useDocumentsQuery()
  const { data: activeEmbeddingProfile } = useQuery({
    queryKey: apiConfigQueryKeys.activeEmbeddingProfile,
    queryFn: () => embeddingProfileGateway.getActive(),
  })
  const { data: orchestrationHealth } = useOrchestrationServiceHealthQuery()
  const qaDocuments = useMemo<QaDocument[]>(
    () =>
      documents
        .filter(isKnowledgeQaDocument)
        .map((document) => ({
          id: document.id,
          title: document.title,
          status: document.status === 'embedding_stale' ? 'embedding_stale' : 'ready',
        })),
    [documents]
  )
  const qaDocumentIdSet = useMemo(() => new Set(qaDocuments.map((document) => document.id)), [qaDocuments])
  const scopedDocumentIds = useMemo(
    () => selectedDocIds.filter((documentId) => qaDocumentIdSet.has(documentId)),
    [qaDocumentIdSet, selectedDocIds]
  )
  const { data: searchResults = [] } = useKnowledgeSearchQuery(
    searchQuery,
    scopedDocumentIds,
    searchQuery.length > 0
  )
  const { data: conversations = [] } = useKnowledgeQaConversationsQuery()
  const { data: activeConversationDetail } = useKnowledgeQaConversationQuery(
    activeConversationId,
    Boolean(activeConversationId),
  )
  const sendQaMutation = useSendKnowledgeQaMessageMutation()
  const cancelQaMutation = useCancelKnowledgeQaMessageMutation()
  const openReader = useAppUiStore((state) => state.openReader)
  const setActiveNavItem = useAppUiStore((state) => state.setActiveNavItem)
  const knowledgeDraft = useAppUiStore((state) => state.knowledgeDraft)
  const clearKnowledgeDraft = useAppUiStore((state) => state.clearKnowledgeDraft)

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
    setSelectedDocIds((previous) => previous.filter((documentId) => qaDocumentIdSet.has(documentId)))
  }, [qaDocumentIdSet])

  useEffect(() => {
    if (!activeConversationId && conversations.length > 0) {
      setActiveConversationId(conversations[0].id)
    }
  }, [activeConversationId, conversations])

  useEffect(() => {
    const hasPendingMessage = activeConversationDetail?.messages.some(
      (message) => message.role === 'assistant' && message.status === 'pending'
    )
    if (!activeConversationId || !hasPendingMessage) {
      return
    }

    const timer = window.setInterval(() => {
      void queryClient.invalidateQueries({
        queryKey: knowledgeQueryKeys.conversation(activeConversationId),
      })
    }, KNOWLEDGE_POLL_INTERVAL_MS)

    return () => window.clearInterval(timer)
  }, [activeConversationDetail?.messages, activeConversationId, queryClient])

  useEffect(() => {
    if (
      !knowledgeDraft.question &&
      knowledgeDraft.selectedDocumentIds.length === 0
    ) {
      return
    }

    if (knowledgeDraft.question) {
      setQuestion((current) => current || knowledgeDraft.question || '')
      setSearchQuery((current) => current || knowledgeDraft.question || '')
    }

    if (knowledgeDraft.selectedDocumentIds.length > 0) {
      setSelectedDocIds(
        knowledgeDraft.selectedDocumentIds.filter((documentId) => qaDocumentIdSet.has(documentId))
      )
    }

    clearKnowledgeDraft()
  }, [clearKnowledgeDraft, knowledgeDraft, qaDocumentIdSet])

  const retrievalWarning = useMemo(() => {
    if (shouldWarnOrchestration) {
      return {
        title: '知识问答服务当前不可用或协议不兼容',
        message: orchestrationHealth?.errorMessage ?? null,
      }
    }

    if (!activeEmbeddingProfile) {
      return {
        title: '当前未配置激活的嵌入模型',
        message:
          '限定文档范围的知识问答依赖嵌入索引。请先在设置中配置嵌入模型，并为文档生成向量索引。',
      }
    }

    if (documents.length > 0 && qaDocuments.length === 0) {
      return {
        title: '当前没有可用于知识问答的文档',
        message: '请先完成解析和向量索引生成；只有状态为“可用”或“待更新”的文档才会出现在这里。',
      }
    }

    if (qaDocuments.some((document) => document.status === 'embedding_stale')) {
      return {
        title: '部分文档的向量索引已过期',
        message: '这些文档仍可查询，但结果可能不稳定。建议重新生成向量索引。',
      }
    }

    return { title: null, message: null }
  }, [activeEmbeddingProfile, documents.length, orchestrationHealth?.errorMessage, qaDocuments, shouldWarnOrchestration])

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
              answerMode: result.answerMode,
              retrievalStatus: result.retrievalStatus,
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
        if (cancelled) {
          return
        }

        const updateMap = new Map(
          updates
            .filter((update): update is NonNullable<typeof update> => update != null)
            .map((update) => [update.turnId, update])
        )

        if (updateMap.size === 0) {
          return
        }

        setTurns((previous) =>
          previous.map((turn) => {
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
      const trimmedQuestion = (rawQuestion ?? question).trim()
      if (!trimmedQuestion || sendQaMutation.isPending || isRestartingService) {
        return
      }

      setSearchQuery(trimmedQuestion)
      setQuestion('')

      try {
        if (shouldWarnOrchestration) {
          await handleRestartService()
        }

        const result = await sendQaMutation.mutateAsync({
          conversationId: activeConversationId,
          question: trimmedQuestion,
          documentIds: scopedDocumentIds.length > 0 ? scopedDocumentIds : undefined,
        })

        setActiveConversationId(result.conversation.id)
        await queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.conversations() })
        await queryClient.invalidateQueries({
          queryKey: knowledgeQueryKeys.conversation(result.conversation.id),
        })
      } catch (error) {
        reportAppError('知识问答', error, {
          title: '知识问答启动失败',
          showToast: true,
        })
      }
    },
    [
      activeConversationId,
      handleRestartService,
      isRestartingService,
      question,
      queryClient,
      scopedDocumentIds,
      sendQaMutation,
      shouldWarnOrchestration,
    ]
  )

  const toggleDoc = useCallback((docId: string) => {
    if (!qaDocumentIdSet.has(docId)) {
      return
    }

    setSelectedDocIds((previous) =>
      previous.includes(docId)
        ? previous.filter((existingId) => existingId !== docId)
        : [...previous, docId]
    )
  }, [qaDocumentIdSet])

  const persistedTurns = useMemo(
    () => buildTurnsFromMessages(activeConversationDetail?.messages ?? [], documentTitleLookup),
    [activeConversationDetail?.messages, documentTitleLookup]
  )

  const handleRetry = useCallback(
    (turnId: string) => {
      const turn = persistedTurns.find((item) => item.id === turnId)
      if (!turn) {
        return
      }
      void handleAsk(turn.question)
    },
    [handleAsk, persistedTurns]
  )

  const handleCancel = useCallback(
    async (turnId: string) => {
      const turn = persistedTurns.find((item) => item.id === turnId)
      if (!turn?.assistantMessageId) {
        return
      }
      try {
        await cancelQaMutation.mutateAsync(turn.assistantMessageId)
        if (activeConversationId) {
          await queryClient.invalidateQueries({
            queryKey: knowledgeQueryKeys.conversation(activeConversationId),
          })
        }
      } catch (error) {
        reportAppError('知识问答', error, {
          title: '停止回答失败',
          showToast: true,
        })
      }
    },
    [activeConversationId, cancelQaMutation, persistedTurns, queryClient]
  )

  const latestCitations = persistedTurns.flatMap((turn) => turn.citations).slice(0, 6)

  return (
    <KnowledgeQaPageView
      question={question}
      documents={qaDocuments}
      selectedDocumentIds={scopedDocumentIds}
      turns={persistedTurns.map((turn) => ({
        id: turn.id,
        question: turn.question,
        answer: turn.answer,
        answerMode: turn.answerMode ?? null,
        retrievalStatus: turn.retrievalStatus ?? null,
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
      isSubmitting={sendQaMutation.isPending || isRestartingService}
      hasConfiguration
      serviceWarningTitle={retrievalWarning.title}
      serviceWarningMessage={retrievalWarning.message}
      isRestartingService={isRestartingService}
      onQuestionChange={setQuestion}
      onSubmit={() => {
        void handleAsk()
      }}
      onRetryQuestion={handleRetry}
      onCancelQuestion={handleCancel}
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

function buildTurnsFromMessages(
  messages: KnowledgeQaMessage[],
  documentTitleCache: Map<string, string>
): TurnState[] {
  const turns: TurnState[] = []
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index]
    if (message.role !== 'user') {
      continue
    }

    const assistant = messages
      .slice(index + 1)
      .find((candidate) => candidate.role === 'assistant') ?? null
    const result = extractKnowledgeQaAnswerPayload(assistant?.answerPayload ?? null, documentTitleCache)

    turns.unshift({
      id: assistant?.id ?? message.id,
      question: message.content,
      answer: assistant?.content || result.answer,
      answerMode: result.answerMode,
      retrievalStatus: result.retrievalStatus,
      citations: result.citations,
      status: assistant?.status ?? 'error',
      errorMessage: assistant?.errorMessage ?? null,
      documentTitleCache: new Map(documentTitleCache),
      workflowRunId: assistant?.workflowRunId ?? null,
      assistantMessageId: assistant?.id ?? null,
    })
  }
  return turns
}

function extractKnowledgeQaAnswerPayload(
  payload: Record<string, unknown> | null,
  documentTitleCache: Map<string, string>
) {
  const answerPayload =
    payload && typeof payload['answer'] === 'object' && payload['answer'] != null
      ? (payload['answer'] as Record<string, unknown>)
      : null

  return normalizeKnowledgeQaAnswer(answerPayload, documentTitleCache)
}

export function extractKnowledgeQaResult(
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

  return normalizeKnowledgeQaAnswer(answerPayload, documentTitleCache)
}

function normalizeKnowledgeQaAnswer(
  answerPayload: Record<string, unknown> | null,
  documentTitleCache: Map<string, string>
) {
  const answer =
    answerPayload && typeof answerPayload['answer'] === 'string' && answerPayload['answer'].trim()
      ? answerPayload['answer']
      : 'Answer generated, but no displayable body was returned.'

  const answerMode: AnswerMode =
    answerPayload &&
    (answerPayload['answerMode'] === 'grounded' ||
      answerPayload['answerMode'] === 'no_relevant_content' ||
      answerPayload['answerMode'] === 'excerpt_fallback')
      ? answerPayload['answerMode']
      : 'grounded'

  const retrievalStatus: RetrievalStatus =
    answerPayload &&
    (answerPayload['retrievalStatus'] === 'ready' ||
      answerPayload['retrievalStatus'] === 'embedding_missing' ||
      answerPayload['retrievalStatus'] === 'embedding_stale' ||
      answerPayload['retrievalStatus'] === 'embedding_failed' ||
      answerPayload['retrievalStatus'] === 'no_hits')
      ? answerPayload['retrievalStatus']
      : 'ready'

  const citations = Array.isArray(answerPayload?.['citations'])
    ? answerPayload['citations'].flatMap((citation, index) =>
        normalizeKnowledgeCitation(citation, index, documentTitleCache)
      )
    : []

  return { answer, answerMode, retrievalStatus, citations }
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
