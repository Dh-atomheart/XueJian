import { useEffect, useRef } from 'react'
import { reportAppError } from '@/lib/appFeedback'
import { renderPdfPageToCanvas, type PdfDocumentSource } from '@/services/renderer/pdf'

interface PdfPageCanvasProps {
  pdfSource: PdfDocumentSource
  pageNumber: number
  scale: number
  className?: string
  onViewportReady?: (viewport: { width: number; height: number }) => void
  onRenderError?: (message: string | null) => void
}

export function PdfPageCanvas({
  pdfSource,
  pageNumber,
  scale,
  className,
  onViewportReady,
  onRenderError,
}: PdfPageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const controller = new AbortController()
    onRenderError?.(null)

    void renderPdfPageToCanvas(pdfSource, pageNumber, canvas, scale, controller.signal)
      .then((viewport) => {
        if (!controller.signal.aborted) {
          onViewportReady?.({ width: viewport.width, height: viewport.height })
        }
      })
      .catch((error) => {
        if (controller.signal.aborted || isAbortError(error)) {
          return
        }

        const message = reportAppError('PDF 阅读器', error, {
          title: `第 ${pageNumber} 页渲染失败`,
          showToast: false,
        })
        onRenderError?.(message)
      })

    return () => {
      controller.abort()
    }
  }, [onRenderError, onViewportReady, pageNumber, pdfSource, scale])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      data-page={pageNumber}
    />
  )
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError'
}
