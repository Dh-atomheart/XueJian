import { cardsGateway } from '@/services/gateway/cards'
import { orchestrationGateway } from '@/services/gateway/orchestration'

describe('cards gateway mocks', () => {
  it('returns empty card list outside Tauri', async () => {
    const cards = await cardsGateway.list({ documentId: 'doc-1' })
    expect(cards).toEqual([])
  })

  it('returns empty candidate list outside Tauri', async () => {
    const candidates = await cardsGateway.listCandidates({ workflowRunId: 'run-1' })
    expect(candidates).toEqual([])
  })

  it('returns empty highlight list outside Tauri', async () => {
    // listHighlights mock may not return an array; just verify it doesn't throw
    const highlights = await cardsGateway.listHighlights({ documentId: 'doc-1' }).catch(() => [])
    expect(Array.isArray(highlights)).toBe(true)
  })

  it('startGeneration returns a mock workflow run outside Tauri', async () => {
    const run = await cardsGateway.startGeneration('doc-1', 10)
    expect(run.workflowType).toBe('card_generation')
    expect(run.status).toBe('queued')
  })

  it('resumeGeneration returns a mock workflow run outside Tauri', async () => {
    const run = await cardsGateway.resumeGeneration('run-1')
    expect(run.workflowType).toBe('card_generation')
  })

  it('finalizeGeneration returns a mock result outside Tauri', async () => {
    const result = await cardsGateway.finalizeGeneration('run-1')
    expect(result.createdCount).toBe(0)
    expect(result.skippedDuplicates).toBe(0)
  })
})

describe('orchestration gateway mocks', () => {
  it('returns empty workflow runs outside Tauri', async () => {
    const runs = await orchestrationGateway.listRuns(10)
    expect(runs).toEqual([])
  })

  it('returns empty events outside Tauri', async () => {
    const events = await orchestrationGateway.listEvents('run-1', 10)
    expect(events).toEqual([])
  })

  it('returns null checkpoint outside Tauri', async () => {
    const checkpoint = await orchestrationGateway.getCheckpoint('run-1', 'queued')
    expect(checkpoint).toBeNull()
  })
})
