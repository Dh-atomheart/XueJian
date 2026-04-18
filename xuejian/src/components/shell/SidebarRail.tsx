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
    icon: <HomeIcon />,
  },
  {
    id: 'library',
    label: '文档库',
    icon: <LibraryIcon />,
  },
  {
    id: 'learning',
    label: '学习',
    icon: <LearningIcon />,
  },
  {
    id: 'knowledge',
    label: '知识问答',
    icon: <KnowledgeIcon />,
  },
  {
    id: 'settings',
    label: '设置',
    icon: <SettingsIcon />,
  },
]

export function SidebarRail() {
  const activeItem = useAppUiStore((state) => state.activeNavItem)
  const setActiveItem = useAppUiStore((state) => state.setActiveNavItem)

  return (
    <nav className="app-sidebar-rail flex w-16 flex-col items-center border-r border-line-soft bg-paper-muted py-4">
      {/* Logo */}
      <div className="app-sidebar-logo mb-6 flex h-10 w-10 items-center justify-center font-display text-xl text-ink select-none">
        笺
      </div>

      {/* 导航项 */}
      <div className="flex flex-1 flex-col gap-1.5">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveItem(item.id)}
            className={cn(
              'rail-nav-button flex h-11 w-11 items-center justify-center rounded-lg transition-colors',
              activeItem === item.id
                ? 'rail-nav-button-active bg-ink/10 text-ink'
                : 'text-ink-muted hover:bg-ink/5 hover:text-ink'
            )}
            title={item.label}
            aria-label={item.label}
          >
            {item.icon}
          </button>
        ))}
      </div>
    </nav>
  )
}

// 简单图标组件
function HomeIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  )
}

function LibraryIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  )
}

function LearningIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  )
}

function KnowledgeIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}
