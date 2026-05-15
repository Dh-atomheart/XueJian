import { useEffect, useMemo, useRef, useState } from 'react'
import { ReaderCardPanel } from '@/components/documents/ReaderCardPanel'
import { HighlightLayer } from '@/components/documents/PdfViewer/HighlightLayer'
import { PdfPageCanvas } from '@/components/documents/PdfViewer/PdfPageCanvas'
import { PdfToolbar } from '@/components/documents/PdfViewer/PdfToolbar'
import { Card } from '@/components/ui'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/shared/ui'
import { reportAppError } from '@/lib/appFeedback'
import { resolveReaderRect, type ReaderRect, type ReaderViewport } from '@/lib/readerGeometry'
import { useCardsQuery, useHighlightsQuery } from '@/queries/cards'
import { useDocumentAnchorsQuery, useDocumentQuery } from '@/queries/documents'
import { documentGateway } from '@/services/gateway/documents'
import { getPdfPageViewport } from '@/services/renderer/pdf'
import { useAppUiStore } from '@/store'
import type { Highlight } from '@/types'

const PDF_STAGE_HORIZONTAL_GUTTER = 48
const PDF_STAGE_VERTICAL_GUTTER = 64
const DEFAULT_PDF_PAGE_WIDTH = 612
const DEFAULT_PDF_PAGE_HEIGHT = 792
const MIN_EFFECTIVE_PDF_SCALE = 0.5
const MAX_EFFECTIVE_PDF_SCALE = 4

interface ReaderPageProps {
  documentId: string
}

type FocusRect = {
  x: number
  y: number
  width: number
  height: number
}

