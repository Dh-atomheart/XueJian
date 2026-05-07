import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDocumentImport } from '@/features/documents/useDocumentImport'
import { cardsGateway } from '@/services/gateway/cards'
import { documentGateway } from '@/services/gateway/documents'
import { embeddingProfileGateway } from '@/services/gateway/models'
import type { BackgroundJob, Document } from '@/types'

const importedDocument: Document = {
  id: '22222222-2222-4222-8222-222222222222',
  title: 'Test Document.pdf',
  filePath: 'C:/docs/test.pdf',
  fileType: 'pdf',
  fileSize: 1024,
  pageCount: null,
  contentHash: 'hash-1',
  status: 'uploading',
  createdAt: new Date('2026-04-19T10:00:00.000Z'),
  updatedAt: new Date('2026-04-19T10:00:00.000Z'),
}

const parsedDocument: Document = {
  ...importedDocument,
  pageCount: 2,
  status: 'parsed',
  updatedAt: new Date('2026-04-19T10:01:00.000Z'),
}

const readyDocument: Document = {
  ...parsedDocument,
  status: 'ready',
  updatedAt: new Date('2026-04-19T10:02:00.000Z'),
}

const activeEmbeddingProfile = {
  id: 'profile-1',
  provider: 'custom_openai',
  model: 'embedding-model',
  dimensions: 1024,
  distanceMetric: 'cosine',
  isActive: true,
  revision: 1,
  createdAt: new Date('2026-04-19T10:00:00.000Z'),
}

function makeBackgroundJob(overrides: Partial<BackgroundJob> = {}): BackgroundJob {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    jobType: 'document_embedding',
    status: 'succeeded',
    targetType: 'document',
    targetId: parsedDocument.id,
    payloadJson: '{}',
    resultJson: null,
    errorMessage: null,
    errorDetails: null,
    progressCurrent: 2,
    progressTotal: 2,
    progressMessage: 'done',
    createdAt: new Date('2026-04-19T10:01:00.000Z'),
    startedAt: new Date('2026-04-19T10:01:00.000Z'),
    finishedAt: new Date('2026-04-19T10:02:00.000Z'),
    cancelRequestedAt: null,
    ...overrides,
  }
}

function makeCardGenerationRun() {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    workflowType: 'card_generation' as const,
    presetId: 'm3-card-production-line',
    status: 'queued' as const,
    threadId: `card-generation:${parsedDocument.id}`,
    checkpointRef: 'queued',
    approvalPayload: null,
    costUsd: null,
    errorMessage: null,
    startedAt: null,
    finishedAt: null,
    createdAt: new Date('2026-04-19T10:02:00.000Z'),
    updatedAt: new Date('2026-04-19T10:02:00.000Z'),
  }
}

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

