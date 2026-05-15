import { useEffect, useMemo, useState } from 'react'
import {
  Bot,
  BookOpenCheck,
  ChevronLeft,
  ChevronRight,
  FileText,
  Layers3,
  RotateCcw,
  Send,
  ShieldAlert,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { agentGateway } from '@/services/gateway/agent'
import { startKnowledgeQaWorkflow } from '@/services/gateway/knowledge'
import { useDocumentsQuery } from '@/queries'
import {
  orchestrationQueryKeys,
  useWorkflowCheckpointQuery,
  useWorkflowEventsQuery,
  useWorkflowRunQuery,
} from '@/queries/orchestration'
import { cardsQueryKeys, useDeleteCardMutation } from '@/queries/cards'
import { cn } from '@/lib/utils'
import { useAppUiStore } from '@/store'
import type { Document, WorkflowArtifact, WorkflowRun } from '@/types'
import { routeAgentRequest, type AgentRoute, type AgentRouteDecision } from './agentRouter'
import {
  normalizeAgentWorkflowSummary,
  type AgentWorkflowSummary,
  type QualityEnvelope,
} from './agentResult'

interface AgentMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  route?: AgentRoute
  runId?: string | null
  summary?: AgentWorkflowSummary | null
}

interface AgentPanelViewProps {
  isOpen: boolean
  input: string
  documents: Array<Pick<Document, 'id' | 'title' | 'status'>>
  selectedDocumentIds: string[]
  messages: AgentMessage[]
  routeDecision: AgentRouteDecision
  activeSummary: AgentWorkflowSummary | null
  isSubmitting: boolean
  needsConfirmation: boolean
  actionNotice: string | null
  onToggleOpen: () => void
  onInputChange: (value: string) => void
  onToggleDocument: (documentId: string) => void
  onSubmit: (routeOverride?: AgentRoute) => void
  onAction: (action: AgentWorkflowSummary['availableActions'][number]) => void
}

const POLL_INTERVAL_MS = 1_500

