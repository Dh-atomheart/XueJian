import { type ReactNode } from 'react'
import { Panel } from '@/components/ui'
import { cn } from '@/lib/utils'

export interface KnowledgeChatCitation {
  /** Stable id used as React key. */
  id: string
  documentId: string
  documentTitle?: string
  page?: number | null
  snippet: string
  /** 0-1 normalised relevance score. Optional. */
  relevance?: number | null
}

export interface KnowledgeChatTurn {
  id: string
  question: string
  answer: string | null
  citations: KnowledgeChatCitation[]
  status: 'pending' | 'answered' | 'error'
  errorMessage?: string | null
}

export interface KnowledgeChatPanelProps {
  turns: KnowledgeChatTurn[]
  /** Header content above the conversation, optional. */
  header?: ReactNode
  /** Called when the user clicks a citation chip. */
  onOpenCitation?: (citation: KnowledgeChatCitation) => void
  /** Called when the user clicks "重试" on an errored turn. */
  onRetry?: (turn: KnowledgeChatTurn) => void
  emptyContent?: ReactNode
  className?: string
}

/**
 * RAG-style chat transcript. Conversation flows newest-first or
 * oldest-first based on the order of `turns` (caller decides).
 *
 * Each turn renders the user's question, the model's answer, and a
 * stack of citations that route back to the source document via
 * `onOpenCitation`. No data fetching here; consumers wire to gateway.
 */
export function KnowledgeChatPanel({
  turns,
  header,
  onOpenCitation,
  onRetry,
  emptyContent,
  className,
}: KnowledgeChatPanelProps) {
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {header}

      {turns.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-10">
          {emptyContent}
        </div>
      ) : (
        <ol className="space-y-6">
          {turns.map((turn) => (
            <li key={turn.id} className="space-y-3">
              <div className="flex justify-end">
                <Panel
                  variant="paperCard"
                  className="max-w-[80%] rounded-[20px] rounded-tr-[6px] border border-ink/15 bg-ink/[0.04] px-4 py-3"
                >
                  <p className="font-body text-sm leading-6 text-ink">{turn.question}</p>
                </Panel>
              </div>

              <div className="flex justify-start">
                <Panel
                  variant="paperCard"
                  className={cn(
                    'max-w-[88%] rounded-[20px] rounded-tl-[6px] border px-4 py-3',
                    turn.status === 'error'
                      ? 'border-highlight-pink/60 bg-highlight-pink/10'
                      : 'border-line-soft bg-paper-card'
                  )}
                >
                  {turn.status === 'pending' && <PendingIndicator />}

                  {turn.status === 'answered' && turn.answer && (
                    <p className="font-body text-sm leading-6 text-ink whitespace-pre-line">
                      {turn.answer}
                    </p>
                  )}

                  {turn.status === 'error' && (
                    <div className="space-y-2">
                      <p className="font-body text-sm leading-6 text-ink">
                        生成回答时出现问题。
                      </p>
                      {turn.errorMessage && (
                        <p className="font-latin text-xs text-ink-muted break-all">
                          {turn.errorMessage}
                        </p>
                      )}
                      {onRetry && (
                        <button
                          type="button"
                          onClick={() => onRetry(turn)}
                          className="rounded-full border border-ink/20 bg-paper-card px-3 py-1 font-ui text-xs text-ink hover:bg-paper-muted"
                        >
                          重试
                        </button>
                      )}
                    </div>
                  )}

                  {turn.status === 'answered' && turn.citations.length > 0 && (
                    <div className="mt-4 space-y-2 border-t border-dashed border-line-soft pt-3">
                      <p className="font-ui text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                        引用 {turn.citations.length}
                      </p>
                      <div className="space-y-2">
                        {turn.citations.map((citation) => (
                          <CitationItem
                            key={citation.id}
                            citation={citation}
                            onOpen={onOpenCitation}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {turn.status === 'answered' && turn.citations.length === 0 && (
                    <p className="mt-3 border-t border-dashed border-line-soft pt-2 font-ui text-[11px] text-ink-soft">
                      未检索到可信引用，结果仅供参考。
                    </p>
                  )}
                </Panel>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function PendingIndicator() {
  return (
    <div className="flex items-center gap-2 py-1" aria-live="polite">
      <Dot delay="0ms" />
      <Dot delay="150ms" />
      <Dot delay="300ms" />
      <span className="font-ui text-xs text-ink-soft">正在从知识库检索…</span>
    </div>
  )
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="block h-1.5 w-1.5 animate-pulse rounded-full bg-ink/40"
      style={{ animationDelay: delay }}
    />
  )
}

function CitationItem({
  citation,
  onOpen,
}: {
  citation: KnowledgeChatCitation
  onOpen?: (citation: KnowledgeChatCitation) => void
}) {
  const interactive = Boolean(onOpen)
  const Tag = interactive ? 'button' : 'div'

  return (
    <Tag
      type={interactive ? 'button' : undefined}
      onClick={interactive ? () => onOpen?.(citation) : undefined}
      className={cn(
        'block w-full rounded-[14px] border border-line-soft bg-paper-muted/55 px-3 py-2 text-left transition-colors',
        interactive && 'hover:border-ink/25 hover:bg-paper-muted'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-ui text-xs text-ink">
          {citation.documentTitle ?? '文档'}
        </span>
        <span className="flex items-center gap-2 font-latin text-[10px] text-ink-soft">
          {citation.page != null && <span>P.{citation.page}</span>}
          {citation.relevance != null && (
            <span title={`相关度 ${Math.round(citation.relevance * 100)}%`}>
              {Math.round(citation.relevance * 100)}%
            </span>
          )}
        </span>
      </div>
      <p className="mt-1 line-clamp-2 font-body text-xs leading-5 text-ink-muted">
        {citation.snippet}
      </p>
    </Tag>
  )
}
