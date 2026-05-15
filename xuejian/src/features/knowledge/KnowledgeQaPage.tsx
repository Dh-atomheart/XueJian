import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { KnowledgeQaPage as KnowledgeQaPageView } from '@/components/pages/knowledge-qa-page'
import {
  knowledgeQueryKeys,
  useCancelKnowledgeQaMessageMutation,
  useDeleteKnowledgeQaConversationMutation,
  useDeleteKnowledgeQaTurnMutation,
  useKnowledgeQaConversationQuery,
  useKnowledgeQaConversationsQuery,
  useRegenerateKnowledgeQaTurnMutation,
  useSendKnowledgeQaMessageMutation,
} from '@/queries/knowledge'
import { useWorkflowEventsQuery } from '@/queries/orchestration'
import {
  apiConfigQueryKeys,
  documentsQueryKeys,
  useDocumentsQuery,
  useOrchestrationServiceHealthQuery,
} from '@/queries'
import { reportAppError } from '@/lib/appFeedback'
import { useAppUiStore } from '@/store'
import { isTauriEnvironment } from '@/services/gateway'
import { embeddingProfileGateway } from '@/services/gateway/models'
import { orchestrationGateway } from '@/services/gateway/orchestration'
import type {
  AgentToolInvocation,
  KnowledgeQaMessage,
  RagProgressEventPayload,
  RagProgressStep,
  RagProgressStepKey,
  RagProgressStepStatus,
  RagTrace,
  WorkflowEvent,
} from '@/types'

type RetrievalStatus =
  | 'ready'
  | 'embedding_missing'
  | 'embedding_stale'
  | 'embedding_failed'
  | 'embedding_config_error'
  | 'embedding_auth_error'
  | 'embedding_timeout'
  | 'embedding_rate_limited'
  | 'embedding_dimension_mismatch'
  | 'embedding_network_error'
  | 'query_embedding_failed'
  | 'no_hits'
type AnswerMode = 'grounded' | 'no_relevant_content' | 'excerpt_fallback'

type TurnState = {
  id: string
  question: string
  answer: string | null
  answerMode?: AnswerMode
  retrievalStatus?: RetrievalStatus
  ragTrace?: RagTrace | null
  agentTrace?: AgentToolInvocation[] | null
  sessionMemoryUsed?: boolean
  sessionMemorySummary?: string | null
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
  workflowRunId: string | null
  assistantMessageId: string | null
}

type QaDocument = {
  id: string
  title: string
  status: 'ready' | 'embedding_missing' | 'embedding_stale' | 'embedding_failed'
}

const KNOWLEDGE_POLL_INTERVAL_MS = 1_800
const RAG_PROGRESS_POLL_INTERVAL_MS = 1_200

function isKnowledgeQaDocument(document: {
  id: string
  title: string
  status: string
}): document is QaDocument {
  return (
    document.status === 'ready' ||
    document.status === 'embedding_stale' ||
    document.status === 'embedding_failed' ||
    document.status === 'embedding' ||
    document.status === 'parsed'
  )
}

