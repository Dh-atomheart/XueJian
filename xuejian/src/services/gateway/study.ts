import { z } from 'zod'
import { studyQueueItemSchema, studyReviewResultSchema } from '@/types'
import type { StudyQueueItem, StudyReviewResult } from '@/types'
import type { ReviewRating } from '@/services/learning'
import { invokeWithSchema } from './index'

export interface SubmitStudyReviewInput {
  cardId: string
  rating: ReviewRating
  startedAt?: string | null
  durationMs?: number | null
}

export const studyGateway = {
  async getDailyQueue(newLimit?: number, reviewLimit?: number): Promise<StudyQueueItem[]> {
    return invokeWithSchema('get_daily_queue', z.array(studyQueueItemSchema), {
      newLimit: newLimit ?? undefined,
      reviewLimit: reviewLimit ?? undefined,
    })
  },

  async submitReview(data: SubmitStudyReviewInput): Promise<StudyReviewResult> {
    return invokeWithSchema('submit_study_review', studyReviewResultSchema, {
      data: {
        cardId: data.cardId,
        rating: data.rating,
        startedAt: data.startedAt ?? undefined,
        durationMs: data.durationMs ?? undefined,
      },
    })
  },
}
