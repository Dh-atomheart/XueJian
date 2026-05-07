import { beforeEach, describe, expect, it } from 'vitest'
import { dashboardGateway } from '@/services/gateway/dashboard'
import { studyGateway } from '@/services/gateway/study'
import { resetMockGatewayState } from '@/services/gateway/mockData'

beforeEach(() => {
  resetMockGatewayState()
})

describe('dashboard gateway mocks', () => {
  it('returns summary metrics, heatmap, and progress from study events', async () => {
    const summary = await dashboardGateway.getSummary(63, 6)

    expect(summary.todayCompletedCount).toBe(0)
    expect(summary.totalStudyMinutes).toBeGreaterThan(0)
    expect(summary.heatmap.some((entry) => entry.date === '2026-04-16')).toBe(true)
    expect(summary.documentProgress[0]?.totalCards).toBeGreaterThan(0)
    expect(summary.groupProgress[0]?.progressPercent).toBeGreaterThanOrEqual(0)
  })

  it('updates completion count and heatmap after submitting a study review', async () => {
    const [card] = await studyGateway.getDailyQueue()
    expect(card).toBeDefined()

    await studyGateway.submitReview({
      cardId: card!.id,
      rating: 'good',
      startedAt: '2026-04-17T08:55:00.000Z',
      durationMs: 125_000,
    })

    const summary = await dashboardGateway.getSummary(63, 6)

    expect(summary.todayCompletedCount).toBe(1)
    expect(summary.heatmap).toContainEqual({ date: '2026-04-17', count: 1 })
    expect(summary.todayStudyMinutes).toBe(2)
  })
})
