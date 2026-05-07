import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  cardsGateway,
  type BackgroundJobFilters,
  type CardCandidateFilters,
  type CardFilters,
  type CreateCardInput,
  type CreateHighlightInput,
  type HighlightFilters,
  type StartAiCardGenerationInput,
  type UpdateCardInput,
  type UpdateHighlightInput,
} from '@/services/gateway/cards'
import { orchestrationQueryKeys } from './orchestration'
import type { BackgroundJob } from '@/types'

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
  backgroundJobs: (filters: BackgroundJobFilters) =>
    [
      ...cardsQueryKeys.all,
      'background-jobs',
      filters.jobType ?? 'all-types',
      filters.status ?? 'all-statuses',
      filters.targetType ?? 'all-target-types',
      filters.targetId ?? 'all-targets',
    ] as const,
  backgroundJob: (jobId: string | null) =>
    [...cardsQueryKeys.all, 'background-job', jobId ?? 'none'] as const,
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

export function useBackgroundJobsQuery(
  filters: BackgroundJobFilters,
  options?: {
    enabled?: boolean
    refetchInterval?: number | false | ((query: { state: { data?: BackgroundJob[] } }) => number | false)
  }
) {
  return useQuery({
    queryKey: cardsQueryKeys.backgroundJobs(filters),
    queryFn: () => cardsGateway.listBackgroundJobs(filters),
    enabled: options?.enabled ?? true,
    refetchInterval: options?.refetchInterval,
  })
}

export function useBackgroundJobQuery(
  jobId: string | null,
  options?: { enabled?: boolean; refetchInterval?: number | false }
) {
  return useQuery({
    queryKey: cardsQueryKeys.backgroundJob(jobId),
    queryFn: () => cardsGateway.getBackgroundJob(jobId as string),
    enabled: options?.enabled ?? Boolean(jobId),
    refetchInterval: options?.refetchInterval,
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

function invalidateAiGenerationQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  job?: BackgroundJob | null
) {
  void queryClient.invalidateQueries({ queryKey: cardsQueryKeys.all })
  void queryClient.invalidateQueries({ queryKey: ['basic-cards'] })
  void queryClient.invalidateQueries({ queryKey: ['documents'] })
  if (job?.id) {
    void queryClient.invalidateQueries({ queryKey: cardsQueryKeys.backgroundJob(job.id) })
  }
}

export function useStartAiCardGenerationMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: StartAiCardGenerationInput) => cardsGateway.startAiCardGeneration(data),
    onSuccess: (job) => invalidateAiGenerationQueries(queryClient, job),
  })
}

export function useResumeAiCardGenerationMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (jobId: string) => cardsGateway.resumeAiCardGeneration(jobId),
    onSuccess: (job) => invalidateAiGenerationQueries(queryClient, job),
  })
}

export function useCancelBackgroundJobMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (jobId: string) => cardsGateway.cancelBackgroundJob(jobId),
    onSuccess: (job) => invalidateAiGenerationQueries(queryClient, job),
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
