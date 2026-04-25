import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentProps,
  type ReactNode,
} from 'react'
import Graph from 'graphology'
import forceAtlas2 from 'graphology-layout-forceatlas2'
import Sigma from 'sigma'
import { KnowledgeGraphPageLayout } from '@/components/pages/knowledge-graph-page'
import { Button, Card, Input } from '@/components/ui'
import { cn } from '@/lib/utils'
import {
  useAllGraphEdgesQuery,
  useCancelGraphBuildMutation,
  useCommunitiesQuery,
  useCommunitySummaryQuery,
  useGraphBuildRunsQuery,
  useGraphNodesQuery,
  useGraphStatsQuery,
  useNodeSourcesQuery,
  useStartGraphBuildMutation,
} from '@/queries/knowledgeGraph'
import { useDocumentsQuery } from '@/queries'
import { useAppUiStore } from '@/store'
import type {
  Community,
  CommunitySummary,
  GraphBuildRun,
  GraphStats,
  KnowledgeEdge,
  KnowledgeNode,
  KnowledgeNodeType,
  RelationType,
} from '@/types/knowledge-graph'
import './knowledge-graph.css'

const NODE_TYPE_COLORS: Record<KnowledgeNodeType, string> = {
  concept: '#5B8DEF',
  person: '#E8A838',
  event: '#4CAF7D',
  formula: '#9C6ADE',
  term: '#E06C75',
}

const RELATION_COLORS: Record<RelationType, string> = {
  is_a: '#8BB0F5',
  part_of: '#8BB0F5',
  depends_on: '#F0C06A',
  causes: '#7DCBA4',
  related_to: '#A0A0A0',
  similar_to: '#90A8C0',
  uses: '#B89AE6',
  produces: '#E8989F',
}

const VIEW_MODE_OPTIONS = [
  { id: 'global', label: 'Global' },
  { id: 'explore', label: 'Explore' },
] as const

type ViewMode = (typeof VIEW_MODE_OPTIONS)[number]['id']

type CanvasNode = {
  id: string
  label: string
  color: string
  size: number
}

type CanvasEdge = {
  id: string
  from: string
  to: string
  relation: RelationType
  confidence: number
  color: string
}

function Panel({
  className,
  children,
  ...props
}: ComponentProps<'div'> & { children: ReactNode }) {
  return (
    <Card className={cn('gap-0 py-0', className)} {...props}>
      {children}
    </Card>
  )
}