export function KnowledgeQaPage() {
  const [question, setQuestion] = useState('')
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [hasInitializedConversation, setHasInitializedConversation] = useState(false)
  const [isRestartingService, setIsRestartingService] = useState(false)
  const queryClient = useQueryClient()

  const { data: documents = [] } = useDocumentsQuery()
  const {
    data: activeEmbeddingProfile,
    isPending: isEmbeddingProfileLoading,
    isError: isEmbeddingProfileError,
  } = useQuery({
    queryKey: apiConfigQueryKeys.activeEmbeddingProfile,
    queryFn: () => embeddingProfileGateway.getActive(),
  })
  const { data: orchestrationHealth } = useOrchestrationServiceHealthQuery()
  const { data: conversations = [] } = useKnowledgeQaConversationsQuery()
  const { data: activeConversationDetail } = useKnowledgeQaConversationQuery(
    activeConversationId,
    Boolean(activeConversationId)
  )
  const sendQaMutation = useSendKnowledgeQaMessageMutation()
  const regenerateQaMutation = useRegenerateKnowledgeQaTurnMutation()
  const cancelQaMutation = useCancelKnowledgeQaMessageMutation()
  const deleteConversationMutation = useDeleteKnowledgeQaConversationMutation()
  const deleteTurnMutation = useDeleteKnowledgeQaTurnMutation()

  const setActiveNavItem = useAppUiStore((state) => state.setActiveNavItem)
  const knowledgeDraft = useAppUiStore((state) => state.knowledgeDraft)
  const clearKnowledgeDraft = useAppUiStore((state) => state.clearKnowledgeDraft)

  const qaDocuments = useMemo<QaDocument[]>(
    () =>
      documents.filter(isKnowledgeQaDocument).map((document) => ({
        id: document.id,
        title: document.title,
        status:
          document.status === 'ready'
            ? 'ready'
            : document.status === 'embedding_stale'
              ? 'embedding_stale'
              : document.status === 'embedding_failed'
                ? 'embedding_failed'
                : 'embedding_missing',
      })),
    [documents]
  )
  const qaDocumentIdSet = useMemo(
    () => new Set(qaDocuments.map((document) => document.id)),
    [qaDocuments]
  )
  const readyDocumentIdSet = useMemo(
    () =>
      new Set(
        qaDocuments.filter((document) => document.status === 'ready').map((document) => document.id)
      ),
    [qaDocuments]
  )
  const scopedDocumentIds = useMemo(
    () => selectedDocIds.filter((documentId) => qaDocumentIdSet.has(documentId)),
    [qaDocumentIdSet, selectedDocIds]
  )
  const selectedDocuments = useMemo(
    () =>
      scopedDocumentIds.flatMap((documentId) => {
        const document = qaDocuments.find((candidate) => candidate.id === documentId)
        return document ? [document] : []
      }),
    [qaDocuments, scopedDocumentIds]
  )
  const selectedUnavailableDocument =
    selectedDocuments.find((document) => document.status !== 'ready') ?? null
  const effectiveReadyDocumentIds = useMemo(
    () => scopedDocumentIds.filter((documentId) => readyDocumentIdSet.has(documentId)),
    [readyDocumentIdSet, scopedDocumentIds]
  )
  const hasPendingTurn = useMemo(
    () =>
      activeConversationDetail?.messages.some(
        (message) => message.role === 'assistant' && message.status === 'pending'
      ) ?? false,
    [activeConversationDetail?.messages]
  )

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
    setSelectedDocIds((previous) =>
      previous.filter((documentId) => qaDocumentIdSet.has(documentId))
    )
  }, [qaDocumentIdSet])

  useEffect(() => {
    if (!hasInitializedConversation && !activeConversationId && conversations.length > 0) {
      setActiveConversationId(conversations[0].id)
      setHasInitializedConversation(true)
    } else if (!hasInitializedConversation && conversations.length === 0) {
      setHasInitializedConversation(true)
    }
  }, [activeConversationId, conversations, hasInitializedConversation])

  useEffect(() => {
    if (!activeConversationId) {
      return
    }
    const hasPendingMessage = activeConversationDetail?.messages.some(
      (message) => message.role === 'assistant' && message.status === 'pending'
    )
    if (!hasPendingMessage) {
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
    if (!knowledgeDraft.question && knowledgeDraft.selectedDocumentIds.length === 0) {
      return
    }

    if (knowledgeDraft.question) {
      setQuestion((current) => current || knowledgeDraft.question || '')
    }

    if (knowledgeDraft.selectedDocumentIds.length > 0) {
      setSelectedDocIds(
        knowledgeDraft.selectedDocumentIds.filter((documentId) => qaDocumentIdSet.has(documentId))
      )
    }

    clearKnowledgeDraft()
  }, [clearKnowledgeDraft, knowledgeDraft, qaDocumentIdSet])

  const retrievalWarning = useMemo(() => {
    if (isEmbeddingProfileLoading) {
      return { title: null, message: null }
    }
    if (isEmbeddingProfileError) {
      return {
        title: '无法读取 embedding 配置',
        message: '请确认设置页中的 embedding 模型配置可用，然后重试知识问答。',
      }
    }
    if (shouldWarnOrchestration) {
      return {
        title: '知识问答服务当前不可用',
        message: orchestrationHealth?.errorMessage ?? null,
      }
    }
    if (!activeEmbeddingProfile) {
      return {
        title: '当前没有启用的 embedding 模型',
        message: 'RAG 问答必须依赖文档向量。请先在设置中配置 embedding，并为文档生成向量。',
      }
    }
    if (documents.length > 0 && qaDocuments.length === 0) {
      return {
        title: '当前没有可用于 RAG 问答的文档',
        message: '请先完成文档解析和向量生成。未向量化文档不会进入正式回答链路。',
      }
    }
    if (qaDocuments.some((document) => document.status === 'embedding_missing')) {
      return {
        title: '部分文档尚未生成向量',
        message: '知识问答只基于已向量化文档回答。请回到文档库为这些文档生成向量索引。',
      }
    }
    if (qaDocuments.some((document) => document.status === 'embedding_stale')) {
      return {
        title: '部分文档的向量已过期',
        message: '如果选择这些文档提问，系统会阻止正式回答。请先重新生成向量。',
      }
    }
    if (qaDocuments.some((document) => document.status === 'embedding_failed')) {
      return {
        title: '部分文档向量生成失败',
        message: '请在文档库重试向量生成，成功后再用于知识问答。',
      }
    }
    return { title: null, message: null }
  }, [
    activeEmbeddingProfile,
    documents.length,
    isEmbeddingProfileError,
    isEmbeddingProfileLoading,
    orchestrationHealth?.errorMessage,
    qaDocuments,
    shouldWarnOrchestration,
  ])

  const submitDisabledReason = useMemo(() => {
    if (hasPendingTurn) {
      return '当前回答生成完成后才能继续提问'
    }
    if (isEmbeddingProfileLoading) {
      return '正在检测嵌入模型配置。'
    }
    if (isEmbeddingProfileError || !activeEmbeddingProfile) {
      return '请先在设置中配置嵌入模型，并为文档生成向量索引。'
    }
    if (shouldWarnOrchestration) {
      return '知识问答服务当前不可用，请先重启服务。'
    }
    if (qaDocuments.length === 0 || !qaDocuments.some((document) => document.status === 'ready')) {
      return '当前没有已向量化文档，请先在文档库生成向量索引。'
    }
    if (selectedUnavailableDocument) {
      if (selectedUnavailableDocument.status === 'embedding_stale') {
        return `“${selectedUnavailableDocument.title}”的向量已过期，请重新生成向量后再提问。`
      }
      if (selectedUnavailableDocument.status === 'embedding_failed') {
        return `“${selectedUnavailableDocument.title}”向量生成失败，请重试生成向量后再提问。`
      }
      return `“${selectedUnavailableDocument.title}”尚未生成向量，请先生成向量后再提问。`
    }
    return null
  }, [
    activeEmbeddingProfile,
    hasPendingTurn,
    isEmbeddingProfileError,
    isEmbeddingProfileLoading,
    qaDocuments,
    selectedUnavailableDocument,
    shouldWarnOrchestration,
  ])

  const handleRestartService = useCallback(async (): Promise<boolean> => {
    setIsRestartingService(true)
    try {
      const restarted = await orchestrationGateway.restart()
      return restarted.status === 'healthy' || restarted.status === 'degraded'
    } catch (error) {
      reportAppError('知识问答', error, {
        title: '知识问答服务重启失败',
        showToast: true,
      })
      return false
    } finally {
      setIsRestartingService(false)
    }
  }, [])

  const handleAsk = useCallback(
    async (rawQuestion?: string) => {
      const trimmedQuestion = (rawQuestion ?? question).trim()
      if (
        !trimmedQuestion ||
        sendQaMutation.isPending ||
        regenerateQaMutation.isPending ||
        isRestartingService ||
        hasPendingTurn ||
        submitDisabledReason
      ) {
        return
      }

      setQuestion('')

      try {
        if (shouldWarnOrchestration) {
          const restarted = await handleRestartService()
          if (!restarted) {
            return
          }
        }

        const result = await sendQaMutation.mutateAsync({
          conversationId: activeConversationId,
          question: trimmedQuestion,
          documentIds: effectiveReadyDocumentIds.length > 0 ? effectiveReadyDocumentIds : undefined,
        })

        setActiveConversationId(result.conversation.id)
        await queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.conversations() })
        await queryClient.invalidateQueries({
          queryKey: knowledgeQueryKeys.conversation(result.conversation.id),
        })
        await queryClient.invalidateQueries({ queryKey: documentsQueryKeys.all })
      } catch (error) {
        reportAppError('知识问答', error, {
          title: '发送问题失败',
          showToast: true,
        })
      }
    },
    [
      activeConversationId,
      effectiveReadyDocumentIds,
      handleRestartService,
      hasPendingTurn,
      isRestartingService,
      question,
      queryClient,
      regenerateQaMutation.isPending,
      sendQaMutation,
      shouldWarnOrchestration,
      submitDisabledReason,
    ]
  )

  const toggleDoc = useCallback(
    (docId: string) => {
      if (!qaDocumentIdSet.has(docId)) {
        return
      }
      setSelectedDocIds((previous) =>
        previous.includes(docId)
          ? previous.filter((existingId) => existingId !== docId)
          : [...previous, docId]
      )
    },
    [qaDocumentIdSet]
  )

  const persistedTurns = useMemo(
    () => buildTurnsFromMessages(activeConversationDetail?.messages ?? [], documentTitleLookup),
    [activeConversationDetail?.messages, documentTitleLookup]
  )
  const pendingTurnWithRun = useMemo(
    () => persistedTurns.find((turn) => turn.status === 'pending' && turn.workflowRunId),
    [persistedTurns]
  )
  const { data: pendingWorkflowEvents = [] } = useWorkflowEventsQuery(
    pendingTurnWithRun?.workflowRunId ?? null,
    32,
    { refetchInterval: pendingTurnWithRun ? RAG_PROGRESS_POLL_INTERVAL_MS : false }
  )
  const pendingRagProgressSteps = useMemo(
    () => buildRagProgressStepsFromEvents(pendingWorkflowEvents),
    [pendingWorkflowEvents]
  )

  const handleRetry = useCallback(
    async (turnId: string) => {
      if (hasPendingTurn || regenerateQaMutation.isPending || sendQaMutation.isPending) {
        return
      }
      const turn = persistedTurns.find((item) => item.id === turnId)
      const messageId = turn?.assistantMessageId ?? turn?.id
      if (!messageId) {
        return
      }
      try {
        const result = await regenerateQaMutation.mutateAsync(messageId)
        setActiveConversationId(result.conversation.id)
        await queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.conversations() })
        await queryClient.invalidateQueries({
          queryKey: knowledgeQueryKeys.conversation(result.conversation.id),
        })
        await queryClient.invalidateQueries({ queryKey: documentsQueryKeys.all })
      } catch (error) {
        reportAppError('Knowledge Q&A', error, {
          title: '重新生成回答失败',
          showToast: true,
        })
      }
    },
    [hasPendingTurn, persistedTurns, queryClient, regenerateQaMutation, sendQaMutation.isPending]
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
          title: '取消回答失败',
          showToast: true,
        })
      }
    },
    [activeConversationId, cancelQaMutation, persistedTurns, queryClient]
  )

  const handleDeleteConversation = useCallback(
    async (conversationId: string) => {
      try {
        await deleteConversationMutation.mutateAsync(conversationId)
        if (activeConversationId === conversationId) {
          setActiveConversationId(null)
          setQuestion('')
        }
        queryClient.removeQueries({
          queryKey: knowledgeQueryKeys.conversation(conversationId),
        })
        await queryClient.invalidateQueries({
          queryKey: knowledgeQueryKeys.conversations(),
        })
      } catch (error) {
        reportAppError('Knowledge Q&A', error, {
          title: '删除对话失败',
          showToast: true,
        })
      }
    },
    [activeConversationId, deleteConversationMutation, queryClient]
  )

  const handleDeleteTurn = useCallback(
    async (turnId: string) => {
      if (!activeConversationId) {
        return
      }
      try {
        await deleteTurnMutation.mutateAsync(turnId)
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: knowledgeQueryKeys.conversation(activeConversationId),
          }),
          queryClient.invalidateQueries({
            queryKey: knowledgeQueryKeys.conversations(),
          }),
        ])
      } catch (error) {
        reportAppError('Knowledge Q&A', error, {
          title: '删除问答失败',
          showToast: true,
        })
      }
    },
    [activeConversationId, deleteTurnMutation, queryClient]
  )

  const latestCitations = persistedTurns.flatMap((turn) => turn.citations).slice(0, 6)

  return (
    <KnowledgeQaPageView
      question={question}
      documents={qaDocuments}
      selectedDocumentIds={scopedDocumentIds}
      conversations={conversations}
      activeConversationId={activeConversationId}
      turns={persistedTurns.map((turn) => ({
        id: turn.id,
        question: turn.question,
        answer: turn.answer,
        answerMode: turn.answerMode ?? null,
        retrievalStatus: turn.retrievalStatus ?? null,
        ragTrace: turn.ragTrace ?? null,
        ragProgressSteps:
          turn.status === 'pending' && turn.workflowRunId === pendingTurnWithRun?.workflowRunId
            ? pendingRagProgressSteps
            : [],
        status: turn.status,
        errorMessage: turn.errorMessage ?? null,
        citations: turn.citations.map((citation) => ({
          id: citation.id,
          documentId: citation.documentId,
          documentTitle: citation.documentTitle,
          pageLabel: citation.page != null ? `P.${citation.page}` : '未知页码',
          snippet: citation.snippet,
        })),
      }))}
      citations={latestCitations.map((citation) => ({
        id: citation.id,
        documentId: citation.documentId,
        documentTitle: citation.documentTitle,
        pageLabel: citation.page != null ? `P.${citation.page}` : '未知页码',
        snippet: citation.snippet,
      }))}
      searchResults={[]}
      isSubmitting={
        sendQaMutation.isPending ||
        regenerateQaMutation.isPending ||
        isRestartingService ||
        hasPendingTurn
      }
      isRegenerateDisabled={
        regenerateQaMutation.isPending || sendQaMutation.isPending || hasPendingTurn
      }
      hasConfiguration
      submitDisabledReason={submitDisabledReason}
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
      onOpenCitation={() => undefined}
      onSelectConversation={setActiveConversationId}
      onNewConversation={() => {
        setActiveConversationId(null)
        setQuestion('')
      }}
      onDeleteConversation={(conversationId) => {
        void handleDeleteConversation(conversationId)
      }}
      onDeleteTurn={(turnId) => {
        void handleDeleteTurn(turnId)
      }}
      onRestartService={() => {
        void handleRestartService()
      }}
      onOpenSettings={() => setActiveNavItem('settings')}
    />
  )
}

