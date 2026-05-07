import { beforeEach, describe, expect, it } from 'vitest'
import { studyGateway } from '@/services/gateway/study'
import { resetMockGatewayState } from '@/services/gateway/mockData'

beforeEach(() => {
  resetMockGatewayState()
})

describe('study gateway mocks', () => {
  it('returns only due cards from enabled groups', async () => {
    const queue = await studyGateway.getDailyQueue()

    expect(queue).toHaveLength(1)
    expect(queue[0]?.title).toBe('稳定锚点')
    expect(queue[0]?.state).toBe('new')
  })

  it('submits review and persists the updated schedule', async () => {
    const [initial] = await studyGateway.getDailyQueue()
    expect(initial).toBeDefined()

    const firstResult = await studyGateway.submitReview({
      cardId: initial!.id,
      rating: 'good',
      startedAt: '2026-05-02T10:00:00.000Z',
      durationMs: 2000,
    })

    expect(firstResult.newState).toBe('review')

    const queueAfterGood = await studyGateway.getDailyQueue()
    expect(queueAfterGood).toHaveLength(0)

    const secondResult = await studyGateway.submitReview({
      cardId: initial!.id,
      rating: 'again',
    })

    expect(secondResult.newState).toBe('relearning')
  })

  it('rejects unknown ratings', async () => {
    await expect(
      studyGateway.submitReview({
        cardId: '30303030-3030-4030-8030-303030303030',
        rating: 'maybe' as never,
      })
    ).rejects.toThrow('无效复习反馈档位')
  })
})
