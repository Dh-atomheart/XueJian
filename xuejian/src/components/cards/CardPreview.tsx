import { cn } from '@/lib/utils'
import { Badge, Card, CardContent } from '@/shared/ui'
import { CardContentRenderer } from './CardContentRenderer'
import { SourceQuoteBlock } from './SourceQuoteBlock'

export interface CardPreviewProps {
  front: string
  back: string
  tags?: string[]
  documentTitle?: string | null
  pageLabel?: string | number | null
  nextReviewLabel?: string | null
  sourceQuote?: string | null
  onOpenSource?: () => void
  className?: string
  'data-testid'?: string
}

export function CardPreview({
  front,
  back,
  tags = [],
  documentTitle,
  pageLabel,
  nextReviewLabel,
  sourceQuote,
  onOpenSource,
  className,
  'data-testid': dataTestId,
}: CardPreviewProps) {
  const sourceLabel = [documentTitle?.trim(), pageLabel != null ? `P.${pageLabel}` : null]
    .filter(Boolean)
    .join(' · ')

  return (
    <Card className={cn('gap-0 overflow-hidden', className)} data-testid={dataTestId}>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {sourceLabel ? (
            <span className="truncate text-xs text-ink-soft">{sourceLabel}</span>
          ) : (
            <span className="text-xs text-ink-soft">未标注来源</span>
          )}
          {nextReviewLabel ? (
            <Badge variant="secondary" className="rounded-md font-normal">
              {nextReviewLabel}
            </Badge>
          ) : null}
        </div>

        <div className="space-y-2">
          <div className="rounded-lg bg-highlight-yellow/12 px-3 py-2">
            <p className="mb-1 text-[11px] text-ink-soft">正面</p>
            <CardContentRenderer content={front} compact className="line-clamp-3 text-sm leading-6 text-ink" />
          </div>
          <div className="rounded-lg bg-paper-muted/70 px-3 py-2">
            <p className="mb-1 text-[11px] text-ink-soft">背面</p>
            <CardContentRenderer content={back} compact className="line-clamp-3 text-sm leading-6 text-ink-muted" />
          </div>
        </div>

        {sourceQuote != null || onOpenSource ? (
          <SourceQuoteBlock
            quote={sourceQuote}
            documentTitle={documentTitle}
            pageLabel={pageLabel}
            onOpenSource={onOpenSource}
          />
        ) : null}

        {tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span key={tag} className="rounded-full border border-line-soft bg-paper-card px-2 py-0.5 text-[10px] text-ink-soft">
                #{tag}
              </span>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
