import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CardStudioPage } from '@/features/cards/CardStudioPage'
import { cardsGateway } from '@/services/gateway/cards'
import type { Card, CardCandidate, WorkflowEvent, WorkflowRun } from '@/types'

const {
  useCardsQueryMock,
  useCardCandidatesQueryMock,
  useCreateCardMutationMock,
  useUpdateCardMutationMock,
  useUpdateCardCandidateMutationMock,
  useBulkUpdateCardCandidateStatusesMutationMock,
  useResumeCardGenerationMutationMock,
  useFinalizeCardGenerationMutationMock,
  useRecentWorkflowRunsQueryMock,
  useWorkflowEventsQueryMock,
} = vi.hoisted(() => ({
  useCardsQueryMock: vi.fn(),
  useCardCandidatesQueryMock: vi.fn(),
  useCreateCardMutationMock: vi.fn(),
  useUpdateCardMutationMock: vi.fn(),
  useUpdateCardCandidateMutationMock: vi.fn(),
  useBulkUpdateCardCandidateStatusesMutationMock: vi.fn(),
  useResumeCardGenerationMutationMock: vi.fn(),
  useFinalizeCardGenerationMutationMock: vi.fn(),
  useRecentWorkflowRunsQueryMock: vi.fn(),
  useWorkflowEventsQueryMock: vi.fn(),
}))

vi.mock('@/queries/cards', async () => {
  const actual = await vi.importActual<typeof import('@/queries/cards')>('@/queries/cards')
  return {
    ...actual,
    useCardsQuery: useCardsQueryMock,
    useCardCandidatesQuery: useCardCandidatesQueryMock,
    useCreateCardMutation: useCreateCardMutationMock,
    useUpdateCardMutation: useUpdateCardMutationMock,
    useUpdateCardCandidateMutation: useUpdateCardCandidateMutationMock,
    useBulkUpdateCardCandidateStatusesMutation: useBulkUpdateCardCandidateStatusesMutationMock,
    useResumeCardGenerationMutation: useResumeCardGenerationMutationMock,
    useFinalizeCardGenerationMutation: useFinalizeCardGenerationMutationMock,
  }
})

vi.mock('@/queries/orchestration', async () => {
  const actual =
    await vi.importActual<typeof import('@/queries/orchestration')>('@/queries/orchestration')
  return {
    ...actual,
    useRecentWorkflowRunsQuery: useRecentWorkflowRunsQueryMock,
    useWorkflowEventsQuery: useWorkflowEventsQueryMock,
  }
})

vi.mock('@/services/gateway/cards', async () => {
  const actual = await vi.importActual<typeof import('@/services/gateway/cards')>(
    '@/services/gateway/cards'
  )
  return {
    ...actual,
    cardsGateway: {
      ...actual.cardsGateway,
      importApkg: vi.fn(),
      pickAndExportApkg: vi.fn(),
      pickAndExportCsv: vi.fn(),
      uploadCardMedia: vi.fn(),
    },
  }
})

vi.mock('@/components/cards/CardEditorModal', () => ({
  CardEditorModal: ({ card, onSave }: { card?: Card | null; onSave: (data: unknown) => void }) => (
    <div data-testid="mock-card-editor">
      <span>{card ? '编辑模式' : '创建模式'}</span>
      <button
        onClick={() =>
          void onSave({
            front: card ? '编辑后的问题' : '新建的问题',
            back: card ? '编辑后的答案' : '新建的答案',
            tags: ['tag-a'],
            cardType: card?.cardType ?? 'qa',
            mediaFilePaths: [],
          })
        }
      >
        提交编辑器
      </button>
    </div>
  ),
}))

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
    front: '锚点问题',
    back: '锚点答案',
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
    approvalPayload: {
      documentTitle: 'Mock 文档',
      phase: 'waiting_confirmation',
      generationMode: 'llm',
      fallbackReason: null,
      chunkCursor: 4,
      totalChunks: 4,
      generatedCount: 2,
      duplicateCount: 0,
      pendingCount: 1,
      acceptedCount: 0,
      rejectedCount: 0,
    },
    costUsd: null,
    errorMessage: null,
    startedAt: new Date('2026-04-21T00:00:00.000Z'),
    finishedAt: null,
    createdAt: new Date('2026-04-21T00:00:00.000Z'),
    updatedAt: new Date('2026-04-21T00:00:00.000Z'),
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

