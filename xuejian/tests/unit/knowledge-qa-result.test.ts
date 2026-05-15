import { describe, expect, it } from 'vitest'
import {
  buildRagProgressStepsFromEvents,
  buildTurnsFromMessages,
  extractKnowledgeQaResult,
} from '@/features/knowledge/KnowledgeQaPage'
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

function makeProgressEvent(
  eventType: WorkflowEvent['eventType'],
  createdAt: Date,
  payload: WorkflowEvent['payload'],
  message: string | null = null
): WorkflowEvent {
  return {
    runId: '11111111-1111-4111-8111-111111111111',
    eventType,
    message,
    progress: 0.1,
    createdAt,
    payload,
  }
}

describe('buildRagProgressStepsFromEvents', () => {
  it('lets same-millisecond progress payloads override the generic started event', () => {
    const createdAt = new Date('2026-04-25T00:00:00.000Z')
    const steps = buildRagProgressStepsFromEvents([
      makeProgressEvent(
        'progress',
        createdAt,
        {
          stepKey: 'query_embedding',
          status: 'completed',
          title: 'Vector ready',
          detail: 'ready',
          progress: 0.16,
          metrics: {},
        },
        'ready'
      ),
      makeProgressEvent('started', createdAt, null, 'Agent QA started'),
    ])

    expect(steps[steps.length - 1]?.title).toBe('Vector ready')
  })
})

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

  it('extracts ragTrace diagnostics from completed workflow payloads', () => {
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
              answer: 'trace answer',
              answerMode: 'grounded',
              retrievalStatus: 'ready',
              citations: [],
              ragTrace: {
                embeddingReadiness: 'ready',
                retrievalMode: 'hybrid',
                queryRewriteUsed: true,
                secondRetrievalUsed: true,
                retrievedDocumentCount: 2,
                parentMergeStatus: 'merged',
                rerankStatus: 'local_rule',
                relevanceGateDecision: 'answer',
                citationAuditStatus: 'clean',
                failureReason: null,
                retrievalSummary: {
                  chunkCount: 2,
                  retrievedDocumentCount: 2,
                  lexicalStatus: 'fts5_bm25',
                  retrievalMode: 'hybrid',
                },
                rewriteSummary: {
                  status: 'applied',
                  triggerReason: 'referential',
                  recentMessageCount: 2,
                  originalQueryPreview: '它的优缺点',
                  rewrittenQueryPreview: '检索练习的优缺点',
                },
                mergeSummary: {
                  status: 'merged',
                  childChunksExpanded: 1,
                  parentContextsAdded: 1,
                  sectionContextsAdded: 0,
                  charsAdded: 48,
                },
                packingSummary: {
                  passageCount: 2,
                  totalChars: 320,
                  budgetChars: 8000,
                },
                rerankSummary: {
                  status: 'local_rule',
                  provider: 'local_rule',
                  topScore: 0.86,
                  averageScore: 0.79,
                  chunkCount: 2,
                },
                relevanceGateSummary: {
                  decision: 'answer',
                  topScore: 0.86,
                  threshold: 0.25,
                  chunkCount: 2,
                  reason: 'sufficient_evidence',
                },
                secondRetrievalSummary: {
                  status: 'applied',
                  used: true,
                  queryPreview: '检索练习的优缺点',
                  additionalChunkCount: 1,
                  reason: 'low_relevance',
                },
                auditSummary: {
                  totalCitations: 0,
                  validCitations: 0,
                  rejectedCitations: 0,
                  auditStatus: 'clean',
                },
              },
            },
          },
        },
      ],
      new Map()
    )

    expect(result.ragTrace?.queryRewriteUsed).toBe(true)
    expect(result.ragTrace?.secondRetrievalUsed).toBe(true)
    expect(result.ragTrace?.rerankStatus).toBe('local_rule')
  })

  it('normalizes ragTrace defaults when optional summaries are missing or malformed', () => {
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
              answer: 'trace answer',
              answerMode: 'grounded',
              retrievalStatus: 'ready',
              citations: [],
              ragTrace: {
                embeddingReadiness: 'ready',
                retrievalMode: 'hybrid',
                queryRewriteUsed: false,
                secondRetrievalUsed: false,
                retrievedDocumentCount: 'bad-value',
                parentMergeStatus: null,
                rerankStatus: null,
                relevanceGateDecision: null,
                citationAuditStatus: null,
                failureReason: null,
                retrievalSummary: {
                  chunkCount: 'bad',
                  lexicalStatus: 42,
                },
                mergeSummary: 'bad',
                packingSummary: {
                  passageCount: 'bad',
                },
                auditSummary: {
                  totalCitations: 'bad',
                },
              },
            },
          },
        },
      ],
      new Map()
    )

    expect(result.ragTrace?.retrievedDocumentCount).toBe(0)
    expect(result.ragTrace?.rewriteSummary).toBeUndefined()
    expect(result.ragTrace?.retrievalSummary).toEqual({
      chunkCount: 0,
      retrievedDocumentCount: 0,
      lexicalStatus: 'not_used',
      retrievalMode: 'hybrid',
    })
    expect(result.ragTrace?.mergeSummary.status).toBe('not_run')
    expect(result.ragTrace?.packingSummary).toEqual({
      passageCount: 0,
      totalChars: 0,
      budgetChars: 0,
    })
    expect(result.ragTrace?.auditSummary.auditStatus).toBe('not_run')
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

  it('preserves ragTrace from assistant payloads when building turns', () => {
    const turns = buildTurnsFromMessages(
      [
        makeKnowledgeQaMessage({
          id: 'user-1',
          role: 'user',
          content: '它的优缺点',
        }),
        makeKnowledgeQaMessage({
          id: 'assistant-1',
          role: 'assistant',
          content: '回答',
          answerPayload: {
            answer: {
              answer: '回答',
              answerMode: 'grounded',
              retrievalStatus: 'ready',
              citations: [],
              ragTrace: {
                embeddingReadiness: 'ready',
                retrievalMode: 'hybrid',
                queryRewriteUsed: true,
                secondRetrievalUsed: false,
                retrievedDocumentCount: 1,
                parentMergeStatus: 'merged',
                rerankStatus: 'local_rule',
                relevanceGateDecision: 'answer',
                citationAuditStatus: 'clean',
                failureReason: null,
                retrievalSummary: {
                  chunkCount: 1,
                  retrievedDocumentCount: 1,
                  lexicalStatus: 'fts5_bm25',
                  retrievalMode: 'hybrid',
                },
                mergeSummary: {
                  status: 'merged',
                  childChunksExpanded: 1,
                  parentContextsAdded: 1,
                  sectionContextsAdded: 0,
                  charsAdded: 40,
                },
                packingSummary: {
                  passageCount: 1,
                  totalChars: 180,
                  budgetChars: 8000,
                },
                auditSummary: {
                  totalCitations: 0,
                  validCitations: 0,
                  rejectedCitations: 0,
                  auditStatus: 'clean',
                },
              },
              agentTrace: [
                {
                  toolKey: 'retrieve_evidence',
                  durationMs: 1.25,
                  inputSummary: {
                    questionPreview: '它的优缺点',
                  },
                  outputSummary: {
                    chunkCount: 1,
                    retrievalMode: 'hybrid',
                  },
                  errorCategory: null,
                },
              ],
            },
          },
        }),
      ],
      new Map()
    )

    expect(turns[0].ragTrace?.queryRewriteUsed).toBe(true)
    expect(turns[0].ragTrace?.retrievalMode).toBe('hybrid')
    expect(turns[0].agentTrace?.[0]?.toolKey).toBe('retrieve_evidence')
  })

  it('normalizes session memory metadata from assistant payloads', () => {
    const turns = buildTurnsFromMessages(
      [
        makeKnowledgeQaMessage({
          id: 'user-1',
          role: 'user',
          content: '它和前面那个方法有什么区别？',
        }),
        makeKnowledgeQaMessage({
          id: 'assistant-1',
          role: 'assistant',
          content: '回答',
          answerPayload: {
            answer: {
              answer: '回答',
              answerMode: 'grounded',
              retrievalStatus: 'ready',
              citations: [],
              sessionMemoryUsed: true,
              sessionMemorySummary: '本会话最近关注检索练习与间隔重复的差异。',
            },
          },
        }),
      ],
      new Map()
    )

    expect(turns[0].sessionMemoryUsed).toBe(true)
    expect(turns[0].sessionMemorySummary).toContain('检索练习')
  })
})
