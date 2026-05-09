import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CardEditorModal } from '@/components/cards/CardEditorModal'
import { cardsGateway } from '@/services/gateway/cards'
import type { Card, CardMedia } from '@/types'

const { openMock } = vi.hoisted(() => ({
  openMock: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: openMock,
}))

vi.mock('@uiw/react-md-editor', () => ({
  default: ({
    value,
    onChange,
    textareaProps,
  }: {
    value?: string
    onChange?: (value: string) => void
    textareaProps?: Record<string, unknown>
  }) => (
    <textarea
      data-testid={String(textareaProps?.['data-testid'] ?? 'mock-md-editor')}
      placeholder={String(textareaProps?.placeholder ?? '')}
      value={value ?? ''}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}))

vi.mock('@/services/gateway/cards', () => ({
  cardsGateway: {
    listCardMedia: vi.fn(),
    uploadCardMedia: vi.fn(),
    deleteCardMedia: vi.fn(),
  },
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
    front: '旧问题',
    back: '旧答案',
    sourcePage: null,
    sourceParagraph: null,
    sourceCoordinates: null,
    tags: ['旧标签'],
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

describe('CardEditorModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(cardsGateway.listCardMedia).mockResolvedValue([])
    vi.mocked(cardsGateway.uploadCardMedia).mockResolvedValue({
      id: 'media-1',
      cardId: '33333333-3333-4333-8333-333333333333',
      fileName: 'heart.png',
      mimeType: 'image/png',
      fileSize: null,
      storageKey: 'heart.png',
      createdAt: '2026-04-21T00:00:00.000Z',
    } satisfies CardMedia)
    vi.mocked(cardsGateway.deleteCardMedia).mockResolvedValue(undefined)
  })

  it('queues media for a new card and passes trimmed payload on save', async () => {
    const onSave = vi.fn()
    openMock.mockResolvedValue(['C:\\tmp\\heart.png'])

    render(<CardEditorModal onSave={onSave} onClose={vi.fn()} />)

    fireEvent.change(within(screen.getByTestId('card-editor-front-input')).getByRole('textbox'), {
      target: { value: '  新问题  ' },
    })
    fireEvent.change(within(screen.getByTestId('card-editor-back-input')).getByRole('textbox'), {
      target: { value: '  新答案  ' },
    })
    fireEvent.change(screen.getByTestId('card-editor-tags-input'), {
      target: { value: '数学,  线代 , ' },
    })
    fireEvent.click(screen.getByRole('button', { name: '选择图片' }))

    await waitFor(() => {
      expect(screen.getByText('heart.png')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '创建卡片' }))

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        front: '新问题',
        back: '新答案',
        tags: ['数学', '线代'],
        cardType: 'qa',
        mediaFilePaths: ['C:\\tmp\\heart.png'],
      })
    })
  })

  it('shows the image occlusion helper and loads existing media in edit mode', async () => {
    vi.mocked(cardsGateway.listCardMedia).mockResolvedValue([
      {
        id: 'media-1',
        cardId: '33333333-3333-4333-8333-333333333333',
        fileName: 'diagram.png',
        mimeType: 'image/png',
        fileSize: null,
        storageKey: 'diagram.png',
        createdAt: '2026-04-21T00:00:00.000Z',
      },
    ])

    render(
      <CardEditorModal
        card={makeCard({ cardType: 'image_occlusion' })}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByTestId('card-editor-image-occlusion-help')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('diagram.png')).toBeInTheDocument()
    })
  })

  it('deletes uploaded media in edit mode', async () => {
    vi.mocked(cardsGateway.listCardMedia).mockResolvedValue([
      {
        id: 'media-1',
        cardId: '33333333-3333-4333-8333-333333333333',
        fileName: 'diagram.png',
        mimeType: 'image/png',
        fileSize: null,
        storageKey: 'diagram.png',
        createdAt: '2026-04-21T00:00:00.000Z',
      },
    ])

    render(<CardEditorModal card={makeCard()} onSave={vi.fn()} onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('diagram.png')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '删除' }))

    await waitFor(() => {
      expect(cardsGateway.deleteCardMedia).toHaveBeenCalledWith('media-1')
    })
  })
})
