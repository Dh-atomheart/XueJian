import { useEffect, useMemo, useRef, useState } from 'react'
import { HighlightLayer, PdfPageCanvas, PdfToolbar } from '@/components/documents'
import { Button, Card, CardContent } from '@/components/ui'
import { reportAppError } from '@/lib/appFeedback'
import { resolveReaderRect, type ReaderRect, type ReaderViewport } from '@/lib/readerGeometry'
import {
  useCardsQuery,
  useDocumentAnchorsQuery,
  useDocumentQuery,
  useHighlightsQuery,
} from '@/queries'
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
  const setContextRailOpen = useAppUiStore((state) => state.setContextRailOpen)
  const setReaderPage = useAppUiStore((state) => state.setReaderPage)
  const setReaderScale = useAppUiStore((state) => state.setReaderScale)
  const setReaderTotalPages = useAppUiStore((state) => state.setReaderTotalPages)
  const selectCard = useAppUiStore((state) => state.selectCard)
  const isContextRailOpen = useAppUiStore((state) => state.isContextRailOpen)
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
  const [readerNotice, setReaderNotice] = useState<string | null>(null)
  const [pageViewport, setPageViewport] = useState<ReaderViewport | null>(null)
  const [basePageViewport, setBasePageViewport] = useState<ReaderViewport | null>(null)
  const [pdfStageSize, setPdfStageSize] = useState({ width: 0, height: 0 })
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
              title: '读取文档二进制内容失败',
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
            title: `第 ${reader.currentPage} 页尺寸读取失败`,
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

  useEffect(() => {
    if (selectedCard || activeHighlightId) {
      return
    }

    setReaderNotice(null)
  }, [activeHighlightId, selectedCard])

  function handleHighlightClick(highlight: Highlight) {
    setActiveHighlightId(highlight.id)

    if (highlight.cardId) {
      selectCard(highlight.cardId)
      setReaderNotice('已在右侧定位对应贴笺。')
      return
    }

    setReaderNotice('该高亮尚未绑定贴笺，可在右侧手动补一张。')
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
    <div className="flex h-full min-h-0 flex-col gap-4" data-testid="reader-layout">
      {/* Toolbar */}
      <PdfToolbar
        currentPage={reader.currentPage}
        totalPages={Math.max(reader.totalPages, document.pageCount ?? 1, 1)}
        scale={reader.scale}
        documentTitle={document.title}
        onPageChange={(page) => setReaderPage(page)}
        onScaleChange={(scale) => setReaderScale(scale)}
        onClose={closeReader}
      />

      {/* Header area */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">READER</p>
            <h1 className="mt-1 text-2xl font-medium text-foreground" data-testid="app-shell-page-title">
              阅读工作台
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              边读边贴笺，保持正文专注。高亮与卡片互相定位，正文区域尽量保持克制和稳定。
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ReaderMetric label="当前页" value={`第 ${reader.currentPage} 页`} />
            <ReaderMetric label="贴笺数" value={`${pageCards.length}`} />
            <ReaderMetric label="高亮数" value={`${highlights.length}`} />
            <ReaderMetric label="缩放" value={`${Math.round(reader.scale * 100)}%`} />
          </div>
        </div>

        <Card className="border-border/50 bg-card">
          <CardContent className="p-4">
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">本页操作</p>
            <div className="mt-3 space-y-3 text-sm text-muted-foreground">
              <p>高亮会短暂聚焦，不会长期遮挡正文。</p>
              <p>选中文本后可直接创建贴笺草稿，再回到卡片工坊深化。</p>
              {!isContextRailOpen ? (
                <Button
                  variant="outline"
                  className="w-full justify-center rounded-lg"
                  onClick={() => setContextRailOpen(true)}
                >
                  打开当前页贴笺 ({pageCards.length})
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>

      {readerNotice ? (
        <Card className="border-chart-5/30 bg-chart-5/10">
          <CardContent className="px-4 py-3 text-sm text-muted-foreground">
            {readerNotice}
          </CardContent>
        </Card>
      ) : null}

      {/* Main content: PDF */}
      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="flex min-h-0 flex-col overflow-hidden border-border/50 bg-card p-0" data-testid="reader-main-stage">
          <div className="border-b border-border/30 px-4 py-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">
            正文页
          </div>

          <div
            ref={scrollContainerRef}
            className="relative flex min-h-0 flex-1 overflow-auto bg-[radial-gradient(circle_at_50%_0%,rgba(248,225,108,0.08),transparent_42%),linear-gradient(180deg,rgba(250,248,242,0.94),rgba(238,233,221,0.78))] px-6 py-8"
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
                <div className="relative inline-block max-w-full rounded-xl bg-card shadow-[0_26px_80px_-44px_rgba(38,31,24,0.48),0_2px_10px_rgba(38,31,24,0.08)] ring-1 ring-ink/10">
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
                        fill="rgba(248,225,108,0.14)"
                        stroke="rgba(26,26,26,0.3)"
                        strokeWidth={2}
                      />
                    </svg>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </Card>

        {!isContextRailOpen ? (
          <Card className="hidden border-border/50 xl:block">
            <CardContent className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <p className="text-sm text-muted-foreground">右侧贴笺栏已收起。</p>
              <Button variant="outline" className="rounded-lg" onClick={() => setContextRailOpen(true)}>
                重新展开
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  )
}

function ReaderMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/90 px-4 py-3 shadow-[0_16px_40px_-32px_rgba(48,40,32,0.25)]">
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-sm font-medium text-foreground">{value}</p>
    </div>
  )
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError'
}
