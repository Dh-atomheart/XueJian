import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CardStudioPage } from '@/features/cards/CardStudioPage'
import { cardsGateway } from '@/services/gateway/cards'
import { useAppUiStore } from '@/store'
import type { CardCandidate, Document, WorkflowRun } from '@/types'

const {
  useDocumentsQueryMock,
  useRecentWorkflowRunsQueryMock,
  useDocumentAnchorsQueryMock,
  useDocumentChunksQueryMock,
  useCardCandidatesQueryMock,
  useWorkflowCheckpointQueryMock,
  useWorkflowEventsQueryMock,
} = vi.hoisted(() => ({
  useDocumentsQueryMock: vi.fn(),
  useRecentWorkflowRunsQueryMock: vi.fn(),
  useDocumentAnchorsQueryMock: vi.fn(),
  useDocumentChunksQueryMock: vi.fn(),
  useCardCandidatesQueryMock: vi.fn(),
  useWorkflowCheckpointQueryMock: vi.fn(),
  useWorkflowEventsQueryMock: vi.fn(),
}))

vi.mock('@/queries', () => ({
  cardsQueryKeys: { all: ['cards'] },
  documentsQueryKeys: { all: ['documents'] },
  orchestrationQueryKeys: { all: ['orchestration'] },
  useDocumentsQuery: useDocumentsQueryMock,
  useRecentWorkflowRunsQuery: useRecentWorkflowRunsQueryMock,
  useDocumentAnchorsQuery: useDocumentAnchorsQueryMock,
  useDocumentChunksQuery: useDocumentChunksQueryMock,
  useCardCandidatesQuery: useCardCandidatesQueryMock,
  useWorkflowCheckpointQuery: useWorkflowCheckpointQueryMock,
  useWorkflowEventsQuery: useWorkflowEventsQueryMock,
}))

vi.mock('@/services/gateway/cards', async () => {
  const actual = await vi.importActual<typeof import('@/services/gateway/cards')>(
    '@/services/gateway/cards'
  )
  return {
    ...actual,
    cardsGateway: {
      ...actual.cardsGateway,
      startGeneration: vi.fn(),
      resumeGeneration: vi.fn(),
      finalizeGeneration: vi.fn(),
      updateCandidate: vi.fn(),
      bulkUpdateCandidateStatuses: vi.fn(),
    },
  }
})

function makeDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    title: 'Mock Notes.pdf',
    filePath: 'mock://documents/mock-notes.pdf',
    fileType: 'pdf',
    fileSize: 1024,
    pageCount: 12,
    contentHash: 'hash-1',
    status: 'ready',
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
      documentId: '22222222-2222-4222-8222-222222222222',
      documentTitle: 'Mock Notes.pdf',
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

function renderCardStudioPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <CardStudioPage />
    </QueryClientProvider>
  )
}

function resetUiState() {
  useAppUiStore.setState({
    activeNavItem: 'home',
    activeSettingsSection: 'ai',
    isContextRailOpen: true,
    feedbackLog: [],
    activeNotices: [],
    isFeedbackPanelOpen: false,
    reader: {
      documentId: null,
      currentPage: 1,
      totalPages: 0,
      scale: 1.25,
      selectedHighlightId: null,
      hoveredHighlightId: null,
      selectedCardId: null,
      annotationScope: 'page',
      annotationFilterTags: [],
      isLinkingMode: false,
      linkingCardId: null,
    },
  })
}

