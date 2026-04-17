import { AppShell } from '@/components/shell'
import { DocumentStatusBadge, ImportDocumentButton } from '@/components/documents'
import { Button, Divider, Panel } from '@/components/ui'
import { CardStudioPage } from '@/features/cards'
import { LibraryPage } from '@/features/documents'
import {
  useHostGatewayManifestQuery,
  useOrchestrationServiceHealthQuery,
  useRecentDocumentsQuery,
  useRecentWorkflowRunsQuery,
} from '@/queries'
import { useAppUiStore } from '@/store'

function healthBadgeClasses(status: 'starting' | 'healthy' | 'degraded' | 'stopped') {
  switch (status) {
    case 'healthy':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700'
    case 'starting':
      return 'border-amber-200 bg-amber-50 text-amber-700'
    case 'degraded':
      return 'border-orange-200 bg-orange-50 text-orange-700'
    default:
      return 'border-line-soft bg-paper-muted text-ink-muted'
  }
}

function App() {
  const activeNavItem = useAppUiStore((state) => state.activeNavItem)
  const setActiveNavItem = useAppUiStore((state) => state.setActiveNavItem)
  const { data: recentDocuments = [], isLoading: isLoadingDocuments } = useRecentDocumentsQuery(5)
  const { data: serviceHealth } = useOrchestrationServiceHealthQuery()
  const { data: workflowRuns = [] } = useRecentWorkflowRunsQuery(5)
  const { data: gatewayManifest } = useHostGatewayManifestQuery()

  if (activeNavItem === 'library') {
    return (
      <AppShell>
        <LibraryPage />
      </AppShell>
    )
  }

  if (activeNavItem === 'learning') {
    return (
      <AppShell>
        <CardStudioPage />
      </AppShell>
    )
  }

  if (activeNavItem === 'settings') {
    return (
      <AppShell>
        <PlaceholderPage
          eyebrow="M6 Later"
          title="Settings will expand once BYOK and analytics land."
          description="The current milestone focuses on stable document intake and a recoverable card production line."
        />
      </AppShell>
    )
  }

  const serviceStatus = serviceHealth?.status ?? 'stopped'

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <Panel variant="panel" className="overflow-hidden rounded-[30px] p-0">
          <div className="grid gap-6 bg-[radial-gradient(circle_at_top_left,rgba(248,225,108,0.16),transparent_42%),linear-gradient(135deg,rgba(255,255,255,0.78),rgba(251,251,249,0.94))] px-6 py-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
            <div className="space-y-4">
              <div className="inline-flex w-fit items-center rounded-full border border-ink/10 bg-white/70 px-3 py-1 text-[11px] uppercase tracking-[0.26em] text-ink-soft">
                Local-first Study System
              </div>
              <div className="space-y-3">
                <h1 className="font-display text-4xl leading-tight text-ink">
                  Import PDFs, stabilize anchors, then promote them into reviewable cards.
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-ink-muted">
                  M2 prepares chunks and anchors. M3 adds a checkpointed candidate workflow with
                  human confirmation before anything becomes a durable card.
                </p>
              </div>
            </div>

            <div className="flex min-w-[280px] flex-col gap-4 rounded-[26px] border border-line-soft bg-white/80 px-5 py-5 shadow-card">
              <div className="flex items-center justify-between gap-3">
                <span className="font-ui text-sm text-ink">Orchestration service</span>
                <span
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${healthBadgeClasses(serviceStatus)}`}
                >
                  {serviceStatus}
                </span>
              </div>
              <p className="text-xs text-ink-soft">
                {serviceHealth?.errorMessage ??
                  serviceHealth?.endpoint ??
                  'Waiting for the local orchestration service to start'}
              </p>
              <ImportDocumentButton
                onImported={() => setActiveNavItem('library')}
                showFeedback
                buttonProps={{ variant: 'sketch', className: 'w-full justify-center' }}
              />
            </div>
          </div>
        </Panel>

        <Divider />

        <div className="grid gap-4 lg:grid-cols-3">
          <Panel variant="paperCard">
            <h2 className="mb-3 font-ui text-lg text-ink">Quick start</h2>
            <div className="flex flex-col gap-2">
              <Button variant="sketch" className="w-full justify-start" onClick={() => setActiveNavItem('library')}>
                Open library
              </Button>
              <Button variant="outline" className="w-full justify-start" onClick={() => setActiveNavItem('learning')}>
                Open card foundry
              </Button>
            </div>
          </Panel>

          <Panel variant="paperCard">
            <h2 className="mb-3 font-ui text-lg text-ink">Today</h2>
            <div className="flex flex-col gap-2 text-sm text-ink-muted">
              <div className="flex justify-between">
                <span>Ready documents</span>
                <span className="font-latin text-ink">{recentDocuments.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Workflow runs</span>
                <span className="font-latin text-ink">{workflowRuns.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Service status</span>
                <span className="font-latin text-ink">{serviceStatus}</span>
              </div>
            </div>
          </Panel>

          <Panel variant="paperCard">
            <h2 className="mb-3 font-ui text-lg text-ink">Host boundary</h2>
            <div className="space-y-2 text-sm text-ink-muted">
              <div className="flex justify-between gap-3">
                <span>Protocol version</span>
                <span className="font-latin text-ink">{gatewayManifest?.protocolVersion ?? 'loading'}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>ModelGateway</span>
                <span className="font-latin text-ink">{gatewayManifest?.modelGatewayCommands.length ?? 0}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>ToolGateway</span>
                <span className="font-latin text-ink">{gatewayManifest?.toolGatewayCommands.length ?? 0}</span>
              </div>
            </div>
          </Panel>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
          <Panel variant="canvas" className="rounded-[28px] border border-line-soft bg-white/80">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.26em] text-ink-soft">Recent intake</p>
                <h2 className="mt-2 font-ui text-lg text-ink">Latest documents</h2>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setActiveNavItem('library')}>
                View all
              </Button>
            </div>

            {isLoadingDocuments ? (
              <div className="py-8 text-center text-ink-soft">Loading documents...</div>
            ) : recentDocuments.length === 0 ? (
              <div className="py-8 text-center text-ink-soft">
                No documents yet. Import the first PDF to start the study pipeline.
              </div>
            ) : (
              <ul className="flex flex-col gap-3">
                {recentDocuments.map((document) => (
                  <li
                    key={document.id}
                    className="flex items-center justify-between gap-4 rounded-[22px] border border-line-soft bg-paper-muted/60 px-4 py-4"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-ui text-sm text-ink">{document.title}</p>
                      <p className="mt-1 text-xs text-ink-soft">
                        {document.fileType.toUpperCase()} • {document.pageCount ?? '--'} pages •{' '}
                        {document.contentHash?.slice(0, 12) ?? 'pending-hash'}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <DocumentStatusBadge status={document.status} />
                      <Button variant="ghost" size="sm" onClick={() => setActiveNavItem('library')}>
                        Open
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel variant="paperCard" className="rounded-[28px]">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.26em] text-ink-soft">Workflow feed</p>
                <h2 className="mt-2 font-ui text-lg text-ink">Recent runs</h2>
              </div>
              <span className="font-latin text-xs text-ink-soft">{workflowRuns.length} runs</span>
            </div>

            {workflowRuns.length === 0 ? (
              <div className="py-8 text-center text-ink-soft">No workflow runs yet.</div>
            ) : (
              <ul className="flex flex-col gap-3">
                {workflowRuns.map((run) => (
                  <li
                    key={run.id}
                    className="rounded-[20px] border border-line-soft bg-paper-muted/60 px-4 py-3"
                  >
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <span className="font-ui text-sm text-ink">{run.workflowType}</span>
                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${healthBadgeClasses(
                          run.status === 'running'
                            ? 'starting'
                            : run.status === 'completed'
                              ? 'healthy'
                              : run.status === 'failed'
                                ? 'degraded'
                                : 'stopped'
                        )}`}
                      >
                        {run.status}
                      </span>
                    </div>
                    <p className="font-body text-xs text-ink-soft">thread: {run.threadId}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </AppShell>
  )
}

function PlaceholderPage({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string
  title: string
  description: string
}) {
  return (
    <Panel variant="panel" className="rounded-[30px]">
      <div className="flex min-h-[70vh] items-center justify-center px-6 py-10 text-center">
        <div className="max-w-2xl space-y-4">
          <p className="text-xs uppercase tracking-[0.3em] text-ink-soft">{eyebrow}</p>
          <h1 className="font-display text-4xl leading-tight text-ink">{title}</h1>
          <p className="text-sm leading-6 text-ink-muted">{description}</p>
        </div>
      </div>
    </Panel>
  )
}

export default App
