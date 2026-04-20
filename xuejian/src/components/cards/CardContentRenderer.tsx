import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { cn } from '@/lib/utils'

export interface CardContentRendererProps {
  content: string
  className?: string
  /** Compact mode limits height and uses smaller text (for grid cards). */
  compact?: boolean
}

/**
 * Renders card content as Markdown with KaTeX math support.
 *
 * Inline math: `$...$` or `\(...\)`
 * Display math: `$$...$$` or `\[...\]`
 * Standard Markdown: headings, bold, italic, lists, code blocks, etc.
 *
 * For plain-text content (no markdown syntax), this renders as-is with
 * minimal overhead.
 */
export function CardContentRenderer({
  content,
  className,
  compact = false,
}: CardContentRendererProps) {
  return (
    <div
      className={cn(
        'card-content prose prose-sm max-w-none',
        'prose-headings:font-ui prose-headings:text-ink',
        'prose-p:text-ink prose-p:leading-relaxed',
        'prose-strong:text-ink prose-em:text-ink-muted',
        'prose-code:rounded prose-code:bg-paper-muted/70 prose-code:px-1 prose-code:py-0.5 prose-code:text-xs prose-code:font-mono',
        'prose-pre:bg-paper-muted/50 prose-pre:border prose-pre:border-line-soft/40 prose-pre:rounded-lg',
        'prose-ul:my-1 prose-ol:my-1 prose-li:my-0',
        compact && 'text-sm line-clamp-4',
        !compact && 'text-base',
        className
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
