import type { ReactNode } from 'react'
import { useMemo } from 'react'
import {
  BookOpenCheck,
  FileText,
  Home,
  Layers3,
  MessageSquare,
  Settings,
  WifiOff,
  type LucideIcon,
} from 'lucide-react'
import {
  hasUsableApiConfig,
  useApiConfigsQuery,
} from '@/queries/apiConfigs'
import { useOrchestrationServiceHealthQuery } from '@/queries/orchestration'
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
  eyebrow: string
  title: string
  icon: LucideIcon
}

const NAV_ITEMS: NavItemDefinition[] = [
  {
    id: 'home',
    label: '首页',
    eyebrow: 'Study Dashboard',
    title: '今日学习工作台',
    icon: Home,
  },
  {
    id: 'library',
    label: '文档',
    eyebrow: 'Document Library',
    title: '文档库',
    icon: FileText,
  },
  {
    id: 'cards',
    label: '卡片',
    eyebrow: 'Card Workbench',
    title: '卡片库',
    icon: Layers3,
  },
  {
    id: 'learning',
    label: '学习',
    eyebrow: 'Spaced Review',
    title: '今日复习',
    icon: BookOpenCheck,
  },
  {
    id: 'knowledge',
    label: '知识',
    eyebrow: 'RAG ASSISTANT',
    title: '知识问答',
    icon: MessageSquare,
  },
  {
    id: 'settings',
    label: '设置',
    eyebrow: 'SETTINGS',
    title: '设置',
    icon: Settings,
  },
]

const PAGE_META = Object.fromEntries(
  NAV_ITEMS.map((item) => [item.id, { eyebrow: item.eyebrow, title: item.title }])
) as Record<NavItemId, { eyebrow: string; title: string }>