export function AgentPanel() {
  const [isOpen, setIsOpen] = useState(true)
  const [input, setInput] = useState('')
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([])
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [pendingConfirmation, setPendingConfirmation] = useState(false)
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [lastRequest, setLastRequest] = useState<{ text: string; route: AgentRoute; documentIds: string[] } | null>(
    null
  )
  const [actionNotice, setActionNotice] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const setActiveNavItem = useAppUiStore((state) => state.setActiveNavItem)
  const readerDocumentId = useAppUiStore((state) => state.reader.documentId)
  const { data: documents = [] } = useDocumentsQuery()
  const deleteCardMutation = useDeleteCardMutation()

  const { data: activeRun } = useWorkflowRunQuery(activeRunId, {
    refetchInterval: activeRunId ? POLL_INTERVAL_MS : false,
  })
  const { data: activeEvents = [] } = useWorkflowEventsQuery(activeRunId, 20, {
    refetchInterval: activeRunId ? POLL_INTERVAL_MS : false,
  })
  const { data: activeCheckpoint } = useWorkflowCheckpointQuery(activeRunId, null, {
    refetchInterval: activeRunId ? POLL_INTERVAL_MS : false,
  })

  useEffect(() => {
    if (readerDocumentId) {
      setSelectedDocumentIds([readerDocumentId])
    }
  }, [readerDocumentId])

  const usableDocuments = useMemo(
    () =>
      documents.filter((document) =>
        ['ready', 'parsed', 'embedding_stale', 'embedding_failed'].includes(document.status)
      ),
    [documents]
  )
  const routeDecision = useMemo(() => routeAgentRequest(input), [input])
  const activeSummary = useMemo(
    () => (activeRunId ? normalizeAgentWorkflowSummary(activeRun, activeCheckpoint, activeEvents) : null),
    [activeRunId, activeRun, activeCheckpoint, activeEvents]
  )

  useEffect(() => {
    if (!activeRunId) return
    setMessages((current) =>
      current.map((message) =>
        message.runId === activeRunId ? { ...message, summary: activeSummary } : message
      )
    )
  }, [activeRunId, activeSummary])

  async function submit(routeOverride?: AgentRoute) {
    const text = input.trim()
    const route = routeOverride ?? routeDecision.route
    const effectiveDocumentIds =
      selectedDocumentIds.length > 0
        ? selectedDocumentIds
        : usableDocuments.length === 1
          ? [usableDocuments[0].id]
          : []
    if (!text || route === 'ambiguous') {
      setPendingConfirmation(Boolean(text))
      return
    }
    if (route === 'card' && effectiveDocumentIds.length === 0) {
      setActionNotice('请先选择至少一份资料，再生成卡片。')
      return
    }

    setPendingConfirmation(false)
    setActionNotice(null)
    const userMessage: AgentMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text,
      route,
    }
    const assistantMessage: AgentMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      text: routeLabel(route),
      route,
      runId: null,
      summary: null,
    }
    setMessages((current) => [...current, userMessage, assistantMessage])
    setInput('')
    setLastRequest({ text, route, documentIds: effectiveDocumentIds })

    try {
      const run = await startWorkflow(route, text, effectiveDocumentIds)
      setActiveRunId(run.id)
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessage.id ? { ...message, runId: run.id } : message
        )
      )
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessage.id
            ? {
                ...message,
                text: '工作流启动失败。',
                summary: {
                  status: 'failed',
                  summary: detail,
                  artifactRefs: {},
                  qualityEnvelope: null,
                  errorCategory: 'workflow_start_failed',
                  createdCardIds: [],
                  availableActions: ['retry'],
                },
              }
            : message
        )
      )
    }
  }

  async function startWorkflow(route: AgentRoute, text: string, documentIds: string[]): Promise<WorkflowRun> {
    if (route === 'qa') {
      return startKnowledgeQaWorkflow({ question: text, documentIds })
    }
    if (route === 'card') {
      return agentGateway.startAgentCardGeneration({
        userRequest: text,
        documentIds,
        cardCountHint: 6,
        difficulty: 'medium',
      })
    }
    return agentGateway.startAgentTask({
      userRequest: text,
      documentIds,
      cardGroupIds: [],
      allowFormalCardWrite: route === 'compound',
    })
  }

  function toggleDocument(documentId: string) {
    setSelectedDocumentIds((current) =>
      current.includes(documentId)
        ? current.filter((item) => item !== documentId)
        : [...current, documentId]
    )
  }

  async function handleAction(action: AgentWorkflowSummary['availableActions'][number]) {
    if (action === 'view_cards') {
      setActiveNavItem('cards')
      return
    }
    if (action === 'start_review') {
      setActiveNavItem('learning')
      return
    }
    if (action === 'view_sources') {
      setActiveNavItem('library')
      return
    }
    if (action === 'retry' && lastRequest) {
      setInput(lastRequest.text)
      setSelectedDocumentIds(lastRequest.documentIds)
      const run = await startWorkflow(lastRequest.route, lastRequest.text, lastRequest.documentIds)
      setActiveRunId(run.id)
      setMessages((current) => [
        ...current,
        {
          id: `assistant-retry-${Date.now()}`,
          role: 'assistant',
          text: `重新执行：${routeLabel(lastRequest.route)}`,
          route: lastRequest.route,
          runId: run.id,
          summary: null,
        },
      ])
      return
    }
    if (action === 'undo_created' && activeSummary && activeSummary.createdCardIds.length > 0) {
      await Promise.all(activeSummary.createdCardIds.map((id) => deleteCardMutation.mutateAsync(id)))
      setActionNotice(`已删除 ${activeSummary.createdCardIds.length} 张刚创建的卡片。`)
      void queryClient.invalidateQueries({ queryKey: cardsQueryKeys.all })
      void queryClient.invalidateQueries({ queryKey: orchestrationQueryKeys.all })
    }
  }

  return (
    <AgentPanelView
      isOpen={isOpen}
      input={input}
      documents={usableDocuments}
      selectedDocumentIds={selectedDocumentIds}
      messages={messages}
      routeDecision={routeDecision}
      activeSummary={activeSummary}
      isSubmitting={Boolean(activeRunId && activeRun?.status !== 'completed' && activeRun?.status !== 'failed')}
      needsConfirmation={pendingConfirmation}
      actionNotice={actionNotice}
      onToggleOpen={() => setIsOpen((value) => !value)}
      onInputChange={setInput}
      onToggleDocument={toggleDocument}
      onSubmit={(route) => void submit(route)}
      onAction={(action) => void handleAction(action)}
    />
  )
}

