import { Button, Panel } from '@/components/ui'
import { StudyStatsCard } from '@/components/stats'
import { DocumentStatusBadge, ImportDocumentButton } from '@/components/documents'
import { useDailyStatsQuery, useRecentDocumentsQuery, useApiConfigsQuery } from '@/queries'
import { usePointsSummaryQuery } from '@/queries/points'
import { useAppUiStore } from '@/store'

export function DashboardPage() {
  const setActiveNavItem = useAppUiStore((state) => state.setActiveNavItem)
  const openReader = useAppUiStore((state) => state.openReader)
  const { data: recentDocuments = [], isLoading: isLoadingDocuments } = useRecentDocumentsQuery(5)
  const { data: dailyStats } = useDailyStatsQuery()
  const { data: apiConfigs = [] } = useApiConfigsQuery()
  const { data: pointsSummary } = usePointsSummaryQuery()

  const totalDue = (dailyStats?.newCards ?? 0) + (dailyStats?.reviewCards ?? 0)
  const hasApiConfig = apiConfigs.length > 0
  const hasDocuments = recentDocuments.length > 0

  // First-use: no API config yet
  if (!hasApiConfig && !hasDocuments) {
    return <FirstUseView onGoSettings={() => setActiveNavItem('settings')} />
  }

  // Empty: has config but no documents
  if (hasApiConfig && !hasDocuments) {
    return (
      <EmptyWorkspaceView
        onGoLibrary={() => setActiveNavItem('library')}
        onImported={() => setActiveNavItem('library')}
      />
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* 今日学习任务 — 最重要的信息 */}
      <Panel variant="paperCard" className="rounded-[24px] p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="font-ui text-xs uppercase tracking-[0.24em] text-ink-soft">今日学习</p>
            <div className="flex items-end gap-3">
              <span className="font-display text-5xl tabular-nums leading-none text-ink">
                {totalDue}
              </span>
              <span className="mb-1 font-body text-sm text-ink-muted">张卡片待复习</span>
            </div>
            {dailyStats && (
              <div className="mt-1 flex gap-4 text-sm text-ink-muted">
                <span>
                  新卡 <span className="tabular-nums text-ink">{dailyStats.newCards}</span>
                </span>
                <span>
                  复习 <span className="tabular-nums text-ink">{dailyStats.reviewCards}</span>
                </span>
                {(pointsSummary?.todayPoints ?? 0) > 0 && (
                  <span>
                    积分{' '}
                    <span className="tabular-nums text-ink">+{pointsSummary!.todayPoints}</span>
                  </span>
                )}
              </div>
            )}
          </div>
          <Button
            variant="default"
            size="lg"
            className="shrink-0"
            onClick={() => setActiveNavItem('learning')}
            disabled={totalDue === 0}
          >
            {totalDue > 0 ? '开始学习' : '今日已完成'}
          </Button>
        </div>
      </Panel>

      {/* 快速动作 + 最近文档 */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.6fr)]">
        {/* 最近文档 */}
        <Panel variant="paperCard" className="rounded-[24px] p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-ui text-base text-ink">最近文档</h2>
            <Button variant="ghost" size="sm" onClick={() => setActiveNavItem('library')}>
              查看全部
            </Button>
          </div>

          {isLoadingDocuments ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="flex animate-pulse items-center gap-3 rounded-xl bg-paper-muted p-3"
                >
                  <div className="h-4 w-32 rounded bg-paper-soft" />
                  <div className="ml-auto h-4 w-16 rounded bg-paper-soft" />
                </div>
              ))}
            </div>
          ) : (
            <ul className="space-y-2">
              {recentDocuments.map((doc) => (
                <li key={doc.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-transparent px-3 py-3 text-left transition hover:border-line-soft hover:bg-paper-muted/60"
                    onClick={() => {
                      if (doc.status === 'ready') {
                        openReader(doc.id, doc.pageCount ?? 1)
                      } else {
                        setActiveNavItem('library')
                      }
                    }}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-ui text-sm text-ink">{doc.title}</p>
                      <p className="mt-0.5 text-xs text-ink-soft">
                        {doc.fileType.toUpperCase()} · {doc.pageCount ?? '--'} 页
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <DocumentStatusBadge status={doc.status} />
                      {doc.status === 'ready' && (
                        <span className="font-ui text-xs text-ink-muted">继续阅读 →</span>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* 快速开始侧栏 */}
        <div className="space-y-4">
          <Panel variant="paperCard" className="rounded-[24px] p-5">
            <h3 className="mb-3 font-ui text-sm text-ink">快速开始</h3>
            <div className="space-y-2">
              <Button
                variant="sketch"
                className="w-full justify-start"
                onClick={() => setActiveNavItem('learning')}
              >
                <LearnIcon className="mr-2 h-4 w-4" />
                进入学习
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => setActiveNavItem('library')}
              >
                <BookIcon className="mr-2 h-4 w-4" />
                文档库
              </Button>
              <ImportDocumentButton
                onImported={() => setActiveNavItem('library')}
                showFeedback
                idleLabel="导入文档"
                buttonProps={{
                  variant: 'outline',
                  className: 'w-full justify-start',
                }}
              />
            </div>
          </Panel>

          <Panel variant="paperCard" className="rounded-[24px] p-5">
            <h3 className="mb-3 font-ui text-sm text-ink">学习概览</h3>
            <StudyStatsCard />
          </Panel>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 首次使用视图 */
/* ------------------------------------------------------------------ */

function FirstUseView({ onGoSettings }: { onGoSettings: () => void }) {
  return (
    <div className="flex h-full items-center justify-center">
      <Panel variant="paperCard" className="max-w-md rounded-[24px] p-8 text-center">
        <div className="mb-4 font-display text-3xl text-ink">学笺</div>
        <p className="mb-2 font-body text-base text-ink">欢迎使用学笺，你的本地学习助手</p>
        <p className="mb-6 text-sm leading-relaxed text-ink-muted">
          开始之前，请先配置一个 AI 模型。所有 API Key 仅存储在本地密钥库中，不会离开你的设备。
        </p>
        <div className="flex flex-col gap-3">
          <Button variant="default" onClick={onGoSettings}>
            前往设置，配置模型
          </Button>
          <p className="text-xs text-ink-soft">配置完成后，就可以上传 PDF 并开始学习了</p>
        </div>
      </Panel>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 空工作台视图 */
/* ------------------------------------------------------------------ */

function EmptyWorkspaceView({
  onGoLibrary,
  onImported,
}: {
  onGoLibrary: () => void
  onImported: () => void
}) {
  return (
    <div className="flex h-full items-center justify-center">
      <Panel variant="paperCard" className="max-w-md rounded-[24px] p-8 text-center">
        <div className="mb-4 font-display text-2xl text-ink">准备开始</div>
        <p className="mb-6 text-sm leading-relaxed text-ink-muted">
          模型已配置好。现在上传你的第一份 PDF，系统会自动解析文档并生成学习卡片。
        </p>
        <div className="flex flex-col items-center gap-3">
          <ImportDocumentButton
            onImported={onImported}
            showFeedback
            buttonProps={{ variant: 'default' }}
          />
          <Button variant="ghost" size="sm" onClick={onGoLibrary}>
            前往文档库
          </Button>
        </div>
      </Panel>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 小图标 */
/* ------------------------------------------------------------------ */

function LearnIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
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

function BookIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
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