export function buildTurnsFromMessages(
  messages: KnowledgeQaMessage[],
  documentTitleCache: Map<string, string>
): TurnState[] {
  const turns: TurnState[] = []
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index]
    if (message.role !== 'user') {
      continue
    }

    const assistant =
      messages.slice(index + 1).find((candidate) => candidate.role === 'assistant') ?? null
    const result = extractKnowledgeQaAnswerPayload(
      assistant?.answerPayload ?? null,
      documentTitleCache
    )

    turns.push({
      id: assistant?.id ?? message.id,
      question: message.content,
      answer: assistant?.content || result.answer,
      answerMode: result.answerMode,
      retrievalStatus: result.retrievalStatus,
      ragTrace: result.ragTrace,
      agentTrace: result.agentTrace,
      sessionMemoryUsed: result.sessionMemoryUsed,
      sessionMemorySummary: result.sessionMemorySummary,
      citations: result.citations,
      status: assistant?.status ?? 'error',
      errorMessage: assistant?.errorMessage ?? null,
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
    payload &&
    typeof payload === 'object' &&
    payload['answer'] &&
    typeof payload['answer'] === 'object'
      ? (payload['answer'] as Record<string, unknown>)
      : null

  return normalizeKnowledgeQaAnswer(answerPayload, documentTitleCache)
}

const RAG_PROGRESS_STEP_KEYS: RagProgressStepKey[] = [
  'query_embedding',
  'rewrite',
  'retrieve',
  'rerank',
  'gate',
  'second_retrieval',
  'pack',
  'generate',
  'audit',
]

const RAG_PROGRESS_STATUSES: RagProgressStepStatus[] = [
  'pending',
  'running',
  'completed',
  'skipped',
  'failed',
]

export function buildRagProgressStepsFromEvents(events: WorkflowEvent[]): RagProgressStep[] {
  return events
    .flatMap((event, eventIndex) =>
      normalizeRagProgressEvent(event).map((step) => ({ ...step, eventIndex }))
    )
    .sort((left, right) => {
      const timeDiff = left.createdAt.getTime() - right.createdAt.getTime()
      if (timeDiff !== 0) {
        return timeDiff
      }
      return right.eventIndex - left.eventIndex
    })
    .map(({ eventIndex: _eventIndex, ...step }) => step)
}

function normalizeRagProgressEvent(event: WorkflowEvent): RagProgressStep[] {
  if (event.eventType === 'queued') {
    return [
      {
        id: `${event.runId}-queued-${event.createdAt.getTime()}`,
        stepKey: 'query_embedding',
        status: 'pending',
        title: '准备检索',
        detail: event.message ?? '知识问答已排队',
        progress: event.progress ?? 0,
        metrics: {},
        createdAt: event.createdAt,
      },
    ]
  }

  if (event.eventType === 'started') {
    return [
      {
        id: `${event.runId}-started-${event.createdAt.getTime()}`,
        stepKey: 'query_embedding',
        status: 'running',
        title: '理解问题',
        detail: event.message ?? '正在启动检索流程',
        progress: event.progress ?? 0.1,
        metrics: {},
        createdAt: event.createdAt,
      },
    ]
  }

  if (event.eventType !== 'progress') {
    return []
  }

  const payload = parseRagProgressPayload(event.payload)
  if (!payload) {
    return []
  }

  return [
    {
      id: `${event.runId}-${payload.stepKey}-${event.createdAt.getTime()}`,
      stepKey: payload.stepKey,
      status: payload.status,
      title: payload.title ?? null,
      detail: payload.detail ?? event.message,
      progress: payload.progress ?? event.progress,
      metrics: payload.metrics ?? {},
      createdAt: event.createdAt,
    },
  ]
}

function parseRagProgressPayload(
  payload: Record<string, unknown> | null
): RagProgressEventPayload | null {
  if (!payload) {
    return null
  }

  const stepKey = payload['stepKey']
  const status = payload['status']
  if (
    typeof stepKey !== 'string' ||
    !RAG_PROGRESS_STEP_KEYS.includes(stepKey as RagProgressStepKey) ||
    typeof status !== 'string' ||
    !RAG_PROGRESS_STATUSES.includes(status as RagProgressStepStatus)
  ) {
    return null
  }

  return {
    stepKey: stepKey as RagProgressStepKey,
    status: status as RagProgressStepStatus,
    title: typeof payload['title'] === 'string' ? payload['title'] : null,
    detail: typeof payload['detail'] === 'string' ? payload['detail'] : null,
    progress: asNullableNumber(payload['progress']),
    metrics: normalizeRagProgressMetrics(payload['metrics']),
  }
}

function normalizeRagProgressMetrics(value: unknown) {
  if (!isRecord(value)) {
    return {}
  }

  const metrics: Record<string, string | number | boolean | null> = {}
  for (const [key, metricValue] of Object.entries(value)) {
    if (
      typeof metricValue === 'string' ||
      typeof metricValue === 'number' ||
      typeof metricValue === 'boolean' ||
      metricValue === null
    ) {
      metrics[key] = metricValue
    }
  }
  return metrics
}

function normalizeKnowledgeQaAnswer(
  answerPayload: Record<string, unknown> | null,
  documentTitleCache: Map<string, string>
) {
  const answer =
    answerPayload && typeof answerPayload['answer'] === 'string' && answerPayload['answer'].trim()
      ? answerPayload['answer']
      : '回答已生成，但没有返回可展示的正文。'

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
      answerPayload['retrievalStatus'] === 'embedding_config_error' ||
      answerPayload['retrievalStatus'] === 'embedding_auth_error' ||
      answerPayload['retrievalStatus'] === 'embedding_timeout' ||
      answerPayload['retrievalStatus'] === 'embedding_rate_limited' ||
      answerPayload['retrievalStatus'] === 'embedding_dimension_mismatch' ||
      answerPayload['retrievalStatus'] === 'embedding_network_error' ||
      answerPayload['retrievalStatus'] === 'query_embedding_failed' ||
      answerPayload['retrievalStatus'] === 'no_hits')
      ? answerPayload['retrievalStatus']
      : 'ready'

  const citations = Array.isArray(answerPayload?.['citations'])
    ? answerPayload['citations'].flatMap((citation, index) =>
        normalizeKnowledgeCitation(citation, index, documentTitleCache)
      )
    : []

  const ragTrace = normalizeRagTrace(answerPayload?.['ragTrace'])
  const agentTrace = normalizeAgentTrace(answerPayload?.['agentTrace'])
  const sessionMemoryUsed = Boolean(answerPayload?.['sessionMemoryUsed'])
  const sessionMemorySummary =
    typeof answerPayload?.['sessionMemorySummary'] === 'string'
      ? answerPayload['sessionMemorySummary']
      : null

  return {
    answer,
    answerMode,
    retrievalStatus,
    citations,
    ragTrace,
    agentTrace,
    sessionMemoryUsed,
    sessionMemorySummary,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function asNullableString(value: unknown) {
  return typeof value === 'string' ? value : null
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asNullableNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizeRetrievalSummary(rawSummary: unknown): RagTrace['retrievalSummary'] {
  if (!isRecord(rawSummary)) {
    return {
      chunkCount: 0,
      retrievedDocumentCount: 0,
      lexicalStatus: 'not_used',
      retrievalMode: 'hybrid',
    }
  }

  return {
    chunkCount: asNumber(rawSummary['chunkCount']),
    retrievedDocumentCount: asNumber(rawSummary['retrievedDocumentCount']),
    lexicalStatus: asString(rawSummary['lexicalStatus'], 'not_used'),
    retrievalMode: asString(rawSummary['retrievalMode'], 'hybrid'),
  }
}

function normalizeRewriteSummary(rawSummary: unknown): RagTrace['rewriteSummary'] {
  if (!isRecord(rawSummary)) {
    return undefined
  }

  return {
    status: asString(rawSummary['status'], 'not_run'),
    triggerReason: asNullableString(rawSummary['triggerReason']),
    recentMessageCount: asNumber(rawSummary['recentMessageCount']),
    originalQueryPreview: asString(rawSummary['originalQueryPreview']),
    rewrittenQueryPreview: asString(rawSummary['rewrittenQueryPreview']),
  }
}

function normalizeMergeSummary(rawSummary: unknown): RagTrace['mergeSummary'] {
  if (!isRecord(rawSummary)) {
    return {
      status: 'not_run',
      childChunksExpanded: 0,
      parentContextsAdded: 0,
      sectionContextsAdded: 0,
      charsAdded: 0,
    }
  }

  return {
    status: asString(rawSummary['status'], 'not_run'),
    childChunksExpanded: asNumber(rawSummary['childChunksExpanded']),
    parentContextsAdded: asNumber(rawSummary['parentContextsAdded']),
    sectionContextsAdded: asNumber(rawSummary['sectionContextsAdded']),
    charsAdded: asNumber(rawSummary['charsAdded']),
  }
}

function normalizePackingSummary(rawSummary: unknown): RagTrace['packingSummary'] {
  if (!isRecord(rawSummary)) {
    return {
      passageCount: 0,
      totalChars: 0,
      budgetChars: 0,
    }
  }

  return {
    passageCount: asNumber(rawSummary['passageCount']),
    totalChars: asNumber(rawSummary['totalChars']),
    budgetChars: asNumber(rawSummary['budgetChars']),
  }
}

function normalizeRerankSummary(rawSummary: unknown): RagTrace['rerankSummary'] {
  if (!isRecord(rawSummary)) {
    return undefined
  }

  return {
    status: asString(rawSummary['status'], 'not_run'),
    provider: asString(rawSummary['provider'], 'not_configured'),
    topScore: asNullableNumber(rawSummary['topScore']),
    averageScore: asNullableNumber(rawSummary['averageScore']),
    chunkCount: asNumber(rawSummary['chunkCount']),
  }
}

function normalizeRelevanceGateSummary(rawSummary: unknown): RagTrace['relevanceGateSummary'] {
  if (!isRecord(rawSummary)) {
    return undefined
  }

  return {
    decision: asString(rawSummary['decision'], 'not_run'),
    topScore: asNullableNumber(rawSummary['topScore']),
    threshold: asNumber(rawSummary['threshold']),
    chunkCount: asNumber(rawSummary['chunkCount']),
    reason: asString(rawSummary['reason']),
  }
}

function normalizeSecondRetrievalSummary(rawSummary: unknown): RagTrace['secondRetrievalSummary'] {
  if (!isRecord(rawSummary)) {
    return undefined
  }

  return {
    status: asString(rawSummary['status'], 'not_run'),
    used: Boolean(rawSummary['used']),
    queryPreview: asString(rawSummary['queryPreview']),
    additionalChunkCount: asNumber(rawSummary['additionalChunkCount']),
    reason: asNullableString(rawSummary['reason']),
  }
}

function normalizeAuditSummary(rawSummary: unknown): RagTrace['auditSummary'] {
  if (!isRecord(rawSummary)) {
    return {
      totalCitations: 0,
      validCitations: 0,
      rejectedCitations: 0,
      auditStatus: 'not_run',
    }
  }

  return {
    totalCitations: asNumber(rawSummary['totalCitations']),
    validCitations: asNumber(rawSummary['validCitations']),
    rejectedCitations: asNumber(rawSummary['rejectedCitations']),
    auditStatus: asString(rawSummary['auditStatus'], 'not_run'),
  }
}

function normalizeSummaryRecord(rawSummary: unknown): Record<string, unknown> {
  if (!isRecord(rawSummary)) {
    return {}
  }
  return rawSummary
}

function normalizeAgentTrace(rawTrace: unknown): AgentToolInvocation[] | null {
  if (!Array.isArray(rawTrace)) {
    return null
  }

  return rawTrace.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry['toolKey'] !== 'string') {
      return []
    }

    return [
      {
        toolKey: entry['toolKey'],
        durationMs: asNumber(entry['durationMs']),
        inputSummary: normalizeSummaryRecord(entry['inputSummary']),
        outputSummary: normalizeSummaryRecord(entry['outputSummary']),
        errorCategory: asNullableString(entry['errorCategory']),
      },
    ]
  })
}

