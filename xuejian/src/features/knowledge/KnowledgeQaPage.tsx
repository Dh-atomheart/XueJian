import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Input, Panel, SketchEmptyState } from '@/components/ui'
import {
  KnowledgeChatPanel,
  type KnowledgeChatCitation,
  type KnowledgeChatTurn,
} from '@/components/knowledge'
import { useStartKnowledgeQaMutation, useKnowledgeSearchQuery } from '@/queries/knowledge'
import { useDocumentsQuery, useOrchestrationServiceHealthQuery } from '@/queries'
import { getErrorMessage, reportAppError, reportFeedback } from '@/lib/appFeedback'
import { useAppUiStore } from '@/store'
import { cn } from '@/lib/utils'
import { isTauriEnvironment } from '@/services/gateway'
import { orchestrationGateway } from '@/services/gateway/orchestration'
import type { ChunkSearchResult, WorkflowEvent } from '@/types'

type TurnState = KnowledgeChatTurn & {
  documentTitleCache: Map<string, string>
  workflowRunId: string | null
}

const KNOWLEDGE_POLL_INTERVAL_MS = 1_800

const EXAMPLE_PROMPTS = [
  '这份材料的核心论点是什么？',
  '第 3 节的结论和第 5 节如何对应？',
  '帮我对比两篇文档里相似的概念。',
]

