import { useDeferredValue, useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { CardEditorModal } from '@/components/cards/CardEditorModal'
import { Button, Input } from '@/components/ui'
import { cn } from '@/lib/utils'
import {
  useCardsQuery,
  useDeleteCardMutation,
  useDocumentQuery,
  useHighlightsQuery,
  useUpdateCardMutation,
} from '@/queries'
import { useAppUiStore } from '@/store'
import type { Card, Highlight } from '@/types'
import { StickyNoteCard } from './StickyNoteCard'

interface StickyNotesPanelProps {
  documentId: string
}

export function StickyNotesPanel({ documentId }: StickyNotesPanelProps) {
  const reader = useAppUiStore((state) => state.reader)
  const closeReader = useAppUiStore((state) => state.closeReader)
  const setContextRailOpen = useAppUiStore((state) => state.setContextRailOpen)
  const setReaderPage = useAppUiStore((state) => state.setReaderPage)
  const selectCard = useAppUiStore((state) => state.selectCard)
  const selectHighlight = useAppUiStore((state) => state.selectHighlight)
  const hoverHighlight = useAppUiStore((state) => state.hoverHighlight)
  const setAnnotationFilterTags = useAppUiStore((state) => state.setAnnotationFilterTags)
  const setAnnotationScope = useAppUiStore((state) => state.setAnnotationScope)
  const enterLinkingMode = useAppUiStore((state) => state.enterLinkingMode)
  const exitLinkingMode = useAppUiStore((state) => state.exitLinkingMode)
  const setActiveNavItem = useAppUiStore((state) => state.setActiveNavItem)
  const { data: currentDocument } = useDocumentQuery(documentId)
  const { data: cards = [] } = useCardsQuery(
    { documentId, limit: 5000 },
    { enabled: Boolean(documentId) }
  )
  const { data: highlights = [] } = useHighlightsQuery(
    { documentId, limit: 5000 },
    { enabled: Boolean(documentId) }
  )
  const updateCard = useUpdateCardMutation()
  const deleteCard = useDeleteCardMutation()
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null)
  const [editingCard, setEditingCard] = useState<Card | null>(null)
  const deferredSearchQuery = useDeferredValue(searchQuery)

  const highlightByCardId = useMemo<Record<string, Highlight>>(
    () =>
      Object.fromEntries(
        highlights.filter((item) => item.cardId).map((item) => [item.cardId as string, item])
      ),
    [highlights]
  )

  const availableTags = useMemo(
    () =>
      Array.from(new Set(cards.flatMap((card) => card.tags)))
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right, 'zh-CN')),
    [cards]
  )

  const scopedCards = useMemo(() => {
    if (reader.annotationScope === 'all' || deferredSearchQuery.trim()) {
      return cards
    }

    return cards.filter(
      (card) => (highlightByCardId[card.id]?.pageNumber ?? card.sourcePage) === reader.currentPage
    )
  }, [cards, deferredSearchQuery, highlightByCardId, reader.annotationScope, reader.currentPage])

  const cardEntries = useMemo(() => {
    const normalizedQuery = deferredSearchQuery.trim().toLowerCase()

    return scopedCards
      .map((card) => ({
        card,
        highlight: highlightByCardId[card.id] ?? null,
      }))
      .filter(({ card, highlight }) => {
        if (reader.annotationFilterTags.length > 0) {
          const hasAllTags = reader.annotationFilterTags.every((tag) => card.tags.includes(tag))
          if (!hasAllTags) {
            return false
          }
        }

        if (!normalizedQuery) {
          return true
        }

        const haystack = [
          card.title,
          card.front,
          card.back,
          highlight?.textContent,
          card.tags.join(' '),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()

        return haystack.includes(normalizedQuery)
      })
      .sort((left, right) => {
        const leftPage =
          left.highlight?.pageNumber ?? left.card.sourcePage ?? Number.MAX_SAFE_INTEGER
        const rightPage =
          right.highlight?.pageNumber ?? right.card.sourcePage ?? Number.MAX_SAFE_INTEGER
        if (leftPage !== rightPage) {
          return leftPage - rightPage
        }

        const leftIndex = left.highlight?.pageCardIndex ?? Number.MAX_SAFE_INTEGER
        const rightIndex = right.highlight?.pageCardIndex ?? Number.MAX_SAFE_INTEGER
        if (leftIndex !== rightIndex) {
          return leftIndex - rightIndex
        }

        return left.card.front.localeCompare(right.card.front, 'zh-CN')
      })
  }, [deferredSearchQuery, highlightByCardId, reader.annotationFilterTags, scopedCards])

  const unlinkedCount = useMemo(
    () => cards.filter((card) => !highlightByCardId[card.id]).length,
    [cards, highlightByCardId]
  )

  const groupedCardEntries = useMemo(() => {
    const groups = new Map<number, typeof cardEntries>()

    for (const entry of cardEntries) {
      const pageNumber = entry.highlight?.pageNumber ?? entry.card.sourcePage ?? -1
      const existing = groups.get(pageNumber) ?? []
      groups.set(pageNumber, [...existing, entry])
    }

    return Array.from(groups.entries())
      .sort(([leftPage], [rightPage]) => {
        if (leftPage < 0) {
          return 1
        }
        if (rightPage < 0) {
          return -1
        }
        return leftPage - rightPage
      })
      .map(([pageNumber, entries]) => ({
        pageNumber,
        title: pageNumber > 0 ? `第 ${pageNumber} 页` : '未定位页码',
        entries,
      }))
  }, [cardEntries])

  useEffect(() => {
    if (!reader.selectedCardId) {
      return
    }

    const element = window.document.getElementById(`sticky-card-${reader.selectedCardId}`)
    element?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    setExpandedCardId(reader.selectedCardId)
  }, [reader.selectedCardId])

  return (
    <div
      className="flex h-full flex-col bg-[linear-gradient(180deg,rgba(251,251,249,0.96),rgba(245,243,236,0.98))]"
      data-testid="reader-context-rail"
    >
      <div className="border-b border-line-soft px-4 py-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-ink-soft">Context Rail</p>
            <h2 className="mt-2 font-ui text-lg text-ink">当前页贴笺</h2>
            <p className="mt-1 text-xs leading-5 text-ink-soft">
              {currentDocument?.title ?? '正在加载文档标题'}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setContextRailOpen(false)}>
            收起
          </Button>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <RailMetric
            label="页码"
            value={`${reader.currentPage}/${Math.max(reader.totalPages, 1)}`}
          />
          <RailMetric label="贴笺" value={`${cards.length}`} />
          <RailMetric label="缺失关联" value={`${unlinkedCount}`} />
        </div>

        <div className="mt-4 space-y-3">
          <Input
            value={searchQuery}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setSearchQuery(event.target.value)}
            placeholder="搜索卡片、原文、标签..."
            data-testid="reader-sticky-search"
          />

          {deferredSearchQuery.trim() ? (
            <p className="rounded-[16px] border border-line-soft bg-paper-base/75 px-3 py-2 text-xs leading-5 text-ink-soft">
              当前搜索覆盖整份文档，结果会按页码重新排序。
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {(['page', 'all'] as const).map((scope) => (
              <button
                key={scope}
                type="button"
                onClick={() => setAnnotationScope(scope)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs transition',
                  reader.annotationScope === scope
                    ? 'border-ink/25 bg-ink text-paper-base'
                    : 'border-line-soft bg-paper-base/80 text-ink-soft hover:border-ink/15 hover:text-ink'
                )}
              >
                {scope === 'page' ? '仅本页' : '整份文档'}
              </button>
            ))}
          </div>

          {availableTags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {availableTags.map((tag) => {
                const isActive = reader.annotationFilterTags.includes(tag)

                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      setAnnotationFilterTags(
                        isActive
                          ? reader.annotationFilterTags.filter((item) => item !== tag)
                          : [...reader.annotationFilterTags, tag]
                      )
                    }}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-[11px] transition',
                      isActive
                        ? 'border-ink/20 bg-highlight-yellow/35 text-ink'
                        : 'border-line-soft bg-paper-base/75 text-ink-soft hover:border-ink/10 hover:text-ink'
                    )}
                  >
                    #{tag}
                  </button>
                )
              })}

              {reader.annotationFilterTags.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setAnnotationFilterTags([])}
                  className="rounded-full px-2 py-1 text-[11px] text-ink-soft transition hover:text-ink"
                >
                  清空过滤
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {reader.isLinkingMode ? (
        <div className="border-b border-line-soft bg-highlight-yellow/15 px-4 py-3 text-sm text-ink-muted">
          <div className="flex items-start justify-between gap-3">
            <p>已进入手动关联模式。回到正文圈定一句原文，就会把它绑到当前卡片。</p>
            <Button variant="ghost" size="sm" onClick={exitLinkingMode}>
              取消
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex-1 overflow-auto px-4 py-4">
        {cardEntries.length === 0 ? (
          <div className="relative">
            <span
              aria-hidden
              className="absolute left-1/2 top-0 h-4 w-16 -translate-x-1/2 -translate-y-1/2 rotate-[-4deg] rounded-sm bg-highlight-yellow/40 ring-1 ring-ink/5"
            />
            <div className="rounded-[24px] border border-dashed border-line-soft bg-white/80 px-4 py-7 text-center">
              <p className="font-ui text-sm text-ink">当前范围内还没有贴笺</p>
              <p className="mt-2 text-sm leading-6 text-ink-soft">
                可以在正文里直接圈句建卡，也可以切到整份文档范围继续搜索。
              </p>
              <div className="mt-4 flex justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setReaderPage(Math.max(1, reader.currentPage - 1))}
                >
                  上一页
                </Button>
                <Button variant="ghost" size="sm" onClick={closeReader}>
                  返回文档库
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {groupedCardEntries.map((group) => (
              <section key={group.pageNumber} className="space-y-4">
                {groupedCardEntries.length > 1 || group.pageNumber < 0 ? (
                  <div className="flex items-center justify-between gap-3 px-1">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                      {group.title}
                    </p>
                    <span className="text-[11px] text-ink-soft">{group.entries.length} 张</span>
                  </div>
                ) : null}

                <div className="space-y-4">
                  {group.entries.map(({ card, highlight }, index) => {
                    const isSelected = reader.selectedCardId === card.id

                    return (
                      <div
                        key={card.id}
                        onMouseEnter={() => hoverHighlight(highlight?.id ?? null)}
                        onMouseLeave={() => hoverHighlight(null)}
                      >
                        <StickyNoteCard
                          card={card}
                          highlight={highlight}
                          index={index}
                          isSelected={isSelected}
                          isExpanded={expandedCardId === card.id}
                          onSelect={() => {
                            setReaderPage(
                              highlight?.pageNumber ?? card.sourcePage ?? reader.currentPage
                            )
                            selectCard(card.id)
                          }}
                          onToggleExpand={() => {
                            setExpandedCardId((current) => (current === card.id ? null : card.id))
                          }}
                          onLocate={() => {
                            setReaderPage(
                              highlight?.pageNumber ?? card.sourcePage ?? reader.currentPage
                            )
                            selectCard(card.id)
                          }}
                          onEdit={() => setEditingCard(card)}
                          onDelete={() => {
                            if (!window.confirm('确认删除这张卡片吗？')) {
                              return
                            }
                            deleteCard.mutate(card.id, {
                              onSuccess: () => {
                                if (reader.selectedCardId === card.id) {
                                  selectCard(null)
                                  selectHighlight(null)
                                }
                              },
                            })
                          }}
                          onLink={() => {
                            setReaderPage(card.sourcePage ?? reader.currentPage)
                            selectCard(card.id)
                            enterLinkingMode(card.id)
                          }}
                          onOpenCandidates={() => setActiveNavItem('cards')}
                        />
                      </div>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {editingCard ? (
        <CardEditorModal
          card={editingCard}
          isSaving={updateCard.isPending}
          onClose={() => setEditingCard(null)}
          onSave={async ({ front, back, tags, cardType }) => {
            await updateCard.mutateAsync({
              id: editingCard.id,
              data: {
                front,
                back,
                tags,
                cardType,
              },
            })
            setEditingCard(null)
          }}
        />
      ) : null}
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