function ImportHarness() {
  const importState = useDocumentImport()

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          void importState.importDocument()
        }}
      >
        import
      </button>
      {importState.error ? <p>{importState.error}</p> : null}
      {importState.message ? <p>{importState.message}</p> : null}
      {importState.warnings.map((warning) => (
        <p key={warning}>{warning}</p>
      ))}
      {importState.actions.map((action) => (
        <button key={`${action.id}-${action.documentId ?? 'default'}`} type="button">
          {action.label}
        </button>
      ))}
    </div>
  )
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useDocumentImport', () => {
  it('does not crash when the native file picker is cancelled', async () => {
    const queryClient = createTestQueryClient()
    const pickAndImportSpy = vi.spyOn(documentGateway, 'pickAndImportDocument')

    render(
      <QueryClientProvider client={queryClient}>
        <ImportHarness />
      </QueryClientProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: 'import' }))

    await waitFor(() => {
      expect(pickAndImportSpy).toHaveBeenCalled()
    })
  })

  it('runs backend parsing but blocks automation when embedding profile is missing', async () => {
    const queryClient = createTestQueryClient()

    vi.spyOn(documentGateway, 'pickAndImportDocument').mockResolvedValue(importedDocument)
    vi.spyOn(documentGateway, 'runParseWorkflow').mockResolvedValue(parsedDocument)
    vi.spyOn(embeddingProfileGateway, 'getActive').mockResolvedValue(null)
    const embeddingSpy = vi.spyOn(documentGateway, 'startEmbeddingJob')
    const generationSpy = vi.spyOn(cardsGateway, 'startGeneration')
    const deleteSpy = vi.spyOn(documentGateway, 'delete')
    const updateStatusSpy = vi.spyOn(documentGateway, 'updateStatus')

    render(
      <QueryClientProvider client={queryClient}>
        <ImportHarness />
      </QueryClientProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: 'import' }))

    await waitFor(() => {
      expect(documentGateway.runParseWorkflow).toHaveBeenCalledWith(importedDocument.id)
      expect(screen.getByText('导入完成，但需要先配置向量模型。')).toBeInTheDocument()
    })
    expect(embeddingSpy).not.toHaveBeenCalled()
    expect(generationSpy).not.toHaveBeenCalled()
    expect(deleteSpy).not.toHaveBeenCalled()
    expect(updateStatusSpy).not.toHaveBeenCalledWith(importedDocument.id, 'parsed')
    expect(screen.getByText('前往设置补全 embedding 模型')).toBeInTheDocument()
  })

  it('waits for embedding completion before starting card generation', async () => {
    const queryClient = createTestQueryClient()

    vi.spyOn(documentGateway, 'pickAndImportDocument').mockResolvedValue(importedDocument)
    vi.spyOn(documentGateway, 'runParseWorkflow').mockResolvedValue(parsedDocument)
    vi.spyOn(documentGateway, 'startEmbeddingJob').mockResolvedValue(
      makeBackgroundJob({ status: 'running', progressCurrent: 0 })
    )
    vi.spyOn(documentGateway, 'get').mockResolvedValue(readyDocument)
    vi.spyOn(embeddingProfileGateway, 'getActive').mockResolvedValue(activeEmbeddingProfile)
    vi.spyOn(cardsGateway, 'getBackgroundJob').mockResolvedValue(makeBackgroundJob())
    vi.spyOn(cardsGateway, 'startGeneration').mockResolvedValue(makeCardGenerationRun())

    render(
      <QueryClientProvider client={queryClient}>
        <ImportHarness />
      </QueryClientProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: 'import' }))

    await waitFor(() => {
      expect(documentGateway.startEmbeddingJob).toHaveBeenCalledWith(parsedDocument.id)
    })
    await waitFor(() => {
      expect(cardsGateway.startGeneration).toHaveBeenCalledWith(readyDocument.id)
    })
    expect(cardsGateway.getBackgroundJob).toHaveBeenCalledWith('33333333-3333-4333-8333-333333333333')
    expect(vi.mocked(cardsGateway.getBackgroundJob).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(cardsGateway.startGeneration).mock.invocationCallOrder[0]
    )
  })

  it('keeps the imported document when backend parsing fails', async () => {
    const queryClient = createTestQueryClient()

    vi.spyOn(documentGateway, 'pickAndImportDocument').mockResolvedValue(importedDocument)
    vi.spyOn(documentGateway, 'runParseWorkflow').mockRejectedValue(new Error('parse failed'))
    vi.spyOn(documentGateway, 'updateStatus').mockResolvedValue()
    const deleteSpy = vi.spyOn(documentGateway, 'delete')
    const generationSpy = vi.spyOn(cardsGateway, 'startGeneration')

    render(
      <QueryClientProvider client={queryClient}>
        <ImportHarness />
      </QueryClientProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: 'import' }))

    await waitFor(() => {
      expect(documentGateway.updateStatus).toHaveBeenCalledWith(importedDocument.id, 'error')
    })
    expect(deleteSpy).not.toHaveBeenCalled()
    expect(generationSpy).not.toHaveBeenCalled()
  })

  it('finishes import if automatic card generation fails after embedding succeeds', async () => {
    const queryClient = createTestQueryClient()

    vi.spyOn(documentGateway, 'pickAndImportDocument').mockResolvedValue(importedDocument)
    vi.spyOn(documentGateway, 'runParseWorkflow').mockResolvedValue(parsedDocument)
    vi.spyOn(documentGateway, 'startEmbeddingJob').mockResolvedValue(makeBackgroundJob())
    vi.spyOn(documentGateway, 'get').mockResolvedValue(readyDocument)
    vi.spyOn(embeddingProfileGateway, 'getActive').mockResolvedValue(activeEmbeddingProfile)
    vi.spyOn(cardsGateway, 'startGeneration').mockRejectedValue(new Error('generation unavailable'))

    render(
      <QueryClientProvider client={queryClient}>
        <ImportHarness />
      </QueryClientProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: 'import' }))

    await waitFor(() => {
      expect(screen.getByText('导入完成，但还有 1 项后续处理需要完成。')).toBeInTheDocument()
    })
    expect(screen.getByText(/自动卡片生成没有成功启动/)).toBeInTheDocument()
    expect(screen.getByText('前往卡片页手动处理')).toBeInTheDocument()
  })

  it('stops automatic card generation when embedding fails', async () => {
    const queryClient = createTestQueryClient()

    vi.spyOn(documentGateway, 'pickAndImportDocument').mockResolvedValue(importedDocument)
    vi.spyOn(documentGateway, 'runParseWorkflow').mockResolvedValue(parsedDocument)
    vi.spyOn(documentGateway, 'startEmbeddingJob').mockResolvedValue(
      makeBackgroundJob({ status: 'failed', errorMessage: 'embedding provider failed' })
    )
    vi.spyOn(documentGateway, 'get').mockResolvedValue(parsedDocument)
    vi.spyOn(embeddingProfileGateway, 'getActive').mockResolvedValue(activeEmbeddingProfile)
    const generationSpy = vi.spyOn(cardsGateway, 'startGeneration')

    render(
      <QueryClientProvider client={queryClient}>
        <ImportHarness />
      </QueryClientProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: 'import' }))

    await waitFor(() => {
      expect(screen.getByText('导入完成，但向量生成需要重试。')).toBeInTheDocument()
    })
    expect(generationSpy).not.toHaveBeenCalled()
    expect(screen.getByText(/文档向量生成没有成功/)).toBeInTheDocument()
    expect(screen.getByText('回到文档库重试向量化')).toBeInTheDocument()
  })
})