export function KnowledgeQaPage() {
  const [question, setQuestion] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([])
  const [turns, setTurns] = useState<TurnState[]>([])
  const [isRestartingService, setIsRestartingService] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
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
              const failedMessage = run.errorMessage ?? '知识问答后台流程执行失败'

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
              errorMessage: getErrorMessage(error, '读取知识问答结果失败'),
            }
          }
        })
      ).then((updates) => {
        if (cancelled) {
          return
        }

        const updateMap = new Map(
          updates.filter((update): update is NonNullable<typeof update> => update != null).map((update) => [update.turnId, update])
        )

        if (updateMap.size === 0) {
          return
        }

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
        throw new Error(restarted.errorMessage ?? `当前服务状态：${restarted.status}`)
      }

      reportFeedback({
        scope: '知识问答',
        title: '知识问答服务已重启',
        detail: restarted.endpoint ? `服务地址：${restarted.endpoint}` : '服务已恢复响应。',
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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleAsk()
      }
    },
    [handleAsk]
  )

  const toggleDoc = useCallback((docId: string) => {
    setSelectedDocIds((prev) =>
      prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId]
    )
  }, [])

  const handleCitationClick = useCallback(
    (citation: KnowledgeChatCitation) => {
      openReader(citation.documentId)
    },
    [openReader]
  )

  const handleRetry = useCallback(
    (turn: KnowledgeChatTurn) => {
      void handleAsk(turn.question)
    },
    [handleAsk]
  )

  const handleFillExample = useCallback((prompt: string) => {
    setQuestion(prompt)
    inputRef.current?.focus()
  }, [])

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-ui text-[11px] uppercase tracking-[0.24em] text-ink-soft">
            知识问答工作台
          </p>
          <h1 className="mt-2 font-display text-2xl text-ink">知识问答</h1>
          <p className="mt-1 font-body text-sm leading-6 text-ink-muted">
            在选定的文档范围内提问，回答附带可跳转的原文引用。
          </p>
        </div>
        {selectedDocIds.length > 0 && (
          <span className="rounded-full border border-ink/15 bg-paper-muted/60 px-3 py-1 font-latin text-[11px] tracking-wide text-ink-soft">
            已限定 {selectedDocIds.length} 份文档
          </span>
        )}
      </header>

      {shouldWarnOrchestration ? (
        <Panel variant="paperCard" className="rounded-[20px] border border-amber-200 bg-amber-50/80 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="font-ui text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                服务状态
              </p>
              <p className="text-sm text-ink">
                当前知识问答服务不可用或协议不兼容，系统无法稳定生成回答。
              </p>
              {orchestrationHealth?.errorMessage ? (
                <p className="text-xs leading-5 text-ink-muted break-all">
                  {orchestrationHealth.errorMessage}
                </p>
              ) : null}
            </div>
            <Button
              variant="outline"
              disabled={isRestartingService}
              onClick={() => {
                void handleRestartService()
              }}
            >
              {isRestartingService ? '正在重启服务...' : '重启问答服务'}
            </Button>
          </div>
        </Panel>
      ) : null}

      {documents.length > 0 && (
        <Panel variant="paperCard" className="rounded-[20px] p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="font-ui text-[11px] uppercase tracking-[0.22em] text-ink-soft">
              文档范围（可选）
            </p>
            {selectedDocIds.length > 0 && (
              <button
                type="button"
                className="font-ui text-xs text-ink-soft hover:text-ink"
                onClick={() => setSelectedDocIds([])}
              >
                清除选择
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {documents.map((doc) => {
              const active = selectedDocIds.includes(doc.id)
              return (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => toggleDoc(doc.id)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 font-ui text-xs transition-colors',
                    active
                      ? 'border-ink/35 bg-ink/[0.08] text-ink'
                      : 'border-line-soft bg-paper-card text-ink-muted hover:border-ink/20 hover:text-ink'
                  )}
                >
                  {doc.title}
                </button>
              )
            })}
          </div>
        </Panel>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex gap-3">
          <Input
            ref={inputRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入你的问题…（Enter 发送）"
            className="flex-1 rounded-[14px]"
          />
          <Button
            onClick={() => handleAsk()}
            disabled={!question.trim() || startQaMutation.isPending || isRestartingService}
            variant="sketch"
            className="rounded-[14px]"
          >
            {startQaMutation.isPending || isRestartingService ? '处理中...' : '提问'}
          </Button>
        </div>
        {turns.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => handleFillExample(prompt)}
                className="rounded-full border border-dashed border-line-soft bg-paper-card/70 px-3 py-1 font-ui text-xs text-ink-muted hover:border-ink/25 hover:text-ink"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}
      </div>

      {searchResults.length > 0 && (
        <Panel variant="paperCard" className="rounded-[20px] p-4">
          <p className="mb-3 font-ui text-[11px] uppercase tracking-[0.22em] text-ink-soft">
            相关文档片段 · {searchResults.length}
          </p>
          <div className="space-y-2">
            {searchResults.map((chunk: ChunkSearchResult) => (
              <button
                key={chunk.id}
                type="button"
                onClick={() => openReader(chunk.documentId)}
                className="block w-full rounded-[14px] border border-line-soft bg-paper-muted/40 p-3 text-left transition-colors hover:border-ink/20 hover:bg-paper-muted"
              >
                <p className="font-body text-sm leading-6 text-ink">
                  {chunk.snippet || chunk.content}
                </p>
                <p className="mt-1 font-latin text-xs text-ink-soft">
                  {documentTitleLookup.get(chunk.documentId) ?? '文档'} · 页{' '}
                  {chunk.pageStart ?? '?'}–{chunk.pageEnd ?? '?'}
                </p>
              </button>
            ))}
          </div>
        </Panel>
      )}

      <KnowledgeChatPanel
        turns={turns}
        onOpenCitation={handleCitationClick}
        onRetry={handleRetry}
        className="flex-1"
        emptyContent={
          <SketchEmptyState
            illustration="chat"
            title="从你的文档里问一个问题"
            description="输入问题后，系统会先在选定的文档里检索，再给出带引用的回答。点击下方的引用可以直接跳回原文。"
            className="max-w-md"
          />
        }
      />
    </div>
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
      : '回答已生成，但没有返回可显示的正文。'

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
): KnowledgeChatCitation[] {
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
      documentTitle: documentTitleCache.get(documentId) ?? '文档',
      page: typeof citation['page'] === 'number' ? citation['page'] : null,
      snippet: snippetCandidate,
      relevance:
        typeof citation['relevanceScore'] === 'number' ? citation['relevanceScore'] : null,
    },
  ]
}
