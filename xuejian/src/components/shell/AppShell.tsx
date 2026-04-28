import type { ReactNode } from 'react'
import { useMemo } from 'react'
import {
  hasUsableApiConfig,
  useApiConfigsQuery,
  useOrchestrationServiceHealthQuery,
} from '@/queries'
import { cn } from '@/lib/utils'
import { isTauriEnvironment } from '@/services/gateway'
import { useAppUiStore, type NavItemId } from '@/store'

interface AppShellProps {
  children: ReactNode
  contextPanel?: ReactNode
  className?: string
}

interface NavItemDefinition {
  id: NavItemId
  label: string
  shortLabel: string
  icon: ReactNode
}

const NAV_ITEMS: NavItemDefinition[] = [
  { id: 'home', label: '首页', shortLabel: '首页', icon: <HomeIcon /> },
  { id: 'library', label: '文档库', shortLabel: '文档', icon: <DocumentIcon /> },
  { id: 'cards', label: '卡片工坊', shortLabel: '卡片', icon: <CardsIcon /> },
  { id: 'learning', label: '复习', shortLabel: '复习', icon: <StudyIcon /> },
  { id: 'knowledge', label: '知识问答', shortLabel: '问答', icon: <KnowledgeIcon /> },
  { id: 'profile', label: '我的', shortLabel: '我的', icon: <ProfileIcon /> },
]

const PAGE_META: Record<NavItemId, { eyebrow: string; description: string }> = {
  home: { eyebrow: 'STUDY CENTER', description: '学习中心、最近文档和知识工作流总览。' },
  library: { eyebrow: 'DOCUMENT LIBRARY', description: '双栏文档库、上传状态和文档详情面板。' },
  cards: { eyebrow: 'CARDS WORKSHOP', description: '卡片生成、整理和进入学习队列。' },
  learning: { eyebrow: 'SPACED REVIEW', description: '单卡片主舞台与评分驱动的复习会话。' },
  knowledge: { eyebrow: 'AI ASSISTANT', description: '基于文档上下文的问答工作区。' },
  profile: { eyebrow: 'PROFILE', description: '个人统计、进度和学习回顾。' },
  settings: { eyebrow: 'SETTINGS', description: 'BYOK、工作流分配和体验配置。' },
}

