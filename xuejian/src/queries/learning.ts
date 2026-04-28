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
  studyStats: () => [...learningQueryKeys.all, 'study-stats'] as const,
  masteryBreakdown: () => [...learningQueryKeys.all, 'mastery-breakdown'] as const,
  reviewHeatmap: (days = 112) => [...learningQueryKeys.all, 'review-heatmap', days] as const,
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

export function useStudyStatsQuery() {
  return useQuery({
    queryKey: learningQueryKeys.studyStats(),
    queryFn: () => cardsGateway.getStudyStats(),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })
}

export function useMasteryBreakdownQuery() {
  return useQuery({
    queryKey: learningQueryKeys.masteryBreakdown(),
    queryFn: () => cardsGateway.getMasteryBreakdown(),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })
}

export function useReviewHeatmapQuery(days = 112) {
  return useQuery({
    queryKey: learningQueryKeys.reviewHeatmap(days),
    queryFn: () => cardsGateway.getReviewHeatmap(days),
    staleTime: 60_000,
    placeholderData: (prev) => prev,
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
