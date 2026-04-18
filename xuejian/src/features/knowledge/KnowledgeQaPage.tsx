import { useCallback, useRef, useState } from 'react'
import { Button, Input, Panel } from '@/components/ui'
import { useStartKnowledgeQaMutation, useKnowledgeSearchQuery } from '@/queries/knowledge'
import { useDocumentsQuery } from '@/queries'
import { useAppUiStore } from '@/store'
import type { ChunkSearchResult } from '@/types'

interface QaHistoryEntry {
  question: string
  answer: string | null
  citations: Array<{
    chunkId: string
    documentId: string
    snippet: string
  }>
  isLoading: boolean
  error: string | null
}

export function KnowledgeQaPage() {
  const [question, setQuestion] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([])
  const [history, setHistory] = useState<QaHistoryEntry[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const { data: documents = [] } = useDocumentsQuery()
  const { data: searchResults = [] } = useKnowledgeSearchQuery(
    searchQuery,
    selectedDocIds,
    searchQuery.length > 0
  )
  const startQaMutation = useStartKnowledgeQaMutation()
  const openReader = useAppUiStore((state) => state.openReader)

  const handleAsk = useCallback(() => {
    const q = question.trim()
    if (!q || startQaMutation.isPending) return

    const entry: QaHistoryEntry = {
      question: q,
      answer: null,
      citations: [],
      isLoading: true,
      error: null,
    }
    setHistory((prev) => [entry, ...prev])
    setSearchQuery(q)
    setQuestion('')

    startQaMutation.mutate(
      { question: q, documentIds: selectedDocIds.length > 0 ? selectedDocIds : undefined },
      {
        onSuccess: () => {
          setHistory((prev) => {
            const updated = [...prev]
            if (updated[0]?.question === q) {
              updated[0] = {
                ...updated[0],
                isLoading: false,
                answer: '问答工作流已启动，请稍候查看结果。',
              }
            }
            return updated
          })
        },
        onError: (error) => {
          setHistory((prev) => {
            const updated = [...prev]
            if (updated[0]?.question === q) {
              updated[0] = {
                ...updated[0],
                isLoading: false,
                error: error instanceof Error ? error.message : '问答失败',
              }
            }
            return updated
          })
        },
      }
    )
  }, [question, selectedDocIds, startQaMutation])

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
    (documentId: string) => {
      openReader(documentId)
    },
    [openReader]
  )

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl text-ink">知识问答</h1>
        <p className="mt-1 font-body text-sm text-ink-muted">
          基于文档内容的智能问答，回答附带原文引用
        </p>
      </div>

      {/* Document scope selector */}
      {documents.length > 0 && (
        <Panel variant="paperCard" className="rounded-xl p-4">
          <p className="mb-2 font-ui text-xs font-medium uppercase tracking-wide text-ink-soft">
            限定文档范围（可选）
          </p>
          <div className="flex flex-wrap gap-2">
            {documents.map((doc) => (
              <button
                key={doc.id}
                onClick={() => toggleDoc(doc.id)}
                className={`rounded-lg border px-3 py-1.5 font-ui text-xs transition-colors ${
                  selectedDocIds.includes(doc.id)
                    ? 'border-ink/40 bg-ink/10 text-ink'
                    : 'border-line-soft bg-transparent text-ink-muted hover:border-ink/20'
                }`}
              >
                {doc.title}
              </button>
            ))}
          </div>
        </Panel>
      )}

      {/* Question input */}
      <div className="flex gap-3">
        <Input
          ref={inputRef}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入你的问题…"
          className="flex-1 rounded-xl"
        />
        <Button
          onClick={handleAsk}
          disabled={!question.trim() || startQaMutation.isPending}
          className="rounded-xl"
        >
          提问
        </Button>
      </div>

      {/* FTS5 search results preview */}
      {searchResults.length > 0 && (
        <Panel variant="paperCard" className="rounded-xl p-4">
          <p className="mb-3 font-ui text-xs font-medium uppercase tracking-wide text-ink-soft">
            相关文档片段 ({searchResults.length})
          </p>
          <div className="space-y-2">
            {searchResults.map((chunk: ChunkSearchResult) => (
              <div key={chunk.id} className="rounded-lg border border-line-soft p-3 text-sm">
                <p className="font-body text-ink">{chunk.snippet || chunk.content}</p>
                <p className="mt-1 font-ui text-xs text-ink-soft">
                  页 {chunk.pageStart ?? '?'}–{chunk.pageEnd ?? '?'}
                </p>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Q&A history */}
      {history.length > 0 && (
        <div className="space-y-4">
          {history.map((entry, idx) => (
            <Panel key={idx} variant="paperCard" className="rounded-xl p-5">
              <p className="mb-3 font-ui text-sm font-medium text-ink">Q: {entry.question}</p>
              {entry.isLoading && (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-ink/10 border-t-ink/40" />
                  <span className="font-body text-sm text-ink-muted">思考中…</span>
                </div>
              )}
              {entry.error && <p className="font-body text-sm text-red-600">{entry.error}</p>}
              {entry.answer && (
                <div>
                  <p className="font-body text-sm leading-relaxed text-ink">{entry.answer}</p>
                  {entry.citations.length > 0 && (
                    <div className="mt-3 space-y-1">
                      <p className="font-ui text-xs text-ink-soft">引用来源:</p>
                      {entry.citations.map((cit, citIdx) => (
                        <button
                          key={citIdx}
                          onClick={() => handleCitationClick(cit.documentId)}
                          className="block w-full rounded-lg border border-line-soft p-2 text-left transition-colors hover:bg-paper-muted"
                        >
                          <p className="font-body text-xs text-ink-muted">{cit.snippet}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Panel>
          ))}
        </div>
      )}

      {/* Empty state */}
      {history.length === 0 && searchResults.length === 0 && (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <div className="mb-4 text-4xl">📚</div>
            <p className="font-body text-sm text-ink-muted">输入问题，从文档中获取答案</p>
          </div>
        </div>
      )}
    </div>
  )
}
