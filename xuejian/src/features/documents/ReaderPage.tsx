import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  HighlightLayer,
  PageNavBar,
  PdfPageCanvas,
  PdfSearchBar,
  PdfTextLayer,
  PdfToolbar,
  StickyNotesPanel,
  TextSelectionPopover,
  type ReaderSelectionState,
} from '@/components/documents'
import { Button, Panel } from '@/components/ui'
import { getAnnotationColor } from '@/lib/annotationPalette'
import { reportAppError } from '@/lib/appFeedback'
import { resolveReaderRect, type ReaderRect, type ReaderViewport } from '@/lib/readerGeometry'
import {
  useCardsQuery,
  useCreateCardMutation,
  useCreateHighlightMutation,
  useDocumentAnchorsQuery,
  useDocumentQuery,
  useHighlightsQuery,
} from '@/queries'
import { cardsGateway } from '@/services/gateway/cards'
import { documentGateway } from '@/services/gateway/documents'
import {
  resolvePdfDocumentSource,
  searchPdfDocument,
  type PdfDocumentSource,
} from '@/services/renderer/pdf'
import { useAppUiStore } from '@/store'
import type { DocumentAnchor, Highlight } from '@/types'

interface ReaderPageProps {
  documentId: string
}

export function ReaderPage({ documentId }: ReaderPageProps) {
  const {
    reader,
    closeReader,
    setContextRailOpen,
    setReaderPage,
    setReaderScale,
    setReaderTotalPages,
    selectCard,
    selectHighlight,
    hoverHighlight,
    openReaderSearch,
    closeReaderSearch,
    setReaderSearchQuery,
    setReaderSearchResults,
    setReaderSearchMatchIndex,
    exitLinkingMode,
    setActiveNavItem,
    isContextRailOpen,
  } = useAppUiStore(
    useShallow((state) => ({
      reader: state.reader,
      closeReader: state.closeReader,
      setContextRailOpen: state.setContextRailOpen,
      setReaderPage: state.setReaderPage,
      setReaderScale: state.setReaderScale,
      setReaderTotalPages: state.setReaderTotalPages,
      selectCard: state.selectCard,
      selectHighlight: state.selectHighlight,
      hoverHighlight: state.hoverHighlight,
      openReaderSearch: state.openReaderSearch,
      closeReaderSearch: state.closeReaderSearch,
      setReaderSearchQuery: state.setReaderSearchQuery,
      setReaderSearchResults: state.setReaderSearchResults,
      setReaderSearchMatchIndex: state.setReaderSearchMatchIndex,
      exitLinkingMode: state.exitLinkingMode,
      setActiveNavItem: state.setActiveNavItem,
      isContextRailOpen: state.isContextRailOpen,
    }))
  )
  const { data: document, isLoading: isLoadingDocument } = useDocumentQuery(documentId)
  const { data: anchors = [] } = useDocumentAnchorsQuery(documentId)
  const { data: cards = [] } = useCardsQuery({ documentId, limit: 5000 }, { enabled: Boolean(documentId) })
  const { data: highlights = [] } = useHighlightsQuery({ documentId, limit: 5000 }, { enabled: Boolean(documentId) })

  const [pdfSource, setPdfSource] = useState<PdfDocumentSource | null>(null)
  const [isLoadingBinary, setIsLoadingBinary] = useState(false)
  const [binaryError, setBinaryError] = useState<string | null>(null)
  const [pageRenderError, setPageRenderError] = useState<string | null>(null)
  const [readerNotice, setReaderNotice] = useState<string | null>(null)
  const [selection, setSelection] = useState<ReaderSelectionState | null>(null)
  const [isSelectionBusy, setIsSelectionBusy] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [pageViewport, setPageViewport] = useState<ReaderViewport | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const pageFrameRef = useRef<HTMLDivElement | null>(null)
  const selectionTimerRef = useRef<number | null>(null)
  const deferredSearchQuery = useDeferredValue(reader.searchQuery)
  const createHighlight = useCreateHighlightMutation()
  const createCard = useCreateCardMutation()

  const highlightByCardId = useMemo<Record<string, Highlight>>(
    () =>
      Object.fromEntries(
        highlights.filter((item) => item.cardId).map((item) => [item.cardId as string, item])
      ),
    [highlights]
  )

  const currentPageCards = useMemo(
    () =>
      cards.filter(
        (card) =>
          (highlightByCardId[card.id]?.pageNumber ?? card.sourcePage ?? reader.currentPage) ===
          reader.currentPage
      ),
    [cards, highlightByCardId, reader.currentPage]
  )

  const currentPageHighlights = useMemo(
    () => highlights.filter((highlight) => highlight.pageNumber === reader.currentPage),
    [highlights, reader.currentPage]
  )

  const tagMatchedCardIds = useMemo<Set<string> | null>(() => {
    if (reader.annotationFilterTags.length === 0) {
      return null
    }

    return new Set(
      cards
        .filter((card) => reader.annotationFilterTags.every((tag) => card.tags.includes(tag)))
        .map((card) => card.id)
    )
  }, [cards, reader.annotationFilterTags])

  const mutedCurrentPageHighlightIds = useMemo(() => {
    if (!tagMatchedCardIds) {
      return new Set<string>()
    }

    return new Set(
      currentPageHighlights
        .filter((highlight) => !highlight.cardId || !tagMatchedCardIds.has(highlight.cardId))
        .map((highlight) => highlight.id)
    )
  }, [currentPageHighlights, tagMatchedCardIds])

  const pageMarkers = useMemo<Record<number, string[]>>(() => {
    const markers = new Map<number, string[]>()

    for (const card of cards) {
      const highlight = highlightByCardId[card.id] ?? null
      const pageNumber = highlight?.pageNumber ?? card.sourcePage
      if (!pageNumber) {
        continue
      }

      const color = highlight?.color ?? getAnnotationColor(markers.get(pageNumber)?.length ?? 0)
      markers.set(pageNumber, [...(markers.get(pageNumber) ?? []), color])
    }

    return Object.fromEntries(markers)
  }, [cards, highlightByCardId])

  useEffect(() => {
    if (document?.pageCount) {
      setReaderTotalPages(document.pageCount)
    }
  }, [document?.pageCount, setReaderTotalPages])

  useEffect(() => {
    let cancelled = false

    if (!document) {
      setPdfSource(null)
      setBinaryError(null)
      setIsLoadingBinary(false)
      return () => {
        cancelled = true
      }
    }

    if (document.fileType !== 'pdf') {
      setPdfSource(null)
      setBinaryError('当前阅读器仅支持 PDF 文档。')
      setIsLoadingBinary(false)
      return () => {
        cancelled = true
      }
    }

    setIsLoadingBinary(true)
    setBinaryError(null)

    void resolvePdfDocumentSource(document.filePath, () => documentGateway.readBinary(document.id))
      .then((nextSource) => {
        if (!cancelled) {
          setPdfSource(nextSource)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setPdfSource(null)
          setBinaryError(
            reportAppError('阅读器', error, {
              title: '准备 PDF 数据源失败',
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
  }, [document])

  useEffect(() => {
    setSelection(null)
    window.getSelection()?.removeAllRanges()
  }, [reader.currentPage])

  useEffect(() => {
    setPageViewport(null)
    setPageRenderError(null)
  }, [documentId, reader.currentPage, reader.scale])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
        return

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        openReaderSearch()
        return
      }

      const totalPages = Math.max(reader.totalPages, document?.pageCount ?? 1, 1)

      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        if (reader.currentPage > 1) setReaderPage(reader.currentPage - 1)
        return
      }

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        if (reader.currentPage < totalPages) setReaderPage(reader.currentPage + 1)
        return
      }

      if (e.key === 'Escape') {
        e.preventDefault()
        if (selection) {
          clearSelection()
          return
        }

        if (reader.isLinkingMode) {
          exitLinkingMode()
          return
        }

        if (reader.isSearchOpen) {
          closeReaderSearch()
          return
        }

        closeReader()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    closeReader,
    closeReaderSearch,
    document?.pageCount,
    exitLinkingMode,
    openReaderSearch,
    reader.currentPage,
    reader.isLinkingMode,
    reader.isSearchOpen,
    reader.totalPages,
    selection,
    setReaderPage,
  ])

  useEffect(() => {
    return () => {
      if (selectionTimerRef.current) {
        window.clearTimeout(selectionTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!reader.isSearchOpen || !pdfSource) {
      setIsSearching(false)
      return
    }

    if (!deferredSearchQuery.trim()) {
      setReaderSearchResults([])
      setIsSearching(false)
      return
    }

    let active = true
    setIsSearching(true)

    void searchPdfDocument(pdfSource, deferredSearchQuery)
      .then((results) => {
        if (!active) {
          return
        }

        setReaderSearchResults(results)

        const currentPageFirstIndex = results.findIndex((result) => result.page === reader.currentPage)
        if (currentPageFirstIndex > 0) {
          setReaderSearchMatchIndex(currentPageFirstIndex)
        }
      })
      .catch((error) => {
        if (active) {
          setReaderNotice(
            reportAppError('PDF 搜索', error, {
              title: '搜索 PDF 文本失败',
              showToast: true,
            })
          )
        }
      })
      .finally(() => {
        if (active) {
          setIsSearching(false)
        }
      })

    return () => {
      active = false
    }
  }, [
    deferredSearchQuery,
    pdfSource,
    reader.currentPage,
    reader.isSearchOpen,
    setReaderSearchMatchIndex,
    setReaderSearchResults,
  ])

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
    () => cards.find((card) => card.id === reader.selectedCardId) ?? null,
    [cards, reader.selectedCardId]
  )

  const selectedHighlight = useMemo(
    () => highlights.find((item) => item.id === reader.selectedHighlightId) ?? null,
    [highlights, reader.selectedHighlightId]
  )

  const currentSearchMatch = reader.searchResults[reader.searchMatchIndex] ?? null
  const currentPageSearchRects = useMemo(
    () =>
      reader.searchResults
        .filter((result) => result.page === reader.currentPage)
        .flatMap((result) => result.rects),
    [reader.currentPage, reader.searchResults]
  )

  useEffect(() => {
    if (currentSearchMatch && currentSearchMatch.page !== reader.currentPage) {
      setReaderPage(currentSearchMatch.page)
    }
  }, [currentSearchMatch, reader.currentPage, setReaderPage])

  const resolvedSelectedHighlightId =
    reader.selectedHighlightId ?? (selectedCard ? highlightByCardId[selectedCard.id]?.id ?? null : null)

  const focusRect = useMemo<ReaderRect | null>(() => {
    const selectedCardHighlight = selectedCard ? highlightByCardId[selectedCard.id] ?? null : null

    const selectedCardRect =
      (selectedCardHighlight?.id ? highlightRectOverrides[selectedCardHighlight.id]?.[0] : undefined) ??
      (selectedCard?.anchorId ? anchorRectsById[selectedCard.anchorId]?.[0] : undefined) ??
      selectedCard?.sourceCoordinates ??
      null

    if (selectedCardRect) {
      return selectedCardRect
    }

    const activeHighlightRect =
      (selectedHighlight ? highlightRectOverrides[selectedHighlight.id]?.[0] : undefined) ??
      selectedHighlight?.rectangles[0] ??
      null

    if (activeHighlightRect) {
      return activeHighlightRect
    }

    if (currentSearchMatch?.page === reader.currentPage) {
      return currentSearchMatch.rects[0] ?? null
    }

    return null
  }, [
    anchorRectsById,
    currentSearchMatch,
    highlightByCardId,
    highlightRectOverrides,
    reader.currentPage,
    selectedCard,
    selectedHighlight,
  ])

  const resolvedFocusRect = useMemo(() => {
    if (!pageViewport) {
      return null
    }

    return focusRect ? resolveReaderRect(focusRect, pageViewport) : null
  }, [focusRect, pageViewport])

  useEffect(() => {
    if (!resolvedFocusRect || !scrollContainerRef.current) {
      return
    }

    const top = Math.max(0, resolvedFocusRect.y - 140)
    scrollContainerRef.current.scrollTo({ top, behavior: 'smooth' })
  }, [resolvedFocusRect])

  function handleHighlightClick(highlight: Highlight) {
    selectHighlight(highlight.id)

    if (highlight.cardId) {
      selectCard(highlight.cardId)
      setReaderNotice('已在右侧定位对应贴笺。')
      return
    }

    setReaderNotice('该高亮尚未绑定贴笺，可在右侧手动补一张。')
  }

  function clearSelection() {
    setSelection(null)
    window.getSelection()?.removeAllRanges()
  }

  function scheduleSelectionCapture() {
    if (selectionTimerRef.current) {
      window.clearTimeout(selectionTimerRef.current)
    }

    selectionTimerRef.current = window.setTimeout(() => {
      const nextSelection = readSelectionFromPage(pageFrameRef.current)
      setSelection(nextSelection)
    }, 0)
  }

  async function createSelectionHighlight(cardId?: string | null) {
    if (!selection) {
      return
    }

    const anchor = findBestAnchor(currentPageAnchors, selection.text, selection.rects)
    const pageCardIndex = resolvePageCardIndex(cardId, currentPageHighlights, highlightByCardId)

    setIsSelectionBusy(true)

    try {
      const nextHighlight = await createHighlight.mutateAsync({
        documentId,
        cardId: cardId ?? null,
        anchorId: anchor?.id ?? null,
        pageNumber: reader.currentPage,
        rectangles: selection.rects,
        textContent: selection.text,
        color: getAnnotationColor(pageCardIndex),
        pageCardIndex,
        note: null,
      })

      selectHighlight(nextHighlight.id)
      if (cardId) {
        selectCard(cardId)
        exitLinkingMode()
        setReaderNotice('已把这段原文绑定到目标卡片。')
      } else {
        setReaderNotice('已创建正文高亮。')
      }

      setContextRailOpen(true)
      clearSelection()
    } catch (error) {
      setReaderNotice(
        reportAppError('创建高亮', error, {
          title: '保存高亮失败',
          showToast: true,
        })
      )
    } finally {
      setIsSelectionBusy(false)
    }
  }

  async function createCardFromSelection() {
    if (!selection) {
      return
    }

    const anchor = findBestAnchor(currentPageAnchors, selection.text, selection.rects)
    const bounds = mergeReaderRects(selection.rects)
    const pageCardIndex = resolvePageCardIndex(null, currentPageHighlights, highlightByCardId)

    setIsSelectionBusy(true)

    try {
      const draft = buildSelectionCardDraft(selection.text)
      const nextCard = await createCard.mutateAsync({
        front: draft.front,
        back: draft.back,
        cardType: 'fact',
        documentId,
        anchorId: anchor?.id ?? null,
        sourcePage: reader.currentPage,
        sourceParagraph: anchor?.paragraph ?? null,
        sourceCoordinates: bounds,
        tags: [],
      })

      const nextHighlight = await createHighlight.mutateAsync({
        documentId,
        cardId: nextCard.id,
        anchorId: anchor?.id ?? null,
        pageNumber: reader.currentPage,
        rectangles: selection.rects,
        textContent: selection.text,
        color: getAnnotationColor(pageCardIndex),
        pageCardIndex,
        note: null,
      })

      selectCard(nextCard.id)
      selectHighlight(nextHighlight.id)
      setContextRailOpen(true)
      setReaderNotice('已创建卡片并自动绑定原文高亮。')
      clearSelection()
    } catch (error) {
      setReaderNotice(
        reportAppError('创建卡片', error, {
          title: '从选区创建卡片失败',
          showToast: true,
        })
      )
    } finally {
      setIsSelectionBusy(false)
    }
  }

  async function exportAnnotatedPdf() {
    setIsExporting(true)

    try {
      const result = await cardsGateway.exportAnnotatedPdf(documentId)
      if (!result) {
        setReaderNotice('当前没有可导出的高亮。')
        return
      }

      setReaderNotice(`已导出带批注 PDF，共写入 ${result.highlightCount} 处高亮。`)
    } catch (error) {
      setReaderNotice(
        reportAppError('导出批注 PDF', error, {
          title: '导出带注释 PDF 失败',
          showToast: true,
        })
      )
    } finally {
      setIsExporting(false)
    }
  }

  function moveSearchCursor(direction: 1 | -1) {
    if (reader.searchResults.length === 0) {
      return
    }

    const nextIndex =
      (reader.searchMatchIndex + direction + reader.searchResults.length) %
      reader.searchResults.length
    setReaderSearchMatchIndex(nextIndex)
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
          isSearchOpen={reader.isSearchOpen}
          isExporting={isExporting}
          onPageChange={(page) => setReaderPage(page)}
          onScaleChange={(scale) => setReaderScale(scale)}
          onSearchToggle={() => {
            if (reader.isSearchOpen) {
              closeReaderSearch()
            } else {
              openReaderSearch()
            }
          }}
          onOpenCardStudio={() => setActiveNavItem('cards')}
          onExportAnnotatedPdf={exportAnnotatedPdf}
          onClose={closeReader}
        />

        {reader.isSearchOpen ? (
          <PdfSearchBar
            query={reader.searchQuery}
            currentIndex={reader.searchMatchIndex}
            totalResults={reader.searchResults.length}
            isSearching={isSearching}
            onQueryChange={setReaderSearchQuery}
            onPrevious={() => moveSearchCursor(-1)}
            onNext={() => moveSearchCursor(1)}
            onClose={closeReaderSearch}
          />
        ) : null}
      </Panel>

      {readerNotice ? (
        <div className="rounded-[22px] border border-highlight-yellow/40 bg-highlight-yellow/10 px-4 py-3 text-sm text-ink-muted">
          {readerNotice}
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[132px_minmax(0,1fr)_360px]">
        <PageNavBar
          currentPage={reader.currentPage}
          totalPages={Math.max(reader.totalPages, document.pageCount ?? 1, 1)}
          pageMarkers={pageMarkers}
          onPageChange={setReaderPage}
        />

        <Panel
          variant="paperCard"
          className="flex min-h-0 flex-col overflow-hidden rounded-[32px] p-0"
          data-testid="reader-main-stage"
        >
          <div className="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-ink-soft">Reading Surface</p>
              <p className="mt-1 text-sm text-ink-muted">左页码导航、中间 PDF、右侧贴笺抽屉。</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-ink-soft">
              <span>{currentPageCards.length} 张卡片</span>
              <span>·</span>
              <span>{currentPageHighlights.length} 处高亮</span>
            </div>
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
              ) : isLoadingBinary || !pdfSource ? (
                <div className="flex min-h-[420px] items-center justify-center text-center text-sm text-ink-soft">
                  正在铺开 PDF 纸面...
                </div>
              ) : (
                <div
                  ref={pageFrameRef}
                  className="relative inline-block rounded-[12px] bg-paper-card shadow-paper"
                  onMouseUp={scheduleSelectionCapture}
                  onKeyUp={scheduleSelectionCapture}
                >
                  <PdfPageCanvas
                    pdfSource={pdfSource}
                    pageNumber={reader.currentPage}
                    scale={reader.scale}
                    className="block"
                    onViewportReady={setPageViewport}
                    onRenderError={setPageRenderError}
                  />

                  <PdfTextLayer
                    pdfSource={pdfSource}
                    pageNumber={reader.currentPage}
                    viewport={pageViewport}
                  />

                  <HighlightLayer
                    highlights={currentPageHighlights}
                    highlightRectOverrides={highlightRectOverrides}
                    viewport={pageViewport}
                    selectedHighlightId={resolvedSelectedHighlightId}
                    hoveredHighlightId={reader.hoveredHighlightId}
                    mutedHighlightIds={mutedCurrentPageHighlightIds}
                    searchRects={currentPageSearchRects}
                    onHighlightClick={handleHighlightClick}
                    onHighlightHover={hoverHighlight}
                  />

                  {resolvedFocusRect ? (
                    <svg
                      className="pointer-events-none absolute inset-0 z-20 h-full w-full"
                      data-testid="reader-focus-target"
                    >
                      <rect
                        x={resolvedFocusRect.x}
                        y={resolvedFocusRect.y}
                        width={resolvedFocusRect.width}
                        height={resolvedFocusRect.height}
                        rx={6}
                        ry={6}
                        fill="rgba(248,225,108,0.14)"
                        stroke="rgba(26,26,26,0.3)"
                        strokeWidth={2}
                      />
                    </svg>
                  ) : null}

                  <TextSelectionPopover
                    selection={selection}
                    isBusy={isSelectionBusy || createHighlight.isPending || createCard.isPending}
                    isLinkingMode={reader.isLinkingMode}
                    targetCardLabel={
                      reader.linkingTargetCardId
                        ? cards.find((card) => card.id === reader.linkingTargetCardId)?.title ??
                          cards.find((card) => card.id === reader.linkingTargetCardId)?.front ??
                          null
                        : null
                    }
                    onCreateHighlight={() => {
                      void createSelectionHighlight()
                    }}
                    onCreateCard={() => {
                      void createCardFromSelection()
                    }}
                    onLinkSelection={() => {
                      void createSelectionHighlight(reader.linkingTargetCardId)
                    }}
                    onDismiss={clearSelection}
                  />
                </div>
              )}
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
              <Panel variant="panel" className="rounded-[28px]">
                <p className="text-[11px] uppercase tracking-[0.24em] text-ink-soft">当前页提示</p>
                <div className="mt-3 space-y-3 text-sm leading-6 text-ink-muted">
                  <p>直接在 PDF 上选中文字，会弹出“高亮 / 创建卡片 / 忽略”的操作气泡。</p>
                  <p>点击高亮和右侧贴笺会双向定位；同页颜色按卡片顺序循环分配。</p>
                  <p>缺少高亮的卡片会在右侧明确标记，可进入手动关联模式修复。</p>
                </div>
              </Panel>

              <Panel variant="panel" className="rounded-[28px]">
                <p className="text-[11px] uppercase tracking-[0.24em] text-ink-soft">快捷入口</p>
                <div className="mt-3 space-y-3 text-sm leading-6 text-ink-muted">
                  <p>搜索快捷键: Ctrl/Command + F</p>
                  <p>翻页快捷键: 左右方向键</p>
                  <p>退出当前模式: Esc</p>
                </div>
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
        ) : (
          <Panel variant="panel" className="min-h-0 overflow-hidden rounded-[32px] p-0">
            <StickyNotesPanel documentId={documentId} />
          </Panel>
        )}
      </div>
    </div>
  )
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim().toLowerCase()
}

function readSelectionFromPage(container: HTMLDivElement | null): ReaderSelectionState | null {
  if (!container) {
    return null
  }

  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null
  }

  const text = selection.toString().replace(/\s+/g, ' ').trim()
  if (text.length < 2) {
    return null
  }

  const range = selection.getRangeAt(0)
  if (!container.contains(range.commonAncestorContainer)) {
    return null
  }

  const containerRect = container.getBoundingClientRect()
  const rects = Array.from(range.getClientRects())
    .filter((rect) => rect.width > 1 && rect.height > 1)
    .map((rect) => ({
      x: clamp((rect.left - containerRect.left) / containerRect.width, 0, 1),
      y: clamp((rect.top - containerRect.top) / containerRect.height, 0, 1),
      width: clamp(rect.width / containerRect.width, 0, 1),
      height: clamp(rect.height / containerRect.height, 0, 1),
    }))

  if (rects.length === 0) {
    return null
  }

  const topRect = rects[0]

  return {
    text,
    rects,
    position: {
      x: clamp(topRect.x + topRect.width / 2, 0.08, 0.92),
      y: clamp(topRect.y, 0.08, 0.96),
    },
  }
}

