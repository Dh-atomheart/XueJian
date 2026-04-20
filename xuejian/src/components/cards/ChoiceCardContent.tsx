import { useState, useMemo } from 'react'
import { CardContentRenderer } from './CardContentRenderer'
import { cn } from '@/lib/utils'

export interface ChoiceCardContentProps {
  /** Card front in choice format: `?> question\n- option A\n- [x] correct\n- option C` */
  content: string
  /** When true, correct answer is revealed immediately (review answer side). */
  revealed?: boolean
  /** Called when user selects an option (for scoring). */
  onSelect?: (selectedIndex: number, isCorrect: boolean) => void
  className?: string
}

interface ParsedChoice {
  question: string
  options: { text: string; correct: boolean }[]
}

function parseChoiceFormat(text: string): ParsedChoice | null {
  const lines = text.split('\n')
  const questionLines: string[] = []
  const options: { text: string; correct: boolean }[] = []
  let inOptions = false

  for (const line of lines) {
    const trimmed = line.trim()

    // Option with correct marker: - [x] text
    const correctMatch = trimmed.match(/^-\s*\[x\]\s*(.+)$/i)
    if (correctMatch) {
      inOptions = true
      options.push({ text: correctMatch[1].trim(), correct: true })
      continue
    }

    // Normal option: - text
    const optionMatch = trimmed.match(/^-\s+(.+)$/)
    if (optionMatch && (inOptions || options.length > 0 || trimmed.startsWith('-'))) {
      inOptions = true
      options.push({ text: optionMatch[1].trim(), correct: false })
      continue
    }

    // Question line (possibly with ?> prefix)
    if (!inOptions) {
      questionLines.push(trimmed.replace(/^\?>\s*/, ''))
    }
  }

  if (options.length < 2) return null
  return { question: questionLines.join('\n').trim(), options }
}

/**
 * Renders choice/MCQ cards with `?> question\n- option\n- [x] correct` syntax.
 * Provides immediate feedback on selection.
 */
export function ChoiceCardContent({
  content,
  revealed = false,
  onSelect,
  className,
}: ChoiceCardContentProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const parsed = useMemo(() => parseChoiceFormat(content), [content])

  if (!parsed) {
    return <CardContentRenderer content={content} className={className} />
  }

  const correctIndex = parsed.options.findIndex((o) => o.correct)
  const hasSelected = selectedIndex !== null
  const showResult = hasSelected || revealed

  const handleSelect = (idx: number) => {
    if (hasSelected || revealed) return
    setSelectedIndex(idx)
    onSelect?.(idx, parsed.options[idx].correct)
  }

  return (
    <div className={cn('choice-card', className)}>
      <CardContentRenderer content={parsed.question} />
      <div className="mt-4 space-y-2">
        {parsed.options.map((opt, idx) => {
          const isSelected = selectedIndex === idx
          const isCorrect = opt.correct
          let optionStyle = 'border-line-soft/60 hover:border-ink/30 cursor-pointer'

          if (showResult) {
            if (isCorrect) {
              optionStyle = 'border-green-400 bg-green-50/60 text-green-800'
            } else if (isSelected && !isCorrect) {
              optionStyle = 'border-red-400 bg-red-50/60 text-red-800'
            } else {
              optionStyle = 'border-line-soft/40 text-ink-muted opacity-60'
            }
          }

          return (
            <button
              key={idx}
              onClick={(e) => {
                e.stopPropagation()
                handleSelect(idx)
              }}
              disabled={showResult}
              className={cn(
                'w-full text-left px-4 py-3 rounded-lg border text-sm transition-all flex items-center gap-3',
                optionStyle,
                showResult && 'cursor-default'
              )}
            >
              <span
                className={cn(
                  'flex-shrink-0 w-6 h-6 rounded-full border flex items-center justify-center text-xs font-medium',
                  showResult && isCorrect && 'border-green-500 bg-green-500 text-white',
                  showResult && isSelected && !isCorrect && 'border-red-500 bg-red-500 text-white',
                  !showResult && 'border-ink/30 text-ink-muted'
                )}
              >
                {String.fromCharCode(65 + idx)}
              </span>
              <span>{opt.text}</span>
            </button>
          )
        })}
      </div>
      {showResult && (
        <p
          className={cn(
            'mt-3 text-xs',
            selectedIndex !== null && parsed.options[selectedIndex]?.correct
              ? 'text-green-600'
              : 'text-red-600'
          )}
        >
          {selectedIndex !== null && parsed.options[selectedIndex]?.correct
            ? '✓ 回答正确'
            : `✗ 正确答案是 ${String.fromCharCode(65 + correctIndex)}`}
        </p>
      )}
    </div>
  )
}
