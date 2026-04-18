import { describe, it, expect } from 'vitest'
import { recordPoints, listPointsLedger, getPointsSummary } from '@/services/gateway/points'

// @acceptance:v4-4-a5
describe('daily first-review points rule', () => {
  it('grants 10 points on the first card rating of the day', async () => {
    const entry = await recordPoints({
      reviewLogId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      cardId: '33333333-3333-4333-8333-333333333333',
      rating: 'good',
      cardState: 'review',
    })

    expect(entry).not.toBeNull()
    expect(entry!.points).toBe(10)
    expect(entry!.reviewLogId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    expect(entry!.transactionType).toBe('daily_first_review')
    expect(entry!.reason).toContain('Daily first review bonus')
  })

  it('returns null after the daily reward has already been claimed', async () => {
    const entry = await recordPoints({
      reviewLogId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      cardId: '33333333-3333-4333-8333-333333333333',
      rating: 'good',
      cardState: 'review',
    })

    expect(entry).toBeNull()
  })

  it('keeps the ledger traceable to the original review event', async () => {
    const entries = await listPointsLedger()
    expect(entries.length).toBeGreaterThan(0)
    const entry = entries[0]
    expect(entry.reviewLogId).toBeTruthy()
    expect(entry.cardId).toBeTruthy()
    expect(entry.transactionType).toBe('daily_first_review')
    expect(entry.rating).toBeTruthy()
    expect(entry.reason).toContain('Daily first review bonus')
  })

  it('keeps the daily summary aligned with the single daily reward', async () => {
    const summary = await getPointsSummary()

    expect(summary).toBeDefined()
    expect(summary.todayPoints).toBe(10)
  })
})