function findBestAnchor(
  anchors: DocumentAnchor[],
  selectionText: string,
  selectionRects: ReaderRect[]
) {
  const normalizedSelectionText = normalizeText(selectionText)
  let best: { anchor: DocumentAnchor; score: number } | null = null

  for (const anchor of anchors) {
    let score = 0
    const normalizedAnchorText = normalizeText(anchor.textQuote)

    if (normalizedAnchorText.includes(normalizedSelectionText)) {
      score += 4
    }

    if (normalizedSelectionText.includes(normalizedAnchorText)) {
      score += 2
    }

    for (const anchorRect of anchor.rects) {
      for (const selectionRect of selectionRects) {
        score += rectOverlap(anchorRect, selectionRect)
      }
    }

    if (!best || score > best.score) {
      best = { anchor, score }
    }
  }

  return best && best.score > 0.25 ? best.anchor : null
}

function mergeReaderRects(rects: ReaderRect[]) {
  const minX = Math.min(...rects.map((rect) => rect.x))
  const minY = Math.min(...rects.map((rect) => rect.y))
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width))
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height))

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

function buildSelectionCardDraft(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim()
  return {
    front: normalized.length > 72 ? `${normalized.slice(0, 72)}…` : normalized,
    back: normalized,
  }
}

function resolvePageCardIndex(
  cardId: string | null | undefined,
  pageHighlights: Highlight[],
  highlightByCardId: Record<string, Highlight>
) {
  if (cardId) {
    const existingIndex = highlightByCardId[cardId]?.pageCardIndex
    if (existingIndex !== null && existingIndex !== undefined) {
      return existingIndex
    }
  }

  const existingIndices = pageHighlights
    .map((highlight) => highlight.pageCardIndex)
    .filter((index): index is number => index !== null && index !== undefined)

  return existingIndices.length > 0 ? Math.max(...existingIndices) + 1 : 0
}

function rectOverlap(left: ReaderRect, right: ReaderRect) {
  const overlapX = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x))
  const overlapY = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y))
  return overlapX * overlapY
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
