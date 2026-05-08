import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  LibraryPage,
  type LibraryPageAiJob,
  type LibraryPageDocument,
  type LibraryPageProcessingJob,
} from '@/components/pages/library-page'

function makeDocument(overrides: Partial<LibraryPageDocument> = {}): LibraryPageDocument {
  return {
    id: 'doc-1',
    title: 'Imported.pdf',
    fileType: 'pdf',
    pageCount: 2,
    fileSizeLabel: '1.0 MB',
    uploadedAtLabel: '4/24 10:00',
    status: 'ready',
    description: 'Imported document',
    tags: ['PDF'],
    ...overrides,
  }
}

function makeProcessingJob(overrides: Partial<LibraryPageProcessingJob> = {}): LibraryPageProcessingJob {
  return {
    id: 'parse-job-1',
    jobType: 'document_parse',
    status: 'running',
    targetId: 'doc-1',
    payloadJson: JSON.stringify({ documentId: 'doc-1' }),
    resultJson: null,
    errorMessage: null,
    progressCurrent: 2,
    progressTotal: 5,
    progressMessage: 'Parsing pages',
    createdAt: new Date('2026-04-24T10:00:00.000Z'),
    cancelRequestedAt: null,
    ...overrides,
  }
}

describe('LibraryPage document actions', () => {
  it('allows parsed documents to open reader, cards, and embedding generation', () => {
    const onOpenReader = vi.fn()
    const onOpenCards = vi.fn()
    const onRunEmbedding = vi.fn()

    render(
      <LibraryPage
        documents={[makeDocument({ status: 'parsed' })]}
        onUpload={vi.fn()}
        onOpenReader={onOpenReader}
        onOpenCards={onOpenCards}
        onRunEmbedding={onRunEmbedding}
      />
    )

    fireEvent.click(screen.getByTestId('library-open-reader'))
    fireEvent.click(screen.getByTestId('library-open-cards'))
    fireEvent.click(screen.getByTestId('library-run-embedding'))

    expect(onOpenReader).toHaveBeenCalledWith('doc-1')
    expect(onOpenCards).toHaveBeenCalledWith('doc-1')
    expect(onRunEmbedding).toHaveBeenCalledWith('doc-1')
  })

  it('does not show embedding generation for ready documents', () => {
    render(
      <LibraryPage
        documents={[makeDocument({ status: 'ready' })]}
        onUpload={vi.fn()}
        onOpenReader={vi.fn()}
        onOpenCards={vi.fn()}
        onRunEmbedding={vi.fn()}
      />
    )

    expect(screen.queryByTestId('library-run-embedding')).not.toBeInTheDocument()
  })

  it('uses background job progress for the processing banner', () => {
    render(
      <LibraryPage
        documents={[makeDocument({ status: 'uploading' })]}
        processingJobs={[makeProcessingJob({ progressCurrent: 2, progressTotal: 5 })]}
        onUpload={vi.fn()}
        onOpenReader={vi.fn()}
        onOpenCards={vi.fn()}
      />
    )

    expect(screen.getByText('40%')).toBeInTheDocument()
    expect(screen.queryByText('38%')).not.toBeInTheDocument()
  })

  it('confirms in a dialog before deleting the selected document', () => {
    const onDeleteDocument = vi.fn()

    render(
      <LibraryPage
        documents={[makeDocument()]}
        onUpload={vi.fn()}
        onOpenReader={vi.fn()}
        onOpenCards={vi.fn()}
        onDeleteDocument={onDeleteDocument}
      />
    )

    fireEvent.click(screen.getByTestId('library-delete-document'))
    fireEvent.click(screen.getByRole('button', { name: '删除文档' }))

    expect(onDeleteDocument).toHaveBeenCalledWith('doc-1')
  })

  it('does not delete when dialog confirmation is cancelled', () => {
    const onDeleteDocument = vi.fn()

    render(
      <LibraryPage
        documents={[makeDocument()]}
        onUpload={vi.fn()}
        onOpenReader={vi.fn()}
        onOpenCards={vi.fn()}
        onDeleteDocument={onDeleteDocument}
      />
    )

    fireEvent.click(screen.getByTestId('library-delete-document'))
    fireEvent.click(screen.getByRole('button', { name: '取消' }))

    expect(onDeleteDocument).not.toHaveBeenCalled()
  })

  it('blocks failed documents from reader and exposes retry parse instead of card generation', () => {
    const onOpenReader = vi.fn()
    const onOpenCards = vi.fn()
    const onRetryParse = vi.fn()

    render(
      <LibraryPage
        documents={[makeDocument({ status: 'error' })]}
        onUpload={vi.fn()}
        onOpenReader={onOpenReader}
        onOpenCards={onOpenCards}
        onRetryParse={onRetryParse}
      />
    )

    expect(screen.getByTestId('library-open-reader')).toBeDisabled()
    fireEvent.click(screen.getByTestId('library-retry-parse'))

    expect(onOpenReader).not.toHaveBeenCalled()
    expect(onRetryParse).toHaveBeenCalledWith('doc-1')
    expect(screen.queryByTestId('library-open-cards')).not.toBeInTheDocument()
    expect(onOpenCards).not.toHaveBeenCalled()
  })

  it('blocks reading and card generation while a document is still uploading', () => {
    render(
      <LibraryPage
        documents={[makeDocument({ status: 'uploading' })]}
        onUpload={vi.fn()}
        onOpenReader={vi.fn()}
        onOpenCards={vi.fn()}
      />
    )

    expect(screen.getByTestId('library-open-reader')).toBeDisabled()
    expect(screen.getByTestId('library-open-cards')).toBeDisabled()
  })

  it('keeps embedding_failed documents readable and exposes embedding retry', () => {
    const onOpenReader = vi.fn()
    const onRunEmbedding = vi.fn()

    render(
      <LibraryPage
        documents={[makeDocument({ status: 'embedding_failed' })]}
        onUpload={vi.fn()}
        onOpenReader={onOpenReader}
        onOpenCards={vi.fn()}
        onRunEmbedding={onRunEmbedding}
      />
    )

    fireEvent.click(screen.getByTestId('library-open-reader'))
    fireEvent.click(screen.getByTestId('library-run-embedding'))

    expect(onOpenReader).toHaveBeenCalledWith('doc-1')
    expect(onRunEmbedding).toHaveBeenCalledWith('doc-1')
    expect(screen.queryByTestId('library-retry-parse')).not.toBeInTheDocument()
    expect(screen.getByTestId('library-open-cards')).toBeVisible()
  })

  it('shows the AI generation entry for parsed documents and blocks missing providers', () => {
    const onStart = vi.fn()

    render(
      <LibraryPage
        documents={[makeDocument({ status: 'parsed' })]}
        onUpload={vi.fn()}
        onOpenReader={vi.fn()}
        onOpenCards={vi.fn()}
        aiGeneration={{
          groups: [{ id: '10101010-1010-4010-8010-101010101010', name: '默认分组' }],
          providers: [],
          jobs: [],
          isStarting: false,
          isResuming: false,
          isCancelling: false,
          actionError: null,
          onStart,
          onResume: vi.fn(),
          onCancel: vi.fn(),
          onOpenCards: vi.fn(),
          onOpenSettings: vi.fn(),
          onCreateGroup: vi.fn(),
        }}
      />
    )

    fireEvent.click(screen.getByTestId('library-start-ai-generation'))

    expect(onStart).not.toHaveBeenCalled()
    expect(screen.getByText('当前没有可用 Provider。')).toBeInTheDocument()
  })

  it('submits whole-document and ranged AI generation requests', () => {
    const onStart = vi.fn()

    render(
      <LibraryPage
        documents={[makeDocument({ status: 'ready', pageCount: 8 })]}
        onUpload={vi.fn()}
        onOpenReader={vi.fn()}
        onOpenCards={vi.fn()}
        aiGeneration={{
          groups: [{ id: '10101010-1010-4010-8010-101010101010', name: '默认分组' }],
          providers: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', label: 'OpenAI' }],
          jobs: [],
          isStarting: false,
          isResuming: false,
          isCancelling: false,
          actionError: null,
          onStart,
          onResume: vi.fn(),
          onCancel: vi.fn(),
          onOpenCards: vi.fn(),
          onOpenSettings: vi.fn(),
          onCreateGroup: vi.fn(),
        }}
      />
    )

    expect(screen.getByTestId('library-ai-generation-estimate')).toHaveTextContent('预计 8 页，约 12 张卡片')

    fireEvent.click(screen.getByTestId('library-start-ai-generation'))
    expect(onStart).toHaveBeenLastCalledWith(
      expect.objectContaining({ pageStart: null, pageEnd: null, density: 'medium' })
    )

    fireEvent.change(screen.getByTestId('library-ai-scope'), { target: { value: 'range' } })
    fireEvent.change(screen.getByTestId('library-ai-density'), { target: { value: 'high' } })
    fireEvent.change(screen.getByTestId('library-ai-page-start'), { target: { value: '2' } })
    fireEvent.change(screen.getByTestId('library-ai-page-end'), { target: { value: '5' } })
    expect(screen.getByTestId('library-ai-generation-estimate')).toHaveTextContent('预计 4 页，约 20 张卡片')
    fireEvent.click(screen.getByTestId('library-start-ai-generation'))

    expect(onStart).toHaveBeenLastCalledWith(
      expect.objectContaining({ pageStart: 2, pageEnd: 5, density: 'high' })
    )
  })

  it('renders AI background job status and cancellation', () => {
    const onCancel = vi.fn()
    const job: LibraryPageAiJob = {
      id: '90909090-9090-4090-8090-909090909090',
      status: 'running',
      targetId: 'doc-1',
      payloadJson: JSON.stringify({ documentId: 'doc-1' }),
      resultJson: null,
      errorMessage: null,
      progressCurrent: 1,
      progressTotal: 3,
      progressMessage: '正在生成卡片',
      createdAt: new Date('2026-05-02T00:00:00.000Z'),
    }

    render(
      <LibraryPage
        documents={[makeDocument({ status: 'ready' })]}
        onUpload={vi.fn()}
        onOpenReader={vi.fn()}
        onOpenCards={vi.fn()}
        aiGeneration={{
          groups: [{ id: '10101010-1010-4010-8010-101010101010', name: '默认分组' }],
          providers: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', label: 'OpenAI' }],
          jobs: [job],
          isStarting: false,
          isResuming: false,
          isCancelling: false,
          actionError: null,
          onStart: vi.fn(),
          onResume: vi.fn(),
          onCancel,
          onOpenCards: vi.fn(),
          onOpenSettings: vi.fn(),
          onCreateGroup: vi.fn(),
        }}
      />
    )

    expect(screen.getByText('生成中')).toBeInTheDocument()
    expect(screen.getByText('1/3')).toBeInTheDocument()
    expect(screen.getByText('正在生成卡片')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('library-cancel-ai-generation'))
    expect(onCancel).toHaveBeenCalledWith(job.id)
  })

  it('allows another AI generation after failed or cancelled jobs', () => {
    const onStart = vi.fn()
    const jobs: LibraryPageAiJob[] = [
      {
        id: '80808080-8080-4080-8080-808080808080',
        status: 'cancelled',
        targetId: 'doc-1',
        payloadJson: JSON.stringify({ documentId: 'doc-1' }),
        resultJson: null,
        errorMessage: null,
        progressCurrent: 0,
        progressTotal: 3,
        progressMessage: 'Task cancelled',
        createdAt: new Date('2026-05-02T00:00:00.000Z'),
      },
      {
        id: '70707070-7070-4070-8070-707070707070',
        status: 'failed',
        targetId: 'doc-1',
        payloadJson: JSON.stringify({ documentId: 'doc-1' }),
        resultJson: null,
        errorMessage: 'Timed out',
        progressCurrent: 0,
        progressTotal: 3,
        progressMessage: 'AI card generation failed',
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
      },
    ]

    render(
      <LibraryPage
        documents={[makeDocument({ status: 'ready' })]}
        onUpload={vi.fn()}
        onOpenReader={vi.fn()}
        onOpenCards={vi.fn()}
        aiGeneration={{
          groups: [{ id: '10101010-1010-4010-8010-101010101010', name: '榛樿鍒嗙粍' }],
          providers: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', label: 'OpenAI' }],
          jobs,
          isStarting: false,
          isResuming: false,
          isCancelling: false,
          actionError: null,
          onStart,
          onResume: vi.fn(),
          onCancel: vi.fn(),
          onOpenCards: vi.fn(),
          onOpenSettings: vi.fn(),
          onCreateGroup: vi.fn(),
        }}
      />
    )

    expect(screen.getByText('已取消')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('library-start-ai-generation'))

    expect(onStart).toHaveBeenCalled()
  })
})
