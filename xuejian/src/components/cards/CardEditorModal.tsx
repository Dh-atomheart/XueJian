import { useState, useCallback } from 'react'
import MDEditor from '@uiw/react-md-editor'
import { SketchButton } from '@/components/ui/Sketch'
import { cn } from '@/lib/utils'
import type { Card } from '@/types'

export interface CardEditorModalProps {
  /** If provided, opens in edit mode (pre-fills data). Otherwise create mode. */
  card?: Card | null
  onSave: (data: {
    front: string
    back: string
    tags: string[]
    cardType: Card['cardType']
  }) => void
  onClose: () => void
}

/**
 * Modal for creating / editing a card.
 * Split-pane Markdown editor with live preview (KaTeX supported via react-md-editor).
 */
export function CardEditorModal({ card, onSave, onClose }: CardEditorModalProps) {
  const [front, setFront] = useState(card?.front ?? '')
  const [back, setBack] = useState(card?.back ?? '')
  const [tagsInput, setTagsInput] = useState(card?.tags.join(', ') ?? '')
  const [cardType, setCardType] = useState<Card['cardType']>(card?.cardType ?? 'qa')
  const [activeField, setActiveField] = useState<'front' | 'back'>('front')

  const isEdit = Boolean(card)

  const handleSave = useCallback(() => {
    const trimmedFront = front.trim()
    const trimmedBack = back.trim()
    if (!trimmedFront || !trimmedBack) return

    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)

    onSave({ front: trimmedFront, back: trimmedBack, tags, cardType })
  }, [front, back, tagsInput, cardType, onSave])

  const canSave = front.trim().length > 0 && back.trim().length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-ink/20 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-3xl max-h-[90vh] mx-4 flex flex-col bg-paper-base rounded-2xl border border-line-soft shadow-lg overflow-hidden animate-fade-in">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-line-soft/60">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-display font-semibold">
              {isEdit ? '编辑卡片' : '新建卡片'}
            </h2>
            <select
              value={cardType}
              onChange={(e) => setCardType(e.target.value as Card['cardType'])}
              className="px-2.5 py-1.5 text-xs bg-paper-muted/50 border border-line-soft/60 rounded-lg focus:outline-none focus:ring-2 focus:ring-ink/10"
            >
              <option value="qa">问答</option>
              <option value="cloze">完形填空</option>
              <option value="fact">知识点</option>
              <option value="choice">单选题</option>
            </select>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-paper-muted/50 transition-colors text-ink-muted"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </header>

        {/* Tab bar */}
        <div className="flex gap-1 px-6 pt-3">
          {(['front', 'back'] as const).map((field) => (
            <button
              key={field}
              onClick={() => setActiveField(field)}
              className={cn(
                'px-4 py-2 text-sm rounded-t-lg transition-colors',
                activeField === field
                  ? 'bg-paper-muted/70 font-medium text-ink'
                  : 'text-ink-muted hover:text-ink hover:bg-paper-muted/30'
              )}
            >
              {field === 'front' ? '问题面 (Front)' : '答案面 (Back)'}
            </button>
          ))}
        </div>

        {/* Editor area */}
        <div className="flex-1 min-h-0 px-6 pb-2 overflow-auto" data-color-mode="light">
          <div className={cn(activeField !== 'front' && 'hidden')}>
            <MDEditor
              value={front}
              onChange={(v) => setFront(v ?? '')}
              preview="live"
              height={280}
              textareaProps={{ placeholder: '输入问题... 支持 Markdown 和 $LaTeX$' }}
            />
          </div>
          <div className={cn(activeField !== 'back' && 'hidden')}>
            <MDEditor
              value={back}
              onChange={(v) => setBack(v ?? '')}
              preview="live"
              height={280}
              textareaProps={{ placeholder: '输入答案... 支持 Markdown 和 $LaTeX$' }}
            />
          </div>
        </div>

        {/* Tags */}
        <div className="px-6 py-3 border-t border-line-soft/40">
          <label className="block text-xs text-ink-muted mb-1.5">标签（逗号分隔）</label>
          <input
            type="text"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="例如：数学, 线性代数, 矩阵"
            className="w-full px-3 py-2 bg-paper-muted/50 border border-line-soft/60 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ink/10 transition-all"
          />
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-end gap-3 px-6 py-4 border-t border-line-soft/60">
          <SketchButton variant="outline" onClick={onClose}>
            取消
          </SketchButton>
          <SketchButton onClick={handleSave} disabled={!canSave}>
            {isEdit ? '保存修改' : '创建卡片'}
          </SketchButton>
        </footer>
      </div>
    </div>
  )
}
