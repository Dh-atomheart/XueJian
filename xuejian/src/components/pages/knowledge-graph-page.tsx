import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function KnowledgeGraphPageLayout({
  statsBar,
  buildPanel,
  viewTabs,
  searchBar,
  stageHint,
  graphStage,
  detailRail,
}: {
  statsBar?: ReactNode
  buildPanel: ReactNode
  viewTabs?: Array<{ id: string; label: string; active: boolean; onClick: () => void }>
  searchBar?: ReactNode
  stageHint?: ReactNode
  graphStage: ReactNode
  detailRail: ReactNode
}) {
  return (
    <div
      className="mx-auto flex h-full w-full max-w-[1520px] flex-col gap-5"
      data-testid="knowledge-graph-page"
    >
      <div className="max-w-3xl">
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          KNOWLEDGE GRAPH
        </p>
        <h1 className="mt-1 text-2xl font-medium text-foreground" data-testid="app-shell-page-title">
          知识图谱
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          把构建入口、社区轨道、搜索探索、图谱舞台和节点详情收束到同一套工作台中，
          继续承接真实的构建、编辑、来源追踪与社区控制能力。
        </p>
      </div>

      {statsBar}

      <div className="grid min-h-0 flex-1 gap-5 xl:grid-cols-[300px_minmax(0,1fr)_360px]">
        <aside className="space-y-5">{buildPanel}</aside>

        <section className="flex min-h-0 flex-col gap-4">
          <div className="rounded-[28px] border border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(248,245,238,0.92))] px-5 py-4 shadow-[0_24px_70px_-40px_rgba(120,101,76,0.35)]">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              {viewTabs && viewTabs.length > 0 ? (
                <div className="inline-flex rounded-full border border-border/60 bg-background/70 p-1">
                  {viewTabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={tab.onClick}
                      className={cn(
                        'rounded-full px-4 py-2 text-sm transition-colors',
                        tab.active
                          ? 'bg-foreground text-background shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="flex flex-1 flex-col gap-3 xl:flex-row xl:items-center xl:justify-end">
                {searchBar}
                {stageHint ? (
                  <div className="rounded-full border border-border/50 bg-background/65 px-3 py-1.5 text-xs text-muted-foreground">
                    {stageHint}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1">{graphStage}</div>
        </section>

        <aside className="space-y-5">{detailRail}</aside>
      </div>
    </div>
  )
}
