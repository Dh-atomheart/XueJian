import type { ComponentProps } from 'react'
import type { Document } from '@/types'
import { Button } from '@/components/ui'
import { useDocumentImport } from '@/features/documents/useDocumentImport'

interface ImportDocumentButtonProps {
  onImported?: (document: Document) => void
  showFeedback?: boolean
  buttonProps?: Omit<ComponentProps<typeof Button>, 'onClick' | 'children'>
  idleLabel?: string
}

export function ImportDocumentButton({
  onImported,
  showFeedback = false,
  buttonProps,
  idleLabel = '导入文档',
}: ImportDocumentButtonProps) {
  const importState = useDocumentImport({ onImported })

  return (
    <div className="flex flex-col gap-2">
      <Button
        {...buttonProps}
        disabled={importState.isRunning || buttonProps?.disabled}
        onClick={() => {
          void importState.importDocument()
        }}
      >
        {importState.isRunning ? (importState.message ?? '处理中...') : idleLabel}
      </Button>

      {showFeedback && importState.message ? (
        <p className="text-xs text-ink-soft">{importState.message}</p>
      ) : null}

      {showFeedback && importState.error ? (
        <p className="text-xs text-rose-600">{importState.error}</p>
      ) : null}

      {showFeedback && importState.warnings.length > 0 ? (
        <p className="text-xs text-amber-700">{importState.warnings[0]}</p>
      ) : null}
    </div>
  )
}
