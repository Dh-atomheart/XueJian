import { useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LibraryPage as LibraryPageView } from '@/components/pages/library-page'
import { reportAppError, reportFeedback } from '@/lib/appFeedback'
import { cardsQueryKeys, documentsQueryKeys, orchestrationQueryKeys, useDocumentsQuery } from '@/queries'
import { useDocumentImport } from '@/features/documents/useDocumentImport'
import { isTauriEnvironment } from '@/services/gateway'
import { cardsGateway } from '@/services/gateway/cards'
import { documentGateway } from '@/services/gateway/documents'
import { useAppUiStore } from '@/store'
import type { Document } from '@/types'

export function LibraryPage() {
  const queryClient = useQueryClient()
  const { data: documents = [], isLoading } = useDocumentsQuery()
  const openReader = useAppUiStore((state) => state.openReader)
  const setActiveNavItem = useAppUiStore((state) => state.setActiveNavItem)
  const setPreferredCardStudioDocumentId = useAppUiStore(
    (state) => state.setPreferredCardStudioDocumentId
  )
  const importState = useDocumentImport()

  const viewDocuments = useMemo(() => documents.map(mapDocumentToView), [documents])

  const retryParseMutation = useMutation({
    mutationFn: async (documentId: string) => {
      const parsedDocument = await documentGateway.runParseWorkflow(documentId)
      try {
        await cardsGateway.startGeneration(parsedDocument.id)
      } catch (cause) {
        reportAppError('卡片生成', cause, {
          title: '文档已重新解析，但卡片生成没有成功启动',
          showToast: true,
        })
      }
      return parsedDocument
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: documentsQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: cardsQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: orchestrationQueryKeys.all }),
      ])
    },
    onError: (cause) => {
      reportAppError('文档解析', cause, {
        title: '重试解析失败',
        showToast: true,
      })
    },
  })

  async function handleUpload() {
    if (!isTauriEnvironment()) {
      reportFeedback({
        scope: '文档导入',
        title: '浏览器模式暂不支持系统文件导入',
        detail: '请使用桌面端 (Tauri) 运行后再导入文档。',
        level: 'info',
        showToast: true,
      })
      return
    }

    await importState.importDocument()
  }

  return (
    <LibraryPageView
      documents={viewDocuments}
      isLoading={isLoading}
      onUpload={() => {
        void handleUpload()
      }}
      uploadState={{
        isRunning: importState.isRunning,
        message: importState.message,
        warnings: importState.warnings,
        actions: importState.actions,
        error: importState.error,
      }}
      onUploadAction={(action) => {
        if (action.target === 'settings') {
          setActiveNavItem('settings')
          return
        }

        if (action.documentId) {
          setPreferredCardStudioDocumentId(action.documentId)
        }
        setActiveNavItem('cards')
      }}
      onOpenReader={(documentId) => {
        const document = documents.find((item) => item.id === documentId)
        if (!document) return
        openReader(document.id, document.pageCount ?? 1)
      }}
      onOpenCards={(documentId) => {
        setPreferredCardStudioDocumentId(documentId)
        setActiveNavItem('cards')
      }}
      onRetryParse={(documentId) => retryParseMutation.mutate(documentId)}
    />
  )
}

function mapDocumentToView(document: Document) {
  return {
    id: document.id,
    title: document.title,
    fileType: document.fileType,
    pageCount: document.pageCount,
    fileSizeLabel: formatFileSize(document.fileSize),
    uploadedAtLabel: formatDate(document.updatedAt),
    status: document.status,
    description: '当前文档已经接入真实业务数据源，可直接进入阅读或卡片工坊。',
    tags: [document.fileType.toUpperCase(), document.status],
  }
}

function formatFileSize(size: number | null) {
  if (!size) return '--'
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(size / 1024))} KB`
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
