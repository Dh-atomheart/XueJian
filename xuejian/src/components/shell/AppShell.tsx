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
  icon: ReactNode
}

const NAV_ITEMS: NavItemDefinition[] = [
  { id: 'home', label: '首页', shortLabel: '首页', icon: <HomeIcon /> },
  { id: 'library', label: '文档库', shortLabel: '文档', icon: <DocumentIcon /> },
  { id: 'cards', label: '卡片工坊', shortLabel: '卡片', icon: <CardsIcon /> },
  { id: 'learning', label: '复习', shortLabel: '复习', icon: <StudyIcon /> },
  { id: 'knowledge', label: '知识问答', shortLabel: '问答', icon: <KnowledgeIcon /> },
  { id: 'graph', label: '知识图谱', shortLabel: '图谱', icon: <GraphIcon /> },
  { id: 'podcast', label: '播客工坊', shortLabel: '播客', icon: <PodcastIcon /> },
  { id: 'profile', label: '我的', shortLabel: '我的', icon: <ProfileIcon /> },
]

const PAGE_META: Record<NavItemId, { eyebrow: string; title: string; description: string }> = {
  home: {
    eyebrow: 'STUDY CENTER',
    title: '今日学习中心',
    description: '围绕今天的任务、文档和卡片工作流继续推进。',
  },
  library: {
    eyebrow: 'DOCUMENT LIBRARY',
    title: '文档库',
    description: '管理导入文档、查看状态，并从这里进入阅读与后续工作流。',
  },
  cards: {
    eyebrow: 'CARD STUDIO',
    title: '卡片工坊',
    description: '把文档内容转为候选卡片，并在人工确认后写入正式卡片库。',
  },
  learning: {
    eyebrow: 'REVIEW',
    title: '复习',
    description: '完成今日新卡与到期卡片的复习任务。',
  },
  knowledge: {
    eyebrow: 'KNOWLEDGE QA',
    title: '知识问答',
    description: '围绕你的文档提问，并获得可追溯的引用答案。',
  },
  graph: {
    eyebrow: 'KNOWLEDGE GRAPH',
    title: '知识图谱',
    description: '查看概念之间的连接、社区关系与来源脉络。',
  },
  podcast: {
    eyebrow: 'PODCAST WORKSHOP',
    title: '播客工坊',
    description: '将文档内容改写为可听脚本与音频节目。',
  },
  profile: {
    eyebrow: 'PROFILE',
    title: '我的',
    description: '查看学习统计、阶段进度与累计积分变化。',
  },
  settings: {
    eyebrow: 'SETTINGS',
    title: '设置',
    description: '配置模型、学习偏好和应用行为。',
  },
}

export function AppShell({ children, contextPanel, className }: AppShellProps) {
  const activeNavItem = useAppUiStore((state) => state.activeNavItem)
  const setActiveNavItem = useAppUiStore((state) => state.setActiveNavItem)
  const reader = useAppUiStore((state) => state.reader)
  const feedbackLog = useAppUiStore((state) => state.feedbackLog)
  const toggleFeedbackPanel = useAppUiStore((state) => state.toggleFeedbackPanel)
  const { data: apiConfigs = [], isLoading: isLoadingApiConfigs } = useApiConfigsQuery()

  const pageMeta = useMemo(() => {
    if (reader.documentId) {
      return {
        eyebrow: 'READER',
        title: '阅读',
        description: '沉浸式阅读文档，并在上下文中连接卡片与批注。',
      }
    }

    return PAGE_META[activeNavItem]
  }, [activeNavItem, reader.documentId])

  const showApiHint = !reader.documentId && !isLoadingApiConfigs && !hasUsableApiConfig(apiConfigs)

  return (
    <div
      className={cn('app-shell flex h-screen overflow-hidden bg-background text-foreground', className)}
      data-testid="app-shell"
    >
      <aside className="hidden h-screen w-52 shrink-0 flex-col border-r border-border/60 bg-background md:flex">
        <div className="px-4 py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-foreground/5 text-foreground">
              <span className="text-lg font-semibold">笺</span>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">XUEJIAN</p>
              <p className="text-lg font-semibold text-foreground">学笺</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3" aria-label="Primary">
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

        <div className="border-t border-border/60 px-3 py-4">
          <NavButton
            active={activeNavItem === 'settings'}
            icon={<SettingsIcon />}
            label="设置"
            onClick={() => setActiveNavItem('settings')}
            testId="sidebar-nav-settings"
          />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col bg-background">
        <header className="border-b border-border/60 bg-background/92 px-5 py-4 backdrop-blur md:px-8">
          <div className="mx-auto flex w-full max-w-[1440px] items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                {pageMeta.eyebrow}
              </p>
              <h1 className="mt-1 text-2xl font-medium text-foreground" data-testid="app-shell-page-title">
                {pageMeta.title}
              </h1>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{pageMeta.description}</p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {showApiHint ? (
                <button
                  type="button"
                  onClick={() => setActiveNavItem('settings')}
                  data-testid="api-setup-hint"
                  className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted/40"
                >
                  配置 AI
                </button>
              ) : null}
              <button
                type="button"
                onClick={toggleFeedbackPanel}
                aria-label={`错误日志 ${feedbackLog.length}`}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
              >
                <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-foreground/5 px-1.5 py-0.5 text-[11px] text-foreground">
                  {feedbackLog.length}
                </span>
                日志
              </button>
            </div>
          </div>

          <nav className="mt-4 flex gap-2 overflow-x-auto md:hidden">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveNavItem(item.id)}
                className={cn(
                  'rounded-lg px-3 py-2 text-sm transition-colors',
                  activeNavItem === item.id
                    ? 'bg-foreground/6 text-foreground'
                    : 'text-muted-foreground hover:bg-foreground/[0.03] hover:text-foreground'
                )}
              >
                {item.shortLabel}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setActiveNavItem('settings')}
              className={cn(
                'rounded-lg px-3 py-2 text-sm transition-colors',
                activeNavItem === 'settings'
                  ? 'bg-foreground/6 text-foreground'
                  : 'text-muted-foreground hover:bg-foreground/[0.03] hover:text-foreground'
              )}
            >
              设置
            </button>
          </nav>
        </header>

        <main className="flex-1 overflow-auto">
          <div
            className={cn(
              'mx-auto w-full max-w-[1440px] p-6 md:p-8',
              contextPanel ? 'grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]' : ''
            )}
          >
            <div className="min-w-0">{children}</div>
            {contextPanel ? (
              <aside className="hidden min-h-[70vh] overflow-hidden rounded-2xl border border-border/60 bg-card xl:block">
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
        'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors',
        active
          ? 'bg-foreground/5 text-foreground'
          : 'text-muted-foreground hover:bg-foreground/[0.03] hover:text-foreground'
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

function GraphIcon() {
  return (
    <svg {...iconProps()}>
      <circle cx="6" cy="7" r="2" />
      <circle cx="18" cy="6" r="2" />
      <circle cx="12" cy="18" r="2" />
      <path d="m8 7.5 8-1" />
      <path d="m7.5 8.5 3.5 7" />
      <path d="m16.8 7.8-3.2 8" />
    </svg>
  )
}

function PodcastIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <path d="M12 19v3" />
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
