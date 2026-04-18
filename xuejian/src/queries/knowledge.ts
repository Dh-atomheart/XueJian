import { useMutation, useQuery } from '@tanstack/react-query'
import {
  searchKnowledge,
  startKnowledgeQaWorkflow,
  type StartKnowledgeQaInput,
} from '@/services/gateway/knowledge'

export const knowledgeQueryKeys = {
  all: ['knowledge'] as const,
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
