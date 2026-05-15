import { useState, type ReactNode } from 'react'
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import {
  Copy,
  FileText,
  History,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCcw,
  RotateCcw,
  Send,
  Square,
  Trash2,
} from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  InlineError,
  Input,
  Tooltip,
  UnconfiguredState,
} from '@/shared/ui'
import { cn } from '@/lib/utils'
import { CardMarkdownRenderer } from '@/components/cards/CardMarkdownRenderer'
import { RagProgressCard } from '@/components/knowledge/RagProgressCard'
import { RagTracePanel } from '@/components/knowledge/RagTracePanel'
import type { AgentToolInvocation, RagProgressStep, RagTrace } from '@/types'

export interface KnowledgeQaDocumentScope {
  id: string
  title: string
  status: 'ready' | 'embedding_missing' | 'embedding_stale' | 'embedding_failed'
}

export interface KnowledgeQaConversationView {
  id: string
  title: string
  documentIds: string[]
  createdAt: Date
  updatedAt: Date
}

export interface KnowledgeQaCitationView {
  id: string
  documentId: string
  documentTitle: string
  pageLabel: string
  snippet: string
}

export interface KnowledgeQaTurnView {
  id: string
  question: string
  answer: string | null
  answerMode?: 'grounded' | 'no_relevant_content' | 'excerpt_fallback' | null
  retrievalStatus?:
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
    | null
  status: 'pending' | 'answered' | 'error' | 'cancelled'
  errorMessage?: string | null
  citations: KnowledgeQaCitationView[]
  ragTrace?: RagTrace | null
  ragProgressSteps?: RagProgressStep[]
  agentTrace?: AgentToolInvocation[] | null
  sessionMemoryUsed?: boolean
  sessionMemorySummary?: string | null
}

export interface KnowledgeQaSearchResultView {
  id: string
  documentId: string
  documentTitle: string
  pageLabel: string
  snippet: string
}

export interface KnowledgeQaPageProps {
  question: string
  documents: KnowledgeQaDocumentScope[]
  selectedDocumentIds: string[]
  conversations: KnowledgeQaConversationView[]
  activeConversationId: string | null
  turns: KnowledgeQaTurnView[]
  citations: KnowledgeQaCitationView[]
  searchResults: KnowledgeQaSearchResultView[]
  isSubmitting?: boolean
  isRegenerateDisabled?: boolean
  hasConfiguration?: boolean
  submitDisabledReason?: string | null
  serviceWarningTitle?: string | null
  serviceWarningMessage?: string | null
  isRestartingService?: boolean
  onQuestionChange: (value: string) => void
  onSubmit: () => void
  onRetryQuestion: (turnId: string) => void
  onCancelQuestion: (turnId: string) => void
  onToggleDocument: (documentId: string) => void
  onClearDocuments: () => void
  onUsePrompt: (prompt: string) => void
  onOpenCitation: (documentId: string) => void
  onSelectConversation: (conversationId: string) => void
  onNewConversation: () => void
  onDeleteConversation: (conversationId: string) => void
  onDeleteTurn: (turnId: string) => void
  onRestartService: () => void
  onOpenSettings: () => void
}

const EXAMPLE_PROMPTS = [
  '这份资料如何定义间隔重复？',
  '请总结这章的核心结论。',
  '这个概念和前文的另一个概念有什么区别？',
  '列出资料中支持这个结论的证据。',
]

const DOCUMENT_STATUS_LABELS: Record<KnowledgeQaDocumentScope['status'], string> = {
  ready: '已向量化',
  embedding_missing: '未向量化',
  embedding_stale: '向量过期',
  embedding_failed: '向量失败',
}

type DeleteTarget =
  | { type: 'conversation'; id: string; title: string }
  | { type: 'turn'; id: string; question: string }

