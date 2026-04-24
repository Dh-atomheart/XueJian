import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type PodcastPageMode = 'create' | 'library'

export interface PodcastMetricItem {
  label: string
  value: string | number
  hint?: string
}

export interface PodcastToolbarChip {
  label: string
  tone?: 'neutral' | 'info' | 'success' | 'warning'
}

const CHIP_TONE_CLASS: Record<NonNullable<PodcastToolbarChip['tone']>, string> = {
  neutral: 'border-border/50 bg-card/70 text-muted-foreground',
  info: 'border-sky-200/70 bg-sky-50 text-sky-700',
  success: 'border-emerald-200/70 bg-emerald-50 text-emerald-700',
  warning: 'border-amber-200/70 bg-amber-50 text-amber-700',
}

export function PodcastPageLayout({
  actions,
  toolbarChips,
  toolbarHint,
  metrics,
  mode,
  onModeChange,
  createWorkbench,
  mainStage,
  detailRail,
}: {
  actions?: ReactNode
  toolbarChips?: PodcastToolbarChip[]
  toolbarHint?: ReactNode
  metrics?: PodcastMetricItem[]
  mode: PodcastPageMode
  onModeChange: (mode: PodcastPageMode) => void
  createWorkbench: ReactNode
  mainStage: ReactNode
  detailRail: ReactNode
}) {
  return (
    <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-6" data-testid="podcast-page">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl">
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            PODCAST WORKSHOP
          </p>
          <h1 className="mt-1 text-2xl font-medium text-foreground" data-testid="app-shell-page-title">
            播客工坊
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            先配置 brief、文档与预算，再在同一套工作台里推进 episode 的生成、审阅、
            播放与回查，保持参考编码的创建优先结构。
          </p>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
      </div>

      <div
        className="flex flex-col gap-4 rounded-[28px] border border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(250,247,240,0.9))] px-5 py-4 shadow-[0_24px_70px_-40px_rgba(120,101,76,0.4)]"
        data-testid="podcast-toolbar"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-6 border-b border-border/30">
            {[
              { id: 'create' as const, label: '创建工作台' },
              { id: 'library' as const, label: 'Episode 库' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => onModeChange(tab.id)}
                className={cn(
                  'relative pb-3 text-sm font-medium transition-colors',
                  mode === tab.id
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {tab.label}
                {mode === tab.id ? (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />
                ) : null}
              </button>
            ))}
          </div>
          {toolbarHint ? (
            <div className="text-sm text-muted-foreground">{toolbarHint}</div>
          ) : null}
        </div>

        {toolbarChips && toolbarChips.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {toolbarChips.map((chip) => {
              const tone = chip.tone ?? 'neutral'
              return (
                <span
                  key={`${chip.label}-${tone}`}
                  className={cn(
                    'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium',
                    CHIP_TONE_CLASS[tone]
                  )}
                >
                  {chip.label}
                </span>
              )
            })}
          </div>
        ) : null}
      </div>

      {metrics && metrics.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <div
              key={metric.label}
              className="rounded-[24px] border border-border/60 bg-card/90 px-5 py-4 shadow-[0_16px_40px_-32px_rgba(48,40,32,0.45)]"
            >
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                {metric.label}
              </p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{metric.value}</p>
              {metric.hint ? (
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{metric.hint}</p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)_310px]">
        <aside className="space-y-5">{createWorkbench}</aside>
        <section data-testid="podcast-main-stage">{mainStage}</section>
        <aside data-testid="podcast-detail-rail" className="space-y-5">
          {detailRail}
        </aside>
      </div>
    </div>
  )
}