describe('CardStudioPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetUiState()

    useDocumentsQueryMock.mockReturnValue({ data: [], isLoading: false })
    useRecentWorkflowRunsQueryMock.mockReturnValue({ data: [], isLoading: false })
    useDocumentAnchorsQueryMock.mockReturnValue({ data: [], isLoading: false })
    useDocumentChunksQueryMock.mockReturnValue({ data: [], isLoading: false })
    useCardCandidatesQueryMock.mockReturnValue({ data: [], isLoading: false })
    useWorkflowCheckpointQueryMock.mockReturnValue({ data: null, isLoading: false })
    useWorkflowEventsQueryMock.mockReturnValue({ data: [], isLoading: false })

    vi.mocked(cardsGateway.startGeneration).mockResolvedValue(makeWorkflowRun({ status: 'queued' }))
    vi.mocked(cardsGateway.resumeGeneration).mockResolvedValue(makeWorkflowRun({ status: 'running' }))
    vi.mocked(cardsGateway.finalizeGeneration).mockResolvedValue({
      createdCount: 1,
      skippedDuplicates: 0,
      rejectedCount: 0,
      run: makeWorkflowRun({ status: 'completed', checkpointRef: 'completed' }),
    })
    vi.mocked(cardsGateway.updateCandidate).mockResolvedValue(makeCandidate({ status: 'accepted' }))
    vi.mocked(cardsGateway.bulkUpdateCandidateStatuses).mockResolvedValue(1)
  })

  it('shows the document-import empty state when no ready documents exist', () => {
    renderCardStudioPage()

    expect(screen.getByText('先导入并解析文档，才能开始卡片生产。')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '前往文档库' }))
    expect(useAppUiStore.getState().activeNavItem).toBe('library')
  })

  it('starts generation for the selected ready document', async () => {
    useDocumentsQueryMock.mockReturnValue({
      data: [makeDocument()],
      isLoading: false,
    })
    useDocumentAnchorsQueryMock.mockReturnValue({ data: [{ id: 'a1' }, { id: 'a2' }], isLoading: false })
    useDocumentChunksQueryMock.mockReturnValue({
      data: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }],
      isLoading: false,
    })

    renderCardStudioPage()

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '18' } })
    fireEvent.click(screen.getByRole('button', { name: '生成候选卡片' }))

    await waitFor(() => {
      expect(cardsGateway.startGeneration).toHaveBeenCalledWith(
        '22222222-2222-4222-8222-222222222222',
        18
      )
    })
  })

  it('updates a candidate, resumes the workflow, and finalizes the batch', async () => {
    useDocumentsQueryMock.mockReturnValue({
      data: [makeDocument()],
      isLoading: false,
    })
    useRecentWorkflowRunsQueryMock.mockReturnValue({
      data: [makeWorkflowRun({ status: 'running' })],
      isLoading: false,
    })
    useDocumentAnchorsQueryMock.mockReturnValue({ data: [{ id: 'a1' }], isLoading: false })
    useDocumentChunksQueryMock.mockReturnValue({ data: [{ id: 'c1' }], isLoading: false })
    useCardCandidatesQueryMock.mockReturnValue({
      data: [makeCandidate()],
      isLoading: false,
    })
    useWorkflowCheckpointQueryMock.mockReturnValue({
      data: { id: 'cp-1', runId: '99999999-9999-4999-8999-999999999999', checkpointRef: 'waiting_confirmation', stepKey: null, payload: { phase: 'waiting_confirmation' }, createdAt: new Date('2026-04-21T00:00:00.000Z'), updatedAt: new Date('2026-04-21T00:00:00.000Z') },
      isLoading: false,
    })

    renderCardStudioPage()

    fireEvent.click(screen.getByRole('button', { name: '接受' }))
    fireEvent.click(screen.getByRole('button', { name: '从检查点恢复' }))
    fireEvent.click(screen.getByRole('button', { name: '确认并入库' }))

    await waitFor(() => {
      expect(cardsGateway.updateCandidate).toHaveBeenCalledWith(
        '88888888-8888-4888-8888-888888888888',
        { status: 'accepted' }
      )
      expect(cardsGateway.resumeGeneration).toHaveBeenCalledWith(
        '99999999-9999-4999-8999-999999999999'
      )
      expect(cardsGateway.finalizeGeneration).toHaveBeenCalledWith(
        '99999999-9999-4999-8999-999999999999'
      )
    })
  })
})
