import { useEffect, useState } from 'react'
import { Button, Input } from '@/components/ui'

interface PdfToolbarProps {
  currentPage: number
  totalPages: number
  scale: number
  documentTitle: string
  isSearchOpen: boolean
  isExporting?: boolean
  onPageChange: (page: number) => void
  onScaleChange: (scale: number) => void
  onSearchToggle: () => void
  onOpenCardStudio: () => void
  onExportAnnotatedPdf: () => void
  onClose: () => void
}

const SCALE_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3]

export function PdfToolbar({
  currentPage,
  totalPages,
  scale,
  documentTitle,
  isSearchOpen,
  isExporting = false,
  onPageChange,
  onScaleChange,
  onSearchToggle,
  onOpenCardStudio,
  onExportAnnotatedPdf,
  onClose,
}: PdfToolbarProps) {
  const [pageInput, setPageInput] = useState(String(currentPage))

  useEffect(() => {
    setPageInput(String(currentPage))
  }, [currentPage])

  const zoomIn = () => {
    const nextStep = SCALE_STEPS.find((s) => s > scale)
    if (nextStep) onScaleChange(nextStep)
  }

  const zoomOut = () => {
    const prevStep = [...SCALE_STEPS].reverse().find((s) => s < scale)
    if (prevStep) onScaleChange(prevStep)
  }

  const submitPageInput = () => {
    const nextPage = Number.parseInt(pageInput, 10)
    if (Number.isNaN(nextPage)) {
      setPageInput(String(currentPage))
      return
    }

    onPageChange(nextPage)
  }

  return (
    <div className="flex flex-col border-b border-line-soft bg-paper-base/95">
      <div className="flex flex-col gap-3 px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-center gap-2 overflow-hidden">
          <Button variant="ghost" size="sm" onClick={onClose} title="返回文档库">
            <ArrowLeftIcon />
          </Button>
          <div className="min-w-0">
            <p className="truncate font-ui text-sm text-ink">{documentTitle}</p>
            <p className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">轻量 PDF 阅读贴笺台</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          <Button
            variant={isSearchOpen ? 'default' : 'outline'}
            size="sm"
            onClick={onSearchToggle}
            data-testid="reader-toggle-search"
          >
            <SearchIcon />
            <span className="ml-1">搜索</span>
          </Button>
          <Button variant="outline" size="sm" onClick={onOpenCardStudio}>
            <SparklesIcon />
            <span className="ml-1">AI 卡片</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onExportAnnotatedPdf}
            disabled={isExporting}
            data-testid="reader-export-annotated-pdf"
          >
            <ExportIcon />
            <span className="ml-1">{isExporting ? '导出中…' : '导出批注 PDF'}</span>
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-line-soft/80 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
            title="上一页"
          >
            <ChevronLeftIcon />
          </Button>

          <div className="flex items-center gap-2 rounded-full border border-line-soft bg-paper-card px-2 py-1">
            <Input
              value={pageInput}
              onChange={(event) => setPageInput(event.target.value)}
              onBlur={submitPageInput}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  submitPageInput()
                }
              }}
              className="h-7 w-14 border-none bg-transparent px-1 text-center font-latin shadow-none"
              inputMode="numeric"
              aria-label="跳转页码"
            />
            <span className="font-latin text-xs text-ink-soft">/ {totalPages}</span>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
            title="下一页"
          >
            <ChevronRightIcon />
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={zoomOut}
            disabled={scale <= SCALE_STEPS[0]}
            title="缩小"
          >
            <MinusIcon />
          </Button>
          <span className="min-w-[3.5rem] text-center font-latin text-xs text-ink-muted">
            {Math.round(scale * 100)}%
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={zoomIn}
            disabled={scale >= SCALE_STEPS[SCALE_STEPS.length - 1]}
            title="放大"
          >
            <PlusIcon />
          </Button>
        </div>
      </div>
    </div>
  )
}

function ArrowLeftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  )
}

function ChevronLeftIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

function ChevronRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

function MinusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 12h14" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  )
}

function SparklesIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="m12 3 1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3Z" />
      <path d="m19 3 .7 1.8L21.5 5.5l-1.8.7L19 8l-.7-1.8L16.5 5.5l1.8-.7L19 3Z" />
    </svg>
  )
}

function ExportIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M12 15V3" />
      <path d="m7 8 5-5 5 5" />
      <path d="M5 21h14" />
      <path d="M6 17v4M18 17v4" />
    </svg>
  )
}
