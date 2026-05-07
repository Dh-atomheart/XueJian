import { Brain, CheckCircle2, HelpCircle, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/shared/ui'
import type { ReviewRating } from '@/services/learning'

export interface ReviewFeedbackButtonsProps {
  onRate: (rating: ReviewRating) => void
  disabled?: boolean
  loadingRating?: ReviewRating | null
  className?: string
  'data-testid'?: string
}

const FEEDBACK_OPTIONS: Array<{
  rating: ReviewRating
  label: string
  hotkey: string
  icon: typeof RotateCcw
  className: string
}> = [
  {
    rating: 'again',
    label: '忘记',
    hotkey: '1',
    icon: RotateCcw,
    className: 'border-destructive/25 hover:bg-destructive/5',
  },
  {
    rating: 'hard',
    label: '模糊',
    hotkey: '2',
    icon: HelpCircle,
    className: 'border-highlight-yellow/50 hover:bg-highlight-yellow/10',
  },
  {
    rating: 'good',
    label: '记得',
    hotkey: '3',
    icon: CheckCircle2,
    className: 'border-highlight-green/50 hover:bg-highlight-green/10',
  },
  {
    rating: 'easy',
    label: '熟练',
    hotkey: '4',
    icon: Brain,
    className: 'border-highlight-blue/50 hover:bg-highlight-blue/10',
  },
]

export function ReviewFeedbackButtons({
  onRate,
  disabled,
  loadingRating,
  className,
  'data-testid': dataTestId,
}: ReviewFeedbackButtonsProps) {
  return (
    <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-4', className)} data-testid={dataTestId ?? 'review-feedback-buttons'}>
      {FEEDBACK_OPTIONS.map(({ rating, label, hotkey, icon: Icon, className: optionClassName }) => (
        <Button
          key={rating}
          variant="outline"
          className={cn('h-auto min-h-16 flex-col gap-1 py-3', optionClassName)}
          onClick={() => onRate(rating)}
          disabled={disabled || Boolean(loadingRating)}
          isLoading={loadingRating === rating}
          loadingLabel={label}
          data-testid={`review-rate-${rating}`}
        >
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <Icon className="h-4 w-4" />
            {label}
          </span>
          <kbd className="rounded border border-line-soft bg-paper-muted px-1.5 py-0.5 text-[10px] text-ink-muted">
            {hotkey}
          </kbd>
        </Button>
      ))}
    </div>
  )
}
