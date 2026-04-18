import { cn } from '@/lib/utils'
import type { HTMLAttributes, ReactNode } from 'react'
import { surfaceStyles, type SurfaceVariant } from '@/design-system/tokens'

interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  variant?: SurfaceVariant
  className?: string
}

export function Panel({ children, variant = 'panel', className, ...props }: PanelProps) {
  const styles = surfaceStyles[variant]

  return (
    <div
      {...props}
      className={cn(
        styles.bg,
        styles.border,
        styles.shadow,
        styles.padding,
        className
      )}
    >
      {children}
    </div>
  )
}
