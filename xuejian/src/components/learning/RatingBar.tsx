import { cn } from '@/lib/utils'
import type { ReviewRating } from '@/services/learning'

interface RatingBarProps {
  onRate: (rating: ReviewRating) => void
  disabled?: boolean
  previews?: Record<ReviewRating, { intervalDays: number }>
}

const RATINGS: { key: ReviewRating; label: string; sublabel: string; color: string }[] = [
  {
    key: 'again',
    label: '忘了',
    sublabel: 'Again',
    color: 'border-highlight-pink/50 bg-highlight-pink/15 text-ink hover:bg-highlight-pink/25',
  },
  {
    key: 'hard',
    label: '困难',
    sublabel: 'Hard',
    color: 'border-highlight-yellow/50 bg-highlight-yellow/15 text-ink hover:bg-highlight-yellow/25',
  },
  {
    key: 'good',
    label: '记得',
    sublabel: 'Good',
    color: 'border-highlight-green/50 bg-highlight-green/15 text-ink hover:bg-highlight-green/25',
  },
  {
    key: 'easy',
    label: '简单',
    sublabel: 'Easy',
    color: 'border-highlight-blue/50 bg-highlight-blue/15 text-ink hover:bg-highlight-blue/25',
  },
]

function formatInterval(days: number): string {
  if (days < 1) return '<1天'
  if (days === 1) return '1天'
  if (days < 30) return `${Math.round(days)}天`
  if (days < 365) return `${Math.round(days / 30)}月`
  return `${(days / 365).toFixed(1)}年`
}

export function RatingBar({ onRate, disabled, previews }: RatingBarProps) {
  return (
    <div className="flex items-center justify-center gap-3 px-4 py-4">
      {RATINGS.map(({ key, label, sublabel, color }) => (
        <button
          key={key}
          type="button"
          onClick={() => onRate(key)}
          disabled={disabled}
          className={cn(
            'flex min-w-[80px] flex-col items-center gap-0.5 rounded-xl border px-4 py-2.5',
            'font-ui text-sm transition-all duration-150',
            'disabled:pointer-events-none disabled:opacity-40',
            color
          )}
        >
          <span className="font-medium">{label}</span>
          <span className="text-[10px] opacity-60">{sublabel}</span>
          {previews && (
            <span className="mt-0.5 text-[10px] opacity-50">
              {formatInterval(previews[key].intervalDays)}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
