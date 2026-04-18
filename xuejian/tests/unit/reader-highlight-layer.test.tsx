import { fireEvent, render, screen } from '@testing-library/react'
import { HighlightLayer } from '@/components/documents/PdfViewer/HighlightLayer'
import type { Highlight } from '@/types'

const highlight: Highlight = {
  id: '77777777-7777-4777-8777-777777777777',
  cardId: '33333333-3333-4333-8333-333333333333',
  documentId: '22222222-2222-4222-8222-222222222222',
  anchorId: '55555555-5555-4555-8555-555555555555',
  pageNumber: 1,
  rectangles: [{ x: 0.1, y: 0.2, width: 0.25, height: 0.05 }],
  textContent: 'Chunking keeps the page readable while stable anchors hold the user\'s place.',
  color: '#F8E16C',
  createdAt: new Date('2026-04-17T09:00:00.000Z'),
}

// @acceptance:v4-4-a4
test('maps normalized highlight rectangles into viewport pixels while keeping marks clickable', () => {
  const handleClick = vi.fn()
  const { container } = render(
    <div className="relative h-[240px] w-[240px]">
      <HighlightLayer
        highlights={[highlight]}
        viewport={{ width: 240, height: 240 }}
        selectedHighlightId={null}
        onHighlightClick={handleClick}
      />
    </div>
  )

  const overlay = container.querySelector('svg')
  const mark = screen.getByTestId(`highlight-${highlight.id}`)

  expect(overlay).toHaveClass('z-10')
  expect(mark).toHaveClass('pointer-events-auto')
  expect(Number(mark.getAttribute('x'))).toBeCloseTo(24)
  expect(Number(mark.getAttribute('y'))).toBeCloseTo(48)
  expect(Number(mark.getAttribute('width'))).toBeCloseTo(60)
  expect(Number(mark.getAttribute('height'))).toBeCloseTo(12)

  fireEvent.click(mark)
  expect(handleClick).toHaveBeenCalledWith(highlight)
})

test('prefers anchor-backed highlight rectangle overrides when stored rectangles are stale', () => {
  render(
    <div className="relative h-[300px] w-[200px]">
      <HighlightLayer
        highlights={[
          {
            ...highlight,
            rectangles: [{ x: 120, y: 48, width: 24, height: 12 }],
          },
        ]}
        highlightRectOverrides={{
          [highlight.id]: [{ x: 0.4, y: 0.3, width: 0.2, height: 0.1 }],
        }}
        viewport={{ width: 200, height: 300 }}
        selectedHighlightId={null}
        onHighlightClick={vi.fn()}
      />
    </div>
  )

  const mark = screen.getByTestId(`highlight-${highlight.id}`)

  expect(Number(mark.getAttribute('x'))).toBeCloseTo(80)
  expect(Number(mark.getAttribute('y'))).toBeCloseTo(90)
  expect(Number(mark.getAttribute('width'))).toBeCloseTo(40)
  expect(Number(mark.getAttribute('height'))).toBeCloseTo(30)
})