export function KnowledgeGraphPage() {
  const setActiveNavItem = useAppUiStore((state) => state.setActiveNavItem)
  const openKnowledgeQa = useAppUiStore((state) => state.openKnowledgeQa)
  const setPreferredCardStudioDocumentId = useAppUiStore(
    (state) => state.setPreferredCardStudioDocumentId
  )

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedCommunityId, setSelectedCommunityId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('global')
  const [searchInput, setSearchInput] = useState('')
  const [selectedBuildDocumentIds, setSelectedBuildDocumentIds] = useState<string[]>([])
  const [collapsedCommunityIds, setCollapsedCommunityIds] = useState<string[]>([])

  const deferredSearch = useDeferredValue(searchInput.trim())

  const { data: stats } = useGraphStatsQuery()
  const { data: documents = [] } = useDocumentsQuery()
  const { data: nodes = [] } = useGraphNodesQuery()
  const { data: allEdges = [] } = useAllGraphEdgesQuery()
  const { data: communities = [] } = useCommunitiesQuery()
  const { data: buildRuns = [] } = useGraphBuildRunsQuery()
  const { data: sources = [] } = useNodeSourcesQuery(selectedNodeId ?? '', !!selectedNodeId)

  const startGraphBuildMutation = useStartGraphBuildMutation()
  const cancelGraphBuildMutation = useCancelGraphBuildMutation()

  const readyDocuments = useMemo(
    () => documents.filter((document) => document.status === 'ready'),
    [documents]
  )
  const documentTitleMap = useMemo(
    () => new Map(readyDocuments.map((document) => [document.id, document.title])),
    [readyDocuments]
  )
  const activeBuildRun = useMemo(
    () =>
      buildRuns.find((run) => run.status === 'running' || run.status === 'queued') ??
      buildRuns[0] ??
      null,
    [buildRuns]
  )

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null
  const selectedCommunity =
    communities.find((community) => community.id === selectedCommunityId) ??
    communities.find((community) => community.id === selectedNode?.communityId) ??
    null
  const { data: selectedCommunitySummary } = useCommunitySummaryQuery(
    selectedCommunity?.id ?? '',
    !!selectedCommunity?.id
  )
  const communitySummary =
    selectedCommunitySummary ?? safeParseSummary(selectedCommunity?.summaryJson ?? null)

  const selectedSourceDocuments = useMemo(
    () =>
      sources.map((sourceId) => ({
        id: sourceId,
        title: documentTitleMap.get(sourceId) ?? sourceId,
      })),
    [documentTitleMap, sources]
  )

  useEffect(() => {
    startTransition(() => {
      setCollapsedCommunityIds(
        communities.filter((community) => community.collapsed).map((community) => community.id)
      )
    })
  }, [communities])

  useEffect(() => {
    if (readyDocuments.length === 0) {
      setSelectedBuildDocumentIds([])
      return
    }

    setSelectedBuildDocumentIds((current) => {
      const valid = current.filter((documentId) =>
        readyDocuments.some((document) => document.id === documentId)
      )
      return valid.length > 0 ? valid : [readyDocuments[0].id]
    })
  }, [readyDocuments])

  const selectedIncidentEdges = useMemo(
    () =>
      selectedNodeId
        ? allEdges.filter(
            (edge) => edge.fromNodeId === selectedNodeId || edge.toNodeId === selectedNodeId
          )
        : [],
    [allEdges, selectedNodeId]
  )

  const handleCanvasNodeSelect = useEffectEvent((nodeId: string | null) => {
    setSelectedCommunityId(null)
    setSelectedNodeId(nodeId)
    if (nodeId) {
      setViewMode('explore')
    }
  })

  const handleCanvasCommunitySelect = useEffectEvent((communityId: string | null) => {
    setSelectedNodeId(null)
    setSelectedCommunityId(communityId)
    if (communityId) {
      setViewMode('explore')
    }
  })

  const handleToggleBuildDocument = useEffectEvent((documentId: string) => {
    setSelectedBuildDocumentIds((current) =>
      current.includes(documentId)
        ? current.filter((id) => id !== documentId)
        : [...current, documentId]
    )
  })

  const handleStartBuild = useEffectEvent(() => {
    if (selectedBuildDocumentIds.length === 0) return

    startGraphBuildMutation.mutate({
      documentIds: selectedBuildDocumentIds,
      scopeDescription:
        selectedBuildDocumentIds.length === 1
          ? 'single document graph build'
          : 'multi document graph build',
      incremental: nodes.length > 0,
    })
  })

  const handleCancelBuild = useEffectEvent(() => {
    if (!activeBuildRun) return
    cancelGraphBuildMutation.mutate(activeBuildRun.id)
  })

  const handleAskWithGraph = useEffectEvent(() => {
    if (!selectedNode) return
    openKnowledgeQa({
      question: `请结合知识图谱解释“${selectedNode.label}”`,
      selectedDocumentIds: sources,
      sourceLabel: selectedNode.label,
      graphContextSummary:
        communitySummary?.summary ??
        selectedNode.description ??
        `Graph-assisted answer for ${selectedNode.label}`,
    })
  })

  const handleViewCards = useEffectEvent(() => {
    const documentId = sources[0] ?? selectedNode?.sourceIds[0] ?? null
    if (!documentId) return
    setPreferredCardStudioDocumentId(documentId)
    setActiveNavItem('cards')
  })

  return (
    <KnowledgeGraphPageLayout
      statsBar={<StatsBar stats={stats} buildRuns={buildRuns} />}
      buildPanel={
        <Panel
          className="flex min-h-0 flex-col gap-4 overflow-hidden border border-ink/10 bg-paper-card/80 p-4 backdrop-blur"
          data-testid="knowledge-graph-build-panel"
        >
          <section className="rounded-[22px] border border-ink/10 bg-paper-base/78 p-4 shadow-paper">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.32em] text-ink-soft">Build</p>
                <h2 className="kg-display text-xl text-ink">Graph Build</h2>
                <p className="mt-2 text-sm leading-7 text-ink-muted">
                  Select ready documents, build the graph, then jump from nodes into QA or card study.
                </p>
              </div>
              <Button
                size="sm"
                onClick={activeBuildRun?.status === 'running' ? handleCancelBuild : handleStartBuild}
                disabled={
                  selectedBuildDocumentIds.length === 0 ||
                  startGraphBuildMutation.isPending ||
                  cancelGraphBuildMutation.isPending
                }
                data-testid="knowledge-graph-build-action"
              >
                {activeBuildRun?.status === 'running' ? 'Cancel build' : 'Build graph'}
              </Button>
            </div>

            <div className="mt-4 space-y-2">
              {readyDocuments.length > 0 ? (
                readyDocuments.map((document) => {
                  const checked = selectedBuildDocumentIds.includes(document.id)
                  return (
                    <label
                      key={document.id}
                      className="flex cursor-pointer items-start gap-3 rounded-[16px] border border-ink/10 bg-paper-card px-3 py-3"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => handleToggleBuildDocument(document.id)}
                        className="mt-1"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{document.title}</p>
                        <p className="mt-1 text-xs text-ink-muted">
                          {document.pageCount ?? 0} pages
                        </p>
                      </div>
                    </label>
                  )
                })
              ) : (
                <p className="text-sm text-ink-muted">No ready documents are available.</p>
              )}
            </div>

            <div
              className="mt-4 rounded-[16px] border border-ink/10 bg-paper-card px-3 py-3 text-sm text-ink-muted"
              data-testid="knowledge-graph-build-status"
            >
              {activeBuildRun ? (
                <>
                  <p className="font-medium text-ink">{activeBuildRun.scopeDescription}</p>
                  <p className="mt-1">{describeBuildRun(activeBuildRun)}</p>
                  {activeBuildRun.errorMessage ? (
                    <p className="mt-2 text-destructive">{activeBuildRun.errorMessage}</p>
                  ) : null}
                </>
              ) : (
                <p>No graph build has been started yet.</p>
              )}
            </div>
          </section>

          <section className="rounded-[22px] border border-ink/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.95),rgba(245,245,240,0.92))] p-4 shadow-paper">
            <div>
              <p className="text-[11px] uppercase tracking-[0.32em] text-ink-soft">Overview</p>
              <h2 className="kg-display text-xl text-ink">Knowledge map</h2>
              <p className="mt-2 text-sm leading-7 text-ink-muted">
                Use the graph as a working surface for exploration, not as an isolated report page.
              </p>
            </div>
          </section>

          <section className="rounded-[22px] border border-ink/10 bg-paper-base/78 p-4 shadow-paper">
            <h3 className="text-sm font-semibold text-ink">How to use</h3>
            <div className="mt-3 space-y-3 text-sm text-ink-muted">
              <p>Use search to narrow down nodes by label, alias, or description.</p>
              <p>Click a node to inspect its sources, relations, and graph-aware next actions.</p>
              <p>Explore mode focuses on one node or one community at a time.</p>
            </div>
          </section>

          <section className="rounded-[22px] border border-ink/10 bg-paper-base/78 p-4 shadow-paper">
            <h3 className="text-sm font-semibold text-ink">Recent builds</h3>
            {buildRuns.length > 0 ? (
              <div className="mt-3 space-y-2">
                {buildRuns.slice(0, 4).map((run) => (
                  <div
                    key={run.id}
                    className="rounded-[16px] border border-ink/10 bg-paper-card px-3 py-3"
                  >
                    <p className="text-sm font-medium text-ink">{run.scopeDescription}</p>
                    <p className="mt-1 text-xs text-ink-muted">{describeBuildRun(run)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-ink-muted">No recent graph builds yet.</p>
            )}
          </section>
        </Panel>
      }
      viewTabs={VIEW_MODE_OPTIONS.map((option) => ({
        id: option.id,
        label: option.label,
        active: viewMode === option.id,
        onClick: () => setViewMode(option.id),
      }))}
      searchBar={
        <div className="min-w-[240px] flex-1 xl:max-w-[360px]">
          <Input
            placeholder="Search nodes, aliases, or descriptions"
            value={searchInput}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setSearchInput(event.target.value)}
          />
        </div>
      }
      stageHint={
        viewMode === 'explore' && selectedNode
          ? `Focused node: ${selectedNode.label}`
          : selectedCommunity
            ? `Focused community: ${selectedCommunity.title || 'Untitled'}`
            : 'Browse the complete knowledge graph'
      }
      graphStage={
        <Panel className="relative min-h-0 overflow-hidden border border-ink/10 bg-paper-card/85 p-0 backdrop-blur">
          <div className="grid h-full min-h-0 grid-rows-[1fr_auto]">
            <GraphCanvas
              collapsedCommunityIds={collapsedCommunityIds}
              communities={communities}
              edges={allEdges}
              nodes={nodes}
              searchQuery={deferredSearch}
              selectedCommunityId={selectedCommunity?.id ?? null}
              selectedNodeId={selectedNodeId}
              viewMode={viewMode}
              onSelectCommunity={handleCanvasCommunitySelect}
              onSelectNode={handleCanvasNodeSelect}
            />
            <div className="border-t border-ink/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.8),rgba(245,245,240,0.88))] px-4 py-3 text-xs text-ink-muted">
              The canvas stays read-oriented. Build state and downstream actions live in the side rails.
            </div>
          </div>
        </Panel>
      }
      detailRail={
        <Panel className="flex min-h-0 flex-col gap-4 overflow-hidden border border-ink/10 bg-paper-card/82 p-4 backdrop-blur">
          {selectedNode ? (
            <>
              <section className="rounded-[22px] border border-ink/10 bg-[linear-gradient(160deg,rgba(91,141,239,0.08),rgba(255,255,255,0.95))] p-4 shadow-paper">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.3em] text-ink-soft">Node</p>
                  <h2 className="kg-display text-2xl text-ink">{selectedNode.label}</h2>
                  <p className="mt-2 text-sm text-ink-muted">
                    {selectedNode.description || 'No node description yet.'}
                  </p>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <DetailStat label="Node type" value={selectedNode.nodeType} />
                  <DetailStat label="Degree" value={String(selectedNode.degree)} />
                </div>
              </section>

              <section className="rounded-[22px] border border-ink/10 bg-paper-base/78 p-4 shadow-paper">
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={handleAskWithGraph}
                    data-testid="knowledge-graph-ask-question"
                  >
                    Ask with graph
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleViewCards}
                    disabled={selectedSourceDocuments.length === 0}
                  >
                    View related cards
                  </Button>
                </div>
              </section>

              <section className="rounded-[22px] border border-ink/10 bg-paper-base/78 p-4 shadow-paper">
                <h3 className="text-sm font-semibold text-ink">Source documents</h3>
                {selectedSourceDocuments.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {selectedSourceDocuments.map((source) => (
                      <div
                        key={source.id}
                        className="rounded-[16px] border border-ink/10 bg-paper-card px-3 py-3 text-sm text-ink"
                      >
                        {source.title}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-ink-muted">No source documents are linked yet.</p>
                )}
              </section>

              <section className="rounded-[22px] border border-ink/10 bg-paper-base/78 p-4 shadow-paper">
                <h3 className="text-sm font-semibold text-ink">Relations</h3>
                {selectedIncidentEdges.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {selectedIncidentEdges.slice(0, 8).map((edge) => {
                      const otherNodeId =
                        edge.fromNodeId === selectedNode.id ? edge.toNodeId : edge.fromNodeId
                      const otherNode = nodes.find((node) => node.id === otherNodeId)
                      return (
                        <button
                          key={edge.id}
                          type="button"
                          onClick={() => setSelectedNodeId(otherNodeId)}
                          className="flex w-full items-center justify-between rounded-[16px] border border-ink/10 bg-paper-card px-3 py-3 text-left"
                        >
                          <div>
                            <p className="text-sm font-medium text-ink">
                              {otherNode?.label ?? otherNodeId}
                            </p>
                            <p className="mt-1 text-xs text-ink-muted">
                              {edge.relation} | confidence {edge.confidence.toFixed(2)}
                            </p>
                          </div>
                          <span className="text-xs text-ink-soft">Open</span>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-ink-muted">No incident relations for this node yet.</p>
                )}
              </section>
            </>
          ) : selectedCommunity ? (
            <CommunityDetailPanel community={selectedCommunity} summary={communitySummary} />
          ) : (
            <Panel className="flex h-full items-center justify-center border border-dashed border-ink/15 bg-paper-base/65 p-4 text-center text-ink-muted">
              <div>
                <p className="text-[11px] uppercase tracking-[0.32em] text-ink-soft">Knowledge map</p>
                <h2 className="kg-display mt-2 text-2xl text-ink">Select a node to continue</h2>
                <p className="mt-2 max-w-xs text-sm">
                  Node details, source links, graph-assisted QA, and card hand-off appear here.
                </p>
              </div>
            </Panel>
          )}
        </Panel>
      }
    />
  )
}

function StatsBar({
  buildRuns,
  stats,
}: {
  stats: GraphStats | undefined
  buildRuns: GraphBuildRun[]
}) {
  const distribution = stats?.nodeTypeDistribution ?? {
    concept: 0,
    person: 0,
    event: 0,
    formula: 0,
    term: 0,
  }
  const latestRun = stats?.lastBuildRun ?? buildRuns[0] ?? null

  return (
    <Panel className="border border-ink/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(245,245,240,0.85))] p-4 shadow-paper backdrop-blur">
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr_1.1fr]">
        <div>
          <p className="text-[11px] uppercase tracking-[0.34em] text-ink-soft">Stats</p>
          <div className="mt-2 grid grid-cols-3 gap-3">
            <StatPill label="Nodes" value={stats?.totalNodes ?? 0} accent="kg-stat-accent-blue" />
            <StatPill label="Edges" value={stats?.totalEdges ?? 0} accent="kg-stat-accent-amber" />
            <StatPill
              label="Communities"
              value={stats?.totalCommunities ?? 0}
              accent="kg-stat-accent-green"
            />
          </div>
        </div>
        <div>
          <p className="mb-2 text-[11px] uppercase tracking-[0.34em] text-ink-soft">
            Type distribution
          </p>
          <div className="space-y-2">
            {Object.entries(distribution).map(([nodeType, count]) => (
              <div
                key={nodeType}
                className="grid grid-cols-[72px_1fr_38px] items-center gap-2 text-sm"
              >
                <span className="text-ink-muted">{nodeType}</span>
                <div className="flex items-center gap-2 rounded-full bg-paper-base px-2 py-1">
                  <span className={`kg-node-dot kg-node-dot-${nodeType}`} aria-hidden="true" />
                  <span className="text-xs text-ink-soft">distribution</span>
                </div>
                <span className="text-right text-ink">{count}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-[11px] uppercase tracking-[0.34em] text-ink-soft">Latest build</p>
          {latestRun ? (
            <div className="rounded-[20px] border border-ink/10 bg-paper-base/80 p-3 text-sm text-ink">
              <div className="mb-1 flex items-center justify-between gap-3">
                <span className="font-medium">{latestRun.scopeDescription}</span>
                <span className="rounded-full bg-paper-card px-2 py-1 text-xs text-ink-muted">
                  {latestRun.status}
                </span>
              </div>
              <p className="text-ink-muted">{describeBuildRun(latestRun)}</p>
            </div>
          ) : (
            <div className="rounded-[20px] border border-dashed border-ink/15 bg-paper-base/80 p-3 text-sm text-ink-muted">
              No build history yet
            </div>
          )}
        </div>
      </div>
    </Panel>
  )
}

function StatPill({ accent, label, value }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-[20px] border border-ink/10 bg-paper-base/78 px-4 py-3">
      <div className={`kg-stat-accent mb-2 h-1.5 rounded-full ${accent}`}>
        <div className="h-1.5 rounded-full" />
      </div>
      <p className="text-xs uppercase tracking-[0.24em] text-ink-soft">{label}</p>
      <p className="kg-display mt-1 text-2xl text-ink">{value}</p>
    </div>
  )
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-ink/10 bg-paper-base px-3 py-3">
      <p className="text-[11px] uppercase tracking-[0.24em] text-ink-soft">{label}</p>
      <p className="mt-2 text-sm font-medium text-ink">{value}</p>
    </div>
  )
}

function CommunityDetailPanel({
  community,
  summary,
}: {
  community: Community
  summary: CommunitySummary | null
}) {
  return (
    <>
      <section className="rounded-[22px] border border-ink/10 bg-[linear-gradient(160deg,rgba(76,175,125,0.1),rgba(255,255,255,0.96))] p-4 shadow-paper">
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-ink-soft">Community</p>
          <h2 className="kg-display text-2xl text-ink">{community.title || 'Untitled community'}</h2>
          <p className="text-sm text-ink-muted">
            Level {community.level} | {community.nodeCount} nodes | {community.edgeCount} edges
          </p>
        </div>
      </section>
      <section className="rounded-[22px] border border-ink/10 bg-paper-base/78 p-4 shadow-paper">
        <h3 className="mb-3 text-sm font-semibold text-ink">Summary</h3>
        {summary ? (
          <div className="space-y-4 text-sm text-ink">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-ink-soft">Overview</p>
              <p className="mt-1 leading-7 text-ink">{summary.summary}</p>
            </div>
            <SummarySection label="Key entities" values={summary.keyEntities} />
            <SummarySection label="Core relations" values={summary.coreRelations} />
            <SummarySection label="Knowledge gaps" values={summary.knowledgeGaps} />
          </div>
        ) : (
          <p className="text-sm text-ink-muted">No community summary has been generated yet.</p>
        )}
      </section>
    </>
  )
}

function SummarySection({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.24em] text-ink-soft">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {values.length > 0 ? (
          values.map((value) => (
            <span
              key={value}
              className="rounded-full border border-ink/10 bg-paper-card px-3 py-1 text-xs"
            >
              {value}
            </span>
          ))
        ) : (
          <span className="text-sm text-ink-muted">None</span>
        )}
      </div>
    </div>
  )
}

function GraphCanvas({
  collapsedCommunityIds,
  communities,
  edges,
  nodes,
  searchQuery,
  selectedCommunityId,
  selectedNodeId,
  viewMode,
  onSelectCommunity,
  onSelectNode,
}: {
  collapsedCommunityIds: string[]
  communities: Community[]
  edges: KnowledgeEdge[]
  nodes: KnowledgeNode[]
  searchQuery: string
  selectedCommunityId: string | null
  selectedNodeId: string | null
  viewMode: ViewMode
  onSelectCommunity: (communityId: string | null) => void
  onSelectNode: (nodeId: string | null) => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  const handleSelectNode = useEffectEvent((nodeId: string | null) => {
    onSelectNode(nodeId)
  })

  const handleSelectCommunity = useEffectEvent((communityId: string | null) => {
    onSelectCommunity(communityId)
  })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    if (nodes.length === 0) {
      container.innerHTML = ''
      return
    }

    const graph = new Graph()
    const { canvasEdges, canvasNodes } = buildCanvasModel({
      collapsedCommunityIds,
      communities,
      edges,
      nodes,
      searchQuery,
      selectedCommunityId,
      selectedNodeId,
      viewMode,
    })

    if (canvasNodes.length === 0) {
      container.innerHTML = ''
      return
    }

    const radius = Math.max(10, canvasNodes.length * 4)
    canvasNodes.forEach((node, index) => {
      const angle = (Math.PI * 2 * index) / Math.max(1, canvasNodes.length)
      graph.addNode(node.id, {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        label: node.label,
        size: node.size,
        color: node.color,
      })
    })

    canvasEdges.forEach((edge) => {
      if (!graph.hasNode(edge.from) || !graph.hasNode(edge.to)) return
      if (graph.hasEdge(edge.id)) return
      graph.addEdgeWithKey(edge.id, edge.from, edge.to, {
        size: 1 + edge.confidence * 1.5,
        label: edge.relation,
        color: edge.color,
        type: 'arrow',
      })
    })

    if (graph.order > 1) {
      forceAtlas2.assign(graph, {
        iterations: 120,
        settings: forceAtlas2.inferSettings(graph),
      })
    }

    const sigma = new Sigma(graph, container, {
      allowInvalidContainer: true,
      renderLabels: true,
      renderEdgeLabels: graph.order <= 80,
      labelDensity: 0.12,
      labelGridCellSize: 100,
      edgeLabelSize: 12,
      edgeLabelFont: 'LXGW WenKai',
      labelFont: 'LXGW WenKai',
      labelSize: 13,
      zIndex: true,
    })

    sigma.on('clickNode', (event) => {
      const nodeId = String(event.node)
      if (nodeId.startsWith('community:')) {
        handleSelectCommunity(nodeId.replace('community:', ''))
        return
      }
      handleSelectCommunity(null)
      handleSelectNode(nodeId)
    })

    sigma.on('clickStage', () => {
      handleSelectNode(null)
      handleSelectCommunity(null)
    })

    return () => {
      sigma.kill()
      container.innerHTML = ''
    }
  }, [
    collapsedCommunityIds,
    communities,
    edges,
    handleSelectCommunity,
    handleSelectNode,
    nodes,
    searchQuery,
    selectedCommunityId,
    selectedNodeId,
    viewMode,
  ])

  return (
    <div className="relative h-full min-h-0">
      <div className="kg-canvas-surface absolute inset-3 rounded-[28px] border border-ink/10 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.3)]" />
      <div ref={containerRef} className="absolute inset-3 rounded-[28px]" />
      {nodes.length === 0 ? (
        <div className="absolute inset-3 flex items-center justify-center rounded-[28px] border border-dashed border-ink/15 bg-paper-base/75 text-sm text-ink-muted">
          No graph content has been built yet.
        </div>
      ) : null}
    </div>
  )
}

