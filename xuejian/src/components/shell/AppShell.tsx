import { useMemo, type ReactNode } from 'react'
import { hasUsableApiConfig, useApiConfigsQuery } from '@/queries'
import { cn } from '@/lib/utils'
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
  eyebrow: string
}

const NAV_ITEMS: NavItemDefinition[] = [
  { id: 'home', label: '首页', shortLabel: '首页', eyebrow: 'Study Center' },
  { id: 'library', label: '文档库', shortLabel: '文库', eyebrow: 'Document Library' },
  { id: 'cards', label: '卡片工坊', shortLabel: '卡坊', eyebrow: 'Cards Workshop' },
  { id: 'learning', label: '学习', shortLabel: '学习', eyebrow: 'Space Review' },
  { id: 'knowledge', label: '知识问答', shortLabel: '问答', eyebrow: 'AI Assistant' },
  { id: 'graph', label: '知识图谱', shortLabel: '图谱', eyebrow: 'Knowledge Graph' },
  { id: 'podcast', label: '播客工坊', shortLabel: '播客', eyebrow: 'Podcast Workshop' },
  { id: 'profile', label: '我的', shortLabel: '我的', eyebrow: 'Profile & Stats' },
]

const PAGE_META: Record<NavItemId, { eyebrow: string; title: string; description: string }> = {
  home: {
    eyebrow: 'Study Center',
    title: '今日学习中心',
    description: '欢迎回来，今天也要把理解推进一步。',
  },
  library: {
    eyebrow: 'Document Library',
    title: '文档库',
    description: '管理你的 PDF、笔记和知识材料。',
  },
  cards: {
    eyebrow: 'Cards Workshop',
    title: '卡片工坊',
    description: '从材料中提炼卡片，检查候选并整理输出。',
  },
  learning: {
    eyebrow: 'Space Review',
    title: '复习中',
    description: '基于间隔重复，把知识留在长期记忆里。',
  },
  knowledge: {
    eyebrow: 'AI Assistant',
    title: '知识问答',
    description: '针对你的材料提问，进行检索增强问答。',
  },
  graph: {
    eyebrow: 'Knowledge Graph',
    title: '知识图谱',
    description: '观察概念关系，发现结构化知识网络。',
  },
  podcast: {
    eyebrow: 'Podcast Workshop',
    title: '播客工坊',
    description: '将学习内容改写成可听的节目与语音资产。',
  },
  profile: {
    eyebrow: 'Profile & Stats',
    title: '我的',
    description: '查看学习进度、统计和近期表现。',
  },
  settings: {
    eyebrow: 'Settings',
    title: '设置',
    description: '配置你的学习体验、模型能力与应用行为。',
  },
}

