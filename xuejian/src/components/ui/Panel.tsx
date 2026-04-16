import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'
import { surfaceStyles, type SurfaceVariant } from '@/design-system/tokens'

interface PanelProps {
  children: ReactNode
  variant?: SurfaceVariant
  className?: string
}

export function Panel({ children, variant = 'panel', className }: PanelProps) {
  const styles = surfaceStyles[variant]

  return (
    <div
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
