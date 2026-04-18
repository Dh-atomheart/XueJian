import { useEffect, useMemo } from 'react'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import { useCardsQuery, useDocumentQuery, useHighlightsQuery } from '@/queries'
import { useAppUiStore } from '@/store'

interface StickyNotesPanelProps {
  documentId: string
}

export function StickyNotesPanel({ documentId }: StickyNotesPanelProps) {
  const reader = useAppUiStore((state) => state.reader)
  const closeReader = useAppUiStore((state) => state.closeReader)
  const setContextRailOpen = useAppUiStore((state) => state.setContextRailOpen)
  const setReaderPage = useAppUiStore((state) => state.setReaderPage)
  const selectCard = useAppUiStore((state) => state.selectCard)
  const { data: currentDocument } = useDocumentQuery(documentId)
  const { data: cards = [] } = useCardsQuery(
    { documentId, pageNumber: reader.currentPage, limit: 24 },
    { enabled: Boolean(documentId) }
  )
  const { data: highlights = [] } = useHighlightsQuery(
    { documentId, pageNumber: reader.currentPage, limit: 24 },
    { enabled: Boolean(documentId) }
  )

  const cardEntries = useMemo(
    () =>
      cards.map((card) => ({
        card,
        highlight: highlights.find((item) => item.cardId === card.id) ?? null,
      })),
    [cards, highlights]
  )

  useEffect(() => {
    if (!reader.selectedCardId) {
      return
    }

    const element = window.document.getElementById(`sticky-card-${reader.selectedCardId}`)
    element?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [reader.selectedCardId])

  return (
    <div className="flex h-full flex-col bg-[linear-gradient(180deg,rgba(251,251,249,0.96),rgba(245,243,236,0.98))]" data-testid="reader-context-rail">
      <div className="border-b border-line-soft px-4 py-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-ink-soft">Context Rail</p>
            <h2 className="mt-2 font-ui text-lg text-ink">当前页贴笺</h2>
            <p className="mt-1 text-xs leading-5 text-ink-soft">{currentDocument?.title ?? '正在加载文档标题'}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setContextRailOpen(false)}>
            收起
          </Button>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <RailMetric label="页码" value={`${reader.currentPage}/${Math.max(reader.totalPages, 1)}`} />
          <RailMetric label="贴笺" value={`${cards.length}`} />
          <RailMetric label="高亮" value={`${highlights.length}`} />
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 py-4">
        {cardEntries.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-line-soft bg-white/70 px-4 py-6 text-center">
            <p className="font-ui text-sm text-ink">当前页还没有贴笺</p>
            <p className="mt-2 text-sm leading-6 text-ink-soft">
              先在正文摘录里圈出关键句，或回到文档库切换到更有卡片的页面。
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setReaderPage(Math.max(1, reader.currentPage - 1))}>
                上一页
              </Button>
              <Button variant="ghost" size="sm" onClick={closeReader}>
                返回文档库
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {cardEntries.map(({ card, highlight }, index) => {
              const isSelected = reader.selectedCardId === card.id

              return (
                <button
                  key={card.id}
                  id={`sticky-card-${card.id}`}
                  type="button"
                  data-selected={isSelected ? 'true' : 'false'}
                  data-testid={`sticky-card-${card.id}`}
                  onClick={() => {
                    setReaderPage(card.sourcePage ?? reader.currentPage)
                    selectCard(card.id)
                  }}
                  className={cn(
                    'w-full rounded-[24px] border px-4 py-4 text-left transition-all',
                    isSelected
                      ? 'border-ink/25 bg-highlight-yellow/25 shadow-sticky'
                      : 'border-line-soft bg-white/80 hover:border-ink/15 hover:bg-white'
                  )}
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <span className="inline-flex rounded-full border border-ink/10 bg-white/70 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-ink-soft">
                        Note {index + 1}
                      </span>
                      <p className="mt-3 font-ui text-sm leading-6 text-ink">{card.front}</p>
                    </div>
                    <span className="shrink-0 text-[11px] text-ink-soft">页 {card.sourcePage ?? reader.currentPage}</span>
                  </div>

                  <p className="rounded-[18px] bg-paper-base/90 px-3 py-3 text-sm leading-6 text-ink-muted">
                    {highlight?.textContent ?? card.back}
                  </p>

                  <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-ink-soft">
                    <span>{card.tags.join(' · ') || '未分组贴笺'}</span>
                    <span>{highlight ? '含原文高亮' : '仅卡片定位'}</span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function RailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-line-soft bg-white/75 px-3 py-3">
      <p className="text-[10px] uppercase tracking-[0.22em] text-ink-soft">{label}</p>
      <p className="mt-2 font-latin text-sm text-ink">{value}</p>
    </div>
  )
}