import { z } from 'zod'

// ───── Enums ─────

// ───── Domain Types ─────

export type KnowledgeNodeType = 'concept' | 'person' | 'event' | 'formula' | 'term'
export type RelationType =
  | 'is_a'
  | 'part_of'
  | 'depends_on'
  | 'causes'
  | 'related_to'
  | 'similar_to'
  | 'uses'
  | 'produces'

export type GraphBuildStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
export type CommunityLevel = 0 | 1

export interface KnowledgeNode {
  id: string
  nodeType: KnowledgeNodeType
  label: string
  aliases: string[]
  sourceIds: string[]
  description: string
  metadata: Record<string, unknown>
  communityId: string | null
  parentCommunityId: string | null
  degree: number
  hasEmbedding: boolean
  createdAt: string
  updatedAt: string
}

export interface KnowledgeEdge {
  id: string
  fromNodeId: string
  toNodeId: string
  relation: RelationType
  confidence: number
  sourceIds: string[]
  inferred: boolean
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface Community {
  id: string
  level: CommunityLevel
  title: string
  memberNodeIds: string[]
  parentCommunityId: string | null
  summaryJson: string | null
  nodeCount: number
  edgeCount: number
  collapsed: boolean
  createdAt: string
  updatedAt: string
}

export interface CommunitySummary {
  title: string
  summary: string
  keyEntities: string[]
  coreRelations: string[]
  knowledgeGaps: string[]
}

export interface EntityEmbedding {
  nodeId: string
  embeddingModel: string
  updatedAt: string
}

export interface GraphBuildRun {
  id: string
  runId: string | null
  scopeDescription: string
  documentIds: string[]
  nodesCreated: number
  edgesCreated: number
  nodesMerged: number
  communitiesDetected: number
  status: GraphBuildStatus
  errorMessage: string | null
  currentStage: number
  createdAt: string
  updatedAt: string
}

export interface GraphStats {
  totalNodes: number
  totalEdges: number
  totalCommunities: number
  nodeTypeDistribution: Record<KnowledgeNodeType, number>
  lastBuildRun: GraphBuildRun | null
}

// ───── Zod Schemas ─────

export const relationTypeSchema = z.enum([
  'is_a',
  'part_of',
  'depends_on',
  'causes',
  'related_to',
  'similar_to',
  'uses',
  'produces',
])

export const knowledgeNodeSchema = z.object({
  id: z.string(),
  nodeType: z.enum(['concept', 'person', 'event', 'formula', 'term']),
  label: z.string(),
  aliases: z.array(z.string()),
  sourceIds: z.array(z.string()),
  description: z.string(),
  metadata: z.record(z.unknown()),
  communityId: z.string().nullable(),
  parentCommunityId: z.string().nullable(),
  degree: z.number().int().nonnegative(),
  hasEmbedding: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const knowledgeEdgeSchema = z.object({
  id: z.string(),
  fromNodeId: z.string(),
  toNodeId: z.string(),
  relation: relationTypeSchema,
  confidence: z.number().min(0).max(1),
  sourceIds: z.array(z.string()),
  inferred: z.boolean(),
  metadata: z.record(z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const communitySummarySchema = z.object({
  title: z.string(),
  summary: z.string(),
  keyEntities: z.array(z.string()),
  coreRelations: z.array(z.string()),
  knowledgeGaps: z.array(z.string()),
})

export const communitySchema = z.object({
  id: z.string(),
  level: z.union([z.literal(0), z.literal(1)]),
  title: z.string(),
  memberNodeIds: z.array(z.string()),
  parentCommunityId: z.string().nullable(),
  summaryJson: z.string().nullable(),
  nodeCount: z.number().int().nonnegative(),
  edgeCount: z.number().int().nonnegative(),
  collapsed: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const entityEmbeddingSchema = z.object({
  nodeId: z.string(),
  embeddingModel: z.string(),
  updatedAt: z.string(),
})

export const graphBuildRunSchema = z.object({
  id: z.string(),
  runId: z.string().nullable(),
  scopeDescription: z.string(),
  documentIds: z.array(z.string()),
  nodesCreated: z.number().int(),
  edgesCreated: z.number().int(),
  nodesMerged: z.number().int(),
  communitiesDetected: z.number().int(),
  status: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled']),
  errorMessage: z.string().nullable(),
  currentStage: z.number().int().min(0).max(5),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const graphStatsSchema = z.object({
  totalNodes: z.number().int().nonnegative(),
  totalEdges: z.number().int().nonnegative(),
  totalCommunities: z.number().int().nonnegative(),
  nodeTypeDistribution: z.record(
    z.enum(['concept', 'person', 'event', 'formula', 'term']),
    z.number().int().nonnegative()
  ),
  lastBuildRun: graphBuildRunSchema.nullable(),
})
