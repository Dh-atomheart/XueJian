import { cn } from '@/lib/utils'
import type { Highlight } from '@/types'

interface HighlightLayerProps {
  highlights: Highlight[]
  scale: number
  selectedHighlightId: string | null
  onHighlightClick: (highlight: Highlight) => void
}

export function HighlightLayer({
  highlights,
  scale,
  selectedHighlightId,
  onHighlightClick,
}: HighlightLayerProps) {
  if (highlights.length === 0) return null

  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
      {highlights.map((highlight) =>
        highlight.rectangles.map((rect, rectIndex) => (
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
            x={rect.x * scale}
            y={rect.y * scale}
            width={rect.width * scale}
            height={rect.height * scale}
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
        ))
      )}
    </svg>
  )
}
