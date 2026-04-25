import { createEmptyCard, fsrs, generatorParameters, type Grade, Rating } from 'ts-fsrs'
import type { Card } from '@/types'

const params = generatorParameters()
const scheduler = fsrs(params)

export type ReviewRating = 'again' | 'hard' | 'good' | 'easy'

const RATING_MAP: Record<ReviewRating, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
}

export interface SchedulingResult {
  difficulty: number
  stability: number
  retrievability: number
  state: 'new' | 'learning' | 'review' | 'relearning'
  nextReview: string
  intervalDays: number
}

export interface DailyReviewQueueOptions {
  limit?: number
  now?: Date
}

const STATE_MAP: Record<number, Card['state']> = {
  0: 'new',
  1: 'learning',
  2: 'review',
  3: 'relearning',
}

export function scheduleCard(card: Card, rating: ReviewRating): SchedulingResult {
  const grade = RATING_MAP[rating]

  const fsrsCard = createEmptyCard()
  fsrsCard.difficulty = card.difficulty
  fsrsCard.stability = card.stability
  fsrsCard.due = card.nextReview ? new Date(card.nextReview) : new Date()
  fsrsCard.elapsed_days = 0
  fsrsCard.scheduled_days = 0
  fsrsCard.reps = 0
  fsrsCard.lapses = 0
  fsrsCard.state = (['new', 'learning', 'review', 'relearning'] as const).indexOf(card.state)
  fsrsCard.last_review = undefined

  const result = scheduler.repeat(fsrsCard, new Date())
  const scheduled = result[grade]

  const nextReview = scheduled.card.due
  const intervalDays = scheduled.card.scheduled_days

  return {
    difficulty: scheduled.card.difficulty,
    stability: scheduled.card.stability,
    retrievability: card.retrievability ?? 0,
    state: STATE_MAP[scheduled.card.state] ?? 'new',
    nextReview: nextReview.toISOString(),
    intervalDays,
  }
}

export function previewScheduling(card: Card): Record<ReviewRating, { intervalDays: number }> {
  const ratings: ReviewRating[] = ['again', 'hard', 'good', 'easy']
  const result = {} as Record<ReviewRating, { intervalDays: number }>
  for (const rating of ratings) {
    const scheduled = scheduleCard(card, rating)
    result[rating] = { intervalDays: scheduled.intervalDays }
  }
  return result
}

function reviewTime(card: Card): number {
  if (!card.nextReview) {
    return Number.NEGATIVE_INFINITY
  }
  return new Date(card.nextReview).getTime()
}

function isDue(card: Card, now: Date): boolean {
  if (!card.nextReview) {
    return true
  }
  const dueAt = reviewTime(card)
  return Number.isFinite(dueAt) && dueAt <= now.getTime()
}

export function buildDailyReviewQueue(
  cards: Card[],
  options: DailyReviewQueueOptions = {}
): Card[] {
  const now = options.now ?? new Date()
  const limit = Math.max(0, options.limit ?? cards.length)

  return cards
    .filter((card) => isDue(card, now))
    .sort((left, right) => {
      const leftDue = reviewTime(left)
      const rightDue = reviewTime(right)
      if (leftDue !== rightDue) {
        return leftDue - rightDue
      }
      return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
    })
    .slice(0, limit)
}
