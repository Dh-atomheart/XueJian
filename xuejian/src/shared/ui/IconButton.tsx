import type { ComponentProps, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button, type ButtonProps } from './Button'
import { Tooltip } from './Tooltip'

export type IconButtonProps = Omit<ButtonProps, 'size' | 'children' | 'aria-label'> & {
  'aria-label': string
  icon?: LucideIcon
  children?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  tooltip?: ReactNode
}

const sizeMap: Record<NonNullable<IconButtonProps['size']>, ButtonProps['size']> = {
  sm: 'icon-sm',
  md: 'icon',
  lg: 'icon-lg',
}

function IconButton({
  icon: Icon,
  children,
  size = 'md',
  tooltip,
  className,
  ...props
}: IconButtonProps) {
  const button = (
    <Button
      {...props}
      size={sizeMap[size]}
      className={cn('rounded-lg', className)}
    >
      {Icon ? <Icon aria-hidden="true" /> : children}
    </Button>
  )

  return tooltip ? <Tooltip content={tooltip}>{button}</Tooltip> : button
}

export type IconButtonElementProps = ComponentProps<typeof IconButton>
export { IconButton }
