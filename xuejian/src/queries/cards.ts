import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  cardsGateway,
  type CardCandidateFilters,
  type CardFilters,
  type CreateCardInput,
  type CreateHighlightInput,
  type HighlightFilters,
  type UpdateCardInput,
  type UpdateHighlightInput,
} from '@/services/gateway/cards'
import { orchestrationQueryKeys } from './orchestration'

export const cardsQueryKeys = {
  all: ['cards'] as const,
  list: (filters: CardFilters) =>
    [
      ...cardsQueryKeys.all,
      'list',
      filters.documentId ?? 'all-docs',
      filters.anchorId ?? 'all-anchors',
      filters.pageNumber ?? 'all-pages',
      filters.limit ?? 'default',
    ] as const,
  candidates: (filters: CardCandidateFilters) =>
    [
      ...cardsQueryKeys.all,
      'candidates',
      filters.workflowRunId ?? 'all-runs',
      filters.documentId ?? 'all-docs',
      filters.status ?? 'all-statuses',
      filters.limit ?? 'default',
    ] as const,
  highlights: (filters: HighlightFilters) =>
    [
      ...cardsQueryKeys.all,
      'highlights',
      filters.documentId ?? 'all-docs',
      filters.cardId ?? 'all-cards',
      filters.pageNumber ?? 'all-pages',
      filters.limit ?? 'default',
    ] as const,
}

export function useCardsQuery(filters: CardFilters, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: cardsQueryKeys.list(filters),
    queryFn: () => cardsGateway.list(filters),
    enabled: options?.enabled ?? Boolean(filters.documentId || filters.anchorId),
  })
}

export function useCardCandidatesQuery(
  filters: CardCandidateFilters,
  options?: { refetchInterval?: number | false }
) {
  return useQuery({
    queryKey: cardsQueryKeys.candidates(filters),
    queryFn: () => cardsGateway.listCandidates(filters),
    enabled: Boolean(filters.workflowRunId || filters.documentId),
    refetchInterval: options?.refetchInterval,
  })
}

export function useHighlightsQuery(filters: HighlightFilters, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: cardsQueryKeys.highlights(filters),
    queryFn: () => cardsGateway.listHighlights(filters),
    enabled: options?.enabled ?? Boolean(filters.documentId || filters.cardId),
  })
}

export function useCreateHighlightMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateHighlightInput) => cardsGateway.createHighlight(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: cardsQueryKeys.all })
    },
  })
}

export function useUpdateHighlightMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateHighlightInput }) =>
      cardsGateway.updateHighlight(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: cardsQueryKeys.all })
    },
  })
}

export function useCreateCardMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateCardInput) => cardsGateway.create(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: cardsQueryKeys.all })
    },
  })
}

export function useUpdateCardMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCardInput }) =>
      cardsGateway.update(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: cardsQueryKeys.all })
    },
  })
}

export function useDeleteCardMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => cardsGateway.delete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: cardsQueryKeys.all })
    },
  })
}

export function useUpdateCardCandidateMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string
      data: Parameters<typeof cardsGateway.updateCandidate>[1]
    }) => cardsGateway.updateCandidate(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: cardsQueryKeys.all })
      void queryClient.invalidateQueries({ queryKey: orchestrationQueryKeys.all })
    },
  })
}

export function useBulkUpdateCardCandidateStatusesMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      workflowRunId,
      ids,
      status,
    }: {
      workflowRunId: string
      ids: string[]
      status: 'accepted' | 'rejected' | 'pending'
    }) => cardsGateway.bulkUpdateCandidateStatuses(workflowRunId, ids, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: cardsQueryKeys.all })
      void queryClient.invalidateQueries({ queryKey: orchestrationQueryKeys.all })
    },
  })
}

export function useResumeCardGenerationMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (runId: string) => cardsGateway.resumeGeneration(runId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: cardsQueryKeys.all })
      void queryClient.invalidateQueries({ queryKey: orchestrationQueryKeys.all })
    },
  })
}

export function useFinalizeCardGenerationMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (runId: string) => cardsGateway.finalizeGeneration(runId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: cardsQueryKeys.all })
      void queryClient.invalidateQueries({ queryKey: orchestrationQueryKeys.all })
    },
  })
}
