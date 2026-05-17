import { useEffect, useMemo, useState } from 'react'
import {
  Bot,
  ChevronLeft,
  ChevronRight,
  FileText,
  Send,
  ShieldAlert,
  Sparkles,
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
import type { Document, WorkflowRun } from '@/types'
import { routeAgentRequest, type AgentRoute, type AgentRouteDecision } from './agentRouter'
import {
  normalizeAgentWorkflowSummary,
  type AgentWorkflowSummary,
  type QualityEnvelope,
} from './agentResult'
import { ActionButtonGroup } from './components/ActionButtonGroup'
import { ArtifactCardList } from './components/ArtifactCardList'
import { ContextChips } from './components/ContextChips'
import { TaskProgressTimeline } from './components/TaskProgressTimeline'

interface AgentMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  route?: AgentRoute
  runId?: string | null
  summary?: AgentWorkflowSummary | null
}

type AgentAction = AgentWorkflowSummary['availableActions'][number]
type ActionState = 'idle' | 'loading' | 'success' | 'failed'

interface AgentPanelViewProps {
  isOpen: boolean
  input: string
  documents: Array<Pick<Document, 'id' | 'title' | 'status'>>
  selectedDocumentIds: string[]
  messages: AgentMessage[]
  routeDecision: AgentRouteDecision
  activeSummary: AgentWorkflowSummary | null
  events: import('@/types').WorkflowEvent[]
  isSubmitting: boolean
  needsConfirmation: boolean
  actionNotice: string | null
  actionStates?: Partial<Record<AgentAction, ActionState>>
  onToggleOpen: () => void
  onInputChange: (value: string) => void
  onToggleDocument: (documentId: string) => void
  onSubmit: (routeOverride?: AgentRoute) => void
  onAction: (action: AgentAction) => void
}

