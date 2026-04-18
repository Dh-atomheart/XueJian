import { z } from 'zod'

// ───── Domain Types ─────

export type KnowledgeNodeType = 'concept' | 'person' | 'event' | 'formula' | 'term'

export type GraphBuildStatus = 'queued' | 'running' | 'completed' | 'failed'

export interface KnowledgeNode {
  id: string
  nodeType: KnowledgeNodeType
  label: string
  aliases: string[]
  sourceIds: string[]
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface KnowledgeEdge {
  id: string
  fromNodeId: string
  toNodeId: string
  relation: string
  confidence: number
  sourceIds: string[]
  createdAt: string
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
  status: GraphBuildStatus
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}

// ───── Zod Schemas ─────

export const knowledgeNodeSchema = z.object({
  id: z.string(),
  nodeType: z.enum(['concept', 'person', 'event', 'formula', 'term']),
  label: z.string(),
  aliases: z.array(z.string()),
  sourceIds: z.array(z.string()),
  metadata: z.record(z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const knowledgeEdgeSchema = z.object({
  id: z.string(),
  fromNodeId: z.string(),
  toNodeId: z.string(),
  relation: z.string(),
  confidence: z.number(),
  sourceIds: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const graphBuildRunSchema = z.object({
  id: z.string(),
  runId: z.string().nullable(),
  scopeDescription: z.string(),
  documentIds: z.array(z.string()),
  nodesCreated: z.number(),
  edgesCreated: z.number(),
  nodesMerged: z.number(),
  status: z.enum(['queued', 'running', 'completed', 'failed']),
  errorMessage: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
