import { getAnnotationSwatchClass } from '@/lib/annotationPalette'
import { cn } from '@/lib/utils'

interface PageNavBarProps {
  currentPage: number
  totalPages: number
  pageMarkers?: Record<number, string[]>
  onPageChange: (page: number) => void
}

export function PageNavBar({
  currentPage,
  totalPages,
  pageMarkers,
  onPageChange,
}: PageNavBarProps) {
  const pageNumbers = Array.from({ length: totalPages }, (_, index) => index + 1)

  return (
    <aside className="flex h-full min-h-0 flex-col rounded-[28px] border border-line-soft bg-[linear-gradient(180deg,rgb(var(--paper-card)/0.95),rgb(var(--paper-muted)/0.98))] shadow-paper">
      <div className="border-b border-line-soft px-4 py-4">
        <p className="text-[11px] uppercase tracking-[0.24em] text-ink-soft">Pages</p>
        <h2 className="mt-2 font-ui text-base text-ink">页码索引</h2>
        <p className="mt-1 text-xs leading-5 text-ink-soft">
          纯文字页码加卡片提示点，滚动成本最低。
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-3 py-3" data-testid="reader-page-nav">
        <div className="space-y-2">
          {pageNumbers.map((pageNumber) => {
            const colors = pageMarkers?.[pageNumber] ?? []
            const isActive = pageNumber === currentPage

            return (
              <div key={pageNumber} className="px-1 py-1">
                <button
                  type="button"
                  onClick={() => onPageChange(pageNumber)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-[18px] border px-3 py-2 text-left transition-all duration-200',
                    isActive
                      ? 'border-ink/20 bg-paper-base text-ink shadow-card'
                      : 'border-transparent bg-paper-card/60 text-ink-soft hover:border-ink/10 hover:bg-paper-card'
                  )}
                >
                  <span className="font-latin text-sm tabular-nums">
                    {String(pageNumber).padStart(2, '0')}
                  </span>
                  <span className="flex items-center gap-1">
                    {colors.slice(0, 4).map((color, index) => (
                      <span
                        key={`${pageNumber}-${color}-${index}`}
                        aria-hidden
                        className={cn(
                          'h-2 w-2 rounded-full ring-1 ring-ink/8',
                          getAnnotationSwatchClass(color)
                        )}
                      />
                    ))}
                    {colors.length > 4 ? (
                      <span className="font-latin text-[10px] text-ink-soft">
                        +{colors.length - 4}
                      </span>
                    ) : null}
                  </span>
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </aside>
  )
}
