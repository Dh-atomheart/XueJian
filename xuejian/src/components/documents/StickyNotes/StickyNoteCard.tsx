import { getAnnotationColor, getAnnotationSwatchClass } from '@/lib/annotationPalette'
import { cn } from '@/lib/utils'
import type { Card, Highlight } from '@/types'
import { Button } from '@/components/ui'
import { UnlinkedCardNotice } from './UnlinkedCardNotice'

interface StickyNoteCardProps {
  card: Card
  highlight: Highlight | null
  index: number
  isSelected: boolean
  isExpanded: boolean
  onSelect: () => void
  onToggleExpand: () => void
  onLocate: () => void
  onEdit: () => void
  onDelete: () => void
  onLink: () => void
  onOpenCandidates: () => void
}

export function StickyNoteCard({
  card,
  highlight,
  index,
  isSelected,
  isExpanded,
  onSelect,
  onToggleExpand,
  onLocate,
  onEdit,
  onDelete,
  onLink,
  onOpenCandidates,
}: StickyNoteCardProps) {
  const color = highlight?.color ?? getAnnotationColor(highlight?.pageCardIndex ?? index)

  return (
    <article
      id={`sticky-card-${card.id}`}
      data-selected={isSelected ? 'true' : 'false'}
      className={cn(
        'relative overflow-hidden rounded-[24px] border bg-white/92 px-4 py-4 text-left shadow-[0_12px_34px_rgba(34,30,25,0.08)] transition-all duration-200',
        isSelected
          ? 'border-ink/25 ring-1 ring-ink/10'
          : 'border-line-soft hover:-translate-y-0.5 hover:border-ink/15'
      )}
    >
      <span
        aria-hidden
        className={cn('absolute inset-x-0 top-0 h-2', getAnnotationSwatchClass(color))}
      />

      <button type="button" onClick={onSelect} className="block w-full text-left">
        <div className="flex items-start justify-between gap-3 pt-2">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-paper-base/70 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-ink-soft">
              <span>卡片</span>
              <span className="font-latin tabular-nums">{String(index + 1).padStart(2, '0')}</span>
            </div>
            <h3 className="mt-3 font-ui text-sm leading-6 text-ink">
              {card.title?.trim() || card.front}
            </h3>
          </div>
          <span className="shrink-0 font-latin text-[11px] text-ink-soft">P.{card.sourcePage ?? '--'}</span>
        </div>
      </button>

      <div className="mt-3 rounded-[18px] bg-paper-muted/75 px-3 py-3 text-sm leading-6 text-ink-muted">
        {highlight?.textContent || card.front}
      </div>

      {card.tags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {card.tags.map((tag) => (
            <span
              key={`${card.id}-${tag}`}
              className="rounded-full border border-ink/10 bg-paper-base/70 px-2 py-1 text-[11px] text-ink-soft"
            >
              #{tag}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" onClick={onLocate}>
          定位原文
        </Button>
        <Button variant="ghost" size="sm" onClick={onToggleExpand}>
          {isExpanded ? '收起' : '展开'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onEdit}>
          编辑
        </Button>
        <Button variant="ghost" size="sm" onClick={onDelete}>
          删除
        </Button>
      </div>

      {isExpanded ? (
        <div className="mt-4 space-y-3 border-t border-line-soft pt-4">
          <div className="rounded-[18px] border border-line-soft bg-paper-base/80 px-3 py-3">
            <p className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">Front</p>
            <p className="mt-2 text-sm leading-6 text-ink">{card.front}</p>
          </div>

          <div className="rounded-[18px] border border-line-soft bg-paper-base/80 px-3 py-3">
            <p className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">Back</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink">{card.back}</p>
          </div>

          {highlight ? (
            <div className="rounded-[18px] border border-line-soft bg-paper-base/80 px-3 py-3">
              <p className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">原文高亮</p>
              <p className="mt-2 text-sm leading-6 text-ink">{highlight.textContent}</p>
            </div>
          ) : (
            <UnlinkedCardNotice onLink={onLink} onOpenCandidates={onOpenCandidates} />
          )}
        </div>
      ) : null}
    </article>
  )
}