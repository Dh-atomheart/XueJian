import { resolveReaderRect, type ReaderRect, type ReaderViewport } from '@/lib/readerGeometry'
import { cn } from '@/lib/utils'
import type { Highlight } from '@/types'

interface HighlightLayerProps {
  highlights: Highlight[]
  highlightRectOverrides?: Record<string, ReaderRect[]>
  viewport: ReaderViewport | null
  selectedHighlightId: string | null
  hoveredHighlightId?: string | null
  mutedHighlightIds?: ReadonlySet<string>
  searchRects?: ReaderRect[]
  onHighlightClick: (highlight: Highlight) => void
  onHighlightHover?: (highlightId: string | null) => void
}

export function HighlightLayer({
  highlights,
  highlightRectOverrides,
  viewport,
  selectedHighlightId,
  hoveredHighlightId,
  mutedHighlightIds,
  searchRects,
  onHighlightClick,
  onHighlightHover,
}: HighlightLayerProps) {
  if (!viewport || (highlights.length === 0 && (!searchRects || searchRects.length === 0)))
    return null

  return (
    <svg className="absolute inset-0 z-10 h-full w-full" aria-hidden="true">
      {searchRects?.map((rect, index) => {
        const resolvedRect = resolveReaderRect(rect, viewport)

        return (
          <rect
            key={`search-${index}`}
            x={resolvedRect.x}
            y={resolvedRect.y}
            width={resolvedRect.width}
            height={resolvedRect.height}
            rx={3}
            ry={3}
            fill="rgba(245, 158, 11, 0.28)"
            stroke="rgba(194, 65, 12, 0.32)"
            strokeWidth={1}
          />
        )
      })}

      {highlights.map((highlight) => {
        const displayRects = highlightRectOverrides?.[highlight.id] ?? highlight.rectangles
        const isMuted = mutedHighlightIds?.has(highlight.id) ?? false

        return displayRects.map((rect, rectIndex) => {
          const resolvedRect = resolveReaderRect(rect, viewport)
          const isSelected = selectedHighlightId === highlight.id
          const isHovered = hoveredHighlightId === highlight.id

          return (
            <rect
              key={`${highlight.id}-${rectIndex}`}
              data-testid={`highlight-${highlight.id}`}
              aria-label={`高亮 ${rectIndex + 1}`}
              className={cn(
                'pointer-events-auto cursor-pointer transition-all duration-200',
                isSelected || isHovered ? 'ring-2 ring-ink/30' : 'hover:ring-1 hover:ring-ink/20'
              )}
              x={resolvedRect.x}
              y={resolvedRect.y}
              width={resolvedRect.width}
              height={resolvedRect.height}
              rx={3}
              ry={3}
              fill={highlight.color || '#F8E16C'}
              fillOpacity={isSelected ? 0.45 : isHovered ? 0.36 : isMuted ? 0.08 : 0.25}
              stroke={isSelected || isHovered ? 'rgba(26,26,26,0.3)' : 'transparent'}
              strokeWidth={isSelected || isHovered ? 2 : 0}
              onMouseEnter={() => onHighlightHover?.(highlight.id)}
              onMouseLeave={() => onHighlightHover?.(null)}
              onClick={(e) => {
                e.stopPropagation()
                onHighlightClick(highlight)
              }}
            >
              <title>{highlight.textContent.slice(0, 80)}</title>
            </rect>
          )
        })
      })}
    </svg>
  )
}
