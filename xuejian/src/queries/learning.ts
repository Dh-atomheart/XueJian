import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { cardsGateway } from '@/services/gateway/cards'
import { scheduleCard, type ReviewRating } from '@/services/learning'
import type { Card } from '@/types'

export const learningQueryKeys = {
  all: ['learning'] as const,
  dueCards: (limit?: number) =>
    [...learningQueryKeys.all, 'due', limit ?? 'default'] as const,
  dailyStats: () => [...learningQueryKeys.all, 'daily-stats'] as const,
  reviewLogs: (cardId?: string) =>
    [...learningQueryKeys.all, 'logs', cardId ?? 'all'] as const,
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

      return { result, reviewLog }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: learningQueryKeys.all })
    },
  })
}
