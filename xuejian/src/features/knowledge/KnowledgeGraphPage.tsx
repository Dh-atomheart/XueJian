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
import './knowledge-graph.css'
import { KnowledgeGraphPageLayout } from '@/components/pages/knowledge-graph-page'
import { Button, Card, Input } from '@/components/ui'
import { cn } from '@/lib/utils'
import { useDocumentsQuery } from '@/queries'
import {
  useAllGraphEdgesQuery,
  useCancelGraphBuildMutation,
  useCommunitiesQuery,
  useCommunitySummaryQuery,
  useCreateKnowledgeEdgeMutation,
  useDeleteGraphNodeMutation,
  useDeleteKnowledgeEdgeMutation,
  useGraphBuildRunsQuery,
  useGraphStatsQuery,
  useGraphNodesQuery,
  useMergeGraphNodesMutation,
  useNodeSourcesQuery,
  useStartGraphBuildMutation,
  useToggleCommunityCollapseMutation,
  useUpdateKnowledgeEdgeMutation,
  useUpdateKnowledgeNodeMutation,
} from '@/queries/knowledgeGraph'
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

const RELATION_OPTIONS: RelationType[] = [
  'is_a',
  'part_of',
  'depends_on',
  'causes',
  'related_to',
  'similar_to',
  'uses',
  'produces',
]

const VIEW_MODE_OPTIONS = [
  { id: 'global', label: '全局视图' },
  { id: 'explore', label: '探索式视图' },
] as const

type ViewMode = (typeof VIEW_MODE_OPTIONS)[number]['id']

type NodeDraft = {
  label: string
  nodeType: KnowledgeNodeType
  aliases: string
  description: string
}

type EdgeDraft = {
  relation: RelationType
  confidence: number
}