const POLL_INTERVAL_MS = 1_500
const TERMINAL_RUN_STATUSES = new Set<WorkflowRun['status']>(['completed', 'failed', 'cancelled'])

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
  const [actionStates, setActionStates] = useState<Partial<Record<AgentAction, ActionState>>>({})
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
    if ((route === 'card' || route === 'compound') && effectiveDocumentIds.length === 0) {
      setActionNotice('请先选择至少一个文档，或在阅读器中打开一个文档后再生成卡片。')
      return
    }

    setPendingConfirmation(false)
    setActionNotice(null)
    setActionStates({})
    const userMessage: AgentMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text,
      route,
    }
    const assistantMessage: AgentMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      text: `${routeLabel(route)}已提交`,
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
                text: '工作流启动失败',
                summary: {
                  status: 'failed',
                  summary: detail,
                  artifactRefs: {},
                  qualityEnvelope: null,
                  errorCategory: 'workflow_start_failed',
                  createdCardIds: [],
                  recommendationReason: null,
                  rollbackAvailable: false,
                  availableActions: ['retry'],
                },
              }
            : message
        )
      )
    }
  }

  async function startWorkflow(route: AgentRoute, text: string, documentIds: string[]): Promise<WorkflowRun> {
    const agentContext = useAppUiStore.getState().agentContext
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
      cardGroupIds: agentContext.activeCardGroupIds,
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

  async function withActionState(action: AgentAction, operation: () => Promise<void>) {
    setActionStates((current) => ({ ...current, [action]: 'loading' }))
    try {
      await operation()
      setActionStates((current) => ({ ...current, [action]: 'success' }))
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      setActionNotice(detail)
      setActionStates((current) => ({ ...current, [action]: 'failed' }))
    }
  }

  async function handleAction(action: AgentAction) {
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
    if (action === 'expand_reason') {
      setActionNotice(activeSummary?.recommendationReason ?? '当前结果没有额外说明。')
      return
    }
    if (action === 'retry' && lastRequest) {
      await withActionState('retry', async () => {
        setInput(lastRequest.text)
        setSelectedDocumentIds(lastRequest.documentIds)
        const run = await startWorkflow(lastRequest.route, lastRequest.text, lastRequest.documentIds)
        setActiveRunId(run.id)
        setMessages((current) => [
          ...current,
          {
            id: `assistant-retry-${Date.now()}`,
            role: 'assistant',
            text: `重新提交：${routeLabel(lastRequest.route)}`,
            route: lastRequest.route,
            runId: run.id,
            summary: null,
          },
        ])
      })
      return
    }
    if (action === 'undo_created' && activeSummary && activeSummary.createdCardIds.length > 0) {
      await withActionState('undo_created', async () => {
        await Promise.all(activeSummary.createdCardIds.map((id) => deleteCardMutation.mutateAsync(id)))
        setActionNotice(`已撤销 ${activeSummary.createdCardIds.length} 张自动生成的卡片。`)
        void queryClient.invalidateQueries({ queryKey: cardsQueryKeys.all })
        void queryClient.invalidateQueries({ queryKey: orchestrationQueryKeys.all })
      })
      return
    }
    if (action === 'create_card') {
      setActiveNavItem('cards')
      setActionNotice('候选卡片已在产物中展示。当前正式写卡由 CardGraph 工作流完成；需要重试时请直接使用“重试”。')
      return
    }
    if (action === 'continue_task' && activeRunId && lastRequest) {
      await withActionState('continue_task', async () => {
        const run = await agentGateway.resumeAgentTask({
          runId: activeRunId,
          userRequest: lastRequest.text,
          documentIds: lastRequest.documentIds,
          cardGroupIds: useAppUiStore.getState().agentContext.activeCardGroupIds,
          allowFormalCardWrite: lastRequest.route === 'compound',
        })
        setActiveRunId(run.id)
        setActionNotice('任务已继续运行。')
        void queryClient.invalidateQueries({ queryKey: orchestrationQueryKeys.all })
      })
      return
    }
    if (action === 'add_to_study_plan') {
      setActiveNavItem('learning')
      setActionNotice('学习计划建议已生成，请在学习页确认后执行。')
      return
    }
    if (action === 'cancel_task' && activeRunId) {
      await withActionState('cancel_task', async () => {
        await agentGateway.cancelAgentTask(activeRunId)
        setActionNotice('任务已取消。')
        void queryClient.invalidateQueries({ queryKey: orchestrationQueryKeys.all })
      })
      return
    }
    if (action === 'rollback' && activeSummary) {
      await withActionState('rollback', async () => {
        if (activeSummary.createdCardIds.length > 0) {
          await Promise.all(activeSummary.createdCardIds.map((id) => deleteCardMutation.mutateAsync(id)))
        }
        const refs = Object.values(activeSummary.artifactRefs).flat()
        await Promise.allSettled(refs.map((ref) => agentGateway.updateWorkflowArtifactLifecycle(ref, 'rolled_back')))
        setActionNotice('已回滚可回滚的卡片和工作流产物。')
        void queryClient.invalidateQueries({ queryKey: cardsQueryKeys.all })
        void queryClient.invalidateQueries({ queryKey: orchestrationQueryKeys.all })
      })
      return
    }
  }

  const isSubmitting = Boolean(activeRunId && activeRun && !TERMINAL_RUN_STATUSES.has(activeRun.status))

  return (
    <AgentPanelView
      isOpen={isOpen}
      input={input}
      documents={usableDocuments}
      selectedDocumentIds={selectedDocumentIds}
      messages={messages}
      routeDecision={routeDecision}
      activeSummary={activeSummary}
      events={activeEvents}
      isSubmitting={isSubmitting}
      needsConfirmation={pendingConfirmation}
      actionNotice={actionNotice}
      actionStates={actionStates}
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
  events,
  isSubmitting,
  needsConfirmation,
  actionNotice,
  actionStates = {},
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
            <AgentPanelHeader onToggleOpen={onToggleOpen} documents={documents} selectedDocumentIds={selectedDocumentIds} />
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              <DocumentScope
                documents={documents}
                selectedDocumentIds={selectedDocumentIds}
                onToggleDocument={onToggleDocument}
              />
              <div className="mt-3 space-y-3">
                {messages.length === 0 ? (
                  <div className="rounded-lg border border-line-soft bg-paper-base/70 p-3 text-xs leading-5 text-ink-muted">
                    输入一个学习任务，工作台会自动选择知识问答、卡片生成、学习诊断或综合任务。需要精确控制时，可在提示出现后手动选择工作流。
                  </div>
                ) : null}
                {messages.map((message) => (
                  <AgentMessageBubble key={message.id} message={message} />
                ))}
                {activeSummary ? (
                  <AgentWorkbenchCard
                    summary={activeSummary}
                    events={events}
                    actionStates={actionStates}
                    onAction={onAction}
                  />
                ) : null}
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
            aria-label="展开 Agent 工作台"
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

function AgentPanelHeader({
  onToggleOpen,
  documents,
  selectedDocumentIds,
}: {
  onToggleOpen: () => void
  documents: Array<Pick<Document, 'id' | 'title' | 'status'>>
  selectedDocumentIds: string[]
}) {
  return (
    <div className="shrink-0 border-b border-line-soft px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-line-soft bg-paper-base">
            <Bot className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.18em] text-ink-soft">Workbench</p>
            <p className="truncate text-sm font-medium text-ink">学习 Agent 工作台</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleOpen}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line-soft text-ink-muted hover:bg-paper-muted"
          aria-label="收起 Agent 工作台"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-1.5">
        <ContextChips
          documents={documents}
          selectedDocumentIds={selectedDocumentIds}
        />
      </div>
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
        文档范围
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
        {documents.length === 0 ? <p className="px-2 py-1 text-xs text-ink-soft">暂无可用文档</p> : null}
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

function AgentWorkbenchCard({
  summary,
  events,
  actionStates,
  onAction,
}: {
  summary: AgentWorkflowSummary
  events: import('@/types').WorkflowEvent[]
  actionStates: Partial<Record<AgentAction, ActionState>>
  onAction: (action: AgentAction) => void
}) {
  const blockingReasons = summary.qualityEnvelope?.blockingReasons ?? []

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
      <div className="mt-3 space-y-3">
        <ArtifactCardList summary={summary} onAction={onAction} />
        <TaskProgressTimeline events={events} />
        <ActionButtonGroup
          actions={summary.availableActions}
          onAction={onAction}
          createdCardIds={summary.createdCardIds}
          actionStates={actionStates}
        />
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
        <span className="truncate text-[11px] text-ink-soft">{routeReasonLabel(routeDecision.reason)}</span>
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
          placeholder="提问、生成卡片、诊断薄弱点，或组合成一个学习任务..."
          aria-label="Agent 任务输入"
        />
        <button
          type="button"
          onClick={() => onSubmit()}
          disabled={isSubmitting || input.trim().length === 0}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ink text-paper-base transition hover:bg-ink/88 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="提交 Agent 任务"
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
              : status === 'cancelled'
                ? 'border-themeAccent-danger/25 bg-themeAccent-danger/10 text-themeAccent-danger'
                : 'border-line-soft bg-paper-muted text-ink-muted'
      )}
    >
      {statusLabel(status)}
    </span>
  )
}

