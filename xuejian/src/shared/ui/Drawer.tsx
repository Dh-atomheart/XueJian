import * as DialogPrimitive from '@radix-ui/react-dialog'
import type { ComponentProps } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { IconButton } from './IconButton'

const Drawer = DialogPrimitive.Root
const DrawerTrigger = DialogPrimitive.Trigger
const DrawerClose = DialogPrimitive.Close
const DrawerPortal = DialogPrimitive.Portal
const DrawerTitle = DialogPrimitive.Title
const DrawerDescription = DialogPrimitive.Description

function DrawerOverlay({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      className={cn('fixed inset-0 z-50 bg-ink/20 backdrop-blur-sm', className)}
      {...props}
    />
  )
}

function DrawerContent({
  className,
  children,
  side = 'right',
  showCloseButton = true,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
  side?: 'left' | 'right' | 'bottom'
  showCloseButton?: boolean
}) {
  const placement =
    side === 'left'
      ? 'inset-y-0 left-0 w-[min(28rem,calc(100vw-2rem))] border-r'
      : side === 'bottom'
        ? 'inset-x-0 bottom-0 max-h-[85vh] rounded-t-xl border-t'
        : 'inset-y-0 right-0 w-[min(28rem,calc(100vw-2rem))] border-l'

  return (
    <DrawerPortal>
      <DrawerOverlay />
      <DialogPrimitive.Content
        className={cn(
          'fixed z-50 border-line-soft bg-paper-card p-5 text-ink shadow-card outline-none',
          placement,
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton ? (
          <DialogPrimitive.Close asChild>
            <IconButton
              aria-label="关闭抽屉"
              tooltip="关闭"
              variant="ghost"
              size="sm"
              className="absolute right-3 top-3"
              icon={X}
            />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DrawerPortal>
  )
}

function DrawerHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('mb-4 space-y-1.5 pr-10', className)} {...props} />
}

function DrawerFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...props} />
}

export {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle,
  DrawerTrigger,
}