type CanvasNode = {
  id: string
  label: string
  color: string
  size: number
  isCommunity: boolean
  communityId?: string
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
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedCommunityId, setSelectedCommunityId] = useState<string | null>(null)
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([])
  const [incremental, setIncremental] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('global')
  const [searchInput, setSearchInput] = useState('')
  const [mergeSourceId, setMergeSourceId] = useState('')
  const [collapsedCommunityIds, setCollapsedCommunityIds] = useState<string[]>([])
  const [nodeDraft, setNodeDraft] = useState<NodeDraft>({
    label: '',
    nodeType: 'concept',
    aliases: '',
    description: '',
  })
  const [newEdgeTargetId, setNewEdgeTargetId] = useState('')
  const [newEdgeRelation, setNewEdgeRelation] = useState<RelationType>('related_to')
  const [newEdgeConfidence, setNewEdgeConfidence] = useState(0.6)
  const [edgeDrafts, setEdgeDrafts] = useState<Record<string, EdgeDraft>>({})

  const deferredSearch = useDeferredValue(searchInput.trim())

  const { data: stats } = useGraphStatsQuery()
  const { data: nodes = [] } = useGraphNodesQuery()
  const { data: allEdges = [] } = useAllGraphEdgesQuery()
  const { data: communities = [] } = useCommunitiesQuery()
  const { data: buildRuns = [] } = useGraphBuildRunsQuery()
  const { data: sources = [] } = useNodeSourcesQuery(selectedNodeId ?? '', !!selectedNodeId)
  const { data: documents = [] } = useDocumentsQuery()

  const startBuild = useStartGraphBuildMutation()
  const cancelBuild = useCancelGraphBuildMutation()
  const updateNode = useUpdateKnowledgeNodeMutation()
  const mergeNodes = useMergeGraphNodesMutation()
  const deleteNode = useDeleteGraphNodeMutation()
  const createEdge = useCreateKnowledgeEdgeMutation()
  const updateEdge = useUpdateKnowledgeEdgeMutation()
  const deleteEdge = useDeleteKnowledgeEdgeMutation()
  const toggleCommunityCollapse = useToggleCommunityCollapseMutation()

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null
  const selectedCommunity =
    communities.find((community) => community.id === selectedCommunityId) ??
    communities.find((community) => community.id === selectedNode?.communityId) ??
    null
  const { data: selectedCommunitySummary } = useCommunitySummaryQuery(
    selectedCommunity?.id ?? '',
    !!selectedCommunity?.id
  )

  const selectedIncidentEdges = useMemo(
    () =>
      selectedNodeId
        ? allEdges.filter(
            (edge) => edge.fromNodeId === selectedNodeId || edge.toNodeId === selectedNodeId
          )
        : [],
    [allEdges, selectedNodeId]
  )

  const topCommunities = communities.filter((community) => community.level === 1)
  const bottomCommunities = communities.filter((community) => community.level === 0)
  const activeBuild =
    buildRuns.find((run) => run.status === 'queued' || run.status === 'running') ?? null

  useEffect(() => {
    startTransition(() => {
      setCollapsedCommunityIds(
        communities.filter((community) => community.collapsed).map((community) => community.id)
      )
    })
  }, [communities])

  useEffect(() => {
    if (!selectedNode) {
      setNodeDraft({ label: '', nodeType: 'concept', aliases: '', description: '' })
      return
    }
    setNodeDraft({
      label: selectedNode.label,
      nodeType: selectedNode.nodeType,
      aliases: selectedNode.aliases.join(', '),
      description: selectedNode.description,
    })
  }, [selectedNode])

  useEffect(() => {
    if (!selectedNodeId) {
      setEdgeDrafts({})
      return
    }
    const nextDrafts: Record<string, EdgeDraft> = {}
    for (const edge of selectedIncidentEdges) {
      nextDrafts[edge.id] = {
        relation: edge.relation,
        confidence: edge.confidence,
      }
    }
    setEdgeDrafts(nextDrafts)
  }, [selectedNodeId, selectedIncidentEdges])

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
  })

  function handleBuild() {
    if (selectedDocIds.length === 0) return
    startBuild.mutate({ documentIds: selectedDocIds, incremental })
  }

  function handleSaveNode() {
    if (!selectedNode) return
    updateNode.mutate({
      nodeId: selectedNode.id,
      updates: {
        label: nodeDraft.label.trim(),
        nodeType: nodeDraft.nodeType,
        aliases: parseCommaList(nodeDraft.aliases),
        description: nodeDraft.description.trim(),
        metadata: { ...selectedNode.metadata, userEdited: true },
      },
    })
  }

  function handleMerge() {
    if (!selectedNodeId || !mergeSourceId) return
    mergeNodes.mutate(
      { targetNodeId: selectedNodeId, sourceNodeId: mergeSourceId },
      {
        onSuccess: () => {
          setMergeSourceId('')
        },
      }
    )
  }

  function handleCreateEdge() {
    if (!selectedNodeId || !newEdgeTargetId || newEdgeTargetId === selectedNodeId) return
    createEdge.mutate(
      {
        fromNodeId: selectedNodeId,
        toNodeId: newEdgeTargetId,
        relation: newEdgeRelation,
        confidence: newEdgeConfidence,
        sourceIds: selectedNode?.sourceIds ?? [],
        inferred: false,
        metadata: { userEdited: true },
      },
      {
        onSuccess: () => {
          setNewEdgeTargetId('')
          setNewEdgeRelation('related_to')
          setNewEdgeConfidence(0.6)
        },
      }
    )
  }

  function handleToggleCommunity(community: Community) {
    const nextCollapsed = !collapsedCommunityIds.includes(community.id)
    startTransition(() => {
      setCollapsedCommunityIds((current) =>
        nextCollapsed ? [...current, community.id] : current.filter((id) => id !== community.id)
      )
    })
    toggleCommunityCollapse.mutate({ communityId: community.id, collapsed: nextCollapsed })
  }

  const communitySummary =
    selectedCommunitySummary ?? safeParseSummary(selectedCommunity?.summaryJson ?? null)

  return (
    <KnowledgeGraphPageLayout
      statsBar={<StatsBar stats={stats} buildRuns={buildRuns} />}
      buildPanel={
        <Panel className="flex min-h-0 flex-col gap-4 overflow-hidden border border-ink/10 bg-paper-card/80 backdrop-blur">
          <section className="rounded-[22px] border border-ink/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.95),rgba(245,245,240,0.92))] p-4 shadow-paper">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.32em] text-ink-soft">
                  Build Wizard
                </p>
                <h2 className="kg-display text-xl text-ink">图谱构建与增量更新</h2>
              </div>
              {activeBuild ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={cancelBuild.isPending}
                  onClick={() => cancelBuild.mutate(activeBuild.id)}
                >
                  取消当前构建
                </Button>
              ) : null}
            </div>
            <div className="mb-3 max-h-40 overflow-y-auto rounded-[18px] border border-ink/10 bg-paper-base/80 p-2">
              <label className="mb-2 block text-xs text-ink-muted">选择文档</label>
              <div className="flex flex-col gap-1.5">
                {documents.map((document) => {
                  const checked = selectedDocIds.includes(document.id)
                  return (
                    <label
                      key={document.id}
                      className="flex cursor-pointer items-start gap-2 rounded-[14px] border border-transparent px-2 py-2 transition hover:border-ink/10 hover:bg-paper-card"
                    >
                      <input
                        checked={checked}
                        className="mt-1"
                        type="checkbox"
                        onChange={(event) => {
                          const nextChecked = event.target.checked
                          startTransition(() => {
                            setSelectedDocIds((current) =>
                              nextChecked
                                ? [...current, document.id]
                                : current.filter((id) => id !== document.id)
                            )
                          })
                        }}
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-ink">
                          {document.title}
                        </div>
                        <div className="text-xs text-ink-muted">{document.status}</div>
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>
            <label className="mb-3 flex items-center justify-between rounded-[16px] border border-ink/10 bg-paper-base/70 px-3 py-2 text-sm text-ink">
              <span>增量更新</span>
              <input
                checked={incremental}
                type="checkbox"
                onChange={(event) => setIncremental(event.target.checked)}
              />
            </label>
            <Button
              className="w-full"
              disabled={selectedDocIds.length === 0 || startBuild.isPending}
              onClick={handleBuild}
            >
              {startBuild.isPending
                ? '正在提交构建…'
                : incremental
                  ? '开始增量更新'
                  : '开始全量构建'}
            </Button>
          </section>

          <section className="min-h-0 flex-1 overflow-hidden rounded-[22px] border border-ink/10 bg-paper-base/75 p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <p className="text-[11px] uppercase tracking-[0.3em] text-ink-soft">Communities</p>
                <h3 className="text-base font-medium text-ink">主题轨道</h3>
              </div>
              <div className="text-xs text-ink-muted">{communities.length} 个社区</div>
            </div>
            <div className="max-h-[34vh] overflow-y-auto pr-1">
              <div className="mb-4 space-y-2">
                {topCommunities.map((community) => (
                  <CommunityRailCard
                    key={community.id}
                    community={community}
                    isActive={community.id === selectedCommunity?.id}
                    isCollapsed={collapsedCommunityIds.includes(community.id)}
                    onSelect={() => {
                      setSelectedCommunityId(community.id)
                      setSelectedNodeId(null)
                    }}
                    onToggle={() => handleToggleCommunity(community)}
                  />
                ))}
              </div>
              <div className="space-y-2">
                {bottomCommunities.map((community) => (
                  <CommunityRailCard
                    key={community.id}
                    community={community}
                    isActive={community.id === selectedCommunity?.id}
                    isCollapsed={collapsedCommunityIds.includes(community.id)}
                    onSelect={() => {
                      setSelectedCommunityId(community.id)
                      setSelectedNodeId(null)
                    }}
                    onToggle={() => handleToggleCommunity(community)}
                  />
                ))}
              </div>
            </div>
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
            placeholder="搜索节点名称、描述或别名"
            value={searchInput}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setSearchInput(event.target.value)}
          />
        </div>
      }
      stageHint={
        viewMode === 'explore' && selectedNode
          ? `从 ${selectedNode.label} 向外展开`
          : '支持社区折叠与节点高亮'
      }
      graphStage={
        <Panel className="relative min-h-0 overflow-hidden border border-ink/10 bg-paper-card/85 p-0 backdrop-blur">
          <div className="absolute inset-x-0 top-0 z-10 flex flex-wrap items-center gap-2 border-b border-ink/10 bg-paper-card/82 px-4 py-3 backdrop-blur">
            <div className="inline-flex rounded-full border border-ink/10 bg-paper-base/80 p-1">
              {VIEW_MODE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  className={`rounded-full px-3 py-1.5 text-sm transition ${
                    viewMode === option.id
                      ? 'bg-ink text-paper-base shadow-paper'
                      : 'text-ink-muted hover:bg-paper-card hover:text-ink'
                  }`}
                  onClick={() => setViewMode(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="min-w-[240px] flex-1">
              <Input
                placeholder="搜索节点名称、描述或别名"
                value={searchInput}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setSearchInput(event.target.value)}
              />
            </div>
            <div className="rounded-full border border-ink/10 bg-paper-base/80 px-3 py-1 text-xs text-ink-muted">
              {viewMode === 'explore' && selectedNode
                ? `从 ${selectedNode.label} 向外展开`
                : '支持社区折叠与节点高亮'}
            </div>
          </div>

          <div className="grid h-full min-h-0 grid-rows-[1fr_auto] pt-[74px]">
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
              节点大小按连接度缩放，颜色对应节点类型；搜索会高亮匹配节点，探索模式只保留 1-hop
              邻域。
            </div>
          </div>
        </Panel>
      }
      detailRail={
        <Panel className="flex min-h-0 flex-col gap-4 overflow-hidden border border-ink/10 bg-paper-card/82 backdrop-blur">
          {selectedNode ? (
            <>
              <section className="rounded-[22px] border border-ink/10 bg-[linear-gradient(160deg,rgba(91,141,239,0.08),rgba(255,255,255,0.95))] p-4 shadow-paper">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.3em] text-ink-soft">
                      Node Detail
                    </p>
                    <h2 className="kg-display text-2xl text-ink">{selectedNode.label}</h2>
                    <p className="text-sm text-ink-muted">
                      {selectedNode.nodeType} · 度数 {selectedNode.degree} ·{' '}
                      {selectedNode.hasEmbedding ? '已嵌入' : '待嵌入'}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      deleteNode.mutate(selectedNode.id, {
                        onSuccess: () => {
                          setSelectedNodeId(null)
                          setSelectedCommunityId(null)
                        },
                      })
                    }
                  >
                    删除节点
                  </Button>
                </div>
                <div className="grid gap-3">
                  <label className="grid gap-1 text-sm text-ink">
                    <span>标签</span>
                    <Input
                      value={nodeDraft.label}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        setNodeDraft((current) => ({ ...current, label: event.target.value }))
                      }
                    />
                  </label>
                  <label className="grid gap-1 text-sm text-ink">
                    <span>类型</span>
                    <select
                      aria-label="节点类型"
                      className="rounded-[16px] border border-line-soft bg-paper-card px-3 py-2 text-sm text-ink"
                      value={nodeDraft.nodeType}
                      onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                        setNodeDraft((current) => ({
                          ...current,
                          nodeType: event.target.value as KnowledgeNodeType,
                        }))
                      }
                    >
                      {Object.keys(NODE_TYPE_COLORS).map((nodeType) => (
                        <option key={nodeType} value={nodeType}>
                          {nodeType}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm text-ink">
                    <span>别名</span>
                    <Input
                      placeholder="使用逗号分隔"
                      value={nodeDraft.aliases}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        setNodeDraft((current) => ({ ...current, aliases: event.target.value }))
                      }
                    />
                  </label>
                  <label className="grid gap-1 text-sm text-ink">
                    <span>描述</span>
                    <textarea
                      className="min-h-28 rounded-[18px] border border-line-soft bg-paper-card px-3 py-2 text-sm text-ink outline-none focus:border-ink/30"
                      value={nodeDraft.description}
                      onChange={(event) =>
                        setNodeDraft((current) => ({ ...current, description: event.target.value }))
                      }
                    />
                  </label>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={handleSaveNode}>
                    保存节点修改
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setViewMode('explore')}>
                    仅看邻域
                  </Button>
                </div>
              </section>

              <section className="rounded-[22px] border border-ink/10 bg-paper-base/75 p-4 shadow-paper">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-ink">来源文档</h3>
                  <span className="text-xs text-ink-muted">{sources.length} 条来源</span>
                </div>
                {sources.length === 0 ? (
                  <p className="text-sm text-ink-muted">当前节点暂无来源回溯。</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {sources.map((sourceId) => {
                      const doc = documents.find((document) => document.id === sourceId)
                      return (
                        <span
                          key={sourceId}
                          className="rounded-full border border-ink/10 bg-paper-card px-3 py-1 text-xs text-ink"
                        >
                          {doc?.title ?? sourceId}
                        </span>
                      )
                    })}
                  </div>
                )}
              </section>

              <section className="min-h-0 flex-1 overflow-y-auto rounded-[22px] border border-ink/10 bg-paper-base/78 p-4 shadow-paper">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-ink">关系编辑器</h3>
                  <span className="text-xs text-ink-muted">
                    {selectedIncidentEdges.length} 条关联边
                  </span>
                </div>
                <div className="mb-4 rounded-[18px] border border-dashed border-ink/15 bg-paper-card/80 p-3">
                  <p className="mb-2 text-xs uppercase tracking-[0.24em] text-ink-soft">
                    Create Edge
                  </p>
                  <div className="grid gap-2">
                    <select
                      aria-label="新边目标节点"
                      className="rounded-[16px] border border-line-soft bg-paper-card px-3 py-2 text-sm text-ink"
                      value={newEdgeTargetId}
                      onChange={(event) => setNewEdgeTargetId(event.target.value)}
                    >
                      <option value="">选择目标节点</option>
                      {nodes
                        .filter((node) => node.id !== selectedNode.id)
                        .map((node) => (
                          <option key={node.id} value={node.id}>
                            {node.label}
                          </option>
                        ))}
                    </select>
                    <div className="grid grid-cols-[1fr_110px] gap-2">
                      <select
                        aria-label="新边关系类型"
                        className="rounded-[16px] border border-line-soft bg-paper-card px-3 py-2 text-sm text-ink"
                        value={newEdgeRelation}
                        onChange={(event) => setNewEdgeRelation(event.target.value as RelationType)}
                      >
                        {RELATION_OPTIONS.map((relation) => (
                          <option key={relation} value={relation}>
                            {relation}
                          </option>
                        ))}
                      </select>
                      <Input
                        max={1}
                        min={0}
                        step={0.05}
                        type="number"
                        value={newEdgeConfidence}
                        onChange={(event: ChangeEvent<HTMLInputElement>) => setNewEdgeConfidence(Number(event.target.value) || 0)}
                      />
                    </div>
                    <Button size="sm" onClick={handleCreateEdge}>
                      添加边
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  {selectedIncidentEdges.map((edge) => {
                    const draft = edgeDrafts[edge.id] ?? {
                      relation: edge.relation,
                      confidence: edge.confidence,
                    }
                    const oppositeId =
                      edge.fromNodeId === selectedNode.id ? edge.toNodeId : edge.fromNodeId
                    const oppositeNode = nodes.find((node) => node.id === oppositeId)
                    return (
                      <div
                        key={edge.id}
                        className="rounded-[18px] border border-ink/10 bg-paper-card/80 p-3"
                      >
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <button
                            className="text-left text-sm font-medium text-ink underline decoration-ink/20"
                            onClick={() => setSelectedNodeId(oppositeId)}
                          >
                            {oppositeNode?.label ?? oppositeId}
                          </button>
                          <span className="text-xs text-ink-muted">
                            {edge.inferred ? '推断边' : '显式边'}
                          </span>
                        </div>
                        <div className="grid grid-cols-[1fr_84px_auto_auto] gap-2">
                          <select
                            aria-label="编辑边关系类型"
                            className="rounded-[14px] border border-line-soft bg-paper-base px-3 py-2 text-sm text-ink"
                            value={draft.relation}
                            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                              setEdgeDrafts((current) => ({
                                ...current,
                                [edge.id]: {
                                  relation: event.target.value as RelationType,
                                  confidence: current[edge.id]?.confidence ?? edge.confidence,
                                },
                              }))
                            }
                          >
                            {RELATION_OPTIONS.map((relation) => (
                              <option key={relation} value={relation}>
                                {relation}
                              </option>
                            ))}
                          </select>
                          <Input
                            max={1}
                            min={0}
                            step={0.05}
                            type="number"
                            value={draft.confidence}
                            onChange={(event: ChangeEvent<HTMLInputElement>) =>
                              setEdgeDrafts((current) => ({
                                ...current,
                                [edge.id]: {
                                  relation: current[edge.id]?.relation ?? edge.relation,
                                  confidence: Number(event.target.value) || 0,
                                },
                              }))
                            }
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              updateEdge.mutate({
                                edgeId: edge.id,
                                updates: {
                                  relation: draft.relation,
                                  confidence: draft.confidence,
                                  metadata: { ...edge.metadata, userEdited: true },
                                },
                              })
                            }
                          >
                            保存
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => deleteEdge.mutate(edge.id)}
                          >
                            删除
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                  {selectedIncidentEdges.length === 0 ? (
                    <p className="text-sm text-ink-muted">
                      当前节点还没有关联边，先创建一条关系试试。
                    </p>
                  ) : null}
                </div>
              </section>

              <section className="rounded-[22px] border border-ink/10 bg-paper-base/78 p-4 shadow-paper">
                <h3 className="mb-2 text-sm font-semibold text-ink">消歧合并</h3>
                <div className="grid gap-2">
                  <select
                    aria-label="待并入节点"
                    className="rounded-[16px] border border-line-soft bg-paper-card px-3 py-2 text-sm text-ink"
                    value={mergeSourceId}
                    onChange={(event) => setMergeSourceId(event.target.value)}
                  >
                    <option value="">选择待并入节点</option>
                    {nodes
                      .filter((node) => node.id !== selectedNode.id)
                      .map((node) => (
                        <option key={node.id} value={node.id}>
                          {node.label}
                        </option>
                      ))}
                  </select>
                  <Button size="sm" onClick={handleMerge}>
                    合并到当前节点
                  </Button>
                </div>
              </section>
            </>
          ) : selectedCommunity ? (
            <CommunityDetailPanel
              community={selectedCommunity}
              summary={communitySummary}
              onToggle={() => handleToggleCommunity(selectedCommunity)}
            />
          ) : (
            <Panel className="flex h-full items-center justify-center border border-dashed border-ink/15 bg-paper-base/65 text-center text-ink-muted">
              <div>
                <p className="text-[11px] uppercase tracking-[0.32em] text-ink-soft">
                  Knowledge Map
                </p>
                <h2 className="kg-display mt-2 text-2xl text-ink">选择节点或社区</h2>
                <p className="mt-2 max-w-xs text-sm">
                  画布点击节点可进入编辑，点击折叠后的社区超级节点可查看社区摘要与知识缺口。
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
      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr_1.1fr] lg:grid-cols-1">
        <div>
          <p className="text-[11px] uppercase tracking-[0.34em] text-ink-soft">Stats Bar</p>
          <div className="mt-2 grid grid-cols-3 gap-3">
            <StatPill label="节点" value={stats?.totalNodes ?? 0} accent="kg-stat-accent-blue" />
            <StatPill label="边" value={stats?.totalEdges ?? 0} accent="kg-stat-accent-amber" />
            <StatPill
              label="社区"
              value={stats?.totalCommunities ?? 0}
              accent="kg-stat-accent-green"
            />
          </div>
        </div>
        <div>
          <p className="mb-2 text-[11px] uppercase tracking-[0.34em] text-ink-soft">
            Type Distribution
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
                  <span className="text-xs text-ink-soft">知识密度</span>
                </div>
                <span className="text-right text-ink">{count}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-[11px] uppercase tracking-[0.34em] text-ink-soft">Latest Build</p>
          {latestRun ? (
            <div className="rounded-[20px] border border-ink/10 bg-paper-base/80 p-3 text-sm text-ink">
              <div className="mb-1 flex items-center justify-between gap-3">
                <span className="font-medium">{latestRun.scopeDescription}</span>
                <span className="rounded-full bg-paper-card px-2 py-1 text-xs text-ink-muted">
                  {latestRun.status}
                </span>
              </div>
              <p className="text-ink-muted">
                {latestRun.nodesCreated} 节点 · {latestRun.edgesCreated} 边 ·{' '}
                {latestRun.communitiesDetected} 社区
              </p>
            </div>
          ) : (
            <div className="rounded-[20px] border border-dashed border-ink/15 bg-paper-base/80 p-3 text-sm text-ink-muted">
              暂无构建记录
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

function CommunityRailCard({
  community,
  isActive,
  isCollapsed,
  onSelect,
  onToggle,
}: {
  community: Community
  isActive: boolean
  isCollapsed: boolean
  onSelect: () => void
  onToggle: () => void
}) {
  return (
    <div
      className={`rounded-[18px] border px-3 py-3 transition ${
        isActive
          ? 'border-ink/20 bg-paper-card shadow-paper'
          : 'border-ink/10 bg-paper-card/70 hover:border-ink/18 hover:bg-paper-card'
      }`}
    >
      <button className="w-full text-left" onClick={onSelect}>
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-ink">{community.title || '未命名社区'}</span>
          <span className="rounded-full bg-paper-base px-2 py-0.5 text-[11px] text-ink-muted">
            L{community.level}
          </span>
        </div>
        <p className="text-xs text-ink-muted">
          {community.nodeCount} 节点 · {community.edgeCount} 边
        </p>
      </button>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">
          {isCollapsed ? 'Collapsed' : 'Expanded'}
        </span>
        <Button size="sm" variant="outline" onClick={onToggle}>
          {isCollapsed ? '展开' : '折叠'}
        </Button>
      </div>
    </div>
  )
}

function CommunityDetailPanel({
  community,
  summary,
  onToggle,
}: {
  community: Community
  summary: CommunitySummary | null
  onToggle: () => void
}) {
  return (
    <>
      <section className="rounded-[22px] border border-ink/10 bg-[linear-gradient(160deg,rgba(76,175,125,0.1),rgba(255,255,255,0.96))] p-4 shadow-paper">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-ink-soft">Community Detail</p>
            <h2 className="kg-display text-2xl text-ink">{community.title || '未命名社区'}</h2>
            <p className="text-sm text-ink-muted">
              Level {community.level} · {community.nodeCount} 节点 · {community.edgeCount} 边
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={onToggle}>
            {community.collapsed ? '展开社区' : '折叠社区'}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-ink-muted">
          {community.memberNodeIds.slice(0, 8).map((memberNodeId) => (
            <span key={memberNodeId} className="rounded-full bg-paper-base px-3 py-1">
              {memberNodeId.slice(0, 8)}
            </span>
          ))}
        </div>
      </section>
      <section className="rounded-[22px] border border-ink/10 bg-paper-base/78 p-4 shadow-paper">
        <h3 className="mb-3 text-sm font-semibold text-ink">结构化摘要</h3>
        {summary ? (
          <div className="space-y-4 text-sm text-ink">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-ink-soft">Overview</p>
              <p className="mt-1 leading-7 text-ink">{summary.summary}</p>
            </div>
            <SummarySection label="关键实体" values={summary.keyEntities} />
            <SummarySection label="核心关系" values={summary.coreRelations} />
            <SummarySection label="知识缺口" values={summary.knowledgeGaps} />
          </div>
        ) : (
          <p className="text-sm text-ink-muted">当前社区还没有结构化摘要，下一次构建会补齐。</p>
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
          <span className="text-sm text-ink-muted">暂无</span>
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
          还没有知识图谱节点，先在左侧选择文档并触发构建。
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
          label: community?.title || '折叠社区',
          color: selectedCommunityId === collapsedCommunityId ? '#1A1A1A' : '#B6843B',
          size: 18 + Math.log2((community?.nodeCount || 1) + 1) * 4,
          isCommunity: true,
          communityId: collapsedCommunityId,
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
      isCommunity: false,
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

function parseCommaList(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function safeParseSummary(value: string | null): CommunitySummary | null {
  if (!value) return null
  try {
    return JSON.parse(value) as CommunitySummary
  } catch {
    return null
  }
}
