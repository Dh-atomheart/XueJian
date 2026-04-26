import { useMutation, useQuery } from '@tanstack/react-query'
import {
  cancelKnowledgeQaMessage,
  getKnowledgeQaConversation,
  listKnowledgeQaConversations,
  searchKnowledge,
  sendKnowledgeQaMessage,
  startKnowledgeQaWorkflow,
  type SendKnowledgeQaMessageInput,
  type StartKnowledgeQaInput,
} from '@/services/gateway/knowledge'

export const knowledgeQueryKeys = {
  all: ['knowledge'] as const,
  conversations: () => [...knowledgeQueryKeys.all, 'conversations'] as const,
  conversation: (conversationId: string | null) =>
    [...knowledgeQueryKeys.all, 'conversation', conversationId ?? 'none'] as const,
  search: (query: string, documentIds?: string[]) =>
    [...knowledgeQueryKeys.all, 'search', query, ...(documentIds ?? [])] as const,
}

export function useKnowledgeSearchQuery(query: string, documentIds?: string[], enabled = true) {
  return useQuery({
    queryKey: knowledgeQueryKeys.search(query, documentIds),
    queryFn: () => searchKnowledge({ query, documentIds }),
    enabled: enabled && query.trim().length > 0,
  })
}

export function useStartKnowledgeQaMutation() {
  return useMutation({
    mutationFn: (input: StartKnowledgeQaInput) => startKnowledgeQaWorkflow(input),
  })
}

export function useKnowledgeQaConversationsQuery() {
  return useQuery({
    queryKey: knowledgeQueryKeys.conversations(),
    queryFn: () => listKnowledgeQaConversations(),
  })
}

export function useKnowledgeQaConversationQuery(conversationId: string | null, enabled = true) {
  return useQuery({
    queryKey: knowledgeQueryKeys.conversation(conversationId),
    queryFn: () => getKnowledgeQaConversation(conversationId!),
    enabled: enabled && Boolean(conversationId),
  })
}

export function useSendKnowledgeQaMessageMutation() {
  return useMutation({
    mutationFn: (input: SendKnowledgeQaMessageInput) => sendKnowledgeQaMessage(input),
  })
}

export function useCancelKnowledgeQaMessageMutation() {
  return useMutation({
    mutationFn: (messageId: string) => cancelKnowledgeQaMessage(messageId),
  })
}
