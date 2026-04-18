import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { cardsGateway } from '@/services/gateway/cards'
import { recordPoints } from '@/services/gateway/points'
import { scheduleCard, type ReviewRating } from '@/services/learning'
import type { Card } from '@/types'
import { pointsQueryKeys } from './points'

export const learningQueryKeys = {
  all: ['learning'] as const,
  dueCards: (limit?: number) => [...learningQueryKeys.all, 'due', limit ?? 'default'] as const,
  dailyStats: () => [...learningQueryKeys.all, 'daily-stats'] as const,
  reviewLogs: (cardId?: string) => [...learningQueryKeys.all, 'logs', cardId ?? 'all'] as const,
}

export function useDueCardsQuery(limit?: number) {
  return useQuery({
    queryKey: learningQueryKeys.dueCards(limit),
    queryFn: () => cardsGateway.listDueCards(limit),
  })
}

export function useDailyStatsQuery() {
  return useQuery({
    queryKey: learningQueryKeys.dailyStats(),
    queryFn: () => cardsGateway.getDailyStats(),
  })
}

export function useReviewLogsQuery(options?: { cardId?: string; limit?: number }) {
  return useQuery({
    queryKey: learningQueryKeys.reviewLogs(options?.cardId ?? undefined),
    queryFn: () => cardsGateway.listReviewLogs(options?.cardId, options?.limit ?? 500),
  })
}

export function useSubmitReviewMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ card, rating }: { card: Card; rating: ReviewRating }) => {
      const result = scheduleCard(card, rating)

      await cardsGateway.updateCardReview(card.id, {
        difficulty: result.difficulty,
        stability: result.stability,
        retrievability: result.retrievability,
        state: result.state,
        nextReview: result.nextReview,
      })

      const reviewLog = await cardsGateway.createReviewLog({
        cardId: card.id,
        rating,
        state: result.state,
        difficulty: result.difficulty,
        stability: result.stability,
        retrievability: result.retrievability,
        nextReview: result.nextReview,
        intervalDays: result.intervalDays,
      })

      // Record points for this review (fire-and-forget dedup via UNIQUE constraint)
      await recordPoints({
        reviewLogId: reviewLog.id,
        cardId: card.id,
        rating,
        cardState: card.state,
      })

      return { result, reviewLog }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: learningQueryKeys.all })
      queryClient.invalidateQueries({ queryKey: pointsQueryKeys.all })
    },
  })
}