export function AgentPanelView({
  isOpen,
  input,
  documents,
  selectedDocumentIds,
  messages,
  routeDecision,
  activeSummary,
  isSubmitting,
  needsConfirmation,
  actionNotice,
  onToggleOpen,
  onInputChange,
  onToggleDocument,
  onSubmit,
  onAction,
}: AgentPanelViewProps) {
  return (
    <>
      <aside
        className={cn(
          'hidden h-full shrink-0 border-r border-line-soft bg-paper-card/86 md:flex',
          isOpen ? 'w-[336px]' : 'w-12'
        )}
        data-testid="agent-panel"
      >
        {isOpen ? (
          <div className="flex h-full min-w-0 flex-1 flex-col">
            <AgentPanelHeader onToggleOpen={onToggleOpen} />
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              <DocumentScope
                documents={documents}
                selectedDocumentIds={selectedDocumentIds}
                onToggleDocument={onToggleDocument}
              />
              <div className="mt-3 space-y-3">
                {messages.length === 0 ? (
                  <div className="rounded-lg border border-line-soft bg-paper-base/70 p-3 text-xs leading-5 text-ink-muted">
                    输入学习任务。简单问答走 KnowledgeGraph，制卡走 CardGraph，复合学习任务走 Supervisor。
                  </div>
                ) : null}
                {messages.map((message) => (
                  <AgentMessageBubble key={message.id} message={message} />
                ))}
                {activeSummary ? <AgentSummaryCard summary={activeSummary} onAction={onAction} /> : null}
              </div>
            </div>
            <AgentComposer
              input={input}
              routeDecision={routeDecision}
              isSubmitting={isSubmitting}
              needsConfirmation={needsConfirmation}
              actionNotice={actionNotice}
              onInputChange={onInputChange}
              onSubmit={onSubmit}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={onToggleOpen}
            className="flex h-full w-full items-start justify-center px-2 py-4 text-ink-muted hover:bg-paper-muted"
            aria-label="展开 Agent 面板"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </aside>

      <div className="fixed bottom-4 right-4 z-50 md:hidden" data-testid="agent-panel-mobile">
        <button
          type="button"
          onClick={onToggleOpen}
          className="inline-flex h-11 items-center gap-2 rounded-lg border border-line-soft bg-ink px-4 text-sm text-paper-base shadow-card"
        >
          <Bot className="h-4 w-4" />
          Agent
        </button>
      </div>
    </>
  )
}

function AgentPanelHeader({ onToggleOpen }: { onToggleOpen: () => void }) {
  return (
    <div className="flex h-14 shrink-0 items-center justify-between border-b border-line-soft px-3">
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-line-soft bg-paper-base">
          <Bot className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.18em] text-ink-soft">Controlled Agent</p>
          <p className="truncate text-sm font-medium text-ink">学习任务入口</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onToggleOpen}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line-soft text-ink-muted hover:bg-paper-muted"
        aria-label="折叠 Agent 面板"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
    </div>
  )
}

function DocumentScope({
  documents,
  selectedDocumentIds,
  onToggleDocument,
}: {
  documents: AgentPanelViewProps['documents']
  selectedDocumentIds: string[]
  onToggleDocument: (documentId: string) => void
}) {
  return (
    <div className="rounded-lg border border-line-soft bg-paper-base/72 p-2" data-testid="agent-panel-scope">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-ink-muted">
        <FileText className="h-3.5 w-3.5" />
        资料范围
      </div>
      <div className="max-h-24 space-y-1 overflow-y-auto">
        {documents.slice(0, 8).map((document) => (
          <label
            key={document.id}
            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-xs text-ink hover:bg-paper-muted"
          >
            <input
              type="checkbox"
              checked={selectedDocumentIds.includes(document.id)}
              onChange={() => onToggleDocument(document.id)}
            />
            <span className="truncate">{document.title}</span>
          </label>
        ))}
        {documents.length === 0 ? <p className="px-2 py-1 text-xs text-ink-soft">暂无可用资料</p> : null}
      </div>
    </div>
  )
}

function AgentMessageBubble({ message }: { message: AgentMessage }) {
  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2 text-sm leading-6',
        message.role === 'user'
          ? 'border-ink/12 bg-ink text-paper-base'
          : 'border-line-soft bg-paper-base text-ink'
      )}
    >
      <p className="whitespace-pre-wrap break-words">{message.text}</p>
      {message.runId ? <p className="mt-1 truncate text-[11px] opacity-70">run {message.runId}</p> : null}
    </div>
  )
}

