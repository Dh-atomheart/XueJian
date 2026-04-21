import { describe, expect, it } from 'vitest'
import { cardCandidateSchema, cardSchema } from '@/types'

describe('card system schemas', () => {
  it('parses persisted cards with image occlusion card types', () => {
    const card = cardSchema.parse({
      id: '11111111-1111-4111-8111-111111111111',
      groupId: null,
      title: null,
      cardType: 'image_occlusion',
      clusterId: null,
      exportGuid: null,
      documentId: null,
      anchorId: null,
      front: '{"image":"https://example.com/heart.png","zones":[{"x":0.1,"y":0.2,"width":0.3,"height":0.2}]}',
      back: '这是图像遮挡卡片的解析。',
      sourcePage: null,
      sourceParagraph: null,
      sourceCoordinates: null,
      tags: ['biology'],
      difficulty: 0.3,
      stability: 1.2,
      retrievability: null,
      state: 'new',
      nextReview: null,
      createdAt: '2026-04-21T00:00:00.000Z',
      updatedAt: '2026-04-21T00:00:00.000Z',
    })

    expect(card.cardType).toBe('image_occlusion')
    expect(card.createdAt).toBeInstanceOf(Date)
  })

  it('parses persisted card candidates in the current M3 schema shape', () => {
    const candidate = cardCandidateSchema.parse({
      id: '11111111-1111-4111-8111-111111111111',
      workflowRunId: '22222222-2222-4222-8222-222222222222',
      documentId: '33333333-3333-4333-8333-333333333333',
      sectionId: null,
      anchorId: '44444444-4444-4444-8444-444444444444',
      title: null,
      cardType: 'choice',
      sourcePage: 3,
      sourceParagraph: 2,
      sourceQuote: 'FSRS is a scheduling algorithm for spaced repetition.',
      front: 'What is FSRS?',
      back: 'A scheduling algorithm for spaced repetition.',
      tags: ['page-3', 'paragraph-2'],
      confidence: 0.82,
      dedupeKey: 'dedupe-1',
      status: 'pending',
      scoreOverall: 8.7,
      scoreDetails: { accuracy: 9, clarity: 8 },
      visibilityBucket: 'default',
      generationMode: 'llm',
      fallbackReason: null,
      evaluationSummary: '候选卡片质量良好。',
      sourceChunkIds: ['55555555-5555-4555-8555-555555555555'],
      createdAt: '2026-04-21T00:00:00.000Z',
    })

    expect(candidate.cardType).toBe('choice')
    expect(candidate.createdAt).toBeInstanceOf(Date)
  })
})