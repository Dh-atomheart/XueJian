import { fireEvent, render, screen } from '@testing-library/react'
import { HighlightLayer } from '@/components/documents/PdfViewer/HighlightLayer'
import type { Highlight } from '@/types'

const highlight: Highlight = {
  id: '77777777-7777-4777-8777-777777777777',
  cardId: '33333333-3333-4333-8333-333333333333',
  documentId: '22222222-2222-4222-8222-222222222222',
  anchorId: '55555555-5555-4555-8555-555555555555',
  pageNumber: 1,
  rectangles: [{ x: 24, y: 40, width: 160, height: 18 }],
  textContent: 'Chunking keeps the page readable while stable anchors hold the user\'s place.',
  color: '#F8E16C',
  createdAt: new Date('2026-04-17T09:00:00.000Z'),
}

// @acceptance:m4-a4
test('keeps highlight decorations passive while each mark remains individually clickable', () => {
  const handleClick = vi.fn()
  const { container } = render(
    <div className="relative h-[240px] w-[240px]">
      <HighlightLayer
        highlights={[highlight]}
        scale={1}
        selectedHighlightId={null}
        onHighlightClick={handleClick}
      />
    </div>
  )

  const overlay = container.querySelector('svg')
  const mark = screen.getByTestId(`highlight-${highlight.id}`)

  expect(overlay).toHaveClass('pointer-events-none')
  expect(mark).toHaveClass('pointer-events-auto')

  fireEvent.click(mark)
  expect(handleClick).toHaveBeenCalledWith(highlight)
})