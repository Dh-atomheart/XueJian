import { z } from 'zod'
import {
  knowledgeNodeSchema,
  knowledgeEdgeSchema,
  graphBuildRunSchema,
} from '@/types/knowledge-graph'
import type { KnowledgeNode, KnowledgeEdge, GraphBuildRun } from '@/types/knowledge-graph'
import { invokeWithSchema } from './index'

export interface StartGraphBuildInput {
  documentIds: string[]
  scopeDescription?: string
}

export interface MergeNodesInput {
  targetNodeId: string
  sourceNodeId: string
}

export async function startGraphBuild(input: StartGraphBuildInput): Promise<GraphBuildRun> {
  return invokeWithSchema('start_graph_build_workflow', graphBuildRunSchema, { data: input })
}

export async function listGraphNodes(): Promise<KnowledgeNode[]> {
  return invokeWithSchema('list_graph_nodes', z.array(knowledgeNodeSchema), {})
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

export async function listGraphBuildRuns(): Promise<GraphBuildRun[]> {
  return invokeWithSchema('list_graph_build_runs', z.array(graphBuildRunSchema), {})
}
