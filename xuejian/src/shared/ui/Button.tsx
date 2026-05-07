import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { Loader2 } from 'lucide-react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium outline-none transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/35 aria-invalid:border-destructive aria-invalid:ring-destructive/20",
  {
    variants: {
      variant: {
        default: 'bg-ink text-paper-card hover:bg-ink/90',
        destructive: 'bg-destructive text-paper-card hover:bg-destructive/90',
        outline: 'border border-line-soft bg-paper-card text-ink hover:border-ink/20 hover:bg-paper-muted',
        secondary: 'bg-paper-muted text-ink hover:bg-paper-soft',
        ghost: 'text-ink-muted hover:bg-paper-muted hover:text-ink',
        link: 'text-primary underline-offset-4 hover:underline',
        sketch: 'rounded-lg border border-line-soft bg-paper-card hover:bg-paper-muted hover:text-ink',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 gap-1.5 rounded-lg px-3 has-[>svg]:px-2.5',
        lg: 'h-10 rounded-lg px-6 has-[>svg]:px-4',
        icon: 'size-9',
        'icon-sm': 'size-8',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    isLoading?: boolean
    loadingLabel?: string
  }

function Button({
  className,
  variant,
  size,
  asChild = false,
  disabled,
  isLoading = false,
  loadingLabel,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : 'button'
  const isDisabled = disabled || isLoading

  return (
    <Comp
      data-slot="button"
      aria-busy={isLoading || undefined}
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={asChild ? undefined : isDisabled}
      {...props}
    >
      {isLoading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
      {isLoading && loadingLabel ? loadingLabel : children}
    </Comp>
  )
}

export { Button, buttonVariants }
