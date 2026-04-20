import { useMemo } from 'react'
import { Panel } from '@/components/ui'
import { CardContentRenderer } from './CardContentRenderer'
import { cn } from '@/lib/utils'
import type { Card } from '@/types'

export type CardClusterMode = 'flat' | 'group' | 'cluster'

export interface CardClusterViewProps {
  cards: Card[]
  mode?: CardClusterMode
  onSelect?: (card: Card) => void
  /** Card id that should render in an active/selected state. */
  activeCardId?: string | null
  className?: string
  emptyHint?: string
}

/**
 * Presents cards as a flat grid, folded groups (by `groupId`), or clusters
 * (by the first shared tag). Purely presentational so it can back the
 * CardStudio, Library document drawer, or a future review-set picker.
 *
 * Visual rules (per full-scope-design.md §2 and §6.3):
 * - `flat`  : simple card grid
 * - `group` : stacked-paper effect behind the top card
 * - `cluster`: title bar with underline + grouped card grid
 */
export function CardClusterView({
  cards,
  mode = 'flat',
  onSelect,
  activeCardId,
  className,
  emptyHint = '这里还没有卡片',
}: CardClusterViewProps) {
  const clustered = useMemo(() => clusterCards(cards, mode), [cards, mode])

  if (cards.length === 0) {
    return (
      <div
        className={cn(
          'rounded-[24px] border border-dashed border-line-soft bg-paper-muted/40 px-4 py-10 text-center',
          className
        )}
      >
        <p className="font-body text-sm text-ink-muted">{emptyHint}</p>
      </div>
    )
  }

  return (
    <div className={cn('space-y-5', className)}>
      {clustered.map((bucket) => (
        <section key={bucket.key} className="space-y-3">
          {bucket.label && (
            <header className="flex items-baseline justify-between gap-3">
              <h3
                className={cn(
                  'font-ui text-sm text-ink',
                  mode === 'cluster' && 'inline-flex items-center gap-2 pb-0.5'
                )}
                style={
                  mode === 'cluster'
                    ? {
                        backgroundImage:
                          'linear-gradient(to right, rgb(var(--ink) / 0.45) 0%, rgb(var(--ink) / 0) 100%)',
                        backgroundPosition: '0 100%',
                        backgroundRepeat: 'no-repeat',
                        backgroundSize: '60% 1.5px',
                      }
                    : undefined
                }
              >
                {bucket.label}
              </h3>
              <span className="font-latin text-[11px] text-ink-soft">{bucket.cards.length} 张</span>
            </header>
          )}

          <div
            className={cn(
              mode === 'group'
                ? 'grid gap-5 sm:grid-cols-2 lg:grid-cols-3'
                : 'grid gap-3 sm:grid-cols-2 xl:grid-cols-3'
            )}
          >
            {bucket.cards.map((card) => (
              <CardItem
                key={card.id}
                card={card}
                mode={mode}
                stackSize={bucket.stackSize}
                isActive={card.id === activeCardId}
                onSelect={onSelect}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

interface CardItemProps {
  card: Card
  mode: CardClusterMode
  stackSize: number
  isActive: boolean
  onSelect?: (card: Card) => void
}

function CardItem({ card, mode, stackSize, isActive, onSelect }: CardItemProps) {
  const body = (
    <Panel
      variant="paperCard"
      className={cn(
        'relative rounded-[20px] transition-all duration-200',
        isActive ? 'ring-1 ring-ink/30' : '',
        onSelect && 'cursor-pointer hover:-translate-y-0.5 hover:shadow-sticky'
      )}
    >
      {mode === 'group' && stackSize > 1 && <StackLayers count={Math.min(2, stackSize - 1)} />}

      <div className="relative space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center rounded-full border border-ink/10 bg-paper-muted/70 px-2 py-0.5 font-latin text-[10px] uppercase tracking-[0.2em] text-ink-soft">
            {STATE_LABELS[card.state] ?? card.state}
          </span>
          {card.sourcePage != null && (
            <span className="font-latin text-[11px] text-ink-soft">P.{card.sourcePage}</span>
          )}
        </div>
        <p className="line-clamp-3 font-ui text-sm text-ink">
          <CardContentRenderer content={card.front} compact />
        </p>
        <p className="line-clamp-3 font-body text-xs leading-5 text-ink-muted">
          <CardContentRenderer content={card.back} compact />
        </p>
        {card.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {card.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-line-soft bg-paper-muted/60 px-1.5 py-0.5 font-latin text-[10px] text-ink-soft"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </Panel>
  )

  if (!onSelect) return body
  return (
    <button
      type="button"
      onClick={() => onSelect(card)}
      className="block w-full text-left"
      aria-pressed={isActive}
    >
      {body}
    </button>
  )
}

function StackLayers({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => {
        const depth = index + 1
        const offset = depth * 3
        return (
          <span
            key={index}
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[20px] border border-line-soft bg-paper-card/90"
            style={{
              transform: `translate(${offset}px, ${offset + 1}px)`,
              zIndex: -depth,
              opacity: 0.85 - index * 0.15,
            }}
          />
        )
      })}
    </>
  )
}

const STATE_LABELS: Record<Card['state'], string> = {
  new: '新卡',
  learning: '学习中',
  review: '复习',
  relearning: '重学',
}

interface ClusterBucket {
  key: string
  label: string | null
  cards: Card[]
  stackSize: number
}

function clusterCards(cards: Card[], mode: CardClusterMode): ClusterBucket[] {
  if (mode === 'flat' || cards.length === 0) {
    return [{ key: 'all', label: null, cards, stackSize: 1 }]
  }

  if (mode === 'group') {
    const buckets = new Map<string, Card[]>()
    for (const card of cards) {
      const key = card.groupId ?? card.id // ungrouped cards stand alone
      if (!buckets.has(key)) buckets.set(key, [])
      buckets.get(key)!.push(card)
    }

    return Array.from(buckets.entries()).map(([key, groupCards]) => ({
      key,
      label: null,
      cards: [groupCards[0]],
      stackSize: groupCards.length,
    }))
  }

  // mode === 'cluster': group by first shared tag
  const buckets = new Map<string, Card[]>()
  for (const card of cards) {
    const key = card.tags[0] ?? '未分类'
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key)!.push(card)
  }

  return Array.from(buckets.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .map(([tag, clusterCards]) => ({
      key: tag,
      label: tag,
      cards: clusterCards,
      stackSize: 1,
    }))
}
