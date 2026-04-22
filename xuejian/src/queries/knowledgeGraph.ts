import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  cancelGraphBuild,
  createKnowledgeEdge,
  deleteKnowledgeEdge,
  listGraphNodes,
  listAllGraphEdges,
  listGraphEdges,
  listCommunities,
  getCommunitySummary,
  getGraphStats,
  getNodeSources,
  startGraphBuild,
  mergeGraphNodes,
  deleteGraphNode,
  listGraphBuildRuns,
  toggleCommunityCollapse,
  updateKnowledgeEdge,
  updateKnowledgeNode,
  type StartGraphBuildInput,
  type CreateKnowledgeEdgeInput,
  type MergeNodesInput,
  type ToggleCommunityCollapseInput,
  type UpdateKnowledgeEdgeInput,
  type UpdateKnowledgeNodeInput,
} from '@/services/gateway/knowledgeGraph'

export const knowledgeGraphQueryKeys = {
  all: ['knowledgeGraph'] as const,
  stats: () => [...knowledgeGraphQueryKeys.all, 'stats'] as const,
  nodes: () => [...knowledgeGraphQueryKeys.all, 'nodes'] as const,
  allEdges: () => [...knowledgeGraphQueryKeys.all, 'allEdges'] as const,
  edges: (nodeId: string) => [...knowledgeGraphQueryKeys.all, 'edges', nodeId] as const,
  sources: (nodeId: string) => [...knowledgeGraphQueryKeys.all, 'sources', nodeId] as const,
  communities: (level?: number) =>
    [...knowledgeGraphQueryKeys.all, 'communities', level ?? 'all'] as const,
  communitySummary: (communityId: string) =>
    [...knowledgeGraphQueryKeys.all, 'communitySummary', communityId] as const,
  buildRuns: () => [...knowledgeGraphQueryKeys.all, 'buildRuns'] as const,
}

function invalidateGraphData(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: knowledgeGraphQueryKeys.stats() })
  queryClient.invalidateQueries({ queryKey: knowledgeGraphQueryKeys.nodes() })
  queryClient.invalidateQueries({ queryKey: knowledgeGraphQueryKeys.allEdges() })
  queryClient.invalidateQueries({ queryKey: knowledgeGraphQueryKeys.buildRuns() })
  queryClient.invalidateQueries({ queryKey: [...knowledgeGraphQueryKeys.all, 'communities'] })
}

export function useGraphStatsQuery() {
  return useQuery({
    queryKey: knowledgeGraphQueryKeys.stats(),
    queryFn: getGraphStats,
  })
}

/** List all knowledge graph nodes. */
export function useGraphNodesQuery() {
  return useQuery({
    queryKey: knowledgeGraphQueryKeys.nodes(),
    queryFn: listGraphNodes,
  })
}

export function useAllGraphEdgesQuery() {
  return useQuery({
    queryKey: knowledgeGraphQueryKeys.allEdges(),
    queryFn: listAllGraphEdges,
  })
}

/** List edges for a given node. */
export function useGraphEdgesQuery(nodeId: string, enabled = true) {
  return useQuery({
    queryKey: knowledgeGraphQueryKeys.edges(nodeId),
    queryFn: () => listGraphEdges(nodeId),
    enabled,
  })
}

/** Get source IDs for a node. */
export function useNodeSourcesQuery(nodeId: string, enabled = true) {
  return useQuery({
    queryKey: knowledgeGraphQueryKeys.sources(nodeId),
    queryFn: () => getNodeSources(nodeId),
    enabled,
  })
}

export function useCommunitiesQuery(level?: number) {
  return useQuery({
    queryKey: knowledgeGraphQueryKeys.communities(level),
    queryFn: () => listCommunities(level),
  })
}

export function useCommunitySummaryQuery(communityId: string, enabled = true) {
  return useQuery({
    queryKey: knowledgeGraphQueryKeys.communitySummary(communityId),
    queryFn: () => getCommunitySummary(communityId),
    enabled,
  })
}

/** List all graph build runs. */
export function useGraphBuildRunsQuery() {
  return useQuery({
    queryKey: knowledgeGraphQueryKeys.buildRuns(),
    queryFn: listGraphBuildRuns,
  })
}

/** Start a knowledge graph build. */
export function useStartGraphBuildMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: StartGraphBuildInput) => startGraphBuild(input),
    onSuccess: () => {
      invalidateGraphData(queryClient)
    },
  })
}

/** Merge two nodes. */
export function useMergeGraphNodesMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: MergeNodesInput) => mergeGraphNodes(input),
    onSuccess: () => {
      invalidateGraphData(queryClient)
    },
  })
}

/** Delete a graph node. */
export function useDeleteGraphNodeMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (nodeId: string) => deleteGraphNode(nodeId),
    onSuccess: () => {
      invalidateGraphData(queryClient)
    },
  })
}

export function useUpdateKnowledgeNodeMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateKnowledgeNodeInput) => updateKnowledgeNode(input),
    onSuccess: () => {
      invalidateGraphData(queryClient)
    },
  })
}

export function useCreateKnowledgeEdgeMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateKnowledgeEdgeInput) => createKnowledgeEdge(input),
    onSuccess: () => {
      invalidateGraphData(queryClient)
    },
  })
}

export function useUpdateKnowledgeEdgeMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateKnowledgeEdgeInput) => updateKnowledgeEdge(input),
    onSuccess: () => {
      invalidateGraphData(queryClient)
    },
  })
}

export function useDeleteKnowledgeEdgeMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (edgeId: string) => deleteKnowledgeEdge(edgeId),
    onSuccess: () => {
      invalidateGraphData(queryClient)
    },
  })
}

export function useToggleCommunityCollapseMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ToggleCommunityCollapseInput) => toggleCommunityCollapse(input),
    onSuccess: () => {
      invalidateGraphData(queryClient)
    },
  })
}

export function useCancelGraphBuildMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (buildRunId: string) => cancelGraphBuild(buildRunId),
    onSuccess: () => {
      invalidateGraphData(queryClient)
    },
  })
}
