import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import { documentCache } from '@/lib/cache/documentCache'
import { buildDocumentAnalysis, type AnchorSourceTextItem } from './document-analysis'

type PdfTextContentItem = {
  str?: string
  transform?: number[]
  width?: number
  height?: number
  hasEOL?: boolean
}

let pdfWorkerConfigured = false

function ensurePdfWorkerConfigured() {
  if (pdfWorkerConfigured) {
    return
  }

  GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString()
  pdfWorkerConfigured = true
}

export async function parsePdfDocument(documentId: string, bytes: Uint8Array) {
  ensurePdfWorkerConfigured()

  const pdf = await getDocument({ data: bytes }).promise
  const pages = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const viewport = page.getViewport({ scale: 1 })
    const textContent = await page.getTextContent()
    const items = textContent.items.flatMap((item) =>
      normalizeTextItem(item as PdfTextContentItem, viewport.height)
    )

    pages.push({
      pageNumber,
      width: viewport.width,
      height: viewport.height,
      items,
    })

    page.cleanup()
  }

  const analysis = buildDocumentAnalysis(pages, { fileSize: bytes.byteLength })

  await Promise.all(
    analysis.pages.map((page) =>
      documentCache.setPageTextLayer(documentId, page.pageNumber, page.text).catch(() => undefined)
    )
  )

  return analysis
}

export async function renderPdfPageToCanvas(
  bytes: Uint8Array,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  scale = 1.25
) {
  ensurePdfWorkerConfigured()

  const pdf = await getDocument({ data: bytes }).promise
  const page = await pdf.getPage(pageNumber)
  const viewport = page.getViewport({ scale })
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Canvas 2D context is not available')
  }

  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  canvas.style.width = `${Math.ceil(viewport.width)}px`
  canvas.style.height = `${Math.ceil(viewport.height)}px`

  await page.render({
    canvas,
    canvasContext: context,
    viewport,
  }).promise

  page.cleanup()
  return viewport
}

function normalizeTextItem(
  item: PdfTextContentItem,
  viewportHeight: number
): AnchorSourceTextItem[] {
  if (!item.str || !item.transform || item.transform.length < 6) {
    return []
  }

  const text = item.str.trim()

  if (!text) {
    return []
  }

  const height = Math.max(item.height ?? Math.abs(item.transform[3] ?? 0), 1)
  const width = Math.max(item.width ?? Math.abs(item.transform[0] ?? 0), 1)
  const x = item.transform[4] ?? 0
  const y = Math.max(0, viewportHeight - (item.transform[5] ?? 0) - height)

  return [
    {
      text,
      x,
      y,
      width,
      height,
      hasEol: Boolean(item.hasEOL),
    },
  ]
}
