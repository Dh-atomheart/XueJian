import { Button, Input } from '@/components/ui'

interface PdfSearchBarProps {
  query: string
  currentIndex: number
  totalResults: number
  isSearching: boolean
  onQueryChange: (value: string) => void
  onPrevious: () => void
  onNext: () => void
  onClose: () => void
}

export function PdfSearchBar({
  query,
  currentIndex,
  totalResults,
  isSearching,
  onQueryChange,
  onPrevious,
  onNext,
  onClose,
}: PdfSearchBarProps) {
  return (
    <div className="flex flex-col gap-3 border-b border-line-soft bg-paper-base/95 px-4 py-3 lg:flex-row lg:items-center">
      <div className="min-w-0 flex-1">
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="搜索 PDF 文本..."
          data-testid="reader-search-input"
        />
      </div>

      <div className="flex items-center gap-2">
        <span className="min-w-[5.5rem] text-center font-latin text-xs text-ink-soft">
          {isSearching ? '搜索中…' : totalResults > 0 ? `${currentIndex + 1} / ${totalResults}` : '0 / 0'}
        </span>
        <Button variant="ghost" size="sm" onClick={onPrevious} disabled={totalResults === 0}>
          上一个
        </Button>
        <Button variant="ghost" size="sm" onClick={onNext} disabled={totalResults === 0}>
          下一个
        </Button>
        <Button variant="outline" size="sm" onClick={onClose}>
          关闭
        </Button>
      </div>
    </div>
  )
}