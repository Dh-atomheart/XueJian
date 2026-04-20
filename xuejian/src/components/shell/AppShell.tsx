import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'
import { SideNavigation, BottomNavigation } from './SidebarRail'

interface AppShellProps {
  children: ReactNode
  className?: string
}

export function AppShell({ children, className }: AppShellProps) {
  return (
    <div
      className={cn(
        'paper-texture flex min-h-screen bg-paper-base font-body text-ink',
        className,
      )}
      data-testid="app-shell"
    >
      <SideNavigation />

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 overflow-auto pb-20 md:pb-0">
          {children}
        </main>
      </div>

      <BottomNavigation />
    </div>
  )
}
