import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cardsQueryKeys,
  useCreateCardMutation,
  useFinalizeCardGenerationMutation,
  useResumeAiCardGenerationMutation,
  useUpdateCardCandidateMutation,
  useUpdateCardMutation,
} from '@/queries/cards'
import { orchestrationQueryKeys } from '@/queries/orchestration'
import { cardsGateway } from '@/services/gateway/cards'
import type { BackgroundJob, Card, CardCandidate, WorkflowRun } from '@/types'

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    groupId: null,
    title: null,
    cardType: 'qa',
    clusterId: null,
    exportGuid: null,
    documentId: null,
    anchorId: null,
    front: '问题',
    back: '答案',
    sourcePage: null,
    sourceParagraph: null,
    sourceCoordinates: null,
    tags: [],
    difficulty: 0.3,
    stability: 1,
    retrievability: null,
    state: 'new',
    nextReview: null,
    createdAt: new Date('2026-04-21T00:00:00.000Z'),
    updatedAt: new Date('2026-04-21T00:00:00.000Z'),
    ...overrides,
  }
}

function makeWorkflowRun(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id: '99999999-9999-4999-8999-999999999999',
    workflowType: 'card_generation',
    presetId: 'm3-card-production-line',
    status: 'waiting_confirmation',
    threadId: 'card-generation:mock',
    checkpointRef: 'waiting_confirmation',
    approvalPayload: null,
    costUsd: null,
    errorMessage: null,
    startedAt: new Date('2026-04-21T00:00:00.000Z'),
    finishedAt: null,
    createdAt: new Date('2026-04-21T00:00:00.000Z'),
    updatedAt: new Date('2026-04-21T00:00:00.000Z'),
    ...overrides,
  }
}

function makeBackgroundJob(overrides: Partial<BackgroundJob> = {}): BackgroundJob {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    jobType: 'ai_card_generation',
    status: 'queued',
    targetType: 'document',
    targetId: '22222222-2222-4222-8222-222222222222',
    payloadJson: '{}',
    resultJson: null,
    errorMessage: null,
    errorDetails: null,
    progressCurrent: 1,
    progressTotal: 3,
    progressMessage: 'resume queued',
    createdAt: new Date('2026-04-21T00:00:00.000Z'),
    startedAt: null,
    finishedAt: null,
    cancelRequestedAt: null,
    ...overrides,
  }
}

function makeCandidate(overrides: Partial<CardCandidate> = {}): CardCandidate {
  return {
    id: '88888888-8888-4888-8888-888888888888',
    workflowRunId: '99999999-9999-4999-8999-999999999999',
    documentId: '22222222-2222-4222-8222-222222222222',
    sectionId: null,
    anchorId: null,
    title: null,
    cardType: 'qa',
    sourcePage: 1,
    sourceParagraph: 1,
    sourceQuote: '候选原文',
    front: '候选问题',
    back: '候选答案',
    tags: ['候选'],
    confidence: 0.92,
    dedupeKey: 'candidate-dedupe',
    status: 'pending',
    scoreOverall: 92,
    scoreDetails: { clarity: 0.9 },
    visibilityBucket: 'default',
    generationMode: 'llm',
    fallbackReason: null,
    evaluationSummary: '结构完整，适合直接复习。',
    sourceChunkIds: null,
    createdAt: new Date('2026-04-21T00:00:00.000Z'),
    ...overrides,
  }
}

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('card query mutations', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('invalidates card queries after create', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    vi.spyOn(cardsGateway, 'create').mockResolvedValue(makeCard())

    const wrapper = createWrapper(queryClient)

    const { result } = renderHook(() => useCreateCardMutation(), { wrapper })
    await result.current.mutateAsync({ front: '新问题', back: '新答案', cardType: 'qa' })

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: cardsQueryKeys.all })
    })
  })

  it('invalidates card queries after update', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    vi.spyOn(cardsGateway, 'update').mockResolvedValue(makeCard({ front: '已更新问题' }))

    const wrapper = createWrapper(queryClient)

    const { result } = renderHook(() => useUpdateCardMutation(), { wrapper })
    await result.current.mutateAsync({
      id: '33333333-3333-4333-8333-333333333333',
      data: { front: '已更新问题', back: '已更新答案', cardType: 'qa' },
    })

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: cardsQueryKeys.all })
    })
  })

  it('invalidates card and orchestration queries after candidate update', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    vi.spyOn(cardsGateway, 'updateCandidate').mockResolvedValue(
      makeCandidate({ status: 'accepted' })
    )

    const wrapper = createWrapper(queryClient)

    const { result } = renderHook(() => useUpdateCardCandidateMutation(), { wrapper })
    await result.current.mutateAsync({
      id: '88888888-8888-4888-8888-888888888888',
      data: { status: 'accepted' },
    })

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: cardsQueryKeys.all })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: orchestrationQueryKeys.all })
    })
  })

  it('invalidates card and orchestration queries after workflow finalize', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    vi.spyOn(cardsGateway, 'finalizeGeneration').mockResolvedValue({
      createdCount: 1,
      skippedDuplicates: 0,
      rejectedCount: 0,
      run: makeWorkflowRun({ status: 'completed', checkpointRef: 'completed' }),
    })

    const wrapper = createWrapper(queryClient)

    const { result } = renderHook(() => useFinalizeCardGenerationMutation(), { wrapper })
    await result.current.mutateAsync('99999999-9999-4999-8999-999999999999')

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: cardsQueryKeys.all })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: orchestrationQueryKeys.all })
    })
  })

  it('invalidates card queries after AI generation resume', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    vi.spyOn(cardsGateway, 'resumeAiCardGeneration').mockResolvedValue(makeBackgroundJob())

    const wrapper = createWrapper(queryClient)

    const { result } = renderHook(() => useResumeAiCardGenerationMutation(), { wrapper })
    await result.current.mutateAsync('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: cardsQueryKeys.all })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['basic-cards'] })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['documents'] })
    })
  })
})
