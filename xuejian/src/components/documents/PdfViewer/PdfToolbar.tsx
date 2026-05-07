import { ArrowLeft, ChevronLeft, ChevronRight, Minus, PanelRightClose, PanelRightOpen, Plus } from 'lucide-react'
import { Button } from '@/components/ui'

interface PdfToolbarProps {
  currentPage: number
  totalPages: number
  scale: number
  documentTitle: string
  isCardPanelOpen?: boolean
  onPageChange: (page: number) => void
  onScaleChange: (scale: number) => void
  onToggleCardPanel?: () => void
  onOpenCardDrawer?: () => void
  onClose: () => void
}

const SCALE_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3]

export function PdfToolbar({
  currentPage,
  totalPages,
  scale,
  documentTitle,
  isCardPanelOpen = true,
  onPageChange,
  onScaleChange,
  onToggleCardPanel,
  onOpenCardDrawer,
  onClose,
}: PdfToolbarProps) {
  const zoomIn = () => {
    const nextStep = SCALE_STEPS.find((step) => step > scale)
    if (nextStep) onScaleChange(nextStep)
  }

  const zoomOut = () => {
    const prevStep = [...SCALE_STEPS].reverse().find((step) => step < scale)
    if (prevStep) onScaleChange(prevStep)
  }

  return (
    <div className="flex h-11 shrink-0 items-center justify-between border-b border-line-soft bg-paper-muted px-3">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          title="返回文档库"
          aria-label="返回文档库"
          data-testid="reader-close"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="truncate font-ui text-sm text-ink">{documentTitle}</span>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          title="上一页"
          aria-label="上一页"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-[4.5rem] text-center font-latin text-xs tabular-nums text-ink-muted">
          {currentPage} / {totalPages}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          title="下一页"
          aria-label="下一页"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-end gap-1">
        {onOpenCardDrawer ? (
          <Button
            variant="ghost"
            size="icon-sm"
            className="xl:hidden"
            onClick={onOpenCardDrawer}
            title="显示当前页卡片"
            aria-label="显示当前页卡片"
            data-testid="reader-open-card-drawer"
          >
            <PanelRightOpen className="h-4 w-4" />
          </Button>
        ) : null}
        {onToggleCardPanel ? (
          <Button
            variant="ghost"
            size="icon-sm"
            className="hidden xl:inline-flex"
            onClick={onToggleCardPanel}
            title={isCardPanelOpen ? '隐藏当前页卡片' : '显示当前页卡片'}
            aria-label={isCardPanelOpen ? '隐藏当前页卡片' : '显示当前页卡片'}
            data-testid="reader-toggle-card-panel"
          >
            {isCardPanelOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={zoomOut}
          disabled={scale <= SCALE_STEPS[0]}
          title="缩小"
          aria-label="缩小"
        >
          <Minus className="h-4 w-4" />
        </Button>
        <span className="min-w-[4rem] text-center font-latin text-xs tabular-nums text-ink-muted">
          {Math.round(scale * 100)}%
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={zoomIn}
          disabled={scale >= SCALE_STEPS[SCALE_STEPS.length - 1]}
          title="放大"
          aria-label="放大"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
