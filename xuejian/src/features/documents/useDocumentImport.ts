import { useEffectEvent, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Document } from '@/types'
import { documentsQueryKeys } from '@/queries'
import { documentGateway } from '@/services/gateway/documents'
import { parsePdfDocument } from '@/services/renderer/pdf'

type ImportStage = 'idle' | 'picking' | 'parsing' | 'saving' | 'done' | 'error'

interface UseDocumentImportOptions {
  onImported?: (document: Document) => void
}

export function useDocumentImport(options?: UseDocumentImportOptions) {
  const queryClient = useQueryClient()
  const handleImported = useEffectEvent((document: Document) => {
    options?.onImported?.(document)
  })
  const [stage, setStage] = useState<ImportStage>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  async function importPdf() {
    let importedDocument: Document | null = null
    setStage('picking')
    setMessage('正在选择并复制 PDF...')
    setWarnings([])
    setError(null)

    try {
      importedDocument = await documentGateway.pickAndImportPdf()

      if (!importedDocument) {
        setStage('idle')
        setMessage(null)
        return null
      }

      setStage('parsing')
      setMessage(`正在解析 ${importedDocument.title}`)
      const bytes = await documentGateway.readBinary(importedDocument.id)
      const analysis = await parsePdfDocument(importedDocument.id, bytes)

      await documentGateway.updateStatus(importedDocument.id, 'parsed')

      setStage('saving')
      setMessage('正在写入分块与锚点...')
      const readyDocument = await documentGateway.saveAnalysis(importedDocument.id, {
        pageCount: analysis.pageCount,
        anchors: analysis.anchors,
        chunks: analysis.chunks,
      })

      await queryClient.invalidateQueries({ queryKey: documentsQueryKeys.all })

      setWarnings(analysis.warnings)
      setStage('done')
      setMessage(
        analysis.warnings[0] ?? `导入完成，共 ${readyDocument.pageCount ?? analysis.pageCount} 页`
      )
      handleImported(readyDocument)
      return readyDocument
    } catch (cause) {
      if (importedDocument) {
        try {
          await documentGateway.delete(importedDocument.id)
          await queryClient.invalidateQueries({ queryKey: documentsQueryKeys.all })
        } catch {
          // Best effort cleanup — delete cascades chunks, anchors, and file.
        }
      }

      const nextError = cause instanceof Error ? cause.message : '导入失败'
      setStage('error')
      setMessage(null)
      setError(nextError)
      return null
    }
  }

  return {
    importPdf,
    stage,
    message,
    warnings,
    error,
    isRunning: stage === 'picking' || stage === 'parsing' || stage === 'saving',
  }
}
