import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import 'katex/dist/katex.min.css'
import { cn } from '@/lib/utils'

export interface CardMarkdownRendererProps {
  content: string
  className?: string
  compact?: boolean
  variant?: 'card' | 'knowledge'
  components?: Components
}

function normalizeMathDelimitersOutsideCodeBlocks(content: string): string {
  return content
    .split(/(```[\s\S]*?```)/g)
    .map((segment) => {
      if (segment.startsWith('```')) {
        return segment
      }

      return removeUnpairedDisplayMathDelimiters(segment)
        .replace(/\\\[([\s\S]*?)\\\]/g, (_match, math: string) => `$$\n${math.trim()}\n$$`)
        .replace(/\\\(([\s\S]*?)\\\)/g, (_match, math: string) => `$${math.trim()}$`)
    })
    .join('')
}

function removeUnpairedDisplayMathDelimiters(content: string): string {
  const delimiterPattern = /(^|[^\\])\$\$/g
  const matches = [...content.matchAll(delimiterPattern)]

  if (matches.length % 2 === 0) {
    return content
  }

  const lastMatch = matches[matches.length - 1]
  const matchIndex = lastMatch.index ?? -1
  if (matchIndex < 0) {
    return content
  }

  const delimiterIndex = matchIndex + lastMatch[1].length
  return `${content.slice(0, delimiterIndex)}${content.slice(delimiterIndex + 2)}`
}

export function CardMarkdownRenderer({
  content,
  className,
  compact = false,
  variant = 'card',
  components,
}: CardMarkdownRendererProps) {
  const normalizedContent = normalizeMathDelimitersOutsideCodeBlocks(content)

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
        'prose-table:my-0 prose-th:border prose-th:border-line-soft prose-th:bg-paper-muted prose-th:px-2 prose-th:py-1 prose-th:text-left',
        'prose-td:border prose-td:border-line-soft prose-td:px-2 prose-td:py-1',
        '[&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex-display]:py-1',
        !compact && variant === 'card' && 'text-base',
        variant === 'knowledge' && 'text-sm leading-6',
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { errorColor: 'currentColor', throwOnError: false }]]}
        components={{
          table: ({ children, ...props }) => (
            <div className="my-3 w-full overflow-x-auto rounded-lg border border-line-soft">
              <table className="min-w-full border-collapse text-xs" {...props}>
                {children}
              </table>
            </div>
          ),
          ...components,
        }}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  )
}