export function AppShell({ children, contextPanel, className }: AppShellProps) {
  const activeNavItem = useAppUiStore((state) => state.activeNavItem)
  const setActiveNavItem = useAppUiStore((state) => state.setActiveNavItem)
  const pageHeaderActions = useAppUiStore((state) => state.pageHeaderActions)
  const reader = useAppUiStore((state) => state.reader)
  const { data: apiConfigs = [], isLoading: isLoadingApiConfigs } = useApiConfigsQuery()
  const tauriRuntime = isTauriEnvironment()
  const { data: orchestrationHealth } = useOrchestrationServiceHealthQuery({
    enabled: activeNavItem !== 'settings',
  })
  const isReader = Boolean(reader.documentId)

  const pageMeta = useMemo(() => {
    if (isReader) {
      return {
        eyebrow: 'PDF READER',
        title: '文档阅读',
      }
    }
    return PAGE_META[activeNavItem] ?? PAGE_META.home
  }, [activeNavItem, isReader])

  const showApiHint = !isReader && !isLoadingApiConfigs && !hasUsableApiConfig(apiConfigs)

  return (
    <div
      className={cn(
        'app-shell app-shell-frame paper-texture flex h-dvh max-h-dvh min-h-0 overflow-hidden bg-paper-base text-ink',
        className
      )}
      data-testid="app-shell"
    >
      {!isReader ? (
        <aside className="hidden h-full w-[212px] shrink-0 border-r border-line-soft bg-paper-muted/82 md:flex">
          <div className="flex h-full w-full flex-col px-3 py-4">
            <div className="px-2 py-2">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-line-soft bg-paper-card font-reading text-lg text-ink shadow-card">
                  学
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-ink-soft">XUEJIAN</p>
                  <p className="truncate font-ui text-base font-medium text-ink">学鉴</p>
                </div>
              </div>
            </div>

            <nav className="mt-5 flex-1 space-y-1" aria-label="主导航">
              {NAV_ITEMS.map((item) => (
                <NavButton
                  key={item.id}
                  item={item}
                  active={activeNavItem === item.id}
                  onClick={() => setActiveNavItem(item.id)}
                />
              ))}
            </nav>

            <RuntimeStatus
              tauriRuntime={tauriRuntime}
              healthStatus={orchestrationHealth?.status ?? null}
              hostGatewayConfigured={orchestrationHealth?.hostGatewayConfigured ?? false}
              dependenciesReady={orchestrationHealth?.dependenciesReady ?? true}
            />
          </div>
        </aside>
      ) : null}

      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
        {!isReader ? (
          <header className="shrink-0 border-b border-line-soft bg-paper-base/88 px-4 py-3 backdrop-blur md:px-6">
            <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.24em] text-ink-soft">
                  {pageMeta.eyebrow}
                </p>
                <h1
                  className="mt-1 truncate font-ui text-lg font-medium leading-6 text-ink"
                  data-testid="app-shell-page-title"
                >
                  {pageMeta.title}
                </h1>
              </div>
              {showApiHint || pageHeaderActions.length > 0 ? (
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {pageHeaderActions.map((action) => {
                    const Icon = action.icon
                    return (
                      <button
                        key={action.id}
                        type="button"
                        onClick={action.onClick}
                        data-testid={`page-header-action-${action.id}`}
                        className={cn(
                          'inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm transition',
                          action.variant === 'outline'
                            ? 'border-line-soft bg-paper-card text-ink hover:border-ink/20 hover:bg-paper-muted'
                            : 'border-ink/10 bg-ink text-paper-base hover:bg-ink/88'
                        )}
                      >
                        {Icon ? <Icon className="h-4 w-4" /> : null}
                        {action.label}
                      </button>
                    )
                  })}
                  {showApiHint ? (
                    <button
                      type="button"
                      onClick={() => setActiveNavItem('settings')}
                      data-testid="api-setup-hint"
                      className="inline-flex h-9 shrink-0 items-center rounded-lg border border-line-soft bg-paper-card px-3 text-sm text-ink transition hover:border-ink/20 hover:bg-paper-muted"
                    >
                      配置 AI
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>

            <nav className="mt-3 flex gap-2 overflow-x-auto md:hidden" aria-label="移动导航">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveNavItem(item.id)}
                    className={cn(
                      'inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm transition',
                      activeNavItem === item.id
                        ? 'border-ink/20 bg-paper-card text-ink'
                        : 'border-transparent text-ink-muted hover:border-line-soft hover:bg-paper-card/70'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                )
              })}
            </nav>
          </header>
        ) : null}

        <main
          className={cn(
            'app-shell-main min-h-0 flex-1 basis-0 overflow-hidden'
          )}
        >
          <div
            className={cn(
              'mx-auto h-full min-h-0 w-full max-w-[1480px]',
              contextPanel
                ? 'grid h-full min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]'
                : isReader
                  ? 'flex h-full min-h-0 flex-col'
                  : 'min-h-0'
            )}
          >
            <div className={cn('h-full min-h-0 min-w-0')}>{children}</div>
            {contextPanel ? (
              <aside className="hidden min-h-0 overflow-hidden border-l border-line-soft bg-paper-card/80 xl:block">
                {contextPanel}
              </aside>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  )
}

function NavButton({
  item,
  active,
  onClick,
}: {
  item: NavItemDefinition
  active: boolean
  onClick: () => void
}) {
  const Icon = item.icon
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`sidebar-nav-${item.id}`}
      className={cn(
        'flex h-10 w-full items-center gap-3 rounded-lg border px-3 text-left text-sm font-medium transition-colors',
        active
          ? 'border-line-soft bg-paper-card text-ink shadow-card'
          : 'border-transparent text-ink-muted hover:bg-paper-card/65 hover:text-ink'
      )}
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden />
      <span>{item.label}</span>
    </button>
  )
}

function RuntimeStatus({
  tauriRuntime,
  healthStatus,
  hostGatewayConfigured,
  dependenciesReady,
}: {
  tauriRuntime: boolean
  healthStatus: 'starting' | 'healthy' | 'degraded' | 'stopped' | null
  hostGatewayConfigured: boolean
  dependenciesReady: boolean
}) {
  const hasIssue =
    !tauriRuntime ||
    healthStatus === 'degraded' ||
    healthStatus === 'stopped' ||
    !hostGatewayConfigured ||
    !dependenciesReady

  return (
    <div className="mt-4 border-t border-line-soft pt-3" data-testid="runtime-status-banner">
      <div
        className={cn(
          'flex items-start gap-2 rounded-lg border px-3 py-2 text-xs leading-5',
          hasIssue
            ? 'border-highlight-yellow/40 bg-highlight-yellow/15 text-ink-muted'
            : 'border-line-soft bg-paper-card/70 text-ink-muted'
        )}
      >
        <WifiOff className={cn('mt-0.5 h-3.5 w-3.5', !hasIssue && 'opacity-50')} />
        <p>
          {tauriRuntime
            ? hasIssue
              ? '本地服务需要检查。'
              : '本地服务已连接。'
            : 'Web 预览模式。'}
        </p>
      </div>
    </div>
  )
}