function AgentSummaryCard({
  summary,
  onAction,
}: {
  summary: AgentWorkflowSummary
  onAction: (action: AgentWorkflowSummary['availableActions'][number]) => void
}) {
  const [artifactSummaries, setArtifactSummaries] = useState<Record<string, WorkflowArtifact | null>>({})
  const blockingReasons = summary.qualityEnvelope?.blockingReasons ?? []
  const artifactEntries = Object.entries(summary.artifactRefs).filter(([, refs]) => refs.length > 0)
  const artifactRefs = useMemo(() => artifactEntries.flatMap(([, refs]) => refs).slice(0, 8), [artifactEntries])

  useEffect(() => {
    const loader = (agentGateway as Partial<typeof agentGateway>).getWorkflowArtifact
    if (!loader || artifactRefs.length === 0) return

    const missingRefs = artifactRefs.filter((ref) => !(ref in artifactSummaries))
    if (missingRefs.length === 0) return

    let cancelled = false
    void Promise.all(
      missingRefs.map(async (ref) => {
        try {
          return [ref, await loader(ref)] as const
        } catch {
          return [ref, null] as const
        }
      })
    ).then((items) => {
      if (cancelled) return
      setArtifactSummaries((current) => ({
        ...current,
        ...Object.fromEntries(items),
      }))
    })

    return () => {
      cancelled = true
    }
  }, [artifactRefs, artifactSummaries])

  const loadedArtifacts = artifactRefs
    .map((ref) => artifactSummaries[ref])
    .filter((artifact): artifact is WorkflowArtifact => Boolean(artifact))

  return (
    <div className="rounded-lg border border-line-soft bg-paper-base/86 p-3" data-testid="agent-panel-summary">
      <div className="flex items-center justify-between gap-2">
        <StatusBadge status={summary.status} />
        {summary.errorCategory ? (
          <span className="truncate text-[11px] text-ink-soft">{summary.errorCategory}</span>
        ) : null}
      </div>
      <p className="mt-2 text-sm leading-6 text-ink">{summary.summary}</p>
      <QualityLine quality={summary.qualityEnvelope} />
      {blockingReasons.length > 0 ? (
        <div className="mt-2 rounded-md border border-highlight-yellow/40 bg-highlight-yellow/12 px-2 py-1.5 text-xs text-ink-muted">
          <ShieldAlert className="mr-1 inline h-3.5 w-3.5" />
          {blockingReasons.join(', ')}
        </div>
      ) : null}
      {artifactEntries.length > 0 ? (
        <div className="mt-2 space-y-1" data-testid="agent-panel-artifact-refs">
          {artifactEntries.map(([type, refs]) => (
            <p key={type} className="truncate text-xs text-ink-muted">
              <span className="font-medium text-ink">{type}</span>: {refs.join(', ')}
            </p>
          ))}
        </div>
      ) : null}
      {loadedArtifacts.length > 0 ? (
        <div className="mt-2 space-y-1" data-testid="agent-panel-artifact-summaries">
          {loadedArtifacts.map((artifact) => (
            <div
              key={artifact.artifactId}
              className="rounded-md border border-line-soft bg-paper-card px-2 py-1.5 text-xs text-ink-muted"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-ink">{artifact.artifactType}</span>
                <span>{artifact.lifecycleStatus}</span>
              </div>
              <p className="mt-1 line-clamp-2 break-words">{artifact.summary}</p>
              {artifact.errorCategory ? <p className="mt-1 text-ink-soft">{artifact.errorCategory}</p> : null}
            </div>
          ))}
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {summary.availableActions.map((action) => (
          <button
            key={action}
            type="button"
            onClick={() => onAction(action)}
            disabled={action === 'undo_created' && summary.createdCardIds.length === 0}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-line-soft bg-paper-card px-2 text-xs text-ink transition hover:bg-paper-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            {actionIcon(action)}
            {actionLabel(action)}
          </button>
        ))}
      </div>
    </div>
  )
}

function AgentComposer({
  input,
  routeDecision,
  isSubmitting,
  needsConfirmation,
  actionNotice,
  onInputChange,
  onSubmit,
}: {
  input: string
  routeDecision: AgentRouteDecision
  isSubmitting: boolean
  needsConfirmation: boolean
  actionNotice: string | null
  onInputChange: (value: string) => void
  onSubmit: (routeOverride?: AgentRoute) => void
}) {
  return (
    <div className="shrink-0 border-t border-line-soft bg-paper-card px-3 py-3">
      {actionNotice ? <p className="mb-2 text-xs text-ink-muted">{actionNotice}</p> : null}
      <div className="mb-2 flex items-center gap-2">
        <RouteChip route={routeDecision.route} />
        <span className="text-[11px] text-ink-soft">{routeDecision.reason}</span>
      </div>
      {needsConfirmation ? (
        <div className="mb-2 grid grid-cols-2 gap-2" data-testid="agent-panel-confirmation">
          {(['qa', 'card', 'study', 'compound'] as AgentRoute[]).map((route) => (
            <button
              key={route}
              type="button"
              onClick={() => onSubmit(route)}
              className="h-8 rounded-lg border border-line-soft bg-paper-base px-2 text-xs text-ink hover:bg-paper-muted"
            >
              {routeLabel(route)}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex items-end gap-2">
        <textarea
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              onSubmit()
            }
          }}
          rows={3}
          className="min-h-[72px] flex-1 resize-none rounded-lg border border-line-soft bg-paper-base px-3 py-2 text-sm leading-5 text-ink outline-none transition focus:border-ink/30"
          placeholder="解释资料、生成卡片、诊断薄弱点..."
          aria-label="Agent 任务输入"
        />
        <button
          type="button"
          onClick={() => onSubmit()}
          disabled={isSubmitting || input.trim().length === 0}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ink text-paper-base transition hover:bg-ink/88 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="发送 Agent 任务"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: AgentWorkflowSummary['status'] }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center rounded-full border px-2 text-[11px] font-medium',
        status === 'completed'
          ? 'border-themeAccent-success/35 bg-themeAccent-success/10 text-themeAccent-success'
          : status === 'failed'
            ? 'border-themeAccent-danger/35 bg-themeAccent-danger/10 text-themeAccent-danger'
            : status === 'partial'
              ? 'border-highlight-yellow/45 bg-highlight-yellow/15 text-ink-muted'
              : 'border-line-soft bg-paper-muted text-ink-muted'
      )}
    >
      {status}
    </span>
  )
}

function QualityLine({ quality }: { quality: QualityEnvelope | null }) {
  if (!quality) return null
  return (
    <p className="mt-2 text-xs text-ink-muted">
      quality: {quality.riskLevel ?? 'unknown'} / audit {quality.auditStatus ?? 'n/a'}
      {typeof quality.confidence === 'number' ? ` / ${Math.round(quality.confidence * 100)}%` : ''}
    </p>
  )
}

function RouteChip({ route }: { route: AgentRoute }) {
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-full border border-line-soft bg-paper-base px-2 text-[11px] text-ink-muted">
      <Sparkles className="h-3 w-3" />
      {routeLabel(route)}
    </span>
  )
}

function routeLabel(route: AgentRoute) {
  switch (route) {
    case 'qa':
      return '问答'
    case 'card':
      return '制卡'
    case 'study':
      return '学习诊断'
    case 'compound':
      return '复合任务'
    default:
      return '选择任务'
  }
}

function actionLabel(action: AgentWorkflowSummary['availableActions'][number]) {
  switch (action) {
    case 'view_sources':
      return '查看来源'
    case 'view_cards':
      return '查看卡片'
    case 'undo_created':
      return '撤销创建'
    case 'start_review':
      return '开始复习'
    case 'retry':
    default:
      return '重新生成'
  }
}

function actionIcon(action: AgentWorkflowSummary['availableActions'][number]) {
  switch (action) {
    case 'view_sources':
      return <FileText className="h-3.5 w-3.5" />
    case 'view_cards':
      return <Layers3 className="h-3.5 w-3.5" />
    case 'undo_created':
      return <Trash2 className="h-3.5 w-3.5" />
    case 'start_review':
      return <BookOpenCheck className="h-3.5 w-3.5" />
    case 'retry':
    default:
      return <RotateCcw className="h-3.5 w-3.5" />
  }
}
