import { z } from 'zod'
import { chunkSearchResultSchema, workflowRunSchema } from '@/types'
import type { ChunkSearchResult, WorkflowRun } from '@/types'
import { invokeWithSchema } from './index'

export interface SearchKnowledgeInput {
  query: string
  documentIds?: string[]
  limit?: number
}

export interface StartKnowledgeQaInput {
  question: string
  documentIds?: string[]
}

export async function searchKnowledge(input: SearchKnowledgeInput): Promise<ChunkSearchResult[]> {
  return invokeWithSchema('search_knowledge', z.array(chunkSearchResultSchema), {
    data: {
      query: input.query,
      documentIds: input.documentIds ?? null,
      limit: input.limit ?? null,
    },
  })
}

export async function startKnowledgeQaWorkflow(input: StartKnowledgeQaInput): Promise<WorkflowRun> {
  return invokeWithSchema('start_knowledge_qa_workflow', workflowRunSchema, {
    data: {
      question: input.question,
      documentIds: input.documentIds ?? null,
    },
  })
}
