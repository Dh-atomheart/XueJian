import { useState, useMemo } from 'react'
import { CardContentRenderer } from './CardContentRenderer'
import { cn } from '@/lib/utils'

export interface ClozeCardContentProps {
  content: string
  /** When true, all cloze blanks are revealed. */
  revealed?: boolean
  className?: string
}

interface ClozeToken {
  index: number
  answer: string
  hint?: string
}

const CLOZE_RE = /\{\{c(\d+)::([^}]*?)(?:::([^}]*?))?\}\}/g

function parseClozes(text: string): { tokens: ClozeToken[]; indices: number[] } {
  const tokens: ClozeToken[] = []
  const indexSet = new Set<number>()
  let m: RegExpExecArray | null
  while ((m = CLOZE_RE.exec(text)) !== null) {
    const idx = parseInt(m[1], 10)
    tokens.push({ index: idx, answer: m[2], hint: m[3] })
    indexSet.add(idx)
  }
  return { tokens, indices: Array.from(indexSet).sort((a, b) => a - b) }
}

function renderClozeMarkdown(text: string, revealedIndices: Set<number>): string {
  return text.replace(CLOZE_RE, (_match, idxStr: string, answer: string, hint?: string) => {
    const idx = parseInt(idxStr, 10)
    if (revealedIndices.has(idx)) {
      return `**${answer}**`
    }
    return `[\u2588${hint ? ` ${hint}` : ''}\u2588]`
  })
}

/**
 * Renders cloze-deletion cards with `{{c1::answer::hint}}` syntax.
 * Each numbered blank can be independently revealed.
 */
export function ClozeCardContent({ content, revealed = false, className }: ClozeCardContentProps) {
  const { indices } = useMemo(() => parseClozes(content), [content])
  const [revealedSet, setRevealedSet] = useState<Set<number>>(new Set())

  const effectiveRevealed = useMemo(() => {
    if (revealed) return new Set(indices)
    return revealedSet
  }, [revealed, indices, revealedSet])

  const renderedMd = useMemo(
    () => renderClozeMarkdown(content, effectiveRevealed),
    [content, effectiveRevealed]
  )

  const toggleIndex = (idx: number) => {
    setRevealedSet((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  return (
    <div className={cn('cloze-card', className)}>
      <CardContentRenderer content={renderedMd} />
      {!revealed && indices.length > 0 && (
        <div className="flex gap-2 mt-3 flex-wrap">
          {indices.map((idx) => (
            <button
              key={idx}
              onClick={(e) => {
                e.stopPropagation()
                toggleIndex(idx)
              }}
              className={cn(
                'px-2.5 py-1 text-xs rounded-md border transition-all',
                effectiveRevealed.has(idx)
                  ? 'bg-ink/10 border-ink/20 text-ink font-medium'
                  : 'border-line-soft/60 text-ink-muted hover:border-ink/30'
              )}
            >
              c{idx}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
