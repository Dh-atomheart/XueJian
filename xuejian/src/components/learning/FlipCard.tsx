import { cn } from '@/lib/utils'
import type { Card } from '@/types'

interface FlipCardProps {
  card: Card
  isFlipped: boolean
  onFlip: () => void
}

export function FlipCard({ card, isFlipped, onFlip }: FlipCardProps) {
  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <button
        type="button"
        onClick={!isFlipped ? onFlip : undefined}
        className={cn(
          'group relative w-full max-w-xl cursor-pointer select-none',
          'rounded-[24px] border border-line-soft bg-white shadow-card',
          'transition-all duration-300',
          !isFlipped && 'hover:shadow-sticky hover:-translate-y-0.5',
        )}
        aria-label={isFlipped ? '卡片答案面' : '点击翻面'}
      >
        {/* 问题面 */}
        <div className="px-8 py-10">
          <div className="mb-3 flex items-center gap-2">
            <span className="rounded-full border border-ink/10 bg-paper-muted px-2.5 py-0.5 font-ui text-[10px] uppercase tracking-[0.2em] text-ink-soft">
              {isFlipped ? '答案' : '问题'}
            </span>
            {card.tags.length > 0 && (
              <span className="text-[11px] text-ink-soft">
                {card.tags[0]}
              </span>
            )}
          </div>
          <p className="font-body text-lg leading-relaxed text-ink">
            {card.front}
          </p>
        </div>

        {/* 答案面 */}
        {isFlipped && (
          <div className="border-t border-dashed border-line-soft px-8 py-8">
            <p className="font-body text-base leading-relaxed text-ink/80">
              {card.back}
            </p>
          </div>
        )}

        {/* 点击翻面提示 */}
        {!isFlipped && (
          <div className="border-t border-line-soft/60 px-8 py-3 text-center">
            <span className="font-ui text-xs text-ink-soft/60">
              点击翻面
            </span>
          </div>
        )}
      </button>
    </div>
  )
}
