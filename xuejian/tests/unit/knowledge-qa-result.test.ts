import { describe, expect, it } from 'vitest'
import { buildTurnsFromMessages, extractKnowledgeQaResult } from '@/features/knowledge/KnowledgeQaPage'
import type { KnowledgeQaMessage, WorkflowEvent } from '@/types'

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
    expect(result.citations).toEqual([
      {
        id: 'doc-1-0',
        documentId: 'doc-1',
        documentTitle: '文档',
        page: 3,
        snippet: 'excerpt snippet',
        relevance: null,
      },
    ])
  })

  it('uses quote as citation snippet and Chinese display fallbacks', () => {
    const result = extractKnowledgeQaResult(
      [
        {
          runId: '11111111-1111-4111-8111-111111111111',
          eventType: 'completed',
          message: null,
          progress: 1,
          createdAt: new Date('2026-04-25T00:00:00.000Z'),
          payload: {
            answer: {
              answer: '',
              answerMode: 'grounded',
              retrievalStatus: 'ready',
              citations: [
                {
                  chunkId: 'chunk-1',
                  documentId: 'doc-1',
                  quote: '引用片段',
                  page: null,
                },
              ],
            },
          },
        },
      ],
      new Map([['doc-1', '测试文档']])
    )

    expect(result.answer).toBe('回答已生成，但没有返回可展示的正文。')
    expect(result.citations).toEqual([
      {
        id: 'chunk-1',
        documentId: 'doc-1',
        documentTitle: '测试文档',
        page: null,
        snippet: '引用片段',
        relevance: null,
      },
    ])
  })

  it('does not fabricate citations when payload has no citation list', () => {
    const result = extractKnowledgeQaResult(
      [
        {
          runId: '11111111-1111-4111-8111-111111111111',
          eventType: 'completed',
          message: null,
          progress: 1,
          createdAt: new Date('2026-04-25T00:00:00.000Z'),
          payload: {
            answer: {
              answer: '当前资料中没有足够证据回答这个问题。',
              answerMode: 'no_relevant_content',
              retrievalStatus: 'no_hits',
            },
          },
        },
      ],
      new Map()
    )

    expect(result.answerMode).toBe('no_relevant_content')
    expect(result.retrievalStatus).toBe('no_hits')
    expect(result.citations).toEqual([])
  })
})

function makeKnowledgeQaMessage(overrides: Partial<KnowledgeQaMessage>): KnowledgeQaMessage {
  const now = new Date('2026-05-07T00:00:00.000Z')
  return {
    id: 'message-id',
    conversationId: 'conversation-id',
    role: 'user',
    content: '',
    status: 'answered',
    workflowRunId: null,
    documentIds: [],
    answerPayload: null,
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe('buildTurnsFromMessages', () => {
  it('keeps chronological chat order so the newest question renders at the bottom', () => {
    const turns = buildTurnsFromMessages(
      [
        makeKnowledgeQaMessage({
          id: 'user-old',
          role: 'user',
          content: 'old question',
          createdAt: new Date('2026-05-07T00:00:00.000Z'),
        }),
        makeKnowledgeQaMessage({
          id: 'assistant-old',
          role: 'assistant',
          content: 'old answer',
          createdAt: new Date('2026-05-07T00:00:01.000Z'),
        }),
        makeKnowledgeQaMessage({
          id: 'user-new',
          role: 'user',
          content: 'new question',
          createdAt: new Date('2026-05-07T00:01:00.000Z'),
        }),
        makeKnowledgeQaMessage({
          id: 'assistant-new',
          role: 'assistant',
          content: 'new answer',
          createdAt: new Date('2026-05-07T00:01:01.000Z'),
        }),
      ],
      new Map()
    )

    expect(turns.map((turn) => turn.question)).toEqual(['old question', 'new question'])
  })
})
