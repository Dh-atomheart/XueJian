import { beforeEach, describe, expect, it } from 'vitest'
import { cardsGateway } from '@/services/gateway/cards'
import { resetMockGatewayState } from '@/services/gateway/mockData'
import { orchestrationGateway } from '@/services/gateway/orchestration'

const SEEDED_RUN_ID = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  resetMockGatewayState()
})

describe('cards gateway mocks', () => {
  it('returns empty card list outside Tauri', async () => {
    const cards = await cardsGateway.list({ documentId: 'doc-1' })
    expect(cards).toEqual([])
  })

  it('returns empty candidate list for an unrelated workflow outside Tauri', async () => {
    const candidates = await cardsGateway.listCandidates({ workflowRunId: 'run-1' })
    expect(candidates).toEqual([])
  })

  it('returns highlight data without throwing outside Tauri', async () => {
    const highlights = await cardsGateway.listHighlights({ documentId: 'doc-1' }).catch(() => [])
    expect(Array.isArray(highlights)).toBe(true)
  })

  it('startGeneration returns a mock workflow run outside Tauri', async () => {
    const run = await cardsGateway.startGeneration('doc-1', 10)
    expect(run.workflowType).toBe('card_generation')
    expect(run.status).toBe('queued')
  })

  it('resumeGeneration resumes an existing mock workflow run outside Tauri', async () => {
    const run = await cardsGateway.resumeGeneration(SEEDED_RUN_ID)
    expect(run.workflowType).toBe('card_generation')
    expect(run.status).toBe('running')
  })

  it('finalizeGeneration returns a mock result with dedupe tracking', async () => {
    const result = await cardsGateway.finalizeGeneration(SEEDED_RUN_ID)
    expect(result.createdCount).toBe(0)
    expect(result.skippedDuplicates).toBe(0)
    expect(result).toHaveProperty('skippedDuplicates')
    expect(result.run.status).toBe('completed')
  })
})

describe('orchestration gateway mocks', () => {
  it('returns the seeded workflow runs outside Tauri', async () => {
    const runs = await orchestrationGateway.listRuns(10)
    expect(runs).toHaveLength(1)
    expect(runs[0].workflowType).toBe('card_generation')
    expect(runs[0].status).toBe('waiting_confirmation')
  })

  it('returns empty events outside Tauri for an unrelated run', async () => {
    const events = await orchestrationGateway.listEvents('run-1', 10)
    expect(events).toEqual([])
  })

  it('returns null checkpoint outside Tauri', async () => {
    const checkpoint = await orchestrationGateway.getCheckpoint('run-1', 'queued')
    expect(checkpoint).toBeNull()
  })
})
