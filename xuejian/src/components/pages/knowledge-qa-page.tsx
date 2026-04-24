import { AlertCircle, ArrowUpRight, BookOpen, RefreshCcw, Send } from 'lucide-react'
import { Button, Card, CardContent, Input, InlineError, UnconfiguredState, WorkspaceEmptyState } from '@/components/ui'
import { cn } from '@/lib/utils'

export interface KnowledgeQaDocumentScope {
  id: string
  title: string
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
  status: 'pending' | 'answered' | 'error'
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
  onToggleDocument: (documentId: string) => void
  onClearDocuments: () => void
  onUsePrompt: (prompt: string) => void
  onOpenCitation: (documentId: string) => void
  onRestartService: () => void
  onOpenSettings: () => void
}

const EXAMPLE_PROMPTS = [
  '这份资料的核心论点是什么？',
  '第 3 节与第 5 节之间是什么关系？',
  '帮我比较两篇文档里相似的概念。',
]

function Header({ scopedCount }: { scopedCount: number }) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">KNOWLEDGE QA</p>
        <h1 className="mt-1 text-2xl font-medium text-foreground" data-testid="app-shell-page-title">
          知识问答
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          采用参考编码的问答工作台结构，把对话主区、建议问题、引文侧栏和输入区统一到一套轻量骨架里。
        </p>
      </div>
      <Card className="border-border/50 bg-card">
        <CardContent className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted/50">
            <BookOpen className="h-4 w-4 text-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{scopedCount > 0 ? `已限定 ${scopedCount} 份文档` : '当前为全库范围'}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">真实搜索与 workflow 事件仍走现有链路</p>
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
                'rounded-full border px-3 py-1.5 text-xs transition-colors',
                active
                  ? 'border-foreground/20 bg-foreground/[0.06] text-foreground'
                  : 'border-border/50 bg-card/70 text-muted-foreground hover:text-foreground'
              )}
            >
              {doc.title}
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
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10">
            <AlertCircle className="h-4 w-4 text-destructive" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{title}</p>
            {message ? <p className="mt-1 text-sm text-muted-foreground">{message}</p> : null}
          </div>
        </div>
        <Button variant="outline" onClick={onRestartService} disabled={isRestartingService} className="rounded-lg">
          <RefreshCcw className="h-4 w-4" />
          {isRestartingService ? '正在重启服务' : '重启问答服务'}
        </Button>
      </CardContent>
    </Card>
  )
}

function EmptyChatState({ onUsePrompt }: Pick<KnowledgeQaPageProps, 'onUsePrompt'>) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-6 py-14 text-center">
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">从你的文档里问一个问题</p>
        <p className="max-w-xl text-sm leading-7 text-muted-foreground">
          输入问题后，系统会先检索相关文档块，再返回带引用的回答。你可以从右侧直接跳回原文继续阅读。
        </p>
      </div>
      <div className="grid w-full max-w-3xl gap-3 md:grid-cols-3">
        {EXAMPLE_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onUsePrompt(prompt)}
            className="rounded-xl border border-border/50 bg-card/70 p-4 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  )
}

