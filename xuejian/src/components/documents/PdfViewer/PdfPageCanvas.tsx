import { useEffect, useRef, useCallback } from 'react'
import { renderPdfPageToCanvas } from '@/services/renderer/pdf'

interface PdfPageCanvasProps {
  pdfBytes: Uint8Array
  pageNumber: number
  scale: number
  className?: string
  onViewportReady?: (viewport: { width: number; height: number }) => void
}

export function PdfPageCanvas({
  pdfBytes,
  pageNumber,
  scale,
  className,
  onViewportReady,
}: PdfPageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const renderingRef = useRef(false)

  const render = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas || renderingRef.current) return

    renderingRef.current = true
    try {
      const viewport = await renderPdfPageToCanvas(pdfBytes, pageNumber, canvas, scale)
      onViewportReady?.({ width: viewport.width, height: viewport.height })
    } catch (error) {
      console.error(`[PdfPageCanvas] Failed to render page ${pageNumber}:`, error)
    } finally {
      renderingRef.current = false
    }
  }, [pdfBytes, pageNumber, scale, onViewportReady])

  useEffect(() => {
    render()
  }, [render])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      data-page={pageNumber}
    />
  )
}
