import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'
import { SidebarRail } from './SidebarRail'
import { TopBar } from './TopBar'

interface AppShellProps {
  children: ReactNode
  sidebar?: ReactNode
  contextPanel?: ReactNode
  className?: string
}

export function AppShell({ children, sidebar, contextPanel, className }: AppShellProps) {
  return (
    <div className={cn('flex h-screen bg-paper-base font-body text-ink', className)}>
      {/* 左侧导航轨 */}
      <SidebarRail />

      {/* 主内容区域 */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex flex-1 overflow-hidden">
          {/* 侧边栏（可选） */}
          {sidebar && (
            <aside className="w-64 border-r border-line-soft bg-paper-muted">
              {sidebar}
            </aside>
          )}

          {/* 中央内容 */}
          <div className="flex-1 overflow-auto p-4">
            {children}
          </div>

          {/* 上下文侧栏（可选） */}
          {contextPanel && (
            <aside className="w-80 border-l border-line-soft bg-paper-muted">
              {contextPanel}
            </aside>
          )}
        </main>
      </div>
    </div>
  )
}