function TurnCard({
  turn,
  onRetryQuestion,
}: {
  turn: KnowledgeQaTurnView
  onRetryQuestion: KnowledgeQaPageProps['onRetryQuestion']
}) {
  return (
    <Card className="border-border/50 bg-card">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">QUESTION</p>
            <p className="mt-2 text-sm font-medium text-foreground">{turn.question}</p>
          </div>
          {turn.status === 'pending' ? <span className="rounded-md bg-chart-5/12 px-2 py-1 text-xs text-chart-5">处理中</span> : null}
          {turn.status === 'answered' ? <span className="rounded-md bg-chart-1/15 px-2 py-1 text-xs text-chart-1">已回答</span> : null}
          {turn.status === 'error' ? <span className="rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">失败</span> : null}
        </div>
        {turn.status === 'error' ? (
          <InlineError message={turn.errorMessage ?? '问答工作流失败。'} onRetry={() => onRetryQuestion(turn.id)} />
        ) : turn.status === 'pending' ? (
          <div className="rounded-xl border border-border/50 bg-background/50 p-4 text-sm text-muted-foreground">
            正在等待 workflow 返回结果与引用片段……
          </div>
        ) : (
          <div className="rounded-xl border border-border/50 bg-background/50 p-4">
            <p className="whitespace-pre-wrap text-sm leading-7 text-foreground">{turn.answer}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Rail({
  title,
  emptyTitle,
  emptyDescription,
  items,
  onOpenCitation,
}: {
  title: string
  emptyTitle: string
  emptyDescription: string
  items: Array<{ id: string; documentId: string; documentTitle: string; pageLabel: string; snippet: string }>
  onOpenCitation: KnowledgeQaPageProps['onOpenCitation']
}) {
  return (
    <Card className="border-border/50 bg-card">
      <CardContent className="p-5">
        <h3 className="mb-4 text-sm font-medium text-foreground">{title}</h3>
        {items.length === 0 ? (
          <WorkspaceEmptyState className="min-h-[220px]" title={emptyTitle} description={emptyDescription} />
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onOpenCitation(item.documentId)}
                className="w-full rounded-xl border border-border/40 bg-background/50 p-4 text-left transition-colors hover:bg-muted/30"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.documentTitle}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.pageLabel}</p>
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="mt-3 line-clamp-4 text-xs leading-5 text-muted-foreground">{item.snippet}</p>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Composer({
  question,
  isSubmitting,
  onQuestionChange,
  onSubmit,
}: Pick<KnowledgeQaPageProps, 'question' | 'isSubmitting' | 'onQuestionChange' | 'onSubmit'>) {
  return (
    <Card className="border-border/50 bg-card">
      <CardContent className="p-5">
        <div className="flex flex-col gap-3 lg:flex-row">
          <Input
            value={question}
            onChange={(event) => onQuestionChange(event.target.value)}
            placeholder="输入你的问题，按 Enter 或点击发送"
            className="h-11 flex-1 rounded-xl border-border/50 bg-card px-4"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                onSubmit()
              }
            }}
          />
          <Button onClick={onSubmit} disabled={!question.trim() || isSubmitting} className="h-11 rounded-xl px-6">
            <Send className="h-4 w-4" />
            {isSubmitting ? '处理中' : '提问'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function KnowledgeQaPage(props: KnowledgeQaPageProps) {
  if (!props.hasConfiguration) {
    return (
      <div className="mx-auto w-full max-w-6xl" data-testid="knowledge-qa-page">
        <Card className="border-border/50 bg-card">
          <CardContent className="p-6">
            <UnconfiguredState feature="知识问答" onConfigure={props.onOpenSettings} />
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6" data-testid="knowledge-qa-page">
      <Header scopedCount={props.selectedDocumentIds.length} />
      <ScopeBar
        documents={props.documents}
        selectedDocumentIds={props.selectedDocumentIds}
        onToggleDocument={props.onToggleDocument}
        onClearDocuments={props.onClearDocuments}
      />
      {props.serviceWarningTitle ? (
        <WarningBanner
          title={props.serviceWarningTitle}
          message={props.serviceWarningMessage}
          isRestartingService={props.isRestartingService}
          onRestartService={props.onRestartService}
        />
      ) : null}
      <div className="grid min-h-0 flex-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-h-0 flex-col gap-5">
          <Card className="border-border/50 bg-card" data-testid="knowledge-qa-chat">
            <CardContent className="min-h-[560px] p-0">
              {props.turns.length === 0 ? (
                <EmptyChatState onUsePrompt={props.onUsePrompt} />
              ) : (
                <div className="space-y-4 p-5">
                  {props.turns.map((turn) => (
                    <TurnCard key={turn.id} turn={turn} onRetryQuestion={props.onRetryQuestion} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          <Composer
            question={props.question}
            isSubmitting={props.isSubmitting}
            onQuestionChange={props.onQuestionChange}
            onSubmit={props.onSubmit}
          />
        </div>
        <div className="space-y-5" data-testid="knowledge-qa-sidebar">
          <Rail
            title="引用侧栏"
            emptyTitle="等待第一条引用"
            emptyDescription="问答返回后，这里会集中显示最近回答引用的原文片段。"
            items={props.citations}
            onOpenCitation={props.onOpenCitation}
          />
          <Rail
            title="相关搜索片段"
            emptyTitle="等待搜索结果"
            emptyDescription="发送问题后，这里会展示当前问题命中的文档片段。"
            items={props.searchResults}
            onOpenCitation={props.onOpenCitation}
          />
        </div>
      </div>
    </div>
  )
}
