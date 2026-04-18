import { useCallback, useState } from 'react'
import { Button, Panel } from '@/components/ui'
import {
  useGraphNodesQuery,
  useGraphEdgesQuery,
  useNodeSourcesQuery,
  useGraphBuildRunsQuery,
  useStartGraphBuildMutation,
  useMergeGraphNodesMutation,
  useDeleteGraphNodeMutation,
} from '@/queries/knowledgeGraph'
import { useDocumentsQuery } from '@/queries'
import type { KnowledgeNode, KnowledgeEdge } from '@/types/knowledge-graph'

export function KnowledgeGraphPage() {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [mergeSourceId, setMergeSourceId] = useState<string | null>(null)
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([])

  const { data: nodes = [], isLoading: nodesLoading } = useGraphNodesQuery()
  const { data: edges = [] } = useGraphEdgesQuery(selectedNodeId ?? '', !!selectedNodeId)
  const { data: sources = [] } = useNodeSourcesQuery(selectedNodeId ?? '', !!selectedNodeId)
  const { data: buildRuns = [] } = useGraphBuildRunsQuery()
  const { data: documents = [] } = useDocumentsQuery()

  const startBuild = useStartGraphBuildMutation()
  const mergeNodes = useMergeGraphNodesMutation()
  const deleteNode = useDeleteGraphNodeMutation()

  const selectedNode = nodes.find((n) => n.id === selectedNodeId)

  const handleBuild = useCallback(() => {
    if (selectedDocIds.length === 0) return
    startBuild.mutate({ documentIds: selectedDocIds })
  }, [selectedDocIds, startBuild])

  const handleMerge = useCallback(() => {
    if (!selectedNodeId || !mergeSourceId) return
    mergeNodes.mutate(
      { targetNodeId: selectedNodeId, sourceNodeId: mergeSourceId },
      { onSuccess: () => setMergeSourceId(null) }
    )
  }, [selectedNodeId, mergeSourceId, mergeNodes])

  const handleDelete = useCallback(
    (nodeId: string) => {
      deleteNode.mutate(nodeId, {
        onSuccess: () => {
          if (selectedNodeId === nodeId) setSelectedNodeId(null)
        },
      })
    },
    [deleteNode, selectedNodeId]
  )

  return (
    <div className="flex h-full gap-4 p-4">
      {/* ── Left: Node list ── */}
      <Panel className="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto">
        <h2 className="text-lg font-semibold">知识图谱</h2>

        {/* Build section */}
        <div className="flex flex-col gap-2 border-b pb-3">
          <p className="text-sm text-on-surface-variant">选择文档构建图谱</p>
          <select
            multiple
            className="h-20 rounded border bg-surface-container p-1 text-sm text-on-surface"
            value={selectedDocIds}
            onChange={(e) =>
              setSelectedDocIds(Array.from(e.target.selectedOptions, (o) => o.value))
            }
          >
            {documents.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
          <Button
            variant="filled"
            size="sm"
            disabled={selectedDocIds.length === 0 || startBuild.isPending}
            onClick={handleBuild}
          >
            {startBuild.isPending ? '构建中…' : '构建图谱'}
          </Button>
        </div>

        {/* Node list */}
        {nodesLoading ? (
          <p className="text-sm text-on-surface-variant">加载中…</p>
        ) : nodes.length === 0 ? (
          <p className="text-sm text-on-surface-variant">暂无节点，请先构建图谱</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {nodes.map((node) => (
              <li key={node.id}>
                <button
                  className={`w-full rounded px-3 py-2 text-left text-sm transition-colors ${
                    selectedNodeId === node.id
                      ? 'bg-primary-container text-on-primary-container'
                      : 'hover:bg-surface-container-high'
                  }`}
                  onClick={() => setSelectedNodeId(node.id)}
                >
                  <span className="font-medium">{node.label}</span>
                  <span className="ml-2 text-xs opacity-60">{node.nodeType}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Build runs */}
        {buildRuns.length > 0 && (
          <div className="mt-auto border-t pt-2">
            <p className="text-xs font-medium text-on-surface-variant">构建记录</p>
            {buildRuns.slice(0, 3).map((run) => (
              <div key={run.id} className="text-xs text-on-surface-variant">
                {run.status} — {run.nodesCreated} 节点, {run.edgesCreated} 关系
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* ── Right: Detail / edges / sources ── */}
      <Panel className="flex flex-1 flex-col gap-4 overflow-y-auto">
        {selectedNode ? (
          <>
            {/* Node header */}
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-xl font-semibold">{selectedNode.label}</h3>
                <p className="text-sm text-on-surface-variant">
                  类型: {selectedNode.nodeType}
                  {selectedNode.aliases.length > 0 && (
                    <> · 别名: {selectedNode.aliases.join(', ')}</>
                  )}
                </p>
              </div>
              <Button
                variant="outlined"
                size="sm"
                onClick={() => handleDelete(selectedNode.id)}
              >
                删除节点
              </Button>
            </div>

            {/* Source trace */}
            <div className="border-b pb-3">
              <h4 className="mb-1 text-sm font-medium">来源回溯</h4>
              {sources.length === 0 ? (
                <p className="text-sm italic text-on-surface-variant">无已知来源</p>
              ) : (
                <ul className="text-sm">
                  {sources.map((srcId) => {
                    const doc = documents.find((d) => d.id === srcId)
                    return (
                      <li key={srcId} className="text-on-surface-variant">
                        {doc ? doc.title : srcId}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {/* Edges */}
            <div className="border-b pb-3">
              <h4 className="mb-1 text-sm font-medium">关系</h4>
              {edges.length === 0 ? (
                <p className="text-sm italic text-on-surface-variant">暂无关系</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-on-surface-variant">
                      <th className="pb-1">关系</th>
                      <th className="pb-1">目标</th>
                      <th className="pb-1">置信度</th>
                    </tr>
                  </thead>
                  <tbody>
                    {edges.map((edge) => (
                      <EdgeRow
                        key={edge.id}
                        edge={edge}
                        currentNodeId={selectedNode.id}
                        nodes={nodes}
                        onSelectNode={setSelectedNodeId}
                      />
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Merge section */}
            <div>
              <h4 className="mb-1 text-sm font-medium">消歧合并</h4>
              <p className="text-xs text-on-surface-variant">
                选择要合并到此节点的另一个节点
              </p>
              <div className="mt-1 flex items-center gap-2">
                <select
                  className="rounded border bg-surface-container px-2 py-1 text-sm text-on-surface"
                  value={mergeSourceId ?? ''}
                  onChange={(e) => setMergeSourceId(e.target.value || null)}
                >
                  <option value="">选择节点…</option>
                  {nodes
                    .filter((n) => n.id !== selectedNodeId)
                    .map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.label}
                      </option>
                    ))}
                </select>
                <Button
                  variant="filled"
                  size="sm"
                  disabled={!mergeSourceId || mergeNodes.isPending}
                  onClick={handleMerge}
                >
                  合并
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-on-surface-variant">
            选择一个节点查看详情
          </div>
        )}
      </Panel>
    </div>
  )
}

function EdgeRow({
  edge,
  currentNodeId,
  nodes,
  onSelectNode,
}: {
  edge: KnowledgeEdge
  currentNodeId: string
  nodes: KnowledgeNode[]
  onSelectNode: (id: string) => void
}) {
  const isOutgoing = edge.fromNodeId === currentNodeId
  const otherNodeId = isOutgoing ? edge.toNodeId : edge.fromNodeId
  const otherNode = nodes.find((n) => n.id === otherNodeId)
  const direction = isOutgoing ? '→' : '←'

  return (
    <tr className="border-b last:border-0">
      <td className="py-1">
        {direction} {edge.relation}
      </td>
      <td className="py-1">
        <button
          className="text-primary underline"
          onClick={() => onSelectNode(otherNodeId)}
        >
          {otherNode?.label ?? otherNodeId}
        </button>
      </td>
      <td className="py-1">{(edge.confidence * 100).toFixed(0)}%</td>
    </tr>
  )
}
