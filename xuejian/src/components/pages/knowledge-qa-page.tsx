import { useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  Loader2,
  MessageSquare,
  RefreshCcw,
  Send,
  Square,
} from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  InlineError,
  Input,
  UnconfiguredState,
} from '@/components/ui'
import { cn } from '@/lib/utils'

export interface KnowledgeQaDocumentScope {
  id: string
  title: string
  status: 'ready' | 'embedding_stale'
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
  retrievalStatus?: 'ready' | 'embedding_missing' | 'embedding_stale' | 'embedding_failed' | 'no_hits' | null
  status: 'pending' | 'answered' | 'error' | 'cancelled'
  errorMessage?: string | null
  citations: KnowledgeQaCitationView[]
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
  turns: KnowledgeQaTurnView[]
  citations: KnowledgeQaCitationView[]
  searchResults: KnowledgeQaSearchResultView[]
  isSubmitting?: boolean
  hasConfiguration?: boolean
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
  onRestartService: () => void
  onOpenSettings: () => void
}

const EXAMPLE_PROMPTS = [
  '这篇文章的核心观点是什么？',
  '作者如何解释这个概念？',
  '文中提到的关键步骤有哪些？',
  '这份材料的结论和依据分别是什么？',
]

function PageHeader({ scopedCount }: { scopedCount: number }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">AI ASSISTANT</p>
        <h1 className="mt-1 text-2xl font-medium text-foreground" data-testid="app-shell-page-title">
          知识问答
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          基于已就绪文档回答问题，并附带可回溯的引用片段。
        </p>
      </div>
      <Card className="border-border/50 bg-card">
        <CardContent className="flex items-center gap-3 p-3">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <div className="text-xs">
            <span className="text-muted-foreground">文档范围</span>
            <span className="ml-2 font-medium text-foreground">
              {scopedCount > 0 ? `已限定 ${scopedCount} 份` : '全部可用文档'}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function ScopeBar({
  documents,
  selectedDocumentIds,
  onToggleDocument,
  onClearDocuments,
}: Pick<KnowledgeQaPageProps, 'documents' | 'selectedDocumentIds' | 'onToggleDocument' | 'onClearDocuments'>) {
  if (documents.length === 0) {
    return (
      <Card className="mt-6 border-dashed border-border/60 bg-card/50">
        <CardContent className="p-4 text-sm text-muted-foreground">
          当前没有可限定的文档。只有状态为“可用”或“待更新”的文档会出现在这里。
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between" data-testid="knowledge-qa-toolbar">
      <div className="flex flex-wrap gap-2">
        {documents.map((doc) => {
          const active = selectedDocumentIds.includes(doc.id)
          return (
            <button
              key={doc.id}
              type="button"
              onClick={() => onToggleDocument(doc.id)}
              className={cn(
                'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors',
                active
                  ? 'border-foreground/20 bg-foreground/[0.06] text-foreground'
                  : 'border-border/50 bg-card/70 text-muted-foreground hover:text-foreground'
              )}
            >
              <span>{doc.title}</span>
              {doc.status === 'embedding_stale' ? (
                <Badge variant="secondary" className="rounded-md text-[10px]">
                  待更新
                </Badge>
              ) : null}
            </button>
          )
        })}
      </div>
      {selectedDocumentIds.length > 0 ? (
        <Button variant="outline" size="sm" className="rounded-lg" onClick={onClearDocuments}>
          清除限定
        </Button>
      ) : null}
    </div>
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
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10">
            <FileText className="h-4 w-4 text-amber-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{title}</p>
            {message ? <p className="mt-1 text-sm text-muted-foreground">{message}</p> : null}
          </div>
        </div>
        <Button variant="outline" onClick={onRestartService} disabled={isRestartingService} className="rounded-lg">
          <RefreshCcw className="h-4 w-4" />
          {isRestartingService ? '正在重启服务' : '重启服务'}
        </Button>
      </CardContent>
    </Card>
  )
}

function UserMessage({ content }: { content: string }) {
  return (
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
  )
}

function CitationCard({
  citation,
  onOpenCitation,
}: {
  citation: KnowledgeQaCitationView
  onOpenCitation: KnowledgeQaPageProps['onOpenCitation']
}) {
  return (
    <Card className="cursor-pointer border-border/50 bg-card transition-colors hover:bg-muted/30">
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <FileText className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs font-medium text-foreground">{citation.documentTitle}</span>
              <span className="text-xs text-muted-foreground">{citation.pageLabel}</span>
            </div>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{citation.snippet}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 shrink-0 gap-1 text-xs text-muted-foreground"
            onClick={() => onOpenCitation(citation.documentId)}
          >
            查看 <ExternalLink className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function AnswerMeta({
  answerMode,
  retrievalStatus,
}: {
  answerMode?: KnowledgeQaTurnView['answerMode']
  retrievalStatus?: KnowledgeQaTurnView['retrievalStatus']
}) {
  const isPlainGrounded =
    !answerMode || (answerMode === 'grounded' && retrievalStatus === 'ready')

  if (isPlainGrounded) {
    return null
  }

  let label = '结果已降级'
  if (retrievalStatus === 'embedding_missing') {
    label = '未配置嵌入模型，当前结果依赖词法检索'
  } else if (retrievalStatus === 'embedding_stale') {
    label = '向量索引已过期，结果可能不稳定'
  } else if (retrievalStatus === 'embedding_failed') {
    label = '向量索引失败，当前结果依赖回退检索'
  } else if (retrievalStatus === 'no_hits') {
    label = '当前范围内没有命中片段'
  } else if (answerMode === 'excerpt_fallback') {
    label = '未生成归纳答案，已回退为原文摘录'
  }

  return (
    <div className="mb-3 space-y-2" data-testid="knowledge-qa-answer-meta">
      <Badge variant="secondary" className="rounded-md">
        {label}
      </Badge>
    </div>
  )
}

function AssistantMessage({
  content,
  citations,
  answerMode,
  retrievalStatus,
  onOpenCitation,
}: {
  content: string
  citations: KnowledgeQaCitationView[]
  answerMode?: KnowledgeQaTurnView['answerMode']
  retrievalStatus?: KnowledgeQaTurnView['retrievalStatus']
  onOpenCitation: KnowledgeQaPageProps['onOpenCitation']
}) {
  const [showAllCitations, setShowAllCitations] = useState(false)
  const displayCitations = showAllCitations ? citations : citations.slice(0, 2)

  return (
    <div className="flex justify-start">
      <div className="max-w-2xl">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-foreground/5 text-foreground">
            <span className="text-xs">AI</span>
          </div>
        </div>
        <Card className="mt-2 border-border/50 bg-card">
          <CardContent className="p-4">
            <AnswerMeta
              answerMode={answerMode}
              retrievalStatus={retrievalStatus}
            />
            <div className="prose prose-sm max-w-none text-foreground">
              {content.split('\n\n').map((paragraph, idx) => (
                <p key={idx} className="mb-3 text-sm leading-relaxed last:mb-0">
                  {paragraph}
                </p>
              ))}
            </div>

            {citations.length > 0 ? (
              <div className="mt-4 border-t border-border/30 pt-4">
                <button
                  onClick={() => setShowAllCitations(!showAllCitations)}
                  className="mb-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  引用来源 ({citations.length})
                  {showAllCitations ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
                <div className="grid grid-cols-2 gap-2">
                  {displayCitations.map((citation) => (
                    <CitationCard key={citation.id} citation={citation} onOpenCitation={onOpenCitation} />
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function StreamingIndicator({ onCancel }: { onCancel: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-foreground/5">
        <span className="text-xs">AI</span>
      </div>
      <Card className="border-border/50 bg-card">
        <CardContent className="flex items-center gap-2 p-3">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          <Button variant="outline" size="sm" className="h-7 gap-1 rounded-lg text-xs" onClick={onCancel}>
            <Square className="h-3 w-3" />
            停止
          </Button>
          <span className="text-xs text-muted-foreground">正在检索文档并生成回答…</span>
        </CardContent>
      </Card>
    </div>
  )
}

function EmptyChatState({ onUsePrompt }: Pick<KnowledgeQaPageProps, 'onUsePrompt'>) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 py-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-dashed border-border/50">
        <MessageSquare className="h-6 w-6 text-muted-foreground/40" />
      </div>
      <div>
        <p className="text-base font-medium text-foreground">基于文档发起对话</p>
        <p className="mt-1 text-sm text-muted-foreground">可限定到已就绪文档，也可以直接对全部可用文档提问。</p>
      </div>
      <div className="grid w-full max-w-lg grid-cols-2 gap-2">
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

function CitationsSidebar({
  citations,
  onOpenCitation,
}: {
  citations: KnowledgeQaCitationView[]
  onOpenCitation: KnowledgeQaPageProps['onOpenCitation']
}) {
  return (
    <Card className="border-border/50 bg-card">
      <CardContent className="p-4">
        <h4 className="mb-3 text-sm font-medium text-foreground">引用来源</h4>
        <div className="space-y-3">
          {citations.map((citation) => (
            <div key={citation.id} className="rounded-lg border border-border/40 bg-background/50 p-3">
              <div className="flex items-center gap-2">
                <FileText className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs font-medium text-foreground">{citation.documentTitle}</span>
                <span className="text-xs text-muted-foreground">{citation.pageLabel}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{citation.snippet}</p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 h-6 gap-1 px-0 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => onOpenCitation(citation.documentId)}
              >
                在文档中查看 <ExternalLink className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function ChatInput({
  question,
  isSubmitting,
  onQuestionChange,
  onSubmit,
  selectedDocumentIds,
}: Pick<KnowledgeQaPageProps, 'question' | 'isSubmitting' | 'onQuestionChange' | 'onSubmit' | 'selectedDocumentIds'>) {
  return (
    <div className="border-t border-border/30 bg-background p-4">
      <div className="flex items-center gap-3">
        <Input
          value={question}
          onChange={(event) => onQuestionChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              onSubmit()
            }
          }}
          placeholder="请输入你的问题..."
          className="h-11 flex-1 rounded-xl border-border/50 bg-card px-4"
          disabled={isSubmitting}
        />
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-9 gap-2 rounded-lg border-border/50" disabled>
            <FileText className="h-4 w-4" />
            已选文档
            {selectedDocumentIds.length > 0 ? (
              <Badge variant="secondary" className="ml-1 rounded-md">
                {selectedDocumentIds.length}
              </Badge>
            ) : null}
            <ChevronDown className="h-3 w-3" />
          </Button>
          <Button
            className="h-11 w-11 rounded-xl p-0"
            onClick={onSubmit}
            disabled={isSubmitting || !question.trim()}
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-5 w-5" />}
          </Button>
        </div>
      </div>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        回答会优先基于命中的文档片段生成；请结合原文引用自行判断。
      </p>
    </div>
  )
}

export function KnowledgeQaPage(props: KnowledgeQaPageProps) {
  if (!props.hasConfiguration) {
    return (
      <div className="flex h-full flex-col" data-testid="knowledge-qa-page">
        <div className="p-6 pb-0">
          <PageHeader scopedCount={props.selectedDocumentIds.length} />
        </div>
        <div className="flex flex-1 items-center justify-center p-6">
          <UnconfiguredState feature="知识问答" onConfigure={props.onOpenSettings} />
        </div>
        <ChatInput
          question={props.question}
          isSubmitting={props.isSubmitting}
          onQuestionChange={props.onQuestionChange}
          onSubmit={props.onSubmit}
          selectedDocumentIds={props.selectedDocumentIds}
        />
      </div>
    )
  }

  const allCitations = props.citations
  const isEmpty = props.turns.length === 0

  return (
    <div className="flex h-full flex-col" data-testid="knowledge-qa-page">
      <div className="p-6 pb-0">
        <PageHeader scopedCount={props.selectedDocumentIds.length} />
        <ScopeBar
          documents={props.documents}
          selectedDocumentIds={props.selectedDocumentIds}
          onToggleDocument={props.onToggleDocument}
          onClearDocuments={props.onClearDocuments}
        />
        {props.serviceWarningTitle ? (
          <div className="mt-4">
            <WarningBanner
              title={props.serviceWarningTitle}
              message={props.serviceWarningMessage}
              isRestartingService={props.isRestartingService}
              onRestartService={props.onRestartService}
            />
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 gap-6 overflow-hidden px-6 pb-0">
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto py-4">
            {isEmpty ? (
              <EmptyChatState onUsePrompt={props.onUsePrompt} />
            ) : (
              <div className="space-y-6">
                {props.turns.map((turn) =>
                  turn.status === 'pending' ? (
                    <div key={turn.id}>
                      <UserMessage content={turn.question} />
                      <div className="mt-4">
                        <StreamingIndicator onCancel={() => props.onCancelQuestion(turn.id)} />
                      </div>
                    </div>
                  ) : turn.status === 'cancelled' ? (
                    <div key={turn.id}>
                      <UserMessage content={turn.question} />
                      <div className="mt-4">
                        <InlineError
                          message={turn.errorMessage ?? '回答已停止，历史已保留。'}
                          onRetry={() => props.onRetryQuestion(turn.id)}
                        />
                      </div>
                    </div>
                  ) : turn.status === 'error' ? (
                    <div key={turn.id}>
                      <UserMessage content={turn.question} />
                      <div className="mt-4">
                        <InlineError
                          message={turn.errorMessage ?? '回答生成失败，请检查服务和配置后重试。'}
                          onRetry={() => props.onRetryQuestion(turn.id)}
                        />
                      </div>
                    </div>
                  ) : (
                    <div key={turn.id}>
                      <UserMessage content={turn.question} />
                      <div className="mt-4">
                        <AssistantMessage
                          content={turn.answer ?? ''}
                          answerMode={turn.answerMode}
                          retrievalStatus={turn.retrievalStatus}
                          citations={turn.citations}
                          onOpenCitation={props.onOpenCitation}
                        />
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        </div>

        {!isEmpty && allCitations.length > 0 ? (
          <div className="w-80 shrink-0 overflow-y-auto pb-4">
            <CitationsSidebar citations={allCitations} onOpenCitation={props.onOpenCitation} />
            {props.searchResults.length > 0 ? (
              <div className="mt-4">
                <Card className="border-border/50 bg-card">
                  <CardContent className="p-4">
                    <h4 className="mb-3 text-sm font-medium text-foreground">相关检索片段</h4>
                    <div className="space-y-3">
                      {props.searchResults.slice(0, 5).map((result) => (
                        <button
                          key={result.id}
                          type="button"
                          onClick={() => props.onOpenCitation(result.documentId)}
                          className="w-full rounded-lg border border-border/40 bg-background/50 p-3 text-left transition-colors hover:bg-muted/30"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-foreground">{result.documentTitle}</p>
                              <p className="mt-1 text-xs text-muted-foreground">{result.pageLabel}</p>
                            </div>
                            <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
                          </div>
                          <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">{result.snippet}</p>
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <ChatInput
        question={props.question}
        isSubmitting={props.isSubmitting}
        onQuestionChange={props.onQuestionChange}
        onSubmit={props.onSubmit}
        selectedDocumentIds={props.selectedDocumentIds}
      />
    </div>
  )
}