export function AppShell({ children, contextPanel, className }: AppShellProps) {
  const activeNavItem = useAppUiStore((state) => state.activeNavItem)
  const setActiveNavItem = useAppUiStore((state) => state.setActiveNavItem)
  const reader = useAppUiStore((state) => state.reader)
  const { data: apiConfigs = [], isLoading: isLoadingApiConfigs } = useApiConfigsQuery()

  const pageMeta = useMemo(() => {
    if (reader.documentId) {
      return {
        eyebrow: 'Reader',
        title: '阅读',
        description: '沉浸式查看文档，并在上下文中连接卡片与批注。',
      }
    }

    return PAGE_META[activeNavItem]
  }, [activeNavItem, reader.documentId])

  const showApiHint = !reader.documentId && !isLoadingApiConfigs && !hasUsableApiConfig(apiConfigs)

  return (
    <div
      className={cn(
        'app-shell-frame paper-texture flex min-h-screen bg-paper-base text-ink',
        className
      )}
      data-testid="app-shell"
    >
      <aside className="app-shell-sidebar hidden w-[220px] shrink-0 border-r border-line-soft/70 bg-paper-base/80 px-5 py-7 backdrop-blur md:flex md:flex-col">
        <div className="flex items-center gap-3 border-b border-line-soft/60 pb-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-line-soft/80 bg-paper-card font-display text-2xl text-ink">
            笺
          </div>
          <div>
            <p className="font-ui text-[11px] uppercase tracking-[0.3em] text-ink-soft">XueJian</p>
            <h1 className="mt-1 font-display text-[31px] leading-none text-ink">学笺</h1>
          </div>
        </div>

        <nav className="mt-6 flex flex-1 flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const isActive = activeNavItem === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveNavItem(item.id)}
                className={cn(
                  'group rounded-[18px] px-4 py-3 text-left transition duration-200',
                  isActive
                    ? 'bg-[#f3ebe0]/85 text-ink shadow-[inset_0_0_0_1px_rgba(203,179,151,0.28)]'
                    : 'text-ink-muted hover:bg-paper-card/75 hover:text-ink'
                )}
                data-testid={`sidebar-nav-${item.id}`}
              >
                <div className="font-ui text-[17px] leading-6">{item.label}</div>
                <div
                  className={cn(
                    'mt-0.5 font-latin-meta text-[10px] uppercase tracking-[0.24em]',
                    isActive ? 'text-[#9b7d58]' : 'text-ink-soft'
                  )}
                >
                  {item.eyebrow}
                </div>
              </button>
            )
          })}
        </nav>

        <button
          type="button"
          onClick={() => setActiveNavItem('settings')}
          className={cn(
            'mt-6 rounded-[18px] px-4 py-3 text-left transition duration-200',
            activeNavItem === 'settings'
              ? 'bg-paper-card text-ink shadow-[inset_0_0_0_1px_rgba(203,179,151,0.34)]'
              : 'text-ink-muted hover:bg-paper-card/75 hover:text-ink'
          )}
          data-testid="sidebar-nav-settings"
        >
          <div className="font-ui text-[17px] leading-6">设置</div>
          <div
            className={cn(
              'mt-0.5 font-latin-meta text-[10px] uppercase tracking-[0.24em]',
              activeNavItem === 'settings' ? 'text-[#9b7d58]' : 'text-ink-soft'
            )}
          >
            Settings
          </div>
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-line-soft/70 bg-paper-base/70 px-5 py-5 backdrop-blur md:px-8 md:py-6">
          <div className="mx-auto flex w-full max-w-[1380px] flex-col gap-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="font-latin-meta text-[11px] uppercase tracking-[0.34em] text-ink-soft">
                  {pageMeta.eyebrow}
                </p>
                <h2 className="mt-2 font-display text-[34px] leading-none text-ink md:text-[40px]">
                  {pageMeta.title}
                </h2>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-ink-muted md:text-[15px]">
                  {pageMeta.description}
                </p>
              </div>

              {showApiHint ? (
                <button
                  type="button"
                  onClick={() => setActiveNavItem('settings')}
                  className="hidden shrink-0 rounded-full border border-[#ceb18f]/80 bg-[#fbf4ea] px-4 py-2 font-ui text-sm text-[#7c5c39] transition hover:bg-[#f6ebdc] lg:inline-flex"
                >
                  尚未配置 AI 模型，前往设置
                </button>
              ) : null}
            </div>

            <nav className="flex gap-2 overflow-x-auto md:hidden">
              {NAV_ITEMS.map((item) => {
                const isActive = activeNavItem === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveNavItem(item.id)}
                    className={cn(
                      'whitespace-nowrap rounded-full border px-4 py-2 font-ui text-sm transition',
                      isActive
                        ? 'border-[#cfb38e] bg-[#f3ebe0] text-ink'
                        : 'border-line-soft bg-paper-card/80 text-ink-muted'
                    )}
                  >
                    {item.shortLabel}
                  </button>
                )
              })}
              <button
                type="button"
                onClick={() => setActiveNavItem('settings')}
                className={cn(
                  'whitespace-nowrap rounded-full border px-4 py-2 font-ui text-sm transition',
                  activeNavItem === 'settings'
                    ? 'border-[#cfb38e] bg-[#f3ebe0] text-ink'
                    : 'border-line-soft bg-paper-card/80 text-ink-muted'
                )}
              >
                设置
              </button>
            </nav>
          </div>
        </header>

        <main className="flex-1 overflow-auto px-4 py-5 md:px-8 md:py-7">
          <div
            className={cn(
              'mx-auto w-full max-w-[1380px]',
              contextPanel ? 'grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]' : ''
            )}
          >
            <div className="min-w-0">{children}</div>
            {contextPanel ? (
              <aside className="hidden min-h-[70vh] rounded-[28px] border border-line-soft/70 bg-paper-card/80 p-4 shadow-card xl:block">
                {contextPanel}
              </aside>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  )
}
