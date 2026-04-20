import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'
import { useAppUiStore, type NavItemId } from '@/store'

interface NavItem {
  id: NavItemId
  label: string
  icon: ReactNode
}

const navItems: NavItem[] = [
  {
    id: 'home',
    label: '首页',
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
  {
    id: 'knowledge',
    label: '问答',
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    id: 'cards',
    label: '牌库',
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
        <path d="M16 3H8l-2 4h12l-2-4z" />
      </svg>
    ),
  },
  {
    id: 'library',
    label: '资源',
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    ),
  },
  {
    id: 'podcast',
    label: '播客',
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" x2="12" y1="19" y2="23" />
        <line x1="8" x2="16" y1="23" y2="23" />
      </svg>
    ),
  },
  {
    id: 'graph',
    label: '图谱',
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="2" />
        <circle cx="6" cy="6" r="2" />
        <circle cx="18" cy="6" r="2" />
        <circle cx="6" cy="18" r="2" />
        <circle cx="18" cy="18" r="2" />
        <line x1="12" y1="10" x2="12" y2="8" />
        <line x1="6" y1="8" x2="6" y2="16" />
        <line x1="18" y1="8" x2="18" y2="16" />
        <line x1="10" y1="12" x2="8" y2="12" />
        <line x1="14" y1="12" x2="16" y2="12" />
      </svg>
    ),
  },
  {
    id: 'profile',
    label: '我的',
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
]

export function SideNavigation() {
  const activeItem = useAppUiStore((state) => state.activeNavItem)
  const setActiveItem = useAppUiStore((state) => state.setActiveNavItem)

  return (
    <aside className="sticky top-0 hidden h-screen w-64 flex-col border-r border-line-soft bg-paper-muted md:flex">
      <div className="border-b border-line-soft p-6">
        <button
          type="button"
          onClick={() => setActiveItem('home')}
          className="flex items-center gap-3"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ink/5">
            <span className="font-display text-lg font-semibold">笺</span>
          </div>
          <span className="font-display text-xl font-semibold tracking-tight">学笺</span>
        </button>
      </div>

      <nav className="flex-1 space-y-1 p-4">
        {navItems.map((item) => {
          const isActive = activeItem === item.id
          return (
            <button
              type="button"
              key={item.id}
              onClick={() => setActiveItem(item.id)}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-4 py-3 transition-all duration-200',
                isActive
                  ? 'bg-paper-soft text-ink'
                  : 'text-ink/70 hover:bg-paper-soft/50 hover:text-ink'
              )}
              data-testid={`sidebar-nav-${item.id}`}
            >
              {item.icon}
              <span className="font-medium">{item.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="border-t border-line-soft p-4">
        <button
          type="button"
          onClick={() => setActiveItem('settings')}
          className={cn(
            'flex w-full items-center gap-3 rounded-lg px-4 py-3 transition-all duration-200',
            activeItem === 'settings'
              ? 'bg-paper-soft text-ink'
              : 'text-ink/70 hover:bg-paper-soft/50 hover:text-ink'
          )}
          data-testid="sidebar-nav-settings"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          <span className="font-medium">设置</span>
        </button>
      </div>
    </aside>
  )
}

export function BottomNavigation() {
  const activeItem = useAppUiStore((state) => state.activeNavItem)
  const setActiveItem = useAppUiStore((state) => state.setActiveNavItem)

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-line-soft bg-paper-base/95 backdrop-blur-sm md:hidden">
      <div className="mx-auto max-w-lg px-4">
        <div className="flex items-center justify-around py-2">
          {navItems.map((item) => {
            const isActive = activeItem === item.id
            return (
              <button
                type="button"
                key={item.id}
                onClick={() => setActiveItem(item.id)}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-lg px-4 py-2 transition-all duration-200',
                  isActive ? 'text-ink' : 'text-ink-muted hover:text-ink'
                )}
              >
                <div className={cn('transition-transform duration-200', isActive && 'scale-110')}>
                  {item.icon}
                </div>
                <span className="text-xs font-medium">{item.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </nav>
  )
}

// Backward-compatible exports
export { SideNavigation as SidebarRail }
