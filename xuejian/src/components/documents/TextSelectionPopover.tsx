import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'

export interface ReaderSelectionState {
  text: string
  rects: Array<{ x: number; y: number; width: number; height: number }>
  position: { x: number; y: number }
}

interface TextSelectionPopoverProps {
  selection: ReaderSelectionState | null
  isBusy?: boolean
  isLinkingMode?: boolean
  targetCardLabel?: string | null
  onCreateHighlight: () => void
  onCreateCard: () => void
  onLinkSelection: () => void
  onDismiss: () => void
}

export function TextSelectionPopover({
  selection,
  isBusy = false,
  isLinkingMode = false,
  targetCardLabel,
  onCreateHighlight,
  onCreateCard,
  onLinkSelection,
  onDismiss,
}: TextSelectionPopoverProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!containerRef.current || !selection) {
      return
    }

    containerRef.current.style.left = `${selection.position.x * 100}%`
    containerRef.current.style.top = `${Math.max(selection.position.y * 100 - 1.2, 4)}%`
  }, [selection])

  if (!selection) {
    return null
  }

  return (
    <div
      ref={containerRef}
      className="absolute z-30 w-[320px] max-w-[calc(100%-24px)] -translate-x-1/2 -translate-y-full"
      data-testid="reader-selection-popover"
    >
      <div className="rounded-[20px] border border-ink/10 bg-paper-base/95 px-4 py-3 shadow-[0_18px_46px_rgba(33,30,24,0.14)] backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">
              {isLinkingMode ? 'Linking' : 'Selection'}
            </p>
            <p className="mt-2 text-sm leading-6 text-ink">
              {selection.text.length > 72 ? `${selection.text.slice(0, 72)}…` : selection.text}
            </p>
            {isLinkingMode ? (
              <p className="mt-2 text-xs leading-5 text-ink-soft">
                当前会把这段原文关联到 {targetCardLabel ?? '所选卡片'}。
              </p>
            ) : (
              <p className="mt-2 text-xs leading-5 text-ink-soft">
                右侧卡片会自动按页内顺序分配颜色。
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onDismiss}
            className="rounded-full p-1 text-ink-soft transition hover:bg-paper-muted hover:text-ink"
            aria-label="关闭选区操作"
            title="关闭选区操作"
          >
            <CloseIcon />
          </button>
        </div>

        <div
          className={cn('mt-3 flex flex-wrap gap-2', isBusy && 'pointer-events-none opacity-70')}
        >
          {isLinkingMode ? (
            <Button variant="default" size="sm" onClick={onLinkSelection} disabled={isBusy}>
              {isBusy ? '关联中…' : '关联到这张卡片'}
            </Button>
          ) : (
            <>
              <Button variant="default" size="sm" onClick={onCreateHighlight} disabled={isBusy}>
                {isBusy ? '保存中…' : '仅高亮'}
              </Button>
              <Button variant="outline" size="sm" onClick={onCreateCard} disabled={isBusy}>
                创建卡片
              </Button>
            </>
          )}
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            忽略
          </Button>
        </div>
      </div>
    </div>
  )
}

function CloseIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  )
}
