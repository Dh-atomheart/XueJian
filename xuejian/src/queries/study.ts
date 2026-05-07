import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { studyGateway } from '@/services/gateway/study'
import type { ReviewRating } from '@/services/learning'
import { dashboardQueryKeys } from './dashboard'

export const studyQueryKeys = {
  all: ['study'] as const,
  queue: (newLimit?: number, reviewLimit?: number) =>
    [
      ...studyQueryKeys.all,
      'queue',
      newLimit ?? 'default-new',
      reviewLimit ?? 'default-review',
    ] as const,
}

export function useStudyQueueQuery(newLimit?: number, reviewLimit?: number) {
  return useQuery({
    queryKey: studyQueryKeys.queue(newLimit, reviewLimit),
    queryFn: () => studyGateway.getDailyQueue(newLimit, reviewLimit),
  })
}

export function useSubmitStudyReviewMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      cardId,
      rating,
      startedAt,
      durationMs,
    }: {
      cardId: string
      rating: ReviewRating
      startedAt?: string | null
      durationMs?: number | null
    }) => studyGateway.submitReview({ cardId, rating, startedAt, durationMs }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: studyQueryKeys.all })
      queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.all })
    },
  })
}
