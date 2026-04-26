import { z } from 'zod'
import {
  chunkSearchResultSchema,
  knowledgeQaConversationDetailSchema,
  knowledgeQaConversationSchema,
  knowledgeQaMessageSchema,
  sendKnowledgeQaMessageResultSchema,
  workflowRunSchema,
} from '@/types'
import type {
  ChunkSearchResult,
  KnowledgeQaConversation,
  KnowledgeQaConversationDetail,
  KnowledgeQaMessage,
  SendKnowledgeQaMessageResult,
  WorkflowRun,
} from '@/types'
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

export interface SendKnowledgeQaMessageInput {
  conversationId?: string | null
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

export async function listKnowledgeQaConversations(limit = 50): Promise<KnowledgeQaConversation[]> {
  return invokeWithSchema('list_knowledge_qa_conversations', z.array(knowledgeQaConversationSchema), {
    limit,
  })
}

export async function getKnowledgeQaConversation(
  conversationId: string
): Promise<KnowledgeQaConversationDetail | null> {
  return invokeWithSchema('get_knowledge_qa_conversation', knowledgeQaConversationDetailSchema.nullable(), {
    conversationId,
  })
}

export async function sendKnowledgeQaMessage(
  input: SendKnowledgeQaMessageInput
): Promise<SendKnowledgeQaMessageResult> {
  return invokeWithSchema('send_knowledge_qa_message', sendKnowledgeQaMessageResultSchema, {
    data: {
      conversationId: input.conversationId ?? null,
      question: input.question,
      documentIds: input.documentIds ?? null,
    },
  })
}

export async function cancelKnowledgeQaMessage(messageId: string): Promise<KnowledgeQaMessage | null> {
  return invokeWithSchema('cancel_knowledge_qa_message', knowledgeQaMessageSchema.nullable(), {
    messageId,
  })
}
