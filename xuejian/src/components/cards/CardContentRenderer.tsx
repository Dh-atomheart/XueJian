import { lazy, Suspense } from 'react'
import { cn } from '@/lib/utils'

export interface CardContentRendererProps {
  content: string
  className?: string
  /** Compact mode limits height and uses smaller text (for grid cards). */
  compact?: boolean
}

const CardMarkdownRenderer = lazy(() =>
  import('./CardMarkdownRenderer').then((module) => ({
    default: module.CardMarkdownRenderer,
  }))
)

/**
 * Renders card content as Markdown with KaTeX math support.
 *
 * The heavy Markdown/KaTeX stack is loaded on demand so card lists can paint
 * before the parser and highlighter modules finish downloading/executing.
 */
export function CardContentRenderer({
  content,
  className,
  compact = false,
}: CardContentRendererProps) {
  return (
    <Suspense
      fallback={<PlainCardContentPreview content={content} className={className} compact={compact} />}
    >
      <CardMarkdownRenderer content={content} className={className} compact={compact} />
    </Suspense>
  )
}

function PlainCardContentPreview({ content, className, compact = false }: CardContentRendererProps) {
  return (
    <div
      className={cn(
        'card-content whitespace-pre-wrap text-ink',
        compact && 'line-clamp-4 text-sm',
        !compact && 'text-base leading-relaxed',
        className
      )}
    >
      {content}
    </div>
  )
}
