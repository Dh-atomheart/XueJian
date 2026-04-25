import { useEffectEvent, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Document } from '@/types'
import { cardsQueryKeys, documentsQueryKeys, orchestrationQueryKeys } from '@/queries'
import { reportAppError } from '@/lib/appFeedback'
import { cardsGateway } from '@/services/gateway/cards'
import { documentGateway } from '@/services/gateway/documents'
import { embeddingProfileGateway } from '@/services/gateway/models'

type ImportStage = 'idle' | 'picking' | 'parsing' | 'embedding' | 'generating' | 'done' | 'error'

export interface DocumentImportAction {
  id: 'open-settings' | 'open-cards'
  label: string
  target: 'settings' | 'cards'
  documentId?: string | null
}

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
  const [actions, setActions] = useState<DocumentImportAction[]>([])
  const [error, setError] = useState<string | null>(null)

  async function importDocument() {
    let importedDocument: Document | null = null
    setStage('picking')
    setMessage('正在选择并导入文档...')
    setWarnings([])
    setActions([])
    setError(null)

    try {
      importedDocument = await documentGateway.pickAndImportDocument()

      if (!importedDocument) {
        setStage('idle')
        setMessage(null)
        return null
      }

      setStage('parsing')
      setMessage(`正在解析 ${importedDocument.title}`)

      let parsedDocument: Document
      try {
        parsedDocument = await documentGateway.runParseWorkflow(importedDocument.id)
      } catch (parseCause) {
        try {
          await documentGateway.updateStatus(importedDocument.id, 'error')
          await queryClient.invalidateQueries({ queryKey: documentsQueryKeys.all })
        } catch {
          // Keep the original parse error as the user-facing failure.
        }
        throw parseCause
      }

      await queryClient.invalidateQueries({ queryKey: documentsQueryKeys.all })

      let retrievalReadyDocument = parsedDocument
      let knowledgeWarning: string | null = null
      const nextActions: DocumentImportAction[] = []
      try {
        const activeEmbeddingProfile = await embeddingProfileGateway.getActive()
        if (activeEmbeddingProfile) {
          setStage('embedding')
          setMessage('正在为知识问答生成向量索引...')
          retrievalReadyDocument = await documentGateway.runEmbeddingWorkflow(parsedDocument.id)
          await queryClient.invalidateQueries({ queryKey: documentsQueryKeys.all })
        } else {
          knowledgeWarning =
            '文档已完成解析，但当前没有可用的嵌入模型，知识问答和检索命中率会受到影响。'
          nextActions.push({
            id: 'open-settings',
            label: '前往设置补全嵌入模型',
            target: 'settings',
          })
        }
      } catch (embeddingCause) {
        const detail = reportAppError('文档向量化', embeddingCause, {
          title: '文档已解析，但向量索引生成失败',
          showToast: true,
        })
        knowledgeWarning = `知识问答索引未就绪：${detail}`
        nextActions.push({
          id: 'open-settings',
          label: '检查嵌入模型配置',
          target: 'settings',
        })
        await queryClient.invalidateQueries({ queryKey: documentsQueryKeys.all })
      }

      let generationWarning: string | null = null
      try {
        setStage('generating')
        setMessage('正在启动卡片生成...')
        await cardsGateway.startGeneration(retrievalReadyDocument.id)
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: cardsQueryKeys.all }),
          queryClient.invalidateQueries({ queryKey: orchestrationQueryKeys.all }),
        ])
      } catch (generationCause) {
        const detail = reportAppError('卡片生成', generationCause, {
          title: '文档已完成导入，但卡片生成没有成功启动',
          showToast: true,
        })
        generationWarning = `自动卡片生成没有成功启动：${detail}`
        nextActions.push({
          id: 'open-cards',
          label: '前往卡片工坊手动重试',
          target: 'cards',
          documentId: retrievalReadyDocument.id,
        })
      }

      setWarnings(
        [knowledgeWarning, generationWarning].filter((warning): warning is string => Boolean(warning))
      )
      setActions(nextActions)
      setStage('done')
      if (knowledgeWarning || generationWarning) {
        const pendingCount = [knowledgeWarning, generationWarning].filter(Boolean).length
        setMessage(`导入完成，但还有 ${pendingCount} 项后续处理需要完成。`)
      } else {
        setMessage('导入完成，已启动卡片生成。')
      }
      handleImported(retrievalReadyDocument)
      return retrievalReadyDocument
    } catch (cause) {
      const nextError = reportAppError('文档导入', cause, {
        title: importedDocument ? '文档已导入，但解析失败' : '文档导入失败',
        showToast: true,
      })
      setStage('error')
      setMessage(null)
      setActions([])
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
    actions,
    error,
    isRunning:
      stage === 'picking' ||
      stage === 'parsing' ||
      stage === 'embedding' ||
      stage === 'generating',
  }
}