function buildCanvasModel({
  collapsedCommunityIds,
  communities,
  edges,
  nodes,
  searchQuery,
  selectedCommunityId,
  selectedNodeId,
  viewMode,
}: {
  collapsedCommunityIds: string[]
  communities: Community[]
  edges: KnowledgeEdge[]
  nodes: KnowledgeNode[]
  searchQuery: string
  selectedCommunityId: string | null
  selectedNodeId: string | null
  viewMode: ViewMode
}) {
  const communityMap = new Map(communities.map((community) => [community.id, community]))
  const visibleNodeIds = new Set<string>()

  if (viewMode === 'explore' && selectedNodeId) {
    visibleNodeIds.add(selectedNodeId)
    for (const edge of edges) {
      if (edge.fromNodeId === selectedNodeId) visibleNodeIds.add(edge.toNodeId)
      if (edge.toNodeId === selectedNodeId) visibleNodeIds.add(edge.fromNodeId)
    }
  } else if (viewMode === 'explore' && selectedCommunityId) {
    const community = communityMap.get(selectedCommunityId)
    community?.memberNodeIds.forEach((nodeId) => visibleNodeIds.add(nodeId))
  } else {
    nodes.forEach((node) => visibleNodeIds.add(node.id))
  }

  const collapsedSet = new Set(collapsedCommunityIds)
  const collapseMap = new Map<string, string>()
  const canvasNodes = new Map<string, CanvasNode>()

  for (const node of nodes) {
    if (!visibleNodeIds.has(node.id)) continue
    const isMatch = !searchQuery || matchesNode(node, searchQuery)
    const collapsedCommunityId =
      node.communityId && collapsedSet.has(node.communityId) ? node.communityId : null

    if (collapsedCommunityId) {
      const collapsedId = `community:${collapsedCommunityId}`
      collapseMap.set(node.id, collapsedId)
      const community = communityMap.get(collapsedCommunityId)
      if (!canvasNodes.has(collapsedId)) {
        canvasNodes.set(collapsedId, {
          id: collapsedId,
          label: community?.title || 'Collapsed community',
          color: selectedCommunityId === collapsedCommunityId ? '#1A1A1A' : '#B6843B',
          size: 18 + Math.log2((community?.nodeCount || 1) + 1) * 4,
        })
      }
      continue
    }

    canvasNodes.set(node.id, {
      id: node.id,
      label: node.label,
      color:
        selectedNodeId === node.id
          ? '#111111'
          : isMatch
            ? NODE_TYPE_COLORS[node.nodeType]
            : '#C9C6BE',
      size: 8 + Math.log2(node.degree + 1) * 4 + (selectedNodeId === node.id ? 4 : 0),
    })
  }

  const canvasEdges = new Map<string, CanvasEdge>()
  for (const edge of edges) {
    const from = collapseMap.get(edge.fromNodeId) ?? edge.fromNodeId
    const to = collapseMap.get(edge.toNodeId) ?? edge.toNodeId
    if (from === to || !canvasNodes.has(from) || !canvasNodes.has(to)) continue
    const key = [from, to, edge.relation].join('::')
    const current = canvasEdges.get(key)
    if (current) {
      current.confidence = Math.max(current.confidence, edge.confidence)
      continue
    }
    canvasEdges.set(key, {
      id: key,
      from,
      to,
      relation: edge.relation,
      confidence: edge.confidence,
      color: RELATION_COLORS[edge.relation],
    })
  }

  return {
    canvasNodes: Array.from(canvasNodes.values()),
    canvasEdges: Array.from(canvasEdges.values()),
  }
}

function matchesNode(node: KnowledgeNode, query: string) {
  const lowered = query.toLowerCase()
  return [node.label, node.description, node.aliases.join(' ')]
    .join(' ')
    .toLowerCase()
    .includes(lowered)
}

function safeParseSummary(value: string | null): CommunitySummary | null {
  if (!value) return null
  try {
    return JSON.parse(value) as CommunitySummary
  } catch {
    return null
  }
}

function describeBuildRun(run: GraphBuildRun) {
  return `${run.status} | stage ${run.currentStage} | ${run.nodesCreated} nodes | ${run.edgesCreated} edges | ${run.communitiesDetected} communities`
}