export function ReaderPage({ documentId }: ReaderPageProps) {
  const reader = useAppUiStore((state) => state.reader)
  const closeReader = useAppUiStore((state) => state.closeReader)
  const setReaderPage = useAppUiStore((state) => state.setReaderPage)
  const setReaderScale = useAppUiStore((state) => state.setReaderScale)
  const setReaderTotalPages = useAppUiStore((state) => state.setReaderTotalPages)
  const selectCard = useAppUiStore((state) => state.selectCard)
  const { data: document, isLoading: isLoadingDocument } = useDocumentQuery(documentId)
  const { data: anchors = [] } = useDocumentAnchorsQuery(documentId)
  const { data: pageCards = [] } = useCardsQuery(
    { documentId, pageNumber: reader.currentPage, limit: 24 },
    { enabled: Boolean(documentId) }
  )
  const { data: highlights = [] } = useHighlightsQuery(
    { documentId, pageNumber: reader.currentPage, limit: 24 },
    { enabled: Boolean(documentId) }
  )

  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null)
  const [isLoadingBinary, setIsLoadingBinary] = useState(false)
  const [binaryError, setBinaryError] = useState<string | null>(null)
  const [pageRenderError, setPageRenderError] = useState<string | null>(null)
  const [activeHighlightId, setActiveHighlightId] = useState<string | null>(null)
  const [pageViewport, setPageViewport] = useState<ReaderViewport | null>(null)
  const [basePageViewport, setBasePageViewport] = useState<ReaderViewport | null>(null)
  const [pdfStageSize, setPdfStageSize] = useState({ width: 0, height: 0 })
  const [isCardPanelOpen, setCardPanelOpen] = useState(true)
  const [isCardDrawerOpen, setCardDrawerOpen] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (document?.pageCount) {
      setReaderTotalPages(document.pageCount)
    }
  }, [document?.pageCount, setReaderTotalPages])

  useEffect(() => {
    let cancelled = false

    setIsLoadingBinary(true)
    setBinaryError(null)

    void documentGateway
      .readBinary(documentId)
      .then((bytes) => {
        if (!cancelled) {
          setPdfBytes(bytes)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setPdfBytes(null)
          setBinaryError(
            reportAppError('阅读器', error, {
              title: '读取文档内容失败',
              showToast: true,
            })
          )
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingBinary(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [documentId])

  useEffect(() => {
    setActiveHighlightId(null)
  }, [reader.currentPage])

  useEffect(() => {
    setPageViewport(null)
    setPageRenderError(null)
  }, [documentId, reader.currentPage, reader.scale, pdfStageSize.height, pdfStageSize.width])

  useEffect(() => {
    const stage = scrollContainerRef.current
    if (!stage) {
      return
    }

    const updateStageSize = () =>
      setPdfStageSize({
        width: stage.clientWidth,
        height: stage.clientHeight,
      })
    updateStageSize()

    const observer = new ResizeObserver(updateStageSize)
    observer.observe(stage)

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!pdfBytes) {
      setBasePageViewport(null)
      return
    }

    const controller = new AbortController()
    setBasePageViewport(null)

    void getPdfPageViewport(pdfBytes, reader.currentPage, 1, controller.signal)
      .then((viewport) => {
        if (!controller.signal.aborted) {
          setBasePageViewport(viewport)
        }
      })
      .catch((error) => {
        if (controller.signal.aborted || isAbortError(error)) {
          return
        }

        setPageRenderError(
          reportAppError('PDF 阅读器', error, {
            title: `第 ${reader.currentPage} 页渲染失败`,
            showToast: false,
          })
        )
      })

    return () => controller.abort()
  }, [pdfBytes, reader.currentPage])

  const currentPageAnchors = useMemo(
    () => anchors.filter((anchor) => anchor.page === reader.currentPage),
    [anchors, reader.currentPage]
  )
  const anchorRectsById = useMemo<Record<string, ReaderRect[]>>(
    () =>
      Object.fromEntries(
        currentPageAnchors
          .filter((anchor) => anchor.rects.length > 0)
          .map((anchor) => [anchor.id, anchor.rects])
      ),
    [currentPageAnchors]
  )
  const highlightRectOverrides = useMemo<Record<string, ReaderRect[]>>(
    () =>
      Object.fromEntries(
        highlights.flatMap((highlight) => {
          const anchorRects = highlight.anchorId ? anchorRectsById[highlight.anchorId] : undefined
          return anchorRects?.length ? [[highlight.id, anchorRects]] : []
        })
      ),
    [anchorRectsById, highlights]
  )

  const selectedCard = useMemo(
    () => pageCards.find((card) => card.id === reader.selectedCardId) ?? null,
    [pageCards, reader.selectedCardId]
  )

  const resolvedSelectedHighlightId = reader.selectedHighlightId ?? activeHighlightId

  const fitScale = useMemo(() => {
    if (!basePageViewport?.width || !basePageViewport?.height) {
      return 1
    }

    const availableWidth = Math.max(320, pdfStageSize.width - PDF_STAGE_HORIZONTAL_GUTTER)
    const availableHeight = Math.max(320, pdfStageSize.height - PDF_STAGE_VERTICAL_GUTTER)
    const widthFitScale = availableWidth / basePageViewport.width
    const heightFitScale = availableHeight / basePageViewport.height

    return Math.min(widthFitScale, heightFitScale)
  }, [basePageViewport?.height, basePageViewport?.width, pdfStageSize.height, pdfStageSize.width])

  const effectiveScale = Math.max(
    MIN_EFFECTIVE_PDF_SCALE,
    Math.min(MAX_EFFECTIVE_PDF_SCALE, fitScale * reader.scale)
  )
  const optimisticPageViewport = useMemo<ReaderViewport>(
    () => ({
      width: (basePageViewport?.width ?? DEFAULT_PDF_PAGE_WIDTH) * effectiveScale,
      height: (basePageViewport?.height ?? DEFAULT_PDF_PAGE_HEIGHT) * effectiveScale,
    }),
    [basePageViewport?.height, basePageViewport?.width, effectiveScale]
  )
  const highlightViewport = pageViewport ?? optimisticPageViewport

  const focusRect = useMemo<FocusRect | null>(() => {
    if (!highlightViewport) {
      return null
    }

    const selectedCardRect =
      (selectedCard?.anchorId ? anchorRectsById[selectedCard.anchorId]?.[0] : undefined) ??
      selectedCard?.sourceCoordinates

    if (selectedCardRect) {
      return resolveReaderRect(selectedCardRect, highlightViewport)
    }

    const activeHighlight = highlights.find((item) => item.id === resolvedSelectedHighlightId)
    const activeHighlightRect =
      (activeHighlight ? highlightRectOverrides[activeHighlight.id]?.[0] : undefined) ??
      activeHighlight?.rectangles[0]

    return activeHighlightRect ? resolveReaderRect(activeHighlightRect, highlightViewport) : null
  }, [
    anchorRectsById,
    highlightViewport,
    highlightRectOverrides,
    highlights,
    resolvedSelectedHighlightId,
    selectedCard,
  ])

  useEffect(() => {
    if (!focusRect || !scrollContainerRef.current) {
      return
    }

    const top = Math.max(0, focusRect.y - 120)
    scrollContainerRef.current.scrollTo({ top, behavior: 'smooth' })
  }, [focusRect])

  function handleHighlightClick(highlight: Highlight) {
    setActiveHighlightId(highlight.id)

    if (highlight.cardId) {
      selectCard(highlight.cardId)
    }
  }

  if (isLoadingDocument) {
    return (
      <div className="flex h-full items-center justify-center py-16 text-center text-sm text-muted-foreground">
        正在准备阅读工作台...
      </div>
    )
  }

  if (!document) {
    return (
      <div className="flex h-full items-center justify-center py-16 text-center text-sm text-muted-foreground">
        当前文档不存在，无法进入阅读页。
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="reader-layout">
      <PdfToolbar
        currentPage={reader.currentPage}
        totalPages={Math.max(reader.totalPages, document.pageCount ?? 1, 1)}
        scale={reader.scale}
        documentTitle={document.title}
        isCardPanelOpen={isCardPanelOpen}
        onPageChange={(page) => setReaderPage(page)}
        onScaleChange={(scale) => setReaderScale(scale)}
        onToggleCardPanel={() => setCardPanelOpen((open) => !open)}
        onOpenCardDrawer={() => setCardDrawerOpen(true)}
        onClose={closeReader}
      />

      <div className="grid min-h-0 flex-1 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card
          className="flex min-h-0 flex-col overflow-hidden rounded-none border-0 border-border/50 bg-card p-0"
          data-testid="reader-main-stage"
        >
          <div className="border-b border-border/30 px-4 py-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">
            正文页
          </div>

          <div
            ref={scrollContainerRef}
            className="relative flex min-h-0 flex-1 overflow-auto bg-[radial-gradient(circle_at_50%_0%,rgb(var(--highlight-yellow)/0.08),transparent_42%),linear-gradient(180deg,rgb(var(--surface-reader)),rgb(var(--paper-soft)))] px-6 py-8"
            data-testid="reader-pdf-stage"
          >
            {binaryError ? (
              <div className="flex min-h-[420px] items-center justify-center text-center text-sm text-muted-foreground">
                {binaryError}
              </div>
            ) : pageRenderError ? (
              <div className="flex min-h-[420px] items-center justify-center px-6 text-center text-sm text-muted-foreground">
                <div className="space-y-3">
                  <p>{pageRenderError}</p>
                  <p className="text-xs text-muted-foreground">
                    可以尝试切换页码、调整缩放，或重新打开文档。
                  </p>
                </div>
              </div>
            ) : isLoadingBinary || !pdfBytes ? (
              <div className="flex min-h-[420px] items-center justify-center text-center text-sm text-muted-foreground">
                正在铺开 PDF 纸面...
              </div>
            ) : (
              <div className="flex min-h-full w-full justify-center">
                <div className="relative inline-block max-w-full rounded-xl bg-card shadow-paper ring-1 ring-border/60">
                  <PdfPageCanvas
                    pdfBytes={pdfBytes}
                    pageNumber={reader.currentPage}
                    scale={effectiveScale}
                    className="block max-w-full rounded-xl"
                    onViewportReady={setPageViewport}
                    onRenderError={setPageRenderError}
                  />

                  <HighlightLayer
                    highlights={highlights}
                    highlightRectOverrides={highlightRectOverrides}
                    viewport={highlightViewport}
                    selectedHighlightId={resolvedSelectedHighlightId}
                    hoveredHighlightId={reader.hoveredHighlightId}
                    onHighlightClick={handleHighlightClick}
                  />

                  {focusRect ? (
                    <svg
                      className="pointer-events-none absolute inset-0 z-20 h-full w-full"
                      data-testid="reader-focus-target"
                    >
                      <rect
                        x={focusRect.x}
                        y={focusRect.y}
                        width={focusRect.width}
                        height={focusRect.height}
                        rx={6}
                        ry={6}
                        fill="rgb(var(--reader-highlight-fill))"
                        stroke="rgb(var(--reader-highlight-stroke))"
                        strokeWidth={2}
                      />
                    </svg>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </Card>

        {isCardPanelOpen ? (
          <ReaderCardPanel cards={pageCards} anchors={anchors} currentPage={reader.currentPage} />
        ) : (
          <aside
            className="hidden min-h-0 border-l border-line-soft bg-paper-muted/56 xl:flex"
            data-testid="reader-card-panel-placeholder"
            aria-hidden="true"
          />
        )}
      </div>
      <Drawer open={isCardDrawerOpen} onOpenChange={setCardDrawerOpen}>
        <DrawerContent side="right" className="flex max-h-screen flex-col p-0">
          <DrawerHeader className="mb-0 border-b border-line-soft p-4 pr-12">
            <DrawerTitle className="font-ui text-base font-medium text-ink">当前页卡片</DrawerTitle>
            <DrawerDescription className="text-sm text-ink-muted">
              第 {reader.currentPage} 页 · {pageCards.length} 张卡片
            </DrawerDescription>
          </DrawerHeader>
          <ReaderCardPanel
            cards={pageCards}
            anchors={anchors}
            currentPage={reader.currentPage}
            className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-paper-muted/82"
          />
        </DrawerContent>
      </Drawer>
    </div>
  )
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError'
}
