import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LibraryPage, type LibraryPageDocument } from '@/components/pages/library-page'

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

describe('LibraryPage document actions', () => {
  it('allows parsed documents to open reader and cards', () => {
    const onOpenReader = vi.fn()
    const onOpenCards = vi.fn()

    render(
      <LibraryPage
        documents={[makeDocument({ status: 'parsed' })]}
        onUpload={vi.fn()}
        onOpenReader={onOpenReader}
        onOpenCards={onOpenCards}
      />
    )

    fireEvent.click(screen.getByTestId('library-open-reader'))
    fireEvent.click(screen.getByTestId('library-open-cards'))

    expect(onOpenReader).toHaveBeenCalledWith('doc-1')
    expect(onOpenCards).toHaveBeenCalledWith('doc-1')
  })

  it('keeps failed documents readable and exposes retry parse instead of card generation', () => {
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

    fireEvent.click(screen.getByTestId('library-open-reader'))
    fireEvent.click(screen.getByTestId('library-retry-parse'))

    expect(onOpenReader).toHaveBeenCalledWith('doc-1')
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
})
