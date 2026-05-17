import { FileText, Layers3, Quote, TextSelect } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppUiStore } from '@/store'
import type { Document } from '@/types'

interface ContextChipsProps {
  selectedDocumentIds: string[]
  documents: Array<Pick<Document, 'id' | 'title' | 'status'>>
}

export function ContextChips({ selectedDocumentIds, documents }: ContextChipsProps) {
  const agentContext = useAppUiStore((state) => state.agentContext)

  const chips: Array<{ icon: React.ReactNode; label: string; testId: string }> = []

  if (selectedDocumentIds.length > 0) {
    const count = selectedDocumentIds.length
    chips.push({
      icon: <FileText className="h-3 w-3" />,
      label: count === 1 ? documents.find((d) => d.id === selectedDocumentIds[0])?.title ?? '1 个文档' : `${count} 个文档`,
      testId: 'context-chip-documents',
    })
  }

  if (agentContext.selectedTextPreview) {
    chips.push({
      icon: <Quote className="h-3 w-3" />,
      label:
        agentContext.selectedTextPreview.length > 20
          ? `${agentContext.selectedTextPreview.slice(0, 20)}...`
          : agentContext.selectedTextPreview,
      testId: 'context-chip-text',
    })
  }

  if (agentContext.activeCardGroupIds.length > 0) {
    chips.push({
      icon: <Layers3 className="h-3 w-3" />,
      label: `${agentContext.activeCardGroupIds.length} 个卡组`,
      testId: 'context-chip-groups',
    })
  }

  if (agentContext.activeReviewSessionId) {
    chips.push({
      icon: <TextSelect className="h-3 w-3" />,
      label: '复习会话',
      testId: 'context-chip-review',
    })
  }

  if (chips.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1.5" data-testid="agent-context-chips">
      {chips.map((chip) => (
        <span
          key={chip.testId}
          className={cn(
            'inline-flex h-5 items-center gap-1 rounded-full border px-2 text-[10px]',
            'border-line-soft bg-paper-muted text-ink-soft'
          )}
          data-testid={chip.testId}
        >
          {chip.icon}
          <span className="max-w-[120px] truncate">{chip.label}</span>
        </span>
      ))}
    </div>
  )
}
