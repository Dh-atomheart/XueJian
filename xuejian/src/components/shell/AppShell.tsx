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
  description: string
  icon: LucideIcon
}

const NAV_ITEMS: NavItemDefinition[] = [
  {
    id: 'home',
    label: '首页',
    eyebrow: 'STUDY DASHBOARD',
    description: '查看今日复习、学习热力图、最近文档和掌握进度。',
    icon: Home,
  },
  {
    id: 'library',
    label: '文档',
    eyebrow: 'DOCUMENT LIBRARY',
    description: '导入 PDF，检查解析状态，并从文档生成可复习的卡片。',
    icon: FileText,
  },
  {
    id: 'cards',
    label: '卡片',
    eyebrow: 'CARD WORKBENCH',
    description: '管理 Basic 卡、分组、来源和标签。',
    icon: Layers3,
  },
  {
    id: 'learning',
    label: '学习',
    eyebrow: 'SPACED REVIEW',
    description: '专注完成今日复习队列，减少干扰。',
    icon: BookOpenCheck,
  },
  {
    id: 'knowledge',
    label: '知识',
    eyebrow: 'KNOWLEDGE RAG',
    description: '只基于已向量化文档进行学习型问答，并展示可追溯引用。',
    icon: MessageSquare,
  },
  {
    id: 'settings',
    label: '设置',
    eyebrow: 'SETTINGS',
    description: '配置 AI Provider、学习偏好和通用外观。',
    icon: Settings,
  },
]

const PAGE_META = Object.fromEntries(
  NAV_ITEMS.map((item) => [item.id, { eyebrow: item.eyebrow, description: item.description }])
) as Record<NavItemId, { eyebrow: string; description: string }>

export function AppShell({ children, contextPanel, className }: AppShellProps) {
  const activeNavItem = useAppUiStore((state) => state.activeNavItem)
  const setActiveNavItem = useAppUiStore((state) => state.setActiveNavItem)
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
        description: '沉浸阅读文档，并在右侧查看当前页关联卡片。',
      }
    }
    return PAGE_META[activeNavItem] ?? PAGE_META.home
  }, [activeNavItem, isReader])

  const showApiHint = !isReader && !isLoadingApiConfigs && !hasUsableApiConfig(apiConfigs)

  return (
    <div
      className={cn(
        'app-shell app-shell-frame paper-texture flex h-screen overflow-hidden bg-paper-base text-ink',
        className
      )}
      data-testid="app-shell"
    >
      {!isReader ? (
        <aside className="hidden h-screen w-[212px] shrink-0 border-r border-line-soft bg-paper-muted/82 md:flex">
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

      <div className="flex min-w-0 flex-1 flex-col">
        {!isReader ? (
          <header className="border-b border-line-soft bg-paper-base/88 px-4 py-3 backdrop-blur md:px-6">
            <div className="mx-auto flex w-full max-w-[1480px] items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.24em] text-ink-soft">
                  {pageMeta.eyebrow}
                </p>
                <p className="mt-1 truncate text-sm text-ink-muted">{pageMeta.description}</p>
              </div>
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
            'app-shell-main min-h-0 flex-1 overflow-x-hidden',
            isReader ? 'overflow-hidden' : 'overflow-y-auto'
          )}
        >
          <div
            className={cn(
              'mx-auto w-full max-w-[1480px]',
              contextPanel
                ? 'grid h-full min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]'
                : isReader
                  ? 'flex h-full min-h-0 flex-col'
                  : ''
            )}
          >
            <div className={cn('min-w-0', isReader && 'min-h-0')}>{children}</div>
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
