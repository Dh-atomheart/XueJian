import { useEffect, useRef, useState } from 'react'
import { type ReaderViewport } from '@/lib/readerGeometry'
import { cn } from '@/lib/utils'
import {
  getPdfPageTextLayer,
  type PdfDocumentSource,
  type PdfPageTextLayerData,
} from '@/services/renderer/pdf'

interface PdfTextLayerProps {
  pdfSource: PdfDocumentSource
  pageNumber: number
  viewport: ReaderViewport | null
  className?: string
}

export function PdfTextLayer({ pdfSource, pageNumber, viewport, className }: PdfTextLayerProps) {
  const [layer, setLayer] = useState<PdfPageTextLayerData | null>(null)
  const spanRefs = useRef<Array<HTMLSpanElement | null>>([])

  useEffect(() => {
    let active = true
    setLayer(null)

    void getPdfPageTextLayer(pdfSource, pageNumber)
      .then((nextLayer) => {
        if (active) {
          setLayer(nextLayer)
        }
      })
      .catch(() => {
        if (active) {
          setLayer(null)
        }
      })

    return () => {
      active = false
    }
  }, [pageNumber, pdfSource])

  useEffect(() => {
    if (!viewport || !layer) {
      return
    }

    const scaleX = viewport.width / layer.width
    const scaleY = viewport.height / layer.height

    layer.items.forEach((item, index) => {
      const node = spanRefs.current[index]
      if (!node) {
        return
      }

      node.style.left = `${item.x * scaleX}px`
      node.style.top = `${item.y * scaleY}px`
      node.style.width = `${Math.max(item.width * scaleX, 2)}px`
      node.style.height = `${Math.max(item.height * scaleY, 8)}px`
      node.style.fontSize = `${Math.max(item.height * scaleY * 0.78, 8)}px`
      node.style.lineHeight = `${Math.max(item.height * scaleY, 8)}px`
    })
  }, [layer, viewport])

  if (!viewport || !layer) {
    return null
  }

  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-0 z-[6] select-text overflow-hidden',
        className
      )}
      data-testid="pdf-text-layer"
    >
      {layer.items.map((item, index) => {
        const text = `${item.text}${item.hasEol ? '\n' : ' '}`

        return (
          <span
            key={`${pageNumber}-${index}-${item.x}-${item.y}`}
            ref={(node) => {
              spanRefs.current[index] = node
            }}
            className="pointer-events-auto absolute whitespace-pre leading-none [color:transparent] [text-shadow:none]"
          >
            {text}
          </span>
        )
      })}
    </div>
  )
}
