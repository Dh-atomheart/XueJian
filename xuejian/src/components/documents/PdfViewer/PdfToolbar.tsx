import { Button } from '@/components/ui'

interface PdfToolbarProps {
  currentPage: number
  totalPages: number
  scale: number
  documentTitle: string
  onPageChange: (page: number) => void
  onScaleChange: (scale: number) => void
  onClose: () => void
}

const SCALE_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3]

export function PdfToolbar({
  currentPage,
  totalPages,
  scale,
  documentTitle,
  onPageChange,
  onScaleChange,
  onClose,
}: PdfToolbarProps) {
  const zoomIn = () => {
    const nextStep = SCALE_STEPS.find((s) => s > scale)
    if (nextStep) onScaleChange(nextStep)
  }

  const zoomOut = () => {
    const prevStep = [...SCALE_STEPS].reverse().find((s) => s < scale)
    if (prevStep) onScaleChange(prevStep)
  }

  return (
    <div className="flex h-10 items-center justify-between border-b border-line-soft bg-paper-muted px-3">
      {/* Left: back + title */}
      <div className="flex items-center gap-2 overflow-hidden">
        <Button variant="ghost" size="sm" onClick={onClose} title="返回文档库">
          <ArrowLeftIcon />
        </Button>
        <span className="truncate font-ui text-sm text-ink">{documentTitle}</span>
      </div>

      {/* Center: page nav */}
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
        <span className="min-w-[4rem] text-center font-latin text-xs text-ink-muted">
          {currentPage} / {totalPages}
        </span>
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

      {/* Right: zoom */}
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
        <span className="min-w-[3rem] text-center font-latin text-xs text-ink-muted">
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
  )
}

function ArrowLeftIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  )
}

function ChevronLeftIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

function ChevronRightIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

function MinusIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M5 12h14" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}
