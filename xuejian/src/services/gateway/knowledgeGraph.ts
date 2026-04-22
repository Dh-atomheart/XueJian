import { z } from 'zod'
import {
  knowledgeNodeSchema,
  knowledgeEdgeSchema,
  communitySchema,
  communitySummarySchema,
  graphBuildRunSchema,
  graphStatsSchema,
} from '@/types/knowledge-graph'
import type {
  Community,
  CommunitySummary,
  GraphBuildRun,
  GraphStats,
  KnowledgeEdge,
  KnowledgeNode,
} from '@/types/knowledge-graph'
import { invokeWithSchema } from './index'

export interface StartGraphBuildInput {
  documentIds: string[]
  scopeDescription?: string
  incremental?: boolean
}

export interface MergeNodesInput {
  targetNodeId: string
  sourceNodeId: string
}

export interface UpdateKnowledgeNodeInput {
  nodeId: string
  updates: Partial<KnowledgeNode>
}

export interface CreateKnowledgeEdgeInput {
  fromNodeId: string
  toNodeId: string
  relation: KnowledgeEdge['relation']
  confidence: number
  sourceIds: string[]
  inferred: boolean
  metadata: Record<string, unknown>
}

export interface UpdateKnowledgeEdgeInput {
  edgeId: string
  updates: Partial<KnowledgeEdge>
}

export interface ToggleCommunityCollapseInput {
  communityId: string
  collapsed: boolean
}

export async function startGraphBuild(input: StartGraphBuildInput): Promise<GraphBuildRun> {
  return invokeWithSchema('start_graph_build_workflow', graphBuildRunSchema, { data: input })
}

export async function listGraphNodes(): Promise<KnowledgeNode[]> {
  return invokeWithSchema('list_graph_nodes', z.array(knowledgeNodeSchema), {})
}

export async function listAllGraphEdges(): Promise<KnowledgeEdge[]> {
  return invokeWithSchema('list_all_graph_edges', z.array(knowledgeEdgeSchema), {})
}

export async function listGraphEdges(nodeId: string): Promise<KnowledgeEdge[]> {
  return invokeWithSchema('list_graph_edges', z.array(knowledgeEdgeSchema), { nodeId })
}

export async function getNodeSources(nodeId: string): Promise<string[]> {
  return invokeWithSchema('get_node_sources', z.array(z.string()), { nodeId })
}

export async function mergeGraphNodes(input: MergeNodesInput): Promise<KnowledgeNode> {
  return invokeWithSchema('merge_graph_nodes', knowledgeNodeSchema, { data: input })
}

export async function deleteGraphNode(nodeId: string): Promise<void> {
  return invokeWithSchema('delete_graph_node', z.void(), { nodeId })
}

export async function updateKnowledgeNode(input: UpdateKnowledgeNodeInput): Promise<KnowledgeNode> {
  return invokeWithSchema('update_knowledge_node', knowledgeNodeSchema, { data: input })
}

export async function createKnowledgeEdge(input: CreateKnowledgeEdgeInput): Promise<KnowledgeEdge> {
  return invokeWithSchema('create_knowledge_edge', knowledgeEdgeSchema, { data: input })
}

export async function updateKnowledgeEdge(input: UpdateKnowledgeEdgeInput): Promise<KnowledgeEdge> {
  return invokeWithSchema('update_knowledge_edge', knowledgeEdgeSchema, { data: input })
}

export async function deleteKnowledgeEdge(edgeId: string): Promise<void> {
  return invokeWithSchema('delete_knowledge_edge', z.void(), { edgeId })
}

export async function listCommunities(level?: number): Promise<Community[]> {
  return invokeWithSchema('list_communities', z.array(communitySchema), { level })
}

export async function getCommunitySummary(communityId: string): Promise<CommunitySummary | null> {
  return invokeWithSchema('get_community_summary', communitySummarySchema.nullable(), {
    communityId,
  })
}

export async function toggleCommunityCollapse(input: ToggleCommunityCollapseInput): Promise<void> {
  return invokeWithSchema('toggle_community_collapse', z.void(), { data: input })
}

export async function listGraphBuildRuns(): Promise<GraphBuildRun[]> {
  return invokeWithSchema('list_graph_build_runs', z.array(graphBuildRunSchema), {})
}

export async function cancelGraphBuild(buildRunId: string): Promise<void> {
  return invokeWithSchema('cancel_graph_build', z.void(), { buildRunId })
}

export async function getGraphStats(): Promise<GraphStats> {
  const stats = await invokeWithSchema('get_graph_stats', graphStatsSchema, {})
  return {
    ...stats,
    nodeTypeDistribution: {
      concept: stats.nodeTypeDistribution.concept ?? 0,
      person: stats.nodeTypeDistribution.person ?? 0,
      event: stats.nodeTypeDistribution.event ?? 0,
      formula: stats.nodeTypeDistribution.formula ?? 0,
      term: stats.nodeTypeDistribution.term ?? 0,
    },
  }
}