function QualityLine({ quality }: { quality: QualityEnvelope | null }) {
  if (!quality) return null
  return (
    <p className="mt-2 text-xs text-ink-muted">
      质量: {quality.riskLevel ?? 'unknown'} / 审计 {quality.auditStatus ?? 'n/a'}
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
      return '知识问答'
    case 'card':
      return '生成卡片'
    case 'study':
      return '学习诊断'
    case 'compound':
      return '综合任务'
    default:
      return '选择工作流'
  }
}

function routeReasonLabel(reason: string) {
  switch (reason) {
    case 'empty_request':
      return '等待输入'
    case 'multiple_learning_intents':
      return '检测到多个学习意图'
    case 'card_generation_intent':
      return '检测到制卡意图'
    case 'study_diagnosis_intent':
      return '检测到学习诊断意图'
    case 'knowledge_qa_intent':
      return '检测到知识问答意图'
    case 'no_clear_workflow_intent':
      return '需要手动选择工作流'
    default:
      return reason
  }
}

function statusLabel(status: AgentWorkflowSummary['status']) {
  switch (status) {
    case 'queued':
      return '排队中'
    case 'running':
      return '运行中'
    case 'paused':
      return '已暂停'
    case 'waiting_confirmation':
      return '待确认'
    case 'completed':
      return '已完成'
    case 'failed':
      return '失败'
    case 'cancelled':
      return '已取消'
    case 'partial':
      return '部分完成'
    default:
      return status
  }
}
