import { ExternalLink, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/shared/ui'

export interface SourceQuoteBlockProps {
  quote?: string | null
  documentTitle?: string | null
  pageLabel?: string | number | null
  onOpenSource?: () => void
  className?: string
}

export function SourceQuoteBlock({
  quote,
  documentTitle,
  pageLabel,
  onOpenSource,
  className,
}: SourceQuoteBlockProps) {
  const trimmedQuote = quote?.trim()
  const pageText = pageLabel != null ? `P.${pageLabel}` : null

  return (
    <div className={cn('rounded-lg border border-line-soft bg-paper-muted/55 px-3 py-3', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-ink-soft">
            <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {documentTitle?.trim() ? <span className="truncate">{documentTitle.trim()}</span> : null}
            {pageText ? <span className="shrink-0">{pageText}</span> : null}
            {!documentTitle?.trim() && !pageText ? <span>来源片段</span> : null}
          </div>
          {trimmedQuote ? (
            <blockquote className="mt-2 line-clamp-3 border-l border-line-soft pl-3 text-xs leading-5 text-ink-muted">
              {trimmedQuote}
            </blockquote>
          ) : (
            <p className="mt-2 text-xs leading-5 text-ink-soft">暂无来源摘录。</p>
          )}
        </div>
        {onOpenSource ? (
          <Button variant="ghost" size="sm" className="h-7 shrink-0 gap-1.5 px-2 text-xs" onClick={onOpenSource}>
            <ExternalLink className="h-3.5 w-3.5" />
            来源
          </Button>
        ) : null}
      </div>
    </div>
  )
}