function ConversationsPanel({
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  onRequestDelete,
}: Pick<
  KnowledgeQaPageProps,
  'conversations' | 'activeConversationId' | 'onSelectConversation' | 'onNewConversation'
> & {
  onRequestDelete: (conversation: KnowledgeQaConversationView) => void
}) {
  return (
    <Card className="h-full border-border/50 bg-card/92" data-testid="knowledge-qa-conversations">
      <CardContent className="flex h-full min-h-0 flex-col p-4">
        <Button className="h-10 w-full justify-start rounded-lg" onClick={onNewConversation}>
          <Plus className="h-4 w-4" />
          新建对话
        </Button>

        <div className="mt-5 flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <History className="h-3.5 w-3.5" />
          历史对话
        </div>

        <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {conversations.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/60 bg-card/60 p-4 text-xs leading-5 text-muted-foreground">
              还没有历史对话。发送第一个问题后会自动保存。
            </div>
          ) : (
            conversations.map((conversation) => {
              const active = conversation.id === activeConversationId
              return (
                <div
                  key={conversation.id}
                  className={cn(
                    'group/conversation flex w-full items-start gap-2 rounded-lg border px-3 py-3 text-left transition-colors',
                    active
                      ? 'border-foreground/20 bg-foreground/[0.06] text-foreground'
                      : 'border-border/45 bg-card/70 text-muted-foreground hover:border-border hover:bg-muted/35 hover:text-foreground'
                  )}
                >
                  <button
                    type="button"
                    aria-label={`打开对话 ${conversation.title}`}
                    onClick={() => onSelectConversation(conversation.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate text-sm font-medium">{conversation.title}</span>
                    <span className="mt-1 flex items-center justify-between gap-2 text-[11px]">
                      <span>{formatConversationTime(conversation.updatedAt)}</span>
                      <span>
                        {conversation.documentIds.length > 0
                          ? `${conversation.documentIds.length} 份文档`
                          : '全部文档'}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`删除对话 ${conversation.title}`}
                    onClick={() => onRequestDelete(conversation)}
                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/25 group-hover/conversation:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )
            })
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function ScopeMenu({
  documents,
  selectedDocumentIds,
  onToggleDocument,
  onClearDocuments,
}: Pick<
  KnowledgeQaPageProps,
  'documents' | 'selectedDocumentIds' | 'onToggleDocument' | 'onClearDocuments'
>) {
  const readyCount = documents.filter((document) => document.status === 'ready').length
  const scopeLabel =
    selectedDocumentIds.length > 0 ? `已选 ${selectedDocumentIds.length} 份` : '全部已向量化文档'

  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        align="start"
        side="top"
        sideOffset={10}
        collisionPadding={16}
        className="z-[80] w-[320px] rounded-xl border border-line-soft bg-paper-card p-2 text-ink shadow-card outline-none data-[state=open]:animate-fade-in"
        data-testid="knowledge-qa-scope-menu"
      >
        <div className="flex items-center justify-between gap-3 border-b border-line-soft/70 px-2 py-2">
          <div className="min-w-0">
            <p className="text-xs font-medium text-ink">{scopeLabel}</p>
            <p className="mt-0.5 text-[11px] text-ink-soft">
              {readyCount}/{documents.length} 可用
            </p>
          </div>
          {selectedDocumentIds.length > 0 ? (
            <button
              type="button"
              onClick={onClearDocuments}
              className="shrink-0 rounded-md px-2 py-1 text-[11px] text-ink-muted transition hover:bg-paper-muted hover:text-ink"
            >
              清除
            </button>
          ) : null}
        </div>

        <div className="mt-1 max-h-72 overflow-y-auto py-1">
          {documents.length === 0 ? (
            <div className="px-2 py-6 text-center text-xs leading-5 text-ink-muted">
              当前没有可用于 RAG 问答的文档。请先解析文档并生成向量。
            </div>
          ) : (
            documents.map((doc) => {
              const active = selectedDocumentIds.includes(doc.id)
              return (
                <DropdownMenuPrimitive.CheckboxItem
                  key={doc.id}
                  checked={active}
                  onClick={() => onToggleDocument(doc.id)}
                  className={cn(
                    'flex h-9 cursor-pointer select-none items-center gap-2 rounded-lg px-2 text-xs outline-none transition-colors',
                    active
                      ? 'bg-ink/[0.06] text-ink'
                      : 'text-ink-muted hover:bg-paper-muted hover:text-ink'
                  )}
                  onSelect={(event) => event.preventDefault()}
                >
                  <span
                    className={cn(
                      'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border text-[10px] leading-none',
                      active
                        ? 'border-ink bg-ink text-paper-card'
                        : 'border-line-soft bg-paper-card'
                    )}
                    aria-hidden
                  >
                    {active ? '✓' : null}
                  </span>
                  <FileText className="h-3.5 w-3.5 shrink-0 text-ink-soft" />
                  <span className="min-w-0 flex-1 truncate font-medium">{doc.title}</span>
                  <Badge
                    variant={doc.status === 'embedding_failed' ? 'destructive' : 'secondary'}
                    className="shrink-0 rounded-md px-1.5 py-0 text-[10px]"
                  >
                    {DOCUMENT_STATUS_LABELS[doc.status]}
                  </Badge>
                </DropdownMenuPrimitive.CheckboxItem>
              )
            })
          )}
        </div>
      </DropdownMenuPrimitive.Content>
    </DropdownMenuPrimitive.Portal>
  )
}

function WarningBanner({
  title,
  message,
  isRestartingService,
  onRestartService,
}: {
  title: string
  message?: string | null
  isRestartingService?: boolean
  onRestartService: () => void
}) {
  return (
    <Card className="border-border/50 bg-card">
      <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-themeAccent-warning/10">
            <FileText className="h-4 w-4 text-themeAccent-warning" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{title}</p>
            {message ? <p className="mt-1 text-sm text-muted-foreground">{message}</p> : null}
          </div>
        </div>
        <Button
          variant="outline"
          onClick={onRestartService}
          disabled={isRestartingService}
          className="rounded-lg"
        >
          <RefreshCcw className="h-4 w-4" />
          {isRestartingService ? '重启中' : '重启服务'}
        </Button>
      </CardContent>
    </Card>
  )
}

function UserMessage({ content, anchorId }: { content: string; anchorId: string }) {
  return (
    <div id={anchorId} className="scroll-mt-4">
      <div className="flex justify-end">
        <div className="max-w-lg">
          <Card className="border-border/50 bg-chart-2/10">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">你</p>
              <p className="mt-2 text-sm text-foreground">{content}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function CitationBadge({ citation, index }: { citation: KnowledgeQaCitationView; index: number }) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={`引用 ${index + 1}`}
        className="ml-1 inline-flex h-5 w-5 -translate-y-1 items-center justify-center rounded-full border border-ink/20 bg-paper-card align-super text-[10px] font-medium leading-none text-ink shadow-card transition hover:border-ink/35 hover:bg-paper-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/25"
      >
        {index + 1}
      </button>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-[90] mb-2 hidden max-h-80 w-80 max-w-[calc(100vw-2rem)] -translate-x-1/2 overflow-y-auto rounded-md border border-line-soft bg-paper-card p-3 text-left text-xs leading-5 text-ink shadow-card group-focus-within:block group-hover:block">
        <span
          className="block space-y-2 whitespace-normal break-words [overflow-wrap:anywhere]"
          data-testid="knowledge-qa-citation-card"
        >
          <span className="block">
            <span className="block truncate text-xs font-medium text-ink">
              {citation.documentTitle}
            </span>
            <span className="mt-0.5 block text-[11px] text-ink-soft">{citation.pageLabel}</span>
          </span>
          <span className="block whitespace-pre-wrap text-xs leading-5 text-ink-muted">
            {citation.snippet}
          </span>
        </span>
      </span>
    </span>
  )
}

function knowledgeRetrievalStatusLabel(status?: KnowledgeQaTurnView['retrievalStatus']) {
  switch (status) {
    case 'embedding_config_error':
      return 'embedding 配置不可用，已使用原文摘录兜底'
    case 'embedding_auth_error':
      return 'embedding 鉴权失败，已使用原文摘录兜底'
    case 'embedding_timeout':
      return '问题向量生成超时，已使用原文摘录兜底'
    case 'embedding_rate_limited':
      return 'embedding 服务限流，已使用原文摘录兜底'
    case 'embedding_dimension_mismatch':
      return 'embedding 维度不匹配，已使用原文摘录兜底'
    case 'embedding_network_error':
      return 'embedding 服务连接失败，已使用原文摘录兜底'
    case 'query_embedding_failed':
      return '问题向量生成失败，已使用原文摘录兜底'
    default:
      return null
  }
}

function AnswerMeta({
  answerMode,
  retrievalStatus,
  sessionMemoryUsed,
  sessionMemorySummary,
}: {
  answerMode?: KnowledgeQaTurnView['answerMode']
  retrievalStatus?: KnowledgeQaTurnView['retrievalStatus']
  sessionMemoryUsed?: boolean
  sessionMemorySummary?: string | null
}) {
  const isPlainGrounded = !answerMode || (answerMode === 'grounded' && retrievalStatus === 'ready')

  if (isPlainGrounded) {
    return null
  }

  const statusLabels: Record<string, string> = {
    embedding_missing: '需要先配置 embedding 并生成文档向量',
    embedding_stale: '文档向量已过期，请重新生成',
    embedding_failed: '文档向量生成失败，请重试',
    no_hits: '当前资料不足以回答',
    ready: '当前资料不足以回答',
  }
  const label =
    knowledgeRetrievalStatusLabel(retrievalStatus) ??
    (retrievalStatus ? statusLabels[retrievalStatus] : undefined) ??
    (answerMode === 'excerpt_fallback' ? '仅展示原文摘录' : '未能基于资料回答')

  return (
    <div className="mb-3" data-testid="knowledge-qa-answer-meta">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="rounded-md">
          {label}
        </Badge>
        {sessionMemoryUsed ? (
          <Badge
            variant="secondary"
            className="rounded-md border border-border/60 bg-card text-xs text-muted-foreground"
            title={sessionMemorySummary ?? '本轮回答使用了会话记忆辅助理解指代'}
          >
            使用了会话记忆
          </Badge>
        ) : null}
      </div>
    </div>
  )
}

function AssistantMessage({
  content,
  citations,
  answerMode,
  retrievalStatus,
  ragTrace,
  sessionMemoryUsed,
  sessionMemorySummary,
  anchorId,
  actions,
}: {
  content: string
  citations: KnowledgeQaCitationView[]
  answerMode?: KnowledgeQaTurnView['answerMode']
  retrievalStatus?: KnowledgeQaTurnView['retrievalStatus']
  ragTrace?: KnowledgeQaTurnView['ragTrace']
  sessionMemoryUsed?: KnowledgeQaTurnView['sessionMemoryUsed']
  sessionMemorySummary?: KnowledgeQaTurnView['sessionMemorySummary']
  anchorId: string
  actions?: ReactNode
}) {
  return (
    <div id={anchorId} className="scroll-mt-4">
      <div className="flex justify-start">
        <div className="max-w-2xl">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-foreground/5 text-xs text-foreground">
            AI
          </div>
          <Card className="mt-2 border-border/50 bg-card">
            <CardContent className="p-4">
              <AnswerMeta
                answerMode={answerMode}
                retrievalStatus={retrievalStatus}
                sessionMemoryUsed={sessionMemoryUsed}
                sessionMemorySummary={sessionMemorySummary}
              />
              {ragTrace ? <RagTracePanel ragTrace={ragTrace} /> : null}
              <CardMarkdownRenderer content={content} variant="knowledge" />
              {citations.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5" aria-label="引用">
                  {citations.map((citation, citationIndex) => (
                    <CitationBadge key={citation.id} citation={citation} index={citationIndex} />
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
          {actions}
        </div>
      </div>
    </div>
  )
}

function StreamingIndicator({
  anchorId,
  progressSteps,
}: {
  anchorId: string
  progressSteps?: RagProgressStep[]
}) {
  return (
    <div
      id={anchorId}
      className="scroll-mt-4"
    >
      <div className="flex justify-start">
        <div className="max-w-2xl">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-foreground/5 text-xs">
            AI
          </div>
          <Card className="mt-2 border-border/50 bg-card">
            <CardContent className="p-4">
              <RagProgressCard steps={progressSteps ?? []} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function CancelledNotice({ message, anchorId }: { message?: string | null; anchorId: string }) {
  return (
    <div id={anchorId} className="scroll-mt-4">
      <div className="flex justify-start">
        <Card className="border-border/50 bg-card">
          <CardContent className="p-3 text-sm text-muted-foreground">
            {message && message !== 'Cancelled by user' ? message : '回答已停止，历史已保留。'}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export function getKnowledgeQaDisplayError(rawMessage?: string | null): string {
  if (!rawMessage) {
    return '知识问答生成失败，请检查服务和配置后重试。'
  }

  const message = rawMessage.trim()
  const lower = message.toLowerCase()
  if (lower.includes('provider_timeout') || lower.includes('timed out') || lower.includes('timeout')) {
    return 'Model request timed out. Try a smaller document scope or a more reliable provider.'
  }
  if (lower.includes('provider_validation_failed') || lower.includes('field required') || lower.includes('extra inputs')) {
    return 'Model response failed workflow schema validation. Retry or switch to a model that follows structured JSON better.'
  }
  if (lower.includes('provider_invalid_json') || lower.includes('invalid_json') || lower.includes('json')) {
    return 'Model returned invalid JSON. Retry; if it repeats, switch models or simplify the question.'
  }
  if (lower.includes('citation_invalid') || lower.includes('citation_audit_failed')) {
    return 'Citation audit failed. The answer was blocked because sources could not be verified.'
  }
  if (lower.includes('host_gateway_error')) {
    return 'Host Gateway call failed. Check the local desktop service and retry.'
  }
  if (lower.includes('workflow_exception') || lower.includes('knowledge qa workflow failed')) {
    return 'Knowledge QA backend workflow failed. Check workflow details, adjust the scope or model configuration, then retry.'
  }
  if (
    lower.includes('provider_timeout') ||
    lower.includes('timed out') ||
    lower.includes('timeout')
  ) {
    return '模型响应超时，请稍后重试。'
  }
  if (lower.includes('invalid_json') || lower.includes('json')) {
    return '模型返回格式无效，请重试；如果持续出现，请更换模型或降低问题复杂度。'
  }
  if (lower.includes('citation_invalid')) {
    return '回答引用未通过校验，本次结果未展示为成功回答。请重试。'
  }
  if (lower.includes('embedding_config_error')) {
    return '当前 embedding 配置不可用。请在设置中检查启用状态、API Key 和工作流绑定。'
  }
  if (lower.includes('embedding_auth_error')) {
    return 'embedding 鉴权失败。请检查 API Key、Base URL 和模型权限。'
  }
  if (lower.includes('embedding_timeout')) {
    return '问题向量生成超时。请检查 embedding 服务响应速度，或稍后重试。'
  }
  if (lower.includes('embedding_rate_limited')) {
    return 'embedding 服务触发限流。请稍后重试，或切换到可用额度更充足的配置。'
  }
  if (lower.includes('embedding_dimension_mismatch')) {
    return '问题向量维度与文档向量不一致。请确认当前 embedding 模型与文档向量使用同一配置。'
  }
  if (lower.includes('embedding_network_error')) {
    return '无法连接 embedding 服务。请检查网络、代理或自定义 Base URL。'
  }
  if (lower.includes('query_embedding_failed')) {
    return '问题向量生成失败。已尝试用原文检索兜底，请检查 embedding 配置后重试。'
  }
  if (lower.includes('embedding_failed')) {
    return '文档向量生成失败，请在文档库重试生成向量后再提问。'
  }
  if (lower.includes('embedding_stale')) {
    return '文档向量已过期，请重新生成向量后再提问。'
  }
  if (lower.includes('embedding_missing')) {
    return '当前文档尚未完成向量生成，请先生成向量索引。'
  }
  if (lower.includes('cancelled')) {
    return '回答已停止。'
  }
  if (lower.includes('knowledge qa workflow failed')) {
    return '知识问答后台流程失败，请稍后重试。'
  }
  return message
}

function EmptyChatState({ onUsePrompt }: Pick<KnowledgeQaPageProps, 'onUsePrompt'>) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 py-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-dashed border-border/50">
        <MessageSquare className="h-6 w-6 text-muted-foreground/40" />
      </div>
      <div>
        <p className="text-base font-medium text-foreground">向文档提问</p>
        <p className="mt-1 text-sm text-muted-foreground">
          选择文档范围后提问，回答会附带可追溯引用。
        </p>
      </div>
      <div className="grid w-full max-w-lg grid-cols-1 gap-2 sm:grid-cols-2">
        {EXAMPLE_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            onClick={() => onUsePrompt(prompt)}
            className="rounded-xl border border-border/50 bg-card/80 p-3 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  )
}

function ConversationIndex({ turns }: { turns: KnowledgeQaTurnView[] }) {
  if (turns.length === 0) {
    return null
  }

  return (
    <aside
      className="hidden min-h-0 w-8 shrink-0 overflow-y-auto border-l border-border/35 px-1.5 py-4 xl:block"
      aria-label="对话索引"
      data-testid="knowledge-qa-turn-index"
    >
      <div className="flex min-h-full flex-col items-center justify-center gap-1.5">
        {turns.flatMap((turn) => [
          <IndexMark
            key={`${turn.id}-user`}
            roleLabel="我"
            text={turn.question}
            targetId={messageAnchor(turn.id, 'user')}
          />,
          <IndexMark
            key={`${turn.id}-assistant`}
            roleLabel="AI"
            text={assistantIndexText(turn)}
            targetId={messageAnchor(turn.id, 'assistant')}
          />,
        ])}
      </div>
    </aside>
  )
}

function IndexMark({
  roleLabel,
  text,
  targetId,
}: {
  roleLabel: '我' | 'AI'
  text: string
  targetId: string
}) {
  const label = `${roleLabel}：${previewText(text)}`
  return (
    <Tooltip content={label} delayDuration={120}>
      <button
        type="button"
        aria-label={label}
        onClick={() => scrollToMessage(targetId)}
        className={cn(
          'block h-[3px] w-4 rounded-full transition-all hover:w-5 focus-visible:w-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/25',
          roleLabel === '我' ? 'bg-ink-soft/45 hover:bg-ink-muted' : 'bg-ink/28 hover:bg-ink/55'
        )}
      />
    </Tooltip>
  )
}

function TurnActions({
  answer,
  copied,
  onCopy,
  onRegenerate,
  regenerateDisabled,
  onDelete,
}: {
  answer?: string | null
  copied?: boolean
  onCopy: () => void
  onRegenerate?: () => void
  regenerateDisabled?: boolean
  onDelete: () => void
}) {
  const canCopy = Boolean(answer?.trim())
  const copyLabel = copied ? '已复制' : '复制'
  return (
    <div className="mt-2 flex justify-end gap-1 pr-1" data-testid="knowledge-qa-turn-actions">
      <Tooltip content="重新生成" delayDuration={120}>
        <Button
          type="button"
          aria-label="重新生成"
          variant="ghost"
          size="icon-sm"
          className="h-7 w-7 rounded-md text-muted-foreground"
          onClick={onRegenerate}
          disabled={!onRegenerate || regenerateDisabled}
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      </Tooltip>
      <Tooltip content={copyLabel} delayDuration={120}>
        <Button
          type="button"
          aria-label={copyLabel}
          variant="ghost"
          size="icon-sm"
          className="h-7 w-7 rounded-md text-muted-foreground"
          onClick={onCopy}
          disabled={!canCopy}
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </Tooltip>
      <Tooltip content="删除" delayDuration={120}>
        <Button
          type="button"
          aria-label="删除"
          variant="ghost"
          size="icon-sm"
          className="h-7 w-7 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </Tooltip>
    </div>
  )
}

function DeleteConfirmDialog({
  target,
  onClose,
  onConfirm,
}: {
  target: DeleteTarget | null
  onClose: () => void
  onConfirm: (target: DeleteTarget) => void
}) {
  const isConversation = target?.type === 'conversation'
  const description =
    target?.type === 'conversation'
      ? `将永久删除对话「${target.title}」以及其中的全部问答。`
      : `将永久删除这一次提问和对应回答：${target?.type === 'turn' ? previewText(target.question) : ''}`
  return (
    <Dialog open={Boolean(target)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isConversation ? '删除对话' : '删除问答'}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (target) {
                onConfirm(target)
              }
            }}
          >
            确认删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ChatInput({
  question,
  documents,
  isSubmitting,
  submitDisabledReason,
  activePendingTurnId,
  onQuestionChange,
  onSubmit,
  onCancelActiveQuestion,
  selectedDocumentIds,
  onToggleDocument,
  onClearDocuments,
}: Pick<
  KnowledgeQaPageProps,
  | 'question'
  | 'documents'
  | 'isSubmitting'
  | 'submitDisabledReason'
  | 'onQuestionChange'
  | 'onSubmit'
  | 'selectedDocumentIds'
  | 'onToggleDocument'
  | 'onClearDocuments'
> & {
  activePendingTurnId: string | null
  onCancelActiveQuestion: (turnId: string) => void
}) {
  const submitDisabled = Boolean(isSubmitting || submitDisabledReason)
  return (
    <div
      className="shrink-0 border-t border-border/30 bg-background/96 p-4 backdrop-blur"
      data-testid="knowledge-qa-toolbar"
    >
      <div className="flex items-center gap-3">
        <DropdownMenuPrimitive.Root modal={false}>
          <DropdownMenuPrimitive.Trigger asChild>
            <Button variant="outline" size="sm" className="h-11 gap-2 rounded-xl border-border/50">
              <FileText className="h-4 w-4" />
              范围
              <Badge variant="secondary" className="ml-1 rounded-md">
                {selectedDocumentIds.length > 0 ? selectedDocumentIds.length : '全部'}
              </Badge>
            </Button>
          </DropdownMenuPrimitive.Trigger>
          <ScopeMenu
            documents={documents}
            selectedDocumentIds={selectedDocumentIds}
            onToggleDocument={onToggleDocument}
            onClearDocuments={onClearDocuments}
          />
        </DropdownMenuPrimitive.Root>

        <Input
          value={question}
          onChange={(event) => onQuestionChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              if (!submitDisabled) {
                onSubmit()
              }
            }
          }}
          placeholder="基于资料提问..."
          className="h-11 flex-1 rounded-xl border-border/50 bg-card px-4"
          disabled={Boolean(isSubmitting)}
        />
        {activePendingTurnId ? (
          <Tooltip content="停止生成" delayDuration={120}>
            <Button
              className="h-11 w-11 rounded-xl p-0"
              onClick={() => onCancelActiveQuestion(activePendingTurnId)}
              aria-label="停止生成"
              variant="outline"
            >
              <Square className="h-4 w-4" />
            </Button>
          </Tooltip>
        ) : (
          <Button
            className="h-11 w-11 rounded-xl p-0"
            onClick={onSubmit}
            disabled={submitDisabled || !question.trim()}
            aria-label="发送问题"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        )}
      </div>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        {submitDisabledReason ?? '回答只使用当前检索到的文档片段，不使用通用知识补全。'}
      </p>
    </div>
  )
}

export function KnowledgeQaPage(props: KnowledgeQaPageProps) {
  const isEmpty = props.turns.length === 0
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [copiedTurnId, setCopiedTurnId] = useState<string | null>(null)
  const activePendingTurn =
    [...props.turns].reverse().find((turn) => turn.status === 'pending') ?? null
  const regenerateDisabled = Boolean(props.isRegenerateDisabled || activePendingTurn)

  const handleCopyAnswer = (turnId: string, answer?: string | null) => {
    if (!answer?.trim()) {
      return
    }
    void copyTextToClipboard(answer).then(() => {
      setCopiedTurnId(turnId)
      window.setTimeout(
        () => setCopiedTurnId((current) => (current === turnId ? null : current)),
        1600
      )
    })
  }

  if (!props.hasConfiguration) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden" data-testid="knowledge-qa-page">
        <div className="flex flex-1 items-center justify-center p-6">
          <UnconfiguredState feature="知识问答" onConfigure={props.onOpenSettings} />
        </div>
        <ChatInput
          question={props.question}
          documents={props.documents}
          isSubmitting={props.isSubmitting}
          submitDisabledReason={props.submitDisabledReason}
          activePendingTurnId={activePendingTurn?.id ?? null}
          onQuestionChange={props.onQuestionChange}
          onSubmit={props.onSubmit}
          onCancelActiveQuestion={props.onCancelQuestion}
          selectedDocumentIds={props.selectedDocumentIds}
          onToggleDocument={props.onToggleDocument}
          onClearDocuments={props.onClearDocuments}
        />
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden" data-testid="knowledge-qa-page">
      {props.serviceWarningTitle ? (
        <div className="shrink-0 px-6 pb-4 pt-6">
          <WarningBanner
            title={props.serviceWarningTitle}
            message={props.serviceWarningMessage}
            isRestartingService={props.isRestartingService}
            onRestartService={props.onRestartService}
          />
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 gap-4 overflow-hidden px-6 pb-0 pt-6 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_32px]">
        <aside className="hidden min-h-0 overflow-hidden pb-4 lg:block">
          <ConversationsPanel
            conversations={props.conversations}
            activeConversationId={props.activeConversationId}
            onSelectConversation={props.onSelectConversation}
            onNewConversation={props.onNewConversation}
            onRequestDelete={(conversation) =>
              setDeleteTarget({
                type: 'conversation',
                id: conversation.id,
                title: conversation.title,
              })
            }
          />
        </aside>

        <div className="flex min-h-0 flex-col overflow-hidden">
          <div
            className="min-h-0 flex-1 overflow-y-auto py-4 pr-1"
            data-testid="knowledge-qa-message-scroll"
          >
            {isEmpty ? (
              <EmptyChatState onUsePrompt={props.onUsePrompt} />
            ) : (
              <div className="space-y-6">
                {props.turns.map((turn) =>
                  turn.status === 'pending' ? (
                    <div key={turn.id} className="space-y-4">
                      <UserMessage
                        content={turn.question}
                        anchorId={messageAnchor(turn.id, 'user')}
                      />
                      <StreamingIndicator
                        anchorId={messageAnchor(turn.id, 'assistant')}
                        progressSteps={turn.ragProgressSteps}
                      />
                      <TurnActions
                        answer={null}
                        onCopy={() => undefined}
                        regenerateDisabled={regenerateDisabled}
                        onDelete={() =>
                          setDeleteTarget({ type: 'turn', id: turn.id, question: turn.question })
                        }
                      />
                    </div>
                  ) : turn.status === 'cancelled' ? (
                    <div key={turn.id} className="space-y-4">
                      <UserMessage
                        content={turn.question}
                        anchorId={messageAnchor(turn.id, 'user')}
                      />
                      <CancelledNotice
                        message={turn.errorMessage}
                        anchorId={messageAnchor(turn.id, 'assistant')}
                      />
                      <TurnActions
                        answer={null}
                        onCopy={() => undefined}
                        onRegenerate={() => props.onRetryQuestion(turn.id)}
                        regenerateDisabled={regenerateDisabled}
                        onDelete={() =>
                          setDeleteTarget({ type: 'turn', id: turn.id, question: turn.question })
                        }
                      />
                    </div>
                  ) : turn.status === 'error' ? (
                    <div key={turn.id} className="space-y-4">
                      <UserMessage
                        content={turn.question}
                        anchorId={messageAnchor(turn.id, 'user')}
                      />
                      <div id={messageAnchor(turn.id, 'assistant')} className="scroll-mt-4">
                        <InlineError
                          message={getKnowledgeQaDisplayError(turn.errorMessage)}
                          onRetry={() => props.onRetryQuestion(turn.id)}
                        />
                      </div>
                      <TurnActions
                        answer={null}
                        onCopy={() => undefined}
                        onRegenerate={() => props.onRetryQuestion(turn.id)}
                        regenerateDisabled={regenerateDisabled}
                        onDelete={() =>
                          setDeleteTarget({ type: 'turn', id: turn.id, question: turn.question })
                        }
                      />
                    </div>
                  ) : (
                    <div key={turn.id} className="space-y-4">
                      <UserMessage
                        content={turn.question}
                        anchorId={messageAnchor(turn.id, 'user')}
                      />
                      <AssistantMessage
                        content={turn.answer ?? ''}
                        answerMode={turn.answerMode}
                        retrievalStatus={turn.retrievalStatus}
                        citations={turn.citations}
                        ragTrace={turn.ragTrace}
                        sessionMemoryUsed={turn.sessionMemoryUsed}
                        sessionMemorySummary={turn.sessionMemorySummary}
                        anchorId={messageAnchor(turn.id, 'assistant')}
                        actions={
                          <TurnActions
                            answer={turn.answer}
                            copied={copiedTurnId === turn.id}
                            onCopy={() => handleCopyAnswer(turn.id, turn.answer)}
                            onRegenerate={() => props.onRetryQuestion(turn.id)}
                            regenerateDisabled={regenerateDisabled}
                            onDelete={() =>
                              setDeleteTarget({
                                type: 'turn',
                                id: turn.id,
                                question: turn.question,
                              })
                            }
                          />
                        }
                      />
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        </div>

        <ConversationIndex turns={props.turns} />
      </div>

      <ChatInput
        question={props.question}
        documents={props.documents}
        isSubmitting={props.isSubmitting}
        submitDisabledReason={props.submitDisabledReason}
        activePendingTurnId={activePendingTurn?.id ?? null}
        onQuestionChange={props.onQuestionChange}
        onSubmit={props.onSubmit}
        onCancelActiveQuestion={props.onCancelQuestion}
        selectedDocumentIds={props.selectedDocumentIds}
        onToggleDocument={props.onToggleDocument}
        onClearDocuments={props.onClearDocuments}
      />
      <DeleteConfirmDialog
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={(target) => {
          if (target.type === 'conversation') {
            props.onDeleteConversation(target.id)
          } else {
            props.onDeleteTurn(target.id)
          }
          setDeleteTarget(null)
        }}
      />
    </div>
  )
}

function formatConversationTime(value: Date) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return '未知时间'
  }

  const now = Date.now()
  const diffMs = Math.max(0, now - value.getTime())
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (diffMs < minute) return '刚刚'
  if (diffMs < hour) return `${Math.floor(diffMs / minute)} 分钟前`
  if (diffMs < day) return `${Math.floor(diffMs / hour)} 小时前`
  return `${value.getMonth() + 1}/${value.getDate()}`
}

function messageAnchor(turnId: string, role: 'user' | 'assistant') {
  return `knowledge-turn-${turnId}-${role}`
}

function assistantIndexText(turn: KnowledgeQaTurnView) {
  if (turn.status === 'pending') return '正在检索'
  if (turn.status === 'cancelled') return '回答已停止'
  if (turn.status === 'error') return getKnowledgeQaDisplayError(turn.errorMessage)
  return turn.answer ?? ''
}

function previewText(value: string) {
  const compact = value.replace(/\s+/g, '')
  return compact.length > 5 ? compact.slice(0, 5) : compact || '空内容'
}

function scrollToMessage(targetId: string) {
  document.getElementById(targetId)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}

async function copyTextToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}
