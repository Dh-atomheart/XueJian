import { describe, expect, it } from 'vitest'
import { extractKnowledgeQaResult } from '@/features/knowledge/KnowledgeQaPage'
import type { WorkflowEvent } from '@/types'

function makeCompletedEvent(retrievalStatus: string): WorkflowEvent {
  return {
    runId: '11111111-1111-4111-8111-111111111111',
    eventType: 'completed',
    message: null,
    progress: 1,
    createdAt: new Date('2026-04-25T00:00:00.000Z'),
    payload: {
      answer: {
        answer: 'fallback answer',
        answerMode: 'excerpt_fallback',
        retrievalStatus,
        graphEnhanced: true,
        graphContextSummary: 'Graph summary',
        citations: [
          {
            documentId: 'doc-1',
            snippet: 'excerpt snippet',
            page: 3,
          },
        ],
      },
    },
  }
}

describe('extractKnowledgeQaResult', () => {
  it('preserves non-ready retrieval statuses from completed workflow payloads', () => {
    const result = extractKnowledgeQaResult([makeCompletedEvent('embedding_missing')], new Map())

    expect(result.answerMode).toBe('excerpt_fallback')
    expect(result.retrievalStatus).toBe('embedding_missing')
    expect(result.graphEnhanced).toBe(true)
    expect(result.graphContextSummary).toBe('Graph summary')
    expect(result.citations).toEqual([
      {
        id: 'doc-1-0',
        documentId: 'doc-1',
        documentTitle: 'Document',
        page: 3,
        snippet: 'excerpt snippet',
        relevance: null,
      },
    ])
  })
})
