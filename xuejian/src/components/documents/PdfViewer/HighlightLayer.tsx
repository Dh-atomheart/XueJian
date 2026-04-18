import { resolveReaderRect, type ReaderRect, type ReaderViewport } from '@/lib/readerGeometry'
import { cn } from '@/lib/utils'
import type { Highlight } from '@/types'

interface HighlightLayerProps {
  highlights: Highlight[]
  highlightRectOverrides?: Record<string, ReaderRect[]>
  viewport: ReaderViewport | null
  selectedHighlightId: string | null
  onHighlightClick: (highlight: Highlight) => void
}

export function HighlightLayer({
  highlights,
  highlightRectOverrides,
  viewport,
  selectedHighlightId,
  onHighlightClick,
}: HighlightLayerProps) {
  if (highlights.length === 0 || !viewport) return null

  return (
    <svg className="absolute inset-0 z-10 h-full w-full" aria-hidden="true">
      {highlights.map((highlight) => {
        const displayRects = highlightRectOverrides?.[highlight.id] ?? highlight.rectangles

        return displayRects.map((rect, rectIndex) => {
          const resolvedRect = resolveReaderRect(rect, viewport)

          return (
            <rect
              key={`${highlight.id}-${rectIndex}`}
              data-testid={`highlight-${highlight.id}`}
              aria-label={`高亮 ${rectIndex + 1}`}
              className={cn(
                'pointer-events-auto cursor-pointer transition-all duration-200',
                selectedHighlightId === highlight.id
                  ? 'ring-2 ring-ink/30'
                  : 'hover:ring-1 hover:ring-ink/20'
              )}
              x={resolvedRect.x}
              y={resolvedRect.y}
              width={resolvedRect.width}
              height={resolvedRect.height}
              rx={3}
              ry={3}
              fill={highlight.color || '#F8E16C'}
              fillOpacity={selectedHighlightId === highlight.id ? 0.45 : 0.25}
              stroke={selectedHighlightId === highlight.id ? 'rgba(26,26,26,0.3)' : 'transparent'}
              strokeWidth={selectedHighlightId === highlight.id ? 2 : 0}
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
