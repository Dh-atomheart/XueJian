import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CardStudioPage } from '@/features/cards/CardStudioPage'
import { cardsGateway } from '@/services/gateway/cards'
import { useAppUiStore } from '@/store'
import type { Card, Document, WorkflowRun } from '@/types'

const {
  useDocumentsQueryMock,
  useCardsQueryMock,
  useCardCandidatesQueryMock,
  useRecentWorkflowRunsQueryMock,
  useWorkflowEventsQueryMock,
  useUpdateCardCandidateMutationMock,
  useBulkUpdateCardCandidateStatusesMutationMock,
  useFinalizeCardGenerationMutationMock,
} = vi.hoisted(() => ({
  useDocumentsQueryMock: vi.fn(),
  useCardsQueryMock: vi.fn(),
  useCardCandidatesQueryMock: vi.fn(),
  useRecentWorkflowRunsQueryMock: vi.fn(),
  useWorkflowEventsQueryMock: vi.fn(),
  useUpdateCardCandidateMutationMock: vi.fn(),
  useBulkUpdateCardCandidateStatusesMutationMock: vi.fn(),
  useFinalizeCardGenerationMutationMock: vi.fn(),
}))

vi.mock('@/queries', () => ({
  cardsQueryKeys: { all: ['cards'] },
  documentsQueryKeys: { all: ['documents'] },
  orchestrationQueryKeys: { all: ['orchestration'] },
  useDocumentsQuery: useDocumentsQueryMock,
  useCardsQuery: useCardsQueryMock,
  useCardCandidatesQuery: useCardCandidatesQueryMock,
  useRecentWorkflowRunsQuery: useRecentWorkflowRunsQueryMock,
  useWorkflowEventsQuery: useWorkflowEventsQueryMock,
  useUpdateCardCandidateMutation: useUpdateCardCandidateMutationMock,
  useBulkUpdateCardCandidateStatusesMutation: useBulkUpdateCardCandidateStatusesMutationMock,
  useFinalizeCardGenerationMutation: useFinalizeCardGenerationMutationMock,
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
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      listCardMedia: vi.fn(),
      uploadCardMedia: vi.fn(),
      deleteCardMedia: vi.fn(),
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
    status: 'completed',
    threadId: 'card-generation:mock',
    checkpointRef: 'completed',
    approvalPayload: {
      documentId: '22222222-2222-4222-8222-222222222222',
      documentTitle: 'Mock Notes.pdf',
      phase: 'completed',
      generatedCount: 2,
    },
    costUsd: null,
    errorMessage: null,
    startedAt: new Date('2026-04-21T00:00:00.000Z'),
    finishedAt: new Date('2026-04-21T00:01:00.000Z'),
    createdAt: new Date('2026-04-21T00:00:00.000Z'),
    updatedAt: new Date('2026-04-21T00:01:00.000Z'),
    ...overrides,
  }
}

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: '88888888-8888-4888-8888-888888888888',
    groupId: null,
    title: null,
    cardType: 'qa',
    clusterId: null,
    exportGuid: null,
    documentId: '22222222-2222-4222-8222-222222222222',
    anchorId: null,
    front: 'What is FSRS?',
    back: 'A scheduling algorithm for spaced repetition.',
    sourcePage: 1,
    sourceParagraph: 1,
    sourceCoordinates: null,
    tags: ['memory'],
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
    useCardsQueryMock.mockReturnValue({ data: [], isLoading: false })
    useCardCandidatesQueryMock.mockReturnValue({ data: [], isLoading: false })
    useRecentWorkflowRunsQueryMock.mockReturnValue({ data: [], isLoading: false })
    useWorkflowEventsQueryMock.mockReturnValue({ data: [], isLoading: false })
    useUpdateCardCandidateMutationMock.mockReturnValue({
      isPending: false,
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
    })
    useBulkUpdateCardCandidateStatusesMutationMock.mockReturnValue({
      isPending: false,
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
    })
    useFinalizeCardGenerationMutationMock.mockReturnValue({
      isPending: false,
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
    })

    vi.mocked(cardsGateway.startGeneration).mockResolvedValue(makeWorkflowRun({ status: 'queued' }))
    vi.mocked(cardsGateway.create).mockResolvedValue(makeCard({ id: '77777777-7777-4777-8777-777777777777' }))
    vi.mocked(cardsGateway.update).mockResolvedValue(makeCard({ front: 'Updated front' }))
    vi.mocked(cardsGateway.delete).mockResolvedValue(undefined)
    vi.mocked(cardsGateway.listCardMedia).mockResolvedValue([])
    vi.mocked(cardsGateway.uploadCardMedia).mockResolvedValue({
      id: 'media-1',
      cardId: '77777777-7777-4777-8777-777777777777',
      fileName: 'image.png',
      mimeType: 'image/png',
      fileSize: 100,
      storageKey: 'image.png',
      createdAt: '2026-04-21T00:00:00.000Z',
    })
    vi.mocked(cardsGateway.deleteCardMedia).mockResolvedValue(undefined)
  })

  it('shows the document-import empty state when no ready documents exist', () => {
    renderCardStudioPage()

    expect(screen.getByText('先导入并解析文档，才能开始生成卡片。')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '前往文档库' }))
    expect(useAppUiStore.getState().activeNavItem).toBe('library')
  })

  it('starts generation for the selected ready document', async () => {
    useDocumentsQueryMock.mockReturnValue({ data: [makeDocument()], isLoading: false })

    renderCardStudioPage()

    fireEvent.change(screen.getByDisplayValue('24'), { target: { value: '18' } })
    fireEvent.click(screen.getByRole('button', { name: '让 Agent 生成卡片' }))

    await waitFor(() => {
      expect(cardsGateway.startGeneration).toHaveBeenCalledWith(
        '22222222-2222-4222-8222-222222222222',
        18
      )
    })
  })

  it('creates, edits, and deletes formal cards', async () => {
    useDocumentsQueryMock.mockReturnValue({ data: [makeDocument()], isLoading: false })
    useCardsQueryMock.mockReturnValue({ data: [makeCard()], isLoading: false })
    useRecentWorkflowRunsQueryMock.mockReturnValue({ data: [makeWorkflowRun()], isLoading: false })

    renderCardStudioPage()

    expect(screen.getByText('What is FSRS?')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '新建卡片' }))
    const createModal = screen.getByTestId('card-editor-modal')
    const createTextareas = within(createModal).getAllByRole('textbox')
    fireEvent.change(createTextareas[0], { target: { value: 'New question?' } })
    fireEvent.change(createTextareas[1], { target: { value: 'New answer.' } })
    fireEvent.click(within(createModal).getByRole('button', { name: /创建|鍒涘缓/ }))

    await waitFor(() => {
      expect(cardsGateway.create).toHaveBeenCalledWith(
        expect.objectContaining({
          front: 'New question?',
          back: 'New answer.',
          documentId: '22222222-2222-4222-8222-222222222222',
        })
      )
    })

    fireEvent.click(
      screen.getByTestId('card-studio-edit-card-88888888-8888-4888-8888-888888888888')
    )
    const editModal = screen.getByTestId('card-editor-modal')
    const editTextareas = within(editModal).getAllByRole('textbox')
    fireEvent.change(editTextareas[0], { target: { value: 'Updated front' } })
    fireEvent.click(within(editModal).getByRole('button', { name: /保存|淇濆瓨/ }))

    await waitFor(() => {
      expect(cardsGateway.update).toHaveBeenCalledWith(
        '88888888-8888-4888-8888-888888888888',
        expect.objectContaining({ front: 'Updated front' })
      )
    })

    fireEvent.click(
      screen.getByTestId('card-studio-delete-card-88888888-8888-4888-8888-888888888888')
    )

    await waitFor(() => {
      expect(cardsGateway.delete).toHaveBeenCalledWith('88888888-8888-4888-8888-888888888888')
    })
  })
})
