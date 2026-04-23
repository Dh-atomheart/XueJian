import { useEffect, useMemo, useRef, useState } from 'react'
import { HighlightLayer, PdfPageCanvas, PdfToolbar } from '@/components/documents'
import { Button, Panel } from '@/components/ui'
import { reportAppError } from '@/lib/appFeedback'
import { resolveReaderRect, type ReaderRect, type ReaderViewport } from '@/lib/readerGeometry'
import { cn } from '@/lib/utils'
import {
  useCardsQuery,
  useDocumentAnchorsQuery,
  useDocumentQuery,
  useHighlightsQuery,
} from '@/queries'
import { documentGateway } from '@/services/gateway/documents'
import { useAppUiStore } from '@/store'
import type { Highlight } from '@/types'

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
  const [selectionText, setSelectionText] = useState('')
  const [readerNotice, setReaderNotice] = useState<string | null>(null)
  const [showSelectionSaved, setShowSelectionSaved] = useState(false)
  const [pageViewport, setPageViewport] = useState<ReaderViewport | null>(null)
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
    setSelectionText('')
    setShowSelectionSaved(false)
  }, [reader.currentPage])

  useEffect(() => {
    setPageViewport(null)
    setPageRenderError(null)
  }, [documentId, reader.currentPage, reader.scale])

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

  const focusRect = useMemo<FocusRect | null>(() => {
    if (!pageViewport) {
      return null
    }

    const selectedCardRect =
      (selectedCard?.anchorId ? anchorRectsById[selectedCard.anchorId]?.[0] : undefined) ??
      selectedCard?.sourceCoordinates

    if (selectedCardRect) {
      return resolveReaderRect(selectedCardRect, pageViewport)
    }

    const activeHighlight = highlights.find((item) => item.id === resolvedSelectedHighlightId)
    const activeHighlightRect =
      (activeHighlight ? highlightRectOverrides[activeHighlight.id]?.[0] : undefined) ??
      activeHighlight?.rectangles[0]

    return activeHighlightRect ? resolveReaderRect(activeHighlightRect, pageViewport) : null
  }, [
    anchorRectsById,
    highlightRectOverrides,
    highlights,
    pageViewport,
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

  function handleExcerptSelection() {
    const selected = window.getSelection?.()?.toString().trim() ?? ''
    setSelectionText(selected.length >= 4 ? selected : '')
    setShowSelectionSaved(false)
  }

  if (isLoadingDocument) {
    return (
      <Panel variant="panel" className="rounded-[32px] py-16 text-center text-ink-soft">
        正在准备阅读工作台...
      </Panel>
    )
  }

  if (!document) {
    return (
      <Panel variant="panel" className="rounded-[32px] py-16 text-center text-ink-muted">
        当前文档不存在，无法进入阅读页。
      </Panel>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4" data-testid="reader-layout">
      <Panel variant="panel" className="overflow-hidden rounded-[32px] p-0">
        <PdfToolbar
          currentPage={reader.currentPage}
          totalPages={Math.max(reader.totalPages, document.pageCount ?? 1, 1)}
          scale={reader.scale}
          documentTitle={document.title}
          onPageChange={(page) => setReaderPage(page)}
          onScaleChange={(scale) => setReaderScale(scale)}
          onClose={closeReader}
        />

        <div className="space-y-4 bg-[radial-gradient(circle_at_top_left,rgb(var(--highlight-yellow)/0.18),transparent_34%),linear-gradient(180deg,rgb(var(--paper-base)/0.92),rgb(var(--paper-soft)/0.92))] px-4 py-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_280px]">
            <div className="space-y-3">
              <div className="inline-flex items-center rounded-full border border-ink/10 bg-paper-card/70 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-ink-soft">
                阅读工作台
              </div>
              <div className="space-y-2">
                <h1 className="font-display text-2xl text-ink">边读边贴笺，保持正文专注</h1>
                <p className="max-w-3xl text-sm leading-6 text-ink-muted">
                  当前页的贴笺固定留在右侧，高亮与卡片互相定位，正文区域尽量保持克制和稳定。
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <ReaderMetric label="当前页" value={`第 ${reader.currentPage} 页`} />
                <ReaderMetric label="贴笺数" value={`${pageCards.length}`} />
                <ReaderMetric label="高亮数" value={`${highlights.length}`} />
                <ReaderMetric label="缩放" value={`${Math.round(reader.scale * 100)}%`} />
              </div>
            </div>

            <div className="rounded-[24px] border border-ink/10 bg-paper-card/75 px-4 py-4 shadow-card">
              <p className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">本页操作</p>
              <div className="mt-3 space-y-3 text-sm leading-6 text-ink-muted">
                <p>高亮会短暂聚焦，不会长期遮挡正文。</p>
                <p>选中文本后可直接创建贴笺草稿，再回到卡片工坊深化。</p>
                {!isContextRailOpen ? (
                  <Button
                    variant="sketch"
                    className="w-full justify-center"
                    onClick={() => setContextRailOpen(true)}
                  >
                    打开当前页贴笺 ({pageCards.length})
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          {readerNotice ? (
            <div className="rounded-[22px] border border-highlight-yellow/40 bg-highlight-yellow/10 px-4 py-3 text-sm text-ink-muted">
              {readerNotice}
            </div>
          ) : null}
        </div>
      </Panel>

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Panel
          variant="paperCard"
          className="flex min-h-0 flex-col overflow-hidden rounded-[32px] p-0"
          data-testid="reader-main-stage"
        >
          <div className="border-b border-line-soft px-4 py-3 text-xs uppercase tracking-[0.24em] text-ink-soft">
            正文页
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
            <div
              ref={scrollContainerRef}
              className="relative flex min-h-[520px] flex-1 items-start justify-center overflow-auto rounded-[28px] border border-line-soft bg-[linear-gradient(180deg,rgb(var(--paper-base)/0.92),rgb(var(--paper-soft)/0.92))] px-6 py-8"
              data-testid="reader-pdf-stage"
            >
              {binaryError ? (
                <div className="flex min-h-[420px] items-center justify-center text-center text-sm text-ink-muted">
                  {binaryError}
                </div>
              ) : pageRenderError ? (
                <div className="flex min-h-[420px] items-center justify-center px-6 text-center text-sm text-ink-muted">
                  <div className="space-y-3">
                    <p>{pageRenderError}</p>
                    <p className="text-xs text-ink-soft">
                      可以尝试切换页码、调整缩放，或重新打开文档。
                    </p>
                  </div>
                </div>
              ) : isLoadingBinary || !pdfBytes ? (
                <div className="flex min-h-[420px] items-center justify-center text-center text-sm text-ink-soft">
                  正在铺开 PDF 纸面...
                </div>
              ) : (
                <div className="relative inline-block rounded-[12px] bg-paper-card shadow-paper">
                  <PdfPageCanvas
                    pdfBytes={pdfBytes}
                    pageNumber={reader.currentPage}
                    scale={reader.scale}
                    className="block"
                    onViewportReady={setPageViewport}
                    onRenderError={setPageRenderError}
                  />

                  <HighlightLayer
                    highlights={highlights}
                    highlightRectOverrides={highlightRectOverrides}
                    viewport={pageViewport}
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
              )}
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
              <Panel
                variant="panel"
                className="relative rounded-[28px]"
                data-testid="reader-excerpt-panel"
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.24em] text-ink-soft">
                      页内摘录
                    </p>
                    <h2 className="mt-2 font-ui text-base text-ink">当前页摘录</h2>
                  </div>
                  <span className="text-xs text-ink-soft">可直接框选文本</span>
                </div>

                <div className="space-y-3 select-text" onMouseUp={handleExcerptSelection}>
                  {currentPageAnchors.length === 0 ? (
                    <p className="rounded-[18px] bg-paper-muted/80 px-4 py-4 text-sm leading-6 text-ink-soft">
                      当前页还没有可用的文本锚点。
                    </p>
                  ) : (
                    currentPageAnchors.map((anchor) => (
                      <p
                        key={anchor.id}
                        className={cn(
                          'rounded-[18px] border px-4 py-4 text-sm leading-7 transition-colors',
                          selectedCard?.anchorId === anchor.id
                            ? 'border-ink/15 bg-highlight-yellow/18'
                            : 'border-line-soft bg-paper-muted/80'
                        )}
                      >
                        {anchor.textQuote}
                      </p>
                    ))
                  )}
                </div>

                {selectionText ? (
                  <div className="absolute bottom-4 right-4 flex items-center gap-2 rounded-full border border-ink/10 bg-paper-base/90 px-3 py-2 shadow-card">
                    <span className="text-xs text-ink-muted">已选 {selectionText.length} 字</span>
                    <Button
                      variant="sketch"
                      size="sm"
                      onClick={() => {
                        setSelectionText('')
                        setShowSelectionSaved(true)
                        window.getSelection()?.removeAllRanges()
                      }}
                    >
                      创建贴笺草稿
                    </Button>
                  </div>
                ) : null}
              </Panel>

              <Panel variant="panel" className="rounded-[28px]">
                <p className="text-[11px] uppercase tracking-[0.24em] text-ink-soft">阅读提示</p>
                <div className="mt-3 space-y-3 text-sm leading-6 text-ink-muted">
                  <p>点击高亮会在右侧贴笺栏定位对应卡片。</p>
                  <p>点击右侧贴笺会滚动到原文坐标，不会长期污染正文。</p>
                  <p>如果坐标缺失，请回到当前页摘录区手动重绑锚点。</p>
                </div>

                {showSelectionSaved ? (
                  <div className="mt-4 rounded-[18px] border border-highlight-green/40 bg-highlight-green/10 px-3 py-3 text-sm text-ink-muted">
                    已捕获当前选区，可继续整理为贴笺或回到卡片工坊深化内容。
                  </div>
                ) : null}
              </Panel>
            </div>
          </div>
        </Panel>

        {!isContextRailOpen ? (
          <Panel variant="panel" className="hidden rounded-[32px] xl:block">
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <p className="text-sm text-ink-soft">右侧贴笺栏已收起。</p>
              <Button variant="outline" onClick={() => setContextRailOpen(true)}>
                重新展开
              </Button>
            </div>
          </Panel>
        ) : null}
      </div>
    </div>
  )
}

function ReaderMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-line-soft bg-paper-base/76 px-4 py-4">
      <p className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">{label}</p>
      <p className="mt-2 font-ui text-sm text-ink">{value}</p>
    </div>
  )
}
