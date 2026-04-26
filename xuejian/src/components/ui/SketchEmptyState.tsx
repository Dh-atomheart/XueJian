import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type SketchIllustration =
  | 'note'
  | 'book'
  | 'chat'
  | 'podcast'
  | 'cards'
  | 'heatmap'

interface SketchEmptyStateProps {
  illustration?: SketchIllustration
  title: string
  description?: string
  action?: ReactNode
  secondaryAction?: ReactNode
  className?: string
  /**
   * Size scale of the illustration. Defaults to 'md' (120px).
   */
  size?: 'sm' | 'md' | 'lg'
}

const SIZE_MAP: Record<NonNullable<SketchEmptyStateProps['size']>, string> = {
  sm: 'h-20 w-20',
  md: 'h-28 w-28',
  lg: 'h-36 w-36',
}

/**
 * Unified sketch-style empty state. Uses inline monoline SVGs that respect
 * the active theme via `currentColor`. Body text remains in the standard
 * reading font so the hand-drawn feel stays scoped to the illustration.
 */
export function SketchEmptyState({
  illustration = 'note',
  title,
  description,
  action,
  secondaryAction,
  className,
  size = 'md',
}: SketchEmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-5 rounded-[28px] border border-dashed border-line-soft bg-paper-card/70 px-8 py-10 text-center',
        className
      )}
      role="status"
    >
      <div className={cn('text-ink/70', SIZE_MAP[size])}>
        <Illustration illustration={illustration} />
      </div>
      <div className="max-w-sm space-y-2">
        <h3 className="font-display text-lg text-ink">{title}</h3>
        {description ? (
          <p className="font-body text-sm leading-6 text-ink-muted">{description}</p>
        ) : null}
      </div>
      {(action || secondaryAction) && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  )
}

function Illustration({ illustration }: { illustration: SketchIllustration }) {
  switch (illustration) {
    case 'note':
      return <NoteIllustration />
    case 'book':
      return <BookIllustration />
    case 'chat':
      return <ChatIllustration />
    case 'podcast':
      return <PodcastIllustration />
    case 'cards':
      return <CardsIllustration />
    case 'heatmap':
      return <HeatmapIllustration />
  }
}

const baseSvgProps = {
  viewBox: '0 0 120 120',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  className: 'h-full w-full',
}

function NoteIllustration() {
  return (
    <svg {...baseSvgProps}>
      <path d="M30 26c-1.5 8-2 20-1 46l2 20c.5 4 3 5 7 5h48c4 0 6-2 6-6V34c0-4-2-6-6-6H34c-2 0-3.5.5-4 4z" />
      <path d="M42 44h36M42 56h30M42 68h24" />
      <path d="M85 20l8 8" strokeDasharray="2 3" />
      <path d="M22 74c4-1 8-2 10-5" strokeDasharray="2 3" />
    </svg>
  )
}

function BookIllustration() {
  return (
    <svg {...baseSvgProps}>
      <path d="M22 28c10-3 24-3 38 0v66c-14-3-28-3-38 0z" />
      <path d="M98 28c-10-3-24-3-38 0v66c14-3 28-3 38 0z" />
      <path d="M60 28v66" />
      <path d="M30 42c8-1.5 16-1.5 24 0M30 54c8-1.5 16-1.5 24 0M30 66c8-1.5 16-1.5 20 0" />
      <path d="M70 42c8-1.5 16-1.5 20 0M70 54c8-1.5 16-1.5 20 0M70 66c8-1.5 16-1.5 16 0" />
    </svg>
  )
}

function ChatIllustration() {
  return (
    <svg {...baseSvgProps}>
      <path d="M22 38c0-5 3-8 8-8h46c5 0 8 3 8 8v24c0 5-3 8-8 8H56l-14 12v-12h-12c-5 0-8-3-8-8z" />
      <path d="M40 50h26M40 58h18" />
      <circle cx="90" cy="80" r="14" />
      <path d="M84 80h12M90 74v12" />
    </svg>
  )
}

function PodcastIllustration() {
  return (
    <svg {...baseSvgProps}>
      <rect x="48" y="20" width="24" height="44" rx="12" />
      <path d="M60 64v18" />
      <path d="M30 54c0 18 14 30 30 30s30-12 30-30" />
      <path d="M46 86h28" />
      <path d="M60 30v12M60 48v8" strokeDasharray="2 3" />
    </svg>
  )
}

function CardsIllustration() {
  return (
    <svg {...baseSvgProps}>
      <rect x="24" y="40" width="54" height="60" rx="6" transform="rotate(-8 51 70)" />
      <rect x="34" y="30" width="54" height="60" rx="6" transform="rotate(-2 61 60)" />
      <rect x="44" y="26" width="54" height="60" rx="6" />
      <path d="M54 42h36M54 52h28M54 62h22" />
    </svg>
  )
}

function HeatmapIllustration() {
  return (
    <svg {...baseSvgProps}>
      <g>
        {Array.from({ length: 7 }).map((_, row) =>
          Array.from({ length: 10 }).map((__, col) => {
            const filled = (row + col) % 3 === 0
            return (
              <rect
                key={`${row}-${col}`}
                x={18 + col * 9}
                y={30 + row * 9}
                width={7}
                height={7}
                rx={1.5}
                fill={filled ? 'currentColor' : 'none'}
                opacity={filled ? 0.35 : 1}
              />
            )
          })
        )}
      </g>
    </svg>
  )
}
