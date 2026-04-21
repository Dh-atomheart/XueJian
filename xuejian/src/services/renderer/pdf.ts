import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import { documentCache } from '@/lib/cache/documentCache'
import { isTauriEnvironment } from '@/services/gateway'
import { buildDocumentAnalysis, type AnchorSourceTextItem } from './document-analysis'

export type PdfDocumentSource = Uint8Array | string

export interface PdfPageTextLayerData {
  pageNumber: number
  width: number
  height: number
  items: AnchorSourceTextItem[]
}

export interface PdfSearchResult {
  page: number
  rects: Array<{ x: number; y: number; width: number; height: number }>
  excerpt: string
}

type PdfTextContentItem = {
  str?: string
  transform?: number[]
  width?: number
  height?: number
  hasEOL?: boolean
}

let pdfWorkerConfigured = false
const pdfDocumentByteCache = new WeakMap<
  Uint8Array,
  Promise<Awaited<ReturnType<typeof getDocument>['promise']>>
>()
const pdfDocumentUrlCache = new Map<
  string,
  Promise<Awaited<ReturnType<typeof getDocument>['promise']>>
>()
const pdfTextLayerByteCache = new WeakMap<Uint8Array, Map<number, Promise<PdfPageTextLayerData>>>()
const pdfTextLayerUrlCache = new Map<string, Map<number, Promise<PdfPageTextLayerData>>>()

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

export async function parsePdfDocument(documentId: string, source: PdfDocumentSource) {
  const pdf = await loadPdfDocument(source)
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

  const analysis = buildDocumentAnalysis(pages, {
    fileSize: typeof source === 'string' ? undefined : source.byteLength,
  })

  await Promise.all(
    analysis.pages.map((page) =>
      documentCache.setPageTextLayer(documentId, page.pageNumber, page.text).catch(() => undefined)
    )
  )

  return analysis
}

export async function renderPdfPageToCanvas(
  source: PdfDocumentSource,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  scale = 1.25,
  signal?: AbortSignal
) {
  const pdf = await loadPdfDocument(source)

  if (signal?.aborted) {
    throw new DOMException('PDF render aborted', 'AbortError')
  }

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

  const renderTask = page.render({
    canvas,
    canvasContext: context,
    viewport,
  })

  const abortHandler = () => renderTask.cancel()
  signal?.addEventListener('abort', abortHandler, { once: true })

  try {
    await renderTask.promise
    return viewport
  } catch (error) {
    if (signal?.aborted || isCancelledRender(error)) {
      throw new DOMException('PDF render aborted', 'AbortError')
    }

    throw error
  } finally {
    signal?.removeEventListener('abort', abortHandler)
    page.cleanup()
  }
}

export async function getPdfPageTextLayer(
  source: PdfDocumentSource,
  pageNumber: number
): Promise<PdfPageTextLayerData> {
  const cache = getTextLayerCache(source)
  const cached = cache.get(pageNumber)

  if (cached) {
    return cached
  }

  const nextPromise = (async () => {
    const pdf = await loadPdfDocument(source)
    const page = await pdf.getPage(pageNumber)

    try {
      const viewport = page.getViewport({ scale: 1 })
      const textContent = await page.getTextContent()
      const items = textContent.items.flatMap((item) =>
        normalizeTextItem(item as PdfTextContentItem, viewport.height)
      )

      return {
        pageNumber,
        width: viewport.width,
        height: viewport.height,
        items,
      }
    } finally {
      page.cleanup()
    }
  })().catch((error) => {
    cache.delete(pageNumber)
    throw error
  })

  cache.set(pageNumber, nextPromise)
  return nextPromise
}

export async function searchPdfDocument(
  source: PdfDocumentSource,
  query: string,
  maxResults = 240
): Promise<PdfSearchResult[]> {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) {
    return []
  }

  const pdf = await loadPdfDocument(source)
  const results: PdfSearchResult[] = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const layer = await getPdfPageTextLayer(source, pageNumber)

    for (const item of layer.items) {
      if (!item.text.toLowerCase().includes(normalizedQuery)) {
        continue
      }

      results.push({
        page: pageNumber,
        rects: [
          {
            x: item.x / layer.width,
            y: item.y / layer.height,
            width: item.width / layer.width,
            height: item.height / layer.height,
          },
        ],
        excerpt: item.text,
      })

      if (results.length >= maxResults) {
        return results
      }
    }
  }

  return results
}

export async function resolvePdfDocumentSource(
  filePath: string,
  fallback?: () => Promise<Uint8Array>
): Promise<PdfDocumentSource> {
  if (isTauriEnvironment() && !filePath.startsWith('mock://')) {
    const { convertFileSrc } = await import('@tauri-apps/api/core')
    return convertFileSrc(filePath)
  }

  if (fallback) {
    return fallback()
  }

  return filePath
}

async function loadPdfDocument(source: PdfDocumentSource) {
  ensurePdfWorkerConfigured()

  if (typeof source === 'string') {
    const cachedPromise = pdfDocumentUrlCache.get(source)
    if (cachedPromise) {
      return cachedPromise
    }

    const nextPromise = getDocument({ url: source }).promise.catch((error) => {
      pdfDocumentUrlCache.delete(source)
      throw error
    })

    pdfDocumentUrlCache.set(source, nextPromise)
    return nextPromise
  }

  const cachedPromise = pdfDocumentByteCache.get(source)
  if (cachedPromise) {
    return cachedPromise
  }

  const nextPromise = getDocument({ data: source }).promise.catch((error) => {
    pdfDocumentByteCache.delete(source)
    throw error
  })

  pdfDocumentByteCache.set(source, nextPromise)
  return nextPromise
}

function getTextLayerCache(source: PdfDocumentSource) {
  if (typeof source === 'string') {
    let cache = pdfTextLayerUrlCache.get(source)
    if (!cache) {
      cache = new Map<number, Promise<PdfPageTextLayerData>>()
      pdfTextLayerUrlCache.set(source, cache)
    }
    return cache
  }

  let cache = pdfTextLayerByteCache.get(source)
  if (!cache) {
    cache = new Map<number, Promise<PdfPageTextLayerData>>()
    pdfTextLayerByteCache.set(source, cache)
  }
  return cache
}

function isCancelledRender(error: unknown) {
  return error instanceof Error && error.name === 'RenderingCancelledException'
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