export function AppShell({ children, contextPanel, className }: AppShellProps) {
  const activeNavItem = useAppUiStore((state) => state.activeNavItem)
  const setActiveNavItem = useAppUiStore((state) => state.setActiveNavItem)
  const reader = useAppUiStore((state) => state.reader)
  const { data: apiConfigs = [], isLoading: isLoadingApiConfigs } = useApiConfigsQuery()
  const tauriRuntime = isTauriEnvironment()
  const { data: orchestrationHealth } = useOrchestrationServiceHealthQuery()

  const pageMeta = useMemo(() => {
    if (reader.documentId) {
      return {
        eyebrow: 'READER',
        description: '保留真实阅读能力与右侧上下文栏。',
      }
    }

    return PAGE_META[activeNavItem]
  }, [activeNavItem, reader.documentId])

  const showApiHint = !reader.documentId && !isLoadingApiConfigs && !hasUsableApiConfig(apiConfigs)

  return (
    <div
      className={cn('app-shell app-shell-frame paper-texture flex h-screen overflow-hidden bg-background text-foreground', className)}
      data-testid="app-shell"
    >
      {!reader.documentId ? (
        <aside className="app-sidebar-rail hidden h-screen w-[230px] shrink-0 overflow-hidden border-r border-border/70 bg-background/95 md:flex">
          <div className="flex h-full w-full flex-col px-4 py-5">
            <div className="flex items-center gap-2 px-1 py-1">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground/5 text-foreground">
                <span className="text-lg font-medium">笺</span>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.26em] text-muted-foreground">XUEJIAN</p>
                <p className="text-lg font-medium text-foreground">学笺</p>
              </div>
            </div>

            <nav className="mt-6 flex-1 space-y-1" aria-label="Primary">
              {NAV_ITEMS.map((item) => (
                <NavButton
                  key={item.id}
                  active={activeNavItem === item.id}
                  icon={item.icon}
                  label={item.label}
                  onClick={() => setActiveNavItem(item.id)}
                  testId={`sidebar-nav-${item.id}`}
                />
              ))}
            </nav>

            <div className="mt-4 border-t border-border/75 pt-4">
              <NavButton
                active={activeNavItem === 'settings'}
                icon={<SettingsIcon />}
                label="设置"
                onClick={() => setActiveNavItem('settings')}
                testId="sidebar-nav-settings"
              />
            </div>
          </div>
        </aside>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        {!reader.documentId ? (
          <header className="border-b border-border/70 bg-background/88 px-5 py-3 backdrop-blur md:px-8">
            <div className="mx-auto flex w-full max-w-[1480px] items-center justify-between gap-5">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground">{pageMeta.eyebrow}</p>
                <p className="mt-1 text-sm text-muted-foreground">{pageMeta.description}</p>
              </div>
              {showApiHint ? (
                <button
                  type="button"
                  onClick={() => setActiveNavItem('settings')}
                  data-testid="api-setup-hint"
                  className="inline-flex h-10 items-center rounded-full border border-border bg-card px-4 text-sm text-foreground transition hover:bg-muted/50"
                >
                  配置 AI
                </button>
              ) : null}
            </div>

            <RuntimeStatusBanner
              tauriRuntime={tauriRuntime}
              errorMessage={orchestrationHealth?.errorMessage ?? null}
              healthStatus={orchestrationHealth?.status ?? null}
              hostGatewayConfigured={orchestrationHealth?.hostGatewayConfigured ?? false}
              dependenciesReady={orchestrationHealth?.dependenciesReady ?? true}
              missingDependencies={orchestrationHealth?.missingDependencies ?? []}
            />

            <nav className="mt-4 flex gap-2 overflow-x-auto md:hidden">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveNavItem(item.id)}
                  className={cn(
                    'rounded-full border px-3 py-2 text-sm transition',
                    activeNavItem === item.id
                      ? 'border-border bg-card text-foreground shadow-sm'
                      : 'border-transparent bg-transparent text-muted-foreground hover:border-border/70 hover:bg-card/70 hover:text-foreground'
                  )}
                >
                  {item.shortLabel}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setActiveNavItem('settings')}
                className={cn(
                  'rounded-full border px-3 py-2 text-sm transition',
                  activeNavItem === 'settings'
                    ? 'border-border bg-card text-foreground shadow-sm'
                    : 'border-transparent bg-transparent text-muted-foreground hover:border-border/70 hover:bg-card/70 hover:text-foreground'
                )}
              >
                设置
              </button>
            </nav>
          </header>
        ) : null}

        <main
          className={cn(
            'app-shell-main min-h-0 flex-1 overflow-x-hidden',
            reader.documentId ? 'overflow-hidden' : 'overflow-y-auto'
          )}
        >
          <div
            className={cn(
              'mx-auto w-full max-w-[1480px] p-0',
              contextPanel
                ? 'grid h-full min-h-0 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]'
                : reader.documentId
                  ? 'flex h-full min-h-0 flex-col'
                  : ''
            )}
          >
            <div className={cn('min-w-0', reader.documentId && 'min-h-0')}>{children}</div>
            {contextPanel ? (
              <aside className="hidden min-h-0 overflow-hidden rounded-[28px] border border-border/70 bg-card/88 shadow-[0_20px_60px_rgba(58,48,37,0.07)] xl:block">
                {contextPanel}
              </aside>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  )
}

function RuntimeStatusBanner({
  tauriRuntime,
  healthStatus,
  errorMessage,
  hostGatewayConfigured,
  dependenciesReady,
  missingDependencies,
}: {
  tauriRuntime: boolean
  healthStatus: 'starting' | 'healthy' | 'degraded' | 'stopped' | null
  errorMessage: string | null
  hostGatewayConfigured: boolean
  dependenciesReady: boolean
  missingDependencies: string[]
}) {
  if (!tauriRuntime) {
    return (
      <div
        className="mt-4 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground"
        data-testid="runtime-status-banner"
      >
        <span className="font-medium">Web Mock</span>
        <span className="ml-2">
          This session is not using Tauri native commands. Frontend success here does not prove
          backend connectivity.
        </span>
      </div>
    )
  }

  const issues = [
    healthStatus === 'stopped' ? 'orchestration stopped' : null,
    healthStatus === 'degraded' ? 'orchestration degraded' : null,
    !hostGatewayConfigured ? 'host gateway not configured' : null,
    !dependenciesReady ? `missing deps: ${missingDependencies.join(', ')}` : null,
  ].filter(Boolean)

  const toneClass =
    issues.length > 0
      ? 'border-border bg-card text-foreground'
      : 'border-border bg-card text-foreground'

  return (
    <div
      className={cn('mt-4 rounded-2xl border px-4 py-3 text-sm', toneClass)}
      data-testid="runtime-status-banner"
    >
      <span className="font-medium">Tauri Native</span>
      <span className="ml-2">
        {issues.length > 0 ? issues.join(' | ') : 'native IPC and orchestration health are visible'}
      </span>
      {errorMessage ? <p className="mt-2 text-xs opacity-90">{errorMessage}</p> : null}
    </div>
  )
}

function NavButton({
  active,
  icon,
  label,
  onClick,
  testId,
}: {
  active: boolean
  icon: ReactNode
  label: string
  onClick: () => void
  testId: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-colors',
        active ? 'border-transparent bg-foreground/5 text-foreground' : 'border-transparent text-muted-foreground hover:bg-foreground/[0.03] hover:text-foreground'
      )}
    >
      <span className="flex h-[18px] w-[18px] items-center justify-center">{icon}</span>
      <span>{label}</span>
    </button>
  )
}

function iconProps() {
  return {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: 'h-[18px] w-[18px]',
    'aria-hidden': true,
  }
}

function HomeIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10.5V20h13V10.5" />
    </svg>
  )
}

function DocumentIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  )
}

function CardsIcon() {
  return (
    <svg {...iconProps()}>
      <rect x="4" y="5" width="14" height="14" rx="2.5" />
      <path d="M8 3h12v12" />
    </svg>
  )
}

function StudyIcon() {
  return (
    <svg {...iconProps()}>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M8 9.5h8M8 14.5h5" />
    </svg>
  )
}

function KnowledgeIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function ProfileIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M18 20a6 6 0 0 0-12 0" />
      <circle cx="12" cy="8" r="4" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg {...iconProps()}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 0 1-4 0v-.09a1.7 1.7 0 0 0-.4-1.1 1.7 1.7 0 0 0-1-.6 1.7 1.7 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H2.8a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.1-.4 1.7 1.7 0 0 0 .6-1 1.7 1.7 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V2.8a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 .4 1.1 1.7 1.7 0 0 0 1 .6 1.7 1.7 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.28.3.5.66.6 1 .08.35.08.72 0 1.08-.1.35-.32.7-.6 1Z" />
    </svg>
  )
}
