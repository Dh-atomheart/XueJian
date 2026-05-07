import { useMemo } from 'react'
import { SketchEmptyState } from '@/components/ui'
import { CardPreview } from '@/components/cards'
import { cn } from '@/lib/utils'
import { useAppUiStore } from '@/store'
import type { Card, DocumentAnchor } from '@/types'

interface ReaderCardPanelProps {
  cards: Card[]
  anchors: DocumentAnchor[]
  currentPage: number
  className?: string
}

export function ReaderCardPanel({ cards, anchors, currentPage, className }: ReaderCardPanelProps) {
  const selectedCardId = useAppUiStore((state) => state.reader.selectedCardId)
  const selectCard = useAppUiStore((state) => state.selectCard)
  const anchorById = useMemo<Record<string, DocumentAnchor>>(
    () => Object.fromEntries(anchors.map((anchor) => [anchor.id, anchor])),
    [anchors]
  )

  return (
    <aside
      className={cn(
        className ?? 'hidden min-h-0 flex-col overflow-y-auto border-l border-line-soft bg-paper-muted/82 xl:flex'
      )}
      data-testid="reader-card-panel"
    >
      <div className="border-b border-line-soft px-4 py-4">
        <p className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">Page Cards</p>
        <h2 className="mt-2 font-ui text-base text-ink">
          第 {currentPage} 页 · {cards.length} 张卡片
        </h2>
        <p className="mt-1 text-xs leading-5 text-ink-muted">
          选择卡片可定位到对应来源，高亮会保留当前阅读位置。
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-3 px-3 py-4">
        {cards.length === 0 ? (
          <div data-testid="reader-card-panel-empty">
            <SketchEmptyState
              illustration="cards"
              title="当前页暂无卡片"
              description="从文档库生成卡片后，会在这里显示当前页来源卡片。"
              className="mt-4 rounded-lg bg-paper-base/80 px-4 py-8"
              size="sm"
            />
          </div>
        ) : (
          cards.map((card) => (
            <ReaderCardItem
              key={card.id}
              card={card}
              anchor={card.anchorId ? anchorById[card.anchorId] : undefined}
              isSelected={selectedCardId === card.id}
              onSelect={() => selectCard(card.id)}
            />
          ))
        )}
      </div>
    </aside>
  )
}

interface ReaderCardItemProps {
  card: Card
  anchor?: DocumentAnchor
  isSelected: boolean
  onSelect: () => void
}

function ReaderCardItem({ card, anchor, isSelected, onSelect }: ReaderCardItemProps) {
  const pageLabel = card.sourcePage ?? anchor?.page ?? '--'
  const sourceQuote = anchor?.textQuote?.trim()

  return (
    <button
      type="button"
      id={`reader-card-${card.id}`}
      className={cn(
        'w-full rounded-lg text-left transition hover:border-ink/20 hover:bg-paper-base',
        isSelected && 'ring-2 ring-highlight-yellow/30'
      )}
      data-testid={`reader-card-${card.id}`}
      onClick={onSelect}
    >
      <CardPreview
        front={card.front}
        back={card.back}
        tags={card.tags}
        documentTitle={card.title?.trim() || '未命名卡片'}
        pageLabel={pageLabel}
        sourceQuote={sourceQuote}
        className={cn('transition-colors', isSelected && 'border-ink/30 bg-paper-base')}
      />
    </button>
  )
}
