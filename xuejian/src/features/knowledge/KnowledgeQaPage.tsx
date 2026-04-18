import { useCallback, useMemo, useRef, useState } from 'react'
import { Button, Input, Panel, SketchEmptyState } from '@/components/ui'
import {
  KnowledgeChatPanel,
  type KnowledgeChatCitation,
  type KnowledgeChatTurn,
} from '@/components/knowledge'
import { useStartKnowledgeQaMutation, useKnowledgeSearchQuery } from '@/queries/knowledge'
import { useDocumentsQuery } from '@/queries'
import { useAppUiStore } from '@/store'
import { cn } from '@/lib/utils'
import type { ChunkSearchResult } from '@/types'

type TurnState = KnowledgeChatTurn & { documentTitleCache: Map<string, string> }

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
  const inputRef = useRef<HTMLInputElement>(null)

  const { data: documents = [] } = useDocumentsQuery()
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

  const handleAsk = useCallback(
    (rawQuestion?: string) => {
      const q = (rawQuestion ?? question).trim()
      if (!q || startQaMutation.isPending) return

      const turnId = `turn-${Date.now()}`
      const pendingTurn: TurnState = {
        id: turnId,
        question: q,
        answer: null,
        citations: [],
        status: 'pending',
        documentTitleCache: new Map(documentTitleLookup),
      }

      setTurns((prev) => [pendingTurn, ...prev])
      setSearchQuery(q)
      setQuestion('')

      startQaMutation.mutate(
        { question: q, documentIds: selectedDocIds.length > 0 ? selectedDocIds : undefined },
        {
          onSuccess: () => {
            setTurns((prev) =>
              prev.map((turn) =>
                turn.id === turnId
                  ? {
                      ...turn,
                      status: 'answered',
                      answer: '问答工作流已启动。答案和引用会在后台生成后填入这里。',
                    }
                  : turn
              )
            )
          },
          onError: (error) => {
            setTurns((prev) =>
              prev.map((turn) =>
                turn.id === turnId
                  ? {
                      ...turn,
                      status: 'error',
                      errorMessage: error instanceof Error ? error.message : '问答失败',
                    }
                  : turn
              )
            )
          },
        }
      )
    },
    [documentTitleLookup, question, selectedDocIds, startQaMutation]
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
      handleAsk(turn.question)
    },
    [handleAsk]
  )

  const handleFillExample = useCallback((prompt: string) => {
    setQuestion(prompt)
    inputRef.current?.focus()
  }, [])

  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col gap-5 overflow-y-auto p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-ui text-[11px] uppercase tracking-[0.24em] text-ink-soft">
            Knowledge Workbench
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
            disabled={!question.trim() || startQaMutation.isPending}
            variant="sketch"
            className="rounded-[14px]"
          >
            提问
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
