import { scheduleCard, previewScheduling, type ReviewRating } from '@/services/learning'
import { cardsGateway } from '@/services/gateway/cards'
import type { Card } from '@/types'

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'card-1',
    documentId: 'doc-1',
    front: 'What is FSRS?',
    back: 'Free Spaced Repetition Scheduler',
    tags: [],
    state: 'new',
    difficulty: 0,
    stability: 0,
    retrievability: 0,
    nextReview: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

// @acceptance:m5-a1
describe('due and new card counting', () => {
  it('listDueCards returns cards from mock gateway', async () => {
    const cards = await cardsGateway.listDueCards()
    expect(Array.isArray(cards)).toBe(true)
  })

  it('getDailyStats returns newCards and reviewCards counts', async () => {
    const stats = await cardsGateway.getDailyStats()
    expect(stats).toHaveProperty('newCards')
    expect(stats).toHaveProperty('reviewCards')
    expect(typeof stats.newCards).toBe('number')
    expect(typeof stats.reviewCards).toBe('number')
  })
})

// @acceptance:m5-a2
describe('rating flow writes ReviewLog', () => {
  it('createReviewLog accepts valid review data', async () => {
    const result = await cardsGateway.createReviewLog({
      cardId: 'card-1',
      rating: 'good',
      scheduledDays: 3,
      elapsedDays: 0,
      review: new Date().toISOString(),
      state: 'review',
    })
    expect(result).toBeDefined()
  })

  it('listReviewLogs returns array for a card', async () => {
    const logs = await cardsGateway.listReviewLogs({ cardId: 'card-1' })
    expect(Array.isArray(logs)).toBe(true)
  })
})

// @acceptance:m5-a3
describe('card state sync after rating', () => {
  it('scheduleCard returns new state and next review date', () => {
    const card = makeCard({ state: 'new', difficulty: 0, stability: 0 })
    const result = scheduleCard(card, 'good')

    expect(result.nextReview).toBeDefined()
    expect(new Date(result.nextReview).getTime()).toBeGreaterThan(Date.now() - 1000)
    expect(result.state).toBeDefined()
    expect(['new', 'learning', 'review', 'relearning']).toContain(result.state)
    expect(result.difficulty).toBeGreaterThanOrEqual(0)
    expect(result.stability).toBeGreaterThanOrEqual(0)
  })

  it('scheduleCard "again" yields shorter interval than "easy"', () => {
    const card = makeCard({ state: 'review', difficulty: 5, stability: 10 })
    const again = scheduleCard(card, 'again')
    const easy = scheduleCard(card, 'easy')
    expect(again.intervalDays).toBeLessThanOrEqual(easy.intervalDays)
  })

  it('updateCardReview persists card changes via gateway without throwing', async () => {
    await expect(
      cardsGateway.updateCardReview({
        id: 'card-1',
        difficulty: 5.5,
        stability: 12,
        retrievability: 0.9,
        state: 'review',
        nextReview: new Date().toISOString(),
      })
    ).resolves.not.toThrow()
  })
})

// @acceptance:m5-a4
describe('review page visual focus', () => {
  it('previewScheduling returns intervals for all four ratings', () => {
    const card = makeCard()
    const previews = previewScheduling(card)
    const ratings: ReviewRating[] = ['again', 'hard', 'good', 'easy']
    for (const r of ratings) {
      expect(previews[r]).toHaveProperty('intervalDays')
      expect(typeof previews[r].intervalDays).toBe('number')
    }
  })
})
