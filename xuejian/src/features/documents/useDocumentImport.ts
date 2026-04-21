import { useEffectEvent, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Document } from '@/types'
import { cardsQueryKeys, documentsQueryKeys, orchestrationQueryKeys } from '@/queries'
import { reportAppError } from '@/lib/appFeedback'
import { cardsGateway } from '@/services/gateway/cards'
import { documentGateway } from '@/services/gateway/documents'

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

  async function importDocument() {
    let importedDocument: Document | null = null
    let shouldCleanupOnError = false
    setStage('picking')
    setMessage('正在选择并复制文档...')
    setWarnings([])
    setError(null)

    try {
      importedDocument = await documentGateway.pickAndImportDocument()

      if (!importedDocument) {
        setStage('idle')
        setMessage(null)
        return null
      }

      shouldCleanupOnError = false

      setStage('parsing')
      setMessage(`正在解析 ${importedDocument.title}`)
      await documentGateway.runParseWorkflow(importedDocument.id)

      setStage('saving')
      setMessage('正在生成向量索引...')
      const readyDocument = await documentGateway.runEmbeddingWorkflow(importedDocument.id)

      await queryClient.invalidateQueries({ queryKey: documentsQueryKeys.all })

      let generationWarning: string | null = null

      try {
        setMessage('正在启动卡片候选生成...')
        await cardsGateway.startGeneration(readyDocument.id)
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: cardsQueryKeys.all }),
          queryClient.invalidateQueries({ queryKey: orchestrationQueryKeys.all }),
        ])
      } catch (generationCause) {
        const detail = reportAppError('卡片生成', generationCause, {
          title: '文档已导入，但卡片候选生成没有成功启动',
          showToast: true,
        })
        generationWarning = `自动卡片生成没有成功启动：${detail}`
      }

      setWarnings(generationWarning ? [generationWarning] : [])
      setStage('done')
      setMessage(
        generationWarning
          ? '导入完成，但需要手动前往卡片工坊重新生成卡片。'
          : '导入完成，已完成解析、向量化并启动卡片候选生成。'
      )
      handleImported(readyDocument)
      return readyDocument
    } catch (cause) {
      if (importedDocument && shouldCleanupOnError) {
        try {
          await documentGateway.delete(importedDocument.id)
          await queryClient.invalidateQueries({ queryKey: documentsQueryKeys.all })
        } catch {
          // Best effort cleanup — delete cascades chunks, anchors, and file.
        }
      }

      const nextError = reportAppError('文档导入', cause, {
        title: '文档导入失败',
        showToast: true,
      })
      setStage('error')
      setMessage(null)
      setError(nextError)
      return null
    }
  }

  /** @deprecated Use importDocument instead */
  const importPdf = importDocument

  return {
    importDocument,
    importPdf,
    stage,
    message,
    warnings,
    error,
    isRunning: stage === 'picking' || stage === 'parsing' || stage === 'saving',
  }
}
