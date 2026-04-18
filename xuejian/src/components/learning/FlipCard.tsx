import { cn } from '@/lib/utils'
import type { Card } from '@/types'

export type FlipCardVariant = 'default' | 'sketch'

interface FlipCardProps {
  card: Card
  isFlipped: boolean
  onFlip: () => void
  /**
   * Visual variant. `sketch` applies a slightly heavier ink border and a
   * translated drop shadow to echo the hand-drawn comic aesthetic. Body
   * copy stays in the standard reading font either way.
   */
  variant?: FlipCardVariant
}

export function FlipCard({ card, isFlipped, onFlip, variant = 'default' }: FlipCardProps) {
  const isSketch = variant === 'sketch'

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <button
        type="button"
        onClick={!isFlipped ? onFlip : undefined}
        aria-pressed={isFlipped}
        aria-label={isFlipped ? '卡片答案面' : '点击翻面'}
        data-variant={variant}
        data-flipped={isFlipped ? 'true' : 'false'}
        className={cn(
          'group relative w-full max-w-xl select-none text-left',
          'rounded-[24px] bg-paper-card transition-all duration-[260ms] ease-out',
          isSketch
            ? 'border-2 border-ink/75 shadow-[3px_4px_0_rgb(var(--ink)/0.12)]'
            : 'border border-line-soft shadow-card',
          !isFlipped && 'cursor-pointer hover:-translate-y-0.5',
          !isFlipped && (isSketch
            ? 'hover:shadow-[4px_6px_0_rgb(var(--ink)/0.16)]'
            : 'hover:shadow-sticky')
        )}
      >
        {/* 问题面 */}
        <div className="px-8 py-10">
          <div className="mb-3 flex items-center gap-2">
            <span
              className={cn(
                'rounded-full px-2.5 py-0.5 font-ui text-[10px] uppercase tracking-[0.2em]',
                isFlipped
                  ? 'border border-highlight-green/60 bg-highlight-green/25 text-ink'
                  : 'border border-ink/10 bg-paper-muted text-ink-soft'
              )}
            >
              {isFlipped ? '答案' : '问题'}
            </span>
            {card.tags.length > 0 && (
              <span className="text-[11px] text-ink-soft">{card.tags[0]}</span>
            )}
            {card.sourcePage != null && (
              <span className="ml-auto font-latin text-[11px] text-ink-soft">
                P.{card.sourcePage}
              </span>
            )}
          </div>
          <p className="font-body text-lg leading-relaxed text-ink">{card.front}</p>
        </div>

        {/* 答案面 */}
        {isFlipped && (
          <div
            className={cn(
              'px-8 py-8',
              isSketch
                ? 'border-t-2 border-dashed border-ink/40'
                : 'border-t border-dashed border-line-soft'
            )}
          >
            <p className="font-body text-base leading-relaxed text-ink/85">{card.back}</p>
          </div>
        )}

        {/* 点击翻面提示 */}
        {!isFlipped && (
          <div
            className={cn(
              'px-8 py-3 text-center',
              isSketch
                ? 'border-t border-dashed border-ink/30'
                : 'border-t border-line-soft/60'
            )}
          >
            <span className="font-ui text-xs text-ink-soft/70">点击翻面</span>
          </div>
        )}
      </button>
    </div>
  )
}
