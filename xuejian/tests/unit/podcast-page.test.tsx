import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PodcastPage } from '@/features/podcast/PodcastPage'

vi.mock('@/components/podcast/PodcastPlayerModal', () => ({
  PodcastPlayerModal: () => null,
}))

vi.mock('@/queries', async () => {
  const actual = await vi.importActual<typeof import('@/queries')>('@/queries')
  return {
    ...actual,
    useAppSettingsQuery: vi.fn(),
    useCancelPodcastMutation: vi.fn(),
    useDeletePodcastMutation: vi.fn(),
    useDocumentsQuery: vi.fn(),
    usePodcastAudioSegmentsQuery: vi.fn(),
    usePodcastEpisodeQuery: vi.fn(),
    usePodcastEpisodesQuery: vi.fn(),
    useRetryPodcastMutation: vi.fn(),
    useStartPodcastMutation: vi.fn(),
  }
})

import * as queries from '@/queries'

const mockedQueries = vi.mocked(queries)

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedQueries.useAppSettingsQuery.mockReturnValue({
    data: {
      reviewTimeLimit: 30,
      podcastTtsProvider: 'auto',
      podcastGoogleTtsModel: 'gemini-2.5-flash-preview-tts',
      podcastOutputFormat: 'mp3',
    },
  } as ReturnType<typeof queries.useAppSettingsQuery>)
  mockedQueries.useDocumentsQuery.mockReturnValue({
    data: [{ id: 'doc-1', title: 'Memory 101', status: 'ready', pageCount: 12 }],
  } as ReturnType<typeof queries.useDocumentsQuery>)
  mockedQueries.usePodcastEpisodesQuery.mockReturnValue({
    data: [
      {
        id: 'episode-1',
        documentIds: ['doc-1'],
        runId: 'run-1',
        title: 'Podcast Episode',
        scopeDescription: 'overview',
        style: 'lecture',
        language: 'zh-CN',
        durationTier: 'medium',
        ttsProvider: 'auto',
        audioFormat: 'mp3',
        scriptJson:
          '{"segments":[{"id":"seg-1","speaker":"Host","text":"First line","durationMs":12000}]}',
        outlineJson:
          '{"segments":[{"segmentIndex":0,"topic":"Memory","keyPoints":["Recall"],"targetDurationMs":30000,"speakerAssignments":[{"speakerId":"host","role":"host"}]}],"totalTargetDurationMs":30000}',
        evaluationJson:
          '{"coherence":8.2,"accuracy":8.5,"styleConsistency":7.8,"naturalness":8.0,"overallScore":8.1,"issues":[],"suggestions":[],"revised":false}',
        audioPath: null,
        durationMs: 30000,
        status: 'awaiting_review',
        stageKey: 'awaiting_review',
        errorMessage: null,
        errorCode: null,
        errorStage: null,
        retryable: true,
        currentStage: 4,
        completedSegments: 1,
        totalSegments: 2,
        createdAt: '2026-04-22T12:00:00.000Z',
        updatedAt: '2026-04-22T12:10:00.000Z',
      },
    ],
  } as ReturnType<typeof queries.usePodcastEpisodesQuery>)
  mockedQueries.usePodcastEpisodeQuery.mockReturnValue({
    data: undefined,
  } as ReturnType<typeof queries.usePodcastEpisodeQuery>)
  mockedQueries.usePodcastAudioSegmentsQuery.mockReturnValue({
    data: [],
  } as ReturnType<typeof queries.usePodcastAudioSegmentsQuery>)
  mockedQueries.useStartPodcastMutation.mockReturnValue({
    isPending: false,
    mutateAsync: vi.fn(),
  } as ReturnType<typeof queries.useStartPodcastMutation>)
  mockedQueries.useCancelPodcastMutation.mockReturnValue({
    isPending: false,
    mutateAsync: vi.fn(),
  } as ReturnType<typeof queries.useCancelPodcastMutation>)
  mockedQueries.useDeletePodcastMutation.mockReturnValue({
    isPending: false,
    mutateAsync: vi.fn(),
  } as ReturnType<typeof queries.useDeletePodcastMutation>)
  mockedQueries.useRetryPodcastMutation.mockReturnValue({
    isPending: false,
    mutateAsync: vi.fn(),
  } as ReturnType<typeof queries.useRetryPodcastMutation>)
})

describe('PodcastPage', () => {
  it('renders the simplified autonomous workspace', () => {
    renderWithProviders(<PodcastPage />)

    expect(screen.getByTestId('podcast-page')).toBeInTheDocument()
    expect(screen.getByTestId('podcast-toolbar')).toBeInTheDocument()
    expect(screen.getByTestId('podcast-main-stage')).toBeInTheDocument()
    expect(screen.getByTestId('podcast-detail-rail')).toBeInTheDocument()
    expect(screen.getAllByText('Memory 101')).toHaveLength(2)
    expect(screen.getAllByRole('button')).not.toHaveLength(0)
    expect(screen.queryByText(/budget/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/balance/i)).not.toBeInTheDocument()
  })
})
