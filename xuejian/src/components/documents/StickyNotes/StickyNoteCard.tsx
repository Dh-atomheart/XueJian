import { Button } from '@/components/ui'
import { getAnnotationColor, getAnnotationSwatchClass } from '@/lib/annotationPalette'
import { cn } from '@/lib/utils'
import type { Card, Highlight } from '@/types'

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
}: StickyNoteCardProps) {
  const color = highlight?.color ?? getAnnotationColor(highlight?.pageCardIndex ?? index)

  return (
    <article
      id={`sticky-card-${card.id}`}
      data-selected={isSelected ? 'true' : 'false'}
      className={cn(
        'relative overflow-visible rounded-[24px] border bg-white/92 px-4 pb-4 pt-5 text-left shadow-[0_18px_42px_rgba(34,30,25,0.09)] transition-all duration-200 before:absolute before:left-1/2 before:top-0 before:h-4 before:w-16 before:-translate-x-1/2 before:-translate-y-1/2 before:rotate-[-4deg] before:rounded-sm before:bg-highlight-yellow/40 before:ring-1 before:ring-ink/5',
        isSelected
          ? 'border-ink/25 shadow-[0_20px_48px_rgba(34,30,25,0.13)] ring-1 ring-ink/10'
          : 'border-line-soft hover:-translate-y-0.5 hover:border-ink/15'
      )}
    >
      <span
        aria-hidden
        className={cn('absolute inset-x-0 top-0 h-2 rounded-t-[24px]', getAnnotationSwatchClass(color))}
      />

      <button
        type="button"
        onClick={onSelect}
        className="block w-full text-left"
        data-testid={`sticky-card-${card.id}`}
      >
        <div className="flex items-start justify-between gap-3 pt-1">
          <span className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-paper-base/70 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-ink-soft">
            <span>卡片</span>
            <span className="font-latin tabular-nums">{String(index + 1).padStart(2, '0')}</span>
          </span>
          <span className="shrink-0 font-latin text-[11px] text-ink-soft">
            P.{highlight?.pageNumber ?? card.sourcePage ?? '--'}
          </span>
        </div>
      </button>

      <div className="mt-4 space-y-3">
        <div className="rounded-[18px] border border-line-soft bg-paper-base/80 px-3 py-3">
          <p className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">Front</p>
          <p className="mt-2 text-sm leading-6 text-ink">{card.front}</p>
        </div>

        <div className="rounded-[18px] border border-line-soft bg-paper-base/80 px-3 py-3">
          <p className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">Back</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink-muted">{card.back}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" onClick={onLocate}>
          定位原文
        </Button>
        <Button variant="ghost" size="sm" onClick={onEdit}>
          编辑
        </Button>
        <Button variant="ghost" size="sm" onClick={onLink}>
          {highlight ? '编辑关联高亮' : '关联高亮'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onToggleExpand}>
          {isExpanded ? '收起说明' : '说明'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onDelete}>
          删除
        </Button>
      </div>

      {isExpanded ? (
        <div className="mt-3 rounded-[16px] border border-line-soft bg-paper-muted/65 px-3 py-2 text-xs leading-5 text-ink-soft">
          {highlight
            ? '这张贴笺已关联正文高亮，可点击“编辑关联高亮”重新在 PDF 正文中圈选。'
            : '这张贴笺还未关联正文高亮，可点击“关联高亮”到 PDF 正文中圈选。'}
        </div>
      ) : null}
    </article>
  )
}
