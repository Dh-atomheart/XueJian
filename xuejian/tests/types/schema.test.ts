import {
  cardCandidateSchema,
  cardGenerationCandidateSchema,
  finalizeCardGenerationResultSchema,
  ragAnswerSchema,
  serviceHealthStatusSchema,
  workflowEventSchema,
  workflowRunSchema,
} from '@/types'

describe('structured schemas', () => {
  it('parses card generation candidates with strict shape', () => {
    const candidate = cardGenerationCandidateSchema.parse({
      front: '什么是 FSRS？',
      back: '一种用于间隔重复调度的算法。',
      tags: ['fsrs', 'memory'],
      confidence: 0.82,
      sourcePage: 12,
      sourceParagraph: 3,
      sourceQuote: 'FSRS 是一种基于记忆稳定性的调度算法。',
    })

    expect(candidate.tags).toEqual(['fsrs', 'memory'])
    expect(candidate.confidence).toBeCloseTo(0.82)
  })

  it('rejects invalid card generation candidates', () => {
    expect(() =>
      cardGenerationCandidateSchema.parse({
        front: 'bad candidate',
        back: 'still bad',
        tags: [],
        confidence: 1.2,
        sourcePage: null,
        sourceParagraph: null,
        sourceQuote: 'quote',
      }),
    ).toThrow()
  })

  it('parses rag answers with citations', () => {
    const answer = ragAnswerSchema.parse({
      answer: 'FSRS 通过历史复习数据估计下一次最佳复习时间。',
      retrievalMode: 'fts5',
      citations: [
        {
          documentId: '4f4ac6a1-21d0-4d62-bec0-4b7188b84d51',
          anchorId: null,
          page: 8,
          quote: 'FSRS estimates the optimal interval...',
          relevanceScore: 0.91,
        },
      ],
    })

    expect(answer.citations).toHaveLength(1)
    expect(answer.retrievalMode).toBe('fts5')
  })

  it('normalizes workflow event timestamps into Date instances', () => {
    const event = workflowEventSchema.parse({
      runId: '4f4ac6a1-21d0-4d62-bec0-4b7188b84d51',
      eventType: 'progress',
      message: '正在生成卡片',
      progress: 0.4,
      payload: { chunkIndex: 2 },
      createdAt: '2026-04-16T10:00:00.000Z',
    })

    expect(event.createdAt).toBeInstanceOf(Date)
    expect(event.progress).toBeCloseTo(0.4)
  })

  it('parses workflow runs returned from the host', () => {
    const run = workflowRunSchema.parse({
      id: '11111111-1111-4111-8111-111111111111',
      workflowType: 'card_generation',
      presetId: null,
      status: 'running',
      threadId: 'thread-123',
      checkpointRef: 'extract-2',
      approvalPayload: null,
      costUsd: 0.13,
      errorMessage: null,
      startedAt: '2026-04-16T10:00:00.000Z',
      finishedAt: null,
      createdAt: '2026-04-16T10:00:00.000Z',
      updatedAt: '2026-04-16T10:01:00.000Z',
    })

    expect(run.startedAt).toBeInstanceOf(Date)
    expect(run.workflowType).toBe('card_generation')
  })

  it('parses persisted card candidates returned from M3 commands', () => {
    const candidate = cardCandidateSchema.parse({
      id: '11111111-1111-4111-8111-111111111111',
      workflowRunId: '22222222-2222-4222-8222-222222222222',
      documentId: '33333333-3333-4333-8333-333333333333',
      anchorId: '44444444-4444-4444-8444-444444444444',
      sourcePage: 3,
      sourceParagraph: 2,
      sourceQuote: 'FSRS is a scheduling algorithm for spaced repetition.',
      front: 'What is FSRS?',
      back: 'A scheduling algorithm for spaced repetition.',
      tags: ['page-3', 'paragraph-2'],
      confidence: 0.82,
      dedupeKey: 'dedupe-1',
      status: 'pending',
      createdAt: '2026-04-17T02:00:00.000Z',
    })

    expect(candidate.createdAt).toBeInstanceOf(Date)
    expect(candidate.status).toBe('pending')
  })

  it('parses finalize results from the card production line', () => {
    const result = finalizeCardGenerationResultSchema.parse({
      createdCount: 4,
      skippedDuplicates: 1,
      rejectedCount: 2,
      run: {
        id: '11111111-1111-4111-8111-111111111111',
        workflowType: 'card_generation',
        presetId: 'm3-card-production-line',
        status: 'completed',
        threadId: 'card-generation:doc',
        checkpointRef: 'completed',
        approvalPayload: null,
        costUsd: null,
        errorMessage: null,
        startedAt: '2026-04-17T02:00:00.000Z',
        finishedAt: '2026-04-17T02:01:00.000Z',
        createdAt: '2026-04-17T02:00:00.000Z',
        updatedAt: '2026-04-17T02:01:00.000Z',
      },
    })

    expect(result.createdCount).toBe(4)
    expect(result.run.finishedAt).toBeInstanceOf(Date)
  })

  it('parses orchestration service health payloads', () => {
    const status = serviceHealthStatusSchema.parse({
      status: 'healthy',
      endpoint: 'http://127.0.0.1:8765',
      protocolVersion: 'xuejian-orchestration/v1',
      serviceVersion: '0.1.0',
      pid: 12345,
      startedAt: '2026-04-16T10:00:00.000Z',
      checkedAt: '2026-04-16T10:01:00.000Z',
      protocolCompatible: true,
      errorMessage: null,
    })

    expect(status.checkedAt).toBeInstanceOf(Date)
    expect(status.protocolCompatible).toBe(true)
  })
})
