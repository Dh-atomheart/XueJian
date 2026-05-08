import { useEffectEvent, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { BackgroundJob, Document } from '@/types'
import { cardsQueryKeys, documentsQueryKeys, orchestrationQueryKeys } from '@/queries'
import { reportAppError } from '@/lib/appFeedback'
import { cardsGateway } from '@/services/gateway/cards'
import { documentGateway } from '@/services/gateway/documents'
import { embeddingProfileGateway } from '@/services/gateway/models'

type ImportStage = 'idle' | 'picking' | 'parsing' | 'embedding' | 'generating' | 'done' | 'error'

export interface DocumentImportAction {
  id: 'open-settings' | 'open-cards' | 'retry-embedding'
  label: string
  target: 'settings' | 'cards' | 'library'
  documentId?: string | null
}

interface UseDocumentImportOptions {
  onImported?: (document: Document) => void
}

const EMBEDDING_JOB_POLL_INTERVAL_MS = import.meta.env.MODE === 'test' ? 1 : 1_500
const EMBEDDING_JOB_TIMEOUT_MS = 120_000

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

      await queryClient.invalidateQueries({ queryKey: documentsQueryKeys.all })
      await queryClient.invalidateQueries({
        queryKey: cardsQueryKeys.backgroundJobs({
          jobType: 'document_parse',
          targetType: 'document',
        }),
      })

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

      let readyDocument = parsedDocument
      const nextActions: DocumentImportAction[] = []
      const nextWarnings: string[] = []

      const embeddingProfile = await embeddingProfileGateway.getActive()
      if (!embeddingProfile) {
        nextWarnings.push('文档已完成解析，但当前没有可用的 embedding 模型。请先配置 embedding 后再生成向量。')
        nextActions.push({
          id: 'open-settings',
          label: '前往设置补全 embedding 模型',
          target: 'settings',
          documentId: readyDocument.id,
        })
        setWarnings(nextWarnings)
        setActions(nextActions)
        setStage('done')
        setMessage('导入完成，但需要先配置向量模型。')
        handleImported(readyDocument)
        return readyDocument
      }

      try {
        setStage('embedding')
        setMessage(`正在生成 ${parsedDocument.title} 的文档向量...`)
        const embeddingJob = await documentGateway.startEmbeddingJob(parsedDocument.id)
        await queryClient.invalidateQueries({ queryKey: documentsQueryKeys.all })
        await queryClient.invalidateQueries({
          queryKey: cardsQueryKeys.backgroundJobs({
            jobType: 'document_embedding',
            targetType: 'document',
          }),
        })

        await waitForEmbeddingJob(embeddingJob)
        await queryClient.invalidateQueries({ queryKey: documentsQueryKeys.all })
        readyDocument = (await documentGateway.get(parsedDocument.id)) ?? parsedDocument
      } catch (embeddingCause) {
        const detail = reportAppError('文档向量化', embeddingCause, {
          title: '文档已完成解析，但向量生成失败',
          showToast: true,
        })
        nextWarnings.push(`文档向量生成没有成功：${detail}`)
        nextActions.push({
          id: 'retry-embedding',
          label: '回到文档库重试向量化',
          target: 'library',
          documentId: parsedDocument.id,
        })
        setWarnings(nextWarnings)
        setActions(nextActions)
        setStage('done')
        setMessage('导入完成，但向量生成需要重试。')
        readyDocument = (await documentGateway.get(parsedDocument.id)) ?? parsedDocument
        handleImported(readyDocument)
        return readyDocument
      }

      try {
        setStage('generating')
        setMessage('文档向量已生成，正在启动卡片生成...')
        await cardsGateway.startGeneration(readyDocument.id)
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: cardsQueryKeys.all }),
          queryClient.invalidateQueries({ queryKey: orchestrationQueryKeys.all }),
        ])
      } catch (generationCause) {
        const detail = reportAppError('卡片生成', generationCause, {
          title: '文档已完成导入和向量化，但卡片生成没有成功启动',
          showToast: true,
        })
        nextWarnings.push(`自动卡片生成没有成功启动：${detail}`)
        nextActions.push({
          id: 'open-cards',
          label: '前往卡片页手动处理',
          target: 'cards',
          documentId: readyDocument.id,
        })
      }

      setWarnings(nextWarnings)
      setActions(nextActions)
      setStage('done')
      if (nextWarnings.length > 0) {
        setMessage(`导入完成，但还有 ${nextWarnings.length} 项后续处理需要完成。`)
      } else {
        setMessage('导入完成，已生成文档向量并启动卡片生成。')
      }
      readyDocument = (await documentGateway.get(parsedDocument.id)) ?? readyDocument
      handleImported(readyDocument)
      return readyDocument
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

async function waitForEmbeddingJob(initialJob: BackgroundJob): Promise<BackgroundJob> {
  if (initialJob.status === 'succeeded') {
    return initialJob
  }
  if (initialJob.status === 'failed' || initialJob.status === 'cancelled') {
    throw new Error(describeEmbeddingJobFailure(initialJob))
  }

  const deadline = Date.now() + EMBEDDING_JOB_TIMEOUT_MS
  let latestJob: BackgroundJob | null = initialJob

  while (Date.now() < deadline) {
    await delay(EMBEDDING_JOB_POLL_INTERVAL_MS)
    latestJob = await cardsGateway.getBackgroundJob(initialJob.id)
    if (!latestJob) {
      throw new Error('文档向量任务已不存在。')
    }
    if (latestJob.status === 'succeeded') {
      return latestJob
    }
    if (latestJob.status === 'failed' || latestJob.status === 'cancelled') {
      throw new Error(describeEmbeddingJobFailure(latestJob))
    }
  }

  throw new Error(
    latestJob?.progressMessage
      ? `文档向量任务超时：${latestJob.progressMessage}`
      : '文档向量任务超时，请稍后在文档库重试。'
  )
}

function describeEmbeddingJobFailure(job: BackgroundJob): string {
  return (
    job.errorMessage ??
    job.errorDetails ??
    job.progressMessage ??
    (job.status === 'cancelled' ? '文档向量任务已取消。' : '文档向量任务失败。')
  )
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}
