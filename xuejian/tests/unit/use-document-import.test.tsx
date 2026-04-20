import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useDocumentImport } from '@/features/documents/useDocumentImport'
import { cardsGateway } from '@/services/gateway/cards'
import { documentGateway } from '@/services/gateway/documents'
import type { Document } from '@/types'
import { parsePdfDocument, resolvePdfDocumentSource } from '@/services/renderer/pdf'

vi.mock('@/services/renderer/pdf', () => ({
  parsePdfDocument: vi.fn(),
  resolvePdfDocumentSource: vi.fn(),
}))

const importedDocument: Document = {
  id: '22222222-2222-4222-8222-222222222222',
  title: '测试文档',
  filePath: 'C:/docs/test.pdf',
  fileType: 'pdf',
  fileSize: 1024,
  pageCount: 2,
  contentHash: 'hash-1',
  status: 'uploading',
  createdAt: new Date('2026-04-19T10:00:00.000Z'),
  updatedAt: new Date('2026-04-19T10:00:00.000Z'),
}

const readyDocument: Document = {
  ...importedDocument,
  status: 'ready',
  updatedAt: new Date('2026-04-19T10:01:00.000Z'),
}

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
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
    </div>
  )
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('useDocumentImport', () => {
  it('shows a clear error and does not call the gateway outside Tauri', async () => {
    const queryClient = createTestQueryClient()
    const pickAndImportSpy = vi.spyOn(documentGateway, 'pickAndImportDocument')

    render(
      <QueryClientProvider client={queryClient}>
        <ImportHarness />
      </QueryClientProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: 'import' }))

    // In mock (non-Tauri) mode, pickAndImportDocument returns null — no crash, no error
    await waitFor(() => {
      expect(pickAndImportSpy).toHaveBeenCalled()
    })
  })

  it('starts card generation after saving the imported analysis', async () => {
    const queryClient = createTestQueryClient()

    vi.spyOn(documentGateway, 'pickAndImportDocument').mockResolvedValue(importedDocument)
    vi.spyOn(documentGateway, 'readBinary').mockResolvedValue(new Uint8Array([1, 2, 3]))
    vi.spyOn(documentGateway, 'updateStatus').mockResolvedValue()
    vi.spyOn(documentGateway, 'saveAnalysis').mockResolvedValue(readyDocument)
    vi.mocked(resolvePdfDocumentSource).mockImplementation(async (_filePath, fallback) => fallback())
    vi.spyOn(cardsGateway, 'startGeneration').mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      workflowType: 'card_generation',
      presetId: 'm3-card-production-line',
      status: 'queued',
      threadId: `card-generation:${readyDocument.id}`,
      checkpointRef: 'queued',
      approvalPayload: null,
      costUsd: null,
      errorMessage: null,
      startedAt: null,
      finishedAt: null,
      createdAt: new Date('2026-04-19T10:02:00.000Z'),
      updatedAt: new Date('2026-04-19T10:02:00.000Z'),
    })

    vi.mocked(parsePdfDocument).mockResolvedValue({
      pageCount: 2,
      anchors: [
        {
          page: 1,
          paragraph: 1,
          textQuote: '测试锚点',
          rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.1 }],
          hash: 'anchor-hash',
        },
      ],
      chunks: [
        {
          pageStart: 1,
          pageEnd: 1,
          chunkIndex: 0,
          content: '测试分块内容',
          tokenCount: 8,
          metadata: null,
        },
      ],
      warnings: [],
      pages: [],
    } as never)

    render(
      <QueryClientProvider client={queryClient}>
        <ImportHarness />
      </QueryClientProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: 'import' }))

    await waitFor(() => {
      expect(cardsGateway.startGeneration).toHaveBeenCalledWith(readyDocument.id)
    })
  })
})
