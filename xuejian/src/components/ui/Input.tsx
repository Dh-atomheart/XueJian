import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-9 w-full border border-line-soft bg-white px-3 py-1 font-body text-sm text-ink shadow-paper transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-ink-soft focus-visible:outline-none focus-visible:border-ink/30 disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = 'Input'

export { Input }