function normalizeRagTrace(rawTrace: unknown): RagTrace | null {
  if (!isRecord(rawTrace)) {
    return null
  }

  return {
    embeddingReadiness:
      typeof rawTrace['embeddingReadiness'] === 'string'
        ? rawTrace['embeddingReadiness']
        : 'unknown',
    retrievalMode: rawTrace['retrievalMode'] === 'fts5' ? 'fts5' : 'hybrid',
    queryRewriteUsed: Boolean(rawTrace['queryRewriteUsed']),
    secondRetrievalUsed: Boolean(rawTrace['secondRetrievalUsed']),
    retrievedDocumentCount:
      typeof rawTrace['retrievedDocumentCount'] === 'number'
        ? rawTrace['retrievedDocumentCount']
        : 0,
    parentMergeStatus:
      typeof rawTrace['parentMergeStatus'] === 'string' ? rawTrace['parentMergeStatus'] : null,
    rerankStatus: typeof rawTrace['rerankStatus'] === 'string' ? rawTrace['rerankStatus'] : null,
    relevanceGateDecision:
      typeof rawTrace['relevanceGateDecision'] === 'string'
        ? rawTrace['relevanceGateDecision']
        : null,
    citationAuditStatus:
      typeof rawTrace['citationAuditStatus'] === 'string' ? rawTrace['citationAuditStatus'] : null,
    failureReason: typeof rawTrace['failureReason'] === 'string' ? rawTrace['failureReason'] : null,
    retrievalSummary: normalizeRetrievalSummary(rawTrace['retrievalSummary']),
    rewriteSummary: normalizeRewriteSummary(rawTrace['rewriteSummary']),
    mergeSummary: normalizeMergeSummary(rawTrace['mergeSummary']),
    packingSummary: normalizePackingSummary(rawTrace['packingSummary']),
    rerankSummary: normalizeRerankSummary(rawTrace['rerankSummary']),
    relevanceGateSummary: normalizeRelevanceGateSummary(rawTrace['relevanceGateSummary']),
    secondRetrievalSummary: normalizeSecondRetrievalSummary(rawTrace['secondRetrievalSummary']),
    auditSummary: normalizeAuditSummary(rawTrace['auditSummary']),
  }
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

  const chunkId = typeof citation['chunkId'] === 'string' ? citation['chunkId'] : null

  return [
    {
      id: chunkId ?? `${documentId}-${index}`,
      documentId,
      documentTitle: documentTitleCache.get(documentId) ?? '文档',
      page: typeof citation['page'] === 'number' ? citation['page'] : null,
      snippet: snippetCandidate,
      relevance: typeof citation['relevanceScore'] === 'number' ? citation['relevanceScore'] : null,
    },
  ]
}