function makeWorkflowEvent(overrides: Partial<WorkflowEvent> = {}): WorkflowEvent {
  return {
    runId: '99999999-9999-4999-8999-999999999999',
    eventType: 'waiting_confirmation',
    message: '候选已生成，等待人工确认',
    progress: 1,
    payload: null,
    createdAt: new Date('2026-04-21T00:00:00.000Z'),
    ...overrides,
  }
}

describe('CardStudioPage', () => {
  const refetchMock = vi.fn().mockResolvedValue(undefined)
  const createMutateAsync = vi.fn()
  const updateMutateAsync = vi.fn()
  const updateCandidateMutateAsync = vi.fn()
  const bulkUpdateCandidateStatusesMutateAsync = vi.fn()
  const resumeGenerationMutateAsync = vi.fn()
  const finalizeGenerationMutateAsync = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    useCardsQueryMock.mockReturnValue({
      data: [
        makeCard(),
        makeCard({
          id: '44444444-4444-4444-8444-444444444444',
          front: '布局问题',
          back: '布局答案',
          state: 'review',
        }),
      ],
      isLoading: false,
      refetch: refetchMock,
    })
    useCreateCardMutationMock.mockReturnValue({ isPending: false, mutateAsync: createMutateAsync })
    useUpdateCardMutationMock.mockReturnValue({ isPending: false, mutateAsync: updateMutateAsync })
    useCardCandidatesQueryMock.mockReturnValue({ data: [], isLoading: false })
    useUpdateCardCandidateMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: updateCandidateMutateAsync,
    })
    useBulkUpdateCardCandidateStatusesMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: bulkUpdateCandidateStatusesMutateAsync,
    })
    useResumeCardGenerationMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: resumeGenerationMutateAsync,
    })
    useFinalizeCardGenerationMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: finalizeGenerationMutateAsync,
    })
    useRecentWorkflowRunsQueryMock.mockReturnValue({ data: [], isLoading: false })
    useWorkflowEventsQueryMock.mockReturnValue({ data: [], isLoading: false })
    createMutateAsync.mockResolvedValue(makeCard({ id: '55555555-5555-4555-8555-555555555555' }))
    updateMutateAsync.mockResolvedValue(makeCard())
    updateCandidateMutateAsync.mockResolvedValue(makeCandidate({ status: 'accepted' }))
    bulkUpdateCandidateStatusesMutateAsync.mockResolvedValue(1)
    resumeGenerationMutateAsync.mockResolvedValue(makeWorkflowRun({ status: 'queued' }))
    finalizeGenerationMutateAsync.mockResolvedValue({
      createdCount: 1,
      skippedDuplicates: 0,
      rejectedCount: 0,
      run: makeWorkflowRun({ status: 'completed', checkpointRef: 'completed' }),
    })
    vi.mocked(cardsGateway.importApkg).mockResolvedValue({
      importedCount: 1,
      skippedDuplicates: 0,
      deckName: 'Mock Deck',
    })
    vi.mocked(cardsGateway.pickAndExportApkg).mockResolvedValue({
      deckName: 'Mock Deck',
      cardCount: 2,
      outputPath: 'mock://export.apkg',
      exportedAt: '2026-04-21T00:00:00.000Z',
    })
    vi.mocked(cardsGateway.pickAndExportCsv).mockResolvedValue({
      cardCount: 2,
      outputPath: 'mock://export.csv',
    })
    vi.mocked(cardsGateway.uploadCardMedia).mockResolvedValue({
      id: 'media-1',
      cardId: '55555555-5555-4555-8555-555555555555',
      fileName: 'mock.png',
      mimeType: 'image/png',
      fileSize: null,
      storageKey: 'mock.png',
      createdAt: '2026-04-21T00:00:00.000Z',
    })
  })

  it('filters cards by state and search query', () => {
    render(<CardStudioPage />)

    expect(screen.getByText('锚点问题')).toBeInTheDocument()
    expect(screen.getByText('布局问题')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('card-studio-filter-review'))
    expect(screen.queryByText('锚点问题')).not.toBeInTheDocument()
    expect(screen.getByText('布局问题')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('card-studio-filter-all'))
    fireEvent.change(screen.getByTestId('card-studio-search'), {
      target: { value: '锚点' },
    })

    expect(screen.getByText('锚点问题')).toBeInTheDocument()
    expect(screen.queryByText('布局问题')).not.toBeInTheDocument()
  })

  it('creates a card through the editor modal', async () => {
    render(<CardStudioPage />)

    fireEvent.click(screen.getByRole('button', { name: '+ 新建卡片' }))
    fireEvent.click(screen.getByRole('button', { name: '提交编辑器' }))

    await waitFor(() => {
      expect(createMutateAsync).toHaveBeenCalledWith({
        front: '新建的问题',
        back: '新建的答案',
        tags: ['tag-a'],
        cardType: 'qa',
      })
    })
  })

  it('updates an existing card through edit mode', async () => {
    render(<CardStudioPage />)

    fireEvent.click(screen.getByTestId('card-studio-edit-33333333-3333-4333-8333-333333333333'))
    fireEvent.click(screen.getByRole('button', { name: '提交编辑器' }))

    await waitFor(() => {
      expect(updateMutateAsync).toHaveBeenCalledWith({
        id: '33333333-3333-4333-8333-333333333333',
        data: {
          front: '编辑后的问题',
          back: '编辑后的答案',
          tags: ['tag-a'],
          cardType: 'qa',
        },
      })
    })
  })

  it('runs import and shows status feedback', async () => {
    render(<CardStudioPage />)

    fireEvent.click(screen.getByRole('button', { name: '导入 APKG' }))

    await waitFor(() => {
      expect(cardsGateway.importApkg).toHaveBeenCalled()
      expect(screen.getByTestId('card-studio-status')).toHaveTextContent('导入成功: 1 张卡片')
    })
  })

  it('accepts a generated candidate from the review batch', async () => {
    useRecentWorkflowRunsQueryMock.mockReturnValue({
      data: [makeWorkflowRun()],
      isLoading: false,
    })
    useCardCandidatesQueryMock.mockReturnValue({
      data: [makeCandidate()],
      isLoading: false,
    })
    useWorkflowEventsQueryMock.mockReturnValue({
      data: [makeWorkflowEvent()],
      isLoading: false,
    })

    render(<CardStudioPage />)

    fireEvent.click(screen.getByRole('button', { name: '接受' }))

    await waitFor(() => {
      expect(updateCandidateMutateAsync).toHaveBeenCalledWith({
        id: '88888888-8888-4888-8888-888888888888',
        data: { status: 'accepted' },
      })
    })
  })

  it('finalizes a reviewed workflow batch when no pending candidates remain', async () => {
    useRecentWorkflowRunsQueryMock.mockReturnValue({
      data: [
        makeWorkflowRun({
          approvalPayload: {
            documentTitle: 'Mock 文档',
            phase: 'waiting_confirmation',
            generationMode: 'llm',
            fallbackReason: null,
            chunkCursor: 4,
            totalChunks: 4,
            generatedCount: 2,
            duplicateCount: 0,
            pendingCount: 0,
            acceptedCount: 1,
            rejectedCount: 1,
          },
        }),
      ],
      isLoading: false,
    })
    useCardCandidatesQueryMock.mockReturnValue({
      data: [makeCandidate({ status: 'accepted' })],
      isLoading: false,
    })

    render(<CardStudioPage />)

    fireEvent.click(screen.getByTestId('card-studio-finalize-generation'))

    await waitFor(() => {
      expect(finalizeGenerationMutateAsync).toHaveBeenCalledWith(
        '99999999-9999-4999-8999-999999999999'
      )
    })
  })
})
