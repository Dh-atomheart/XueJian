import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listGraphNodes,
  listGraphEdges,
  getNodeSources,
  startGraphBuild,
  mergeGraphNodes,
  deleteGraphNode,
  listGraphBuildRuns,
  type StartGraphBuildInput,
  type MergeNodesInput,
} from '@/services/gateway/knowledgeGraph'

export const knowledgeGraphQueryKeys = {
  all: ['knowledgeGraph'] as const,
  nodes: () => [...knowledgeGraphQueryKeys.all, 'nodes'] as const,
  edges: (nodeId: string) => [...knowledgeGraphQueryKeys.all, 'edges', nodeId] as const,
  sources: (nodeId: string) => [...knowledgeGraphQueryKeys.all, 'sources', nodeId] as const,
  buildRuns: () => [...knowledgeGraphQueryKeys.all, 'buildRuns'] as const,
}

/** List all knowledge graph nodes. */
export function useGraphNodesQuery() {
  return useQuery({
    queryKey: knowledgeGraphQueryKeys.nodes(),
    queryFn: listGraphNodes,
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
      queryClient.invalidateQueries({ queryKey: knowledgeGraphQueryKeys.buildRuns() })
    },
  })
}

/** Merge two nodes. */
export function useMergeGraphNodesMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: MergeNodesInput) => mergeGraphNodes(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: knowledgeGraphQueryKeys.nodes() })
    },
  })
}

/** Delete a graph node. */
export function useDeleteGraphNodeMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (nodeId: string) => deleteGraphNode(nodeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: knowledgeGraphQueryKeys.nodes() })
    },
  })
}
