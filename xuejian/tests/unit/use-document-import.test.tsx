import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDocumentImport } from '@/features/documents/useDocumentImport'
import { cardsGateway } from '@/services/gateway/cards'
import { documentGateway } from '@/services/gateway/documents'
import { embeddingProfileGateway } from '@/services/gateway/models'
import type { Document } from '@/types'

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

  it('runs backend parsing and starts card generation after import', async () => {
    const queryClient = createTestQueryClient()

    vi.spyOn(documentGateway, 'pickAndImportDocument').mockResolvedValue(importedDocument)
    vi.spyOn(documentGateway, 'runParseWorkflow').mockResolvedValue(parsedDocument)
    vi.spyOn(embeddingProfileGateway, 'getActive').mockResolvedValue(null)
    vi.spyOn(cardsGateway, 'startGeneration').mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      workflowType: 'card_generation',
      presetId: 'm3-card-production-line',
      status: 'queued',
      threadId: `card-generation:${parsedDocument.id}`,
      checkpointRef: 'queued',
      approvalPayload: null,
      costUsd: null,
      errorMessage: null,
      startedAt: null,
      finishedAt: null,
      createdAt: new Date('2026-04-19T10:02:00.000Z'),
      updatedAt: new Date('2026-04-19T10:02:00.000Z'),
    })
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
      expect(cardsGateway.startGeneration).toHaveBeenCalledWith(parsedDocument.id)
    })
    expect(deleteSpy).not.toHaveBeenCalled()
    expect(updateStatusSpy).not.toHaveBeenCalledWith(importedDocument.id, 'parsed')
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

  it('finishes import if automatic card generation fails', async () => {
    const queryClient = createTestQueryClient()

    vi.spyOn(documentGateway, 'pickAndImportDocument').mockResolvedValue(importedDocument)
    vi.spyOn(documentGateway, 'runParseWorkflow').mockResolvedValue(parsedDocument)
    vi.spyOn(embeddingProfileGateway, 'getActive').mockResolvedValue(null)
    vi.spyOn(cardsGateway, 'startGeneration').mockRejectedValue(new Error('generation unavailable'))

    render(
      <QueryClientProvider client={queryClient}>
        <ImportHarness />
      </QueryClientProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: 'import' }))

    await waitFor(() => {
      expect(screen.getByText('导入完成，但还有 2 项后续处理需要完成。')).toBeInTheDocument()
    })
    expect(
      screen.getByText('文档已完成解析，但当前没有可用的嵌入模型，知识问答和检索命中率会受到影响。')
    ).toBeInTheDocument()
    expect(screen.getByText('前往设置补全嵌入模型')).toBeInTheDocument()
    expect(screen.getByText('前往卡片工坊手动重试')).toBeInTheDocument()
  })
})
