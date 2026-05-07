import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LibraryPage as LibraryPageView } from '@/components/pages/library-page'
import { reportAppError, reportFeedback } from '@/lib/appFeedback'
import {
  cardsQueryKeys,
  documentsQueryKeys,
  knowledgeQueryKeys,
  orchestrationQueryKeys,
  useApiConfigsQuery,
  useBackgroundJobsQuery,
  useBasicCardGroupsQuery,
  useCancelBackgroundJobMutation,
  useDeleteDocumentMutation,
  useLibraryDocumentsQuery,
  useResumeAiCardGenerationMutation,
  useStartAiCardGenerationMutation,
} from '@/queries'
import { useDocumentImport } from '@/features/documents/useDocumentImport'
import { isTauriEnvironment } from '@/services/gateway'
import { cardsGateway } from '@/services/gateway/cards'
import { documentGateway } from '@/services/gateway/documents'
import { useAppUiStore } from '@/store'
import type { DocumentLibraryItem } from '@/types'

export function LibraryPage() {
  const queryClient = useQueryClient()
  const { data: documents = [], isLoading } = useLibraryDocumentsQuery()
  const { data: cardGroups = [] } = useBasicCardGroupsQuery(false)
  const { data: apiConfigs = [] } = useApiConfigsQuery()
  const aiJobsQuery = useBackgroundJobsQuery(
    { jobType: 'ai_card_generation', targetType: 'document' },
    { refetchInterval: liveJobAwareRefetchInterval }
  )
  const embeddingJobsQuery = useBackgroundJobsQuery(
    { jobType: 'document_embedding', targetType: 'document' },
    { refetchInterval: liveJobAwareRefetchInterval }
  )
  const openReader = useAppUiStore((state) => state.openReader)
  const setActiveNavItem = useAppUiStore((state) => state.setActiveNavItem)
  const setSettingsSection = useAppUiStore((state) => state.setSettingsSection)
  const setPreferredBasicCardsDocumentId = useAppUiStore(
    (state) => state.setPreferredBasicCardsDocumentId
  )
  const importState = useDocumentImport()
  const [aiActionError, setAiActionError] = useState<string | null>(null)
  const previousAiJobStatusesRef = useRef<Map<string, string>>(new Map())
  const startAiGenerationMutation = useStartAiCardGenerationMutation()
  const resumeAiGenerationMutation = useResumeAiCardGenerationMutation()
  const deleteDocumentMutation = useDeleteDocumentMutation()
  const cancelBackgroundJobMutation = useCancelBackgroundJobMutation()

  const viewDocuments = useMemo(() => documents.map(mapDocumentToView), [documents])
  const usableProviderConfigs = useMemo(
    () =>
      apiConfigs
        .filter((config) => config.isEnabled && config.hasStoredCredential)
        .map((config) => ({ id: config.id, label: config.displayName ?? config.name })),
    [apiConfigs]
  )
  const activeCardGroups = useMemo(
    () =>
      cardGroups
        .filter((group) => !group.deletedAt)
        .map((group) => ({ id: group.id, name: group.name })),
    [cardGroups]
  )
  useEffect(() => {
    const jobs = [...(aiJobsQuery.data ?? []), ...(embeddingJobsQuery.data ?? [])]
    const previous = previousAiJobStatusesRef.current
    const transitionedToTerminal = jobs.some((job) => {
      const priorStatus = previous.get(job.id)
      return isTerminalBackgroundJobStatus(job.status) && isLiveBackgroundJobStatus(priorStatus)
    })

    previousAiJobStatusesRef.current = new Map(jobs.map((job) => [job.id, job.status]))

    if (!transitionedToTerminal) return

    void Promise.all([
      queryClient.invalidateQueries({ queryKey: cardsQueryKeys.all }),
      queryClient.invalidateQueries({ queryKey: documentsQueryKeys.all }),
      queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.all }),
    ])
  }, [queryClient, aiJobsQuery.data, embeddingJobsQuery.data])

  const retryParseMutation = useMutation({
    mutationFn: async (documentId: string) => {
      const parsedDocument = await documentGateway.runParseWorkflow(documentId)

      try {
        await cardsGateway.startGeneration(parsedDocument.id)
      } catch (cause) {
        reportAppError('AI 卡片生成', cause, {
          title: '文档解析完成，但卡片生成启动失败',
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
        title: '重新解析失败',
        showToast: true,
      })
    },
  })

  async function handleUpload() {
    if (!isTauriEnvironment()) {
      reportFeedback({
        scope: '文档导入',
        title: '请在桌面应用中导入文档',
        detail: '浏览器预览环境不能访问本地文件选择器。',
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
      aiGeneration={{
        groups: activeCardGroups,
        providers: usableProviderConfigs,
        jobs: aiJobsQuery.data ?? [],
        isStarting: startAiGenerationMutation.isPending,
        isResuming: resumeAiGenerationMutation.isPending,
        isCancelling: cancelBackgroundJobMutation.isPending,
        actionError: aiActionError,
        onStart: (request) => {
          setAiActionError(null)
          startAiGenerationMutation.mutate(request, {
            onSuccess: (job) => {
              reportFeedback({
                scope: 'AI 卡片生成',
                title: '卡片生成任务已启动',
                detail: `任务 ${job.id.slice(0, 8)} 正在后台运行。`,
                level: 'info',
                showToast: true,
              })
            },
            onError: (cause) => {
              const message = getErrorMessage(cause)
              setAiActionError(message)
              reportAppError('AI 卡片生成', cause, {
                title: 'AI 卡片生成启动失败',
                fallbackDetail: message,
                showToast: true,
              })
            },
          })
        },
        onCancel: (jobId) => {
          setAiActionError(null)
          cancelBackgroundJobMutation.mutate(jobId, {
            onError: (cause) => setAiActionError(getErrorMessage(cause)),
          })
        },
        onResume: (jobId) => {
          setAiActionError(null)
          resumeAiGenerationMutation.mutate(jobId, {
            onError: (cause) => setAiActionError(getErrorMessage(cause)),
          })
        },
        onOpenCards: (documentId) => {
          setPreferredBasicCardsDocumentId(documentId)
          setActiveNavItem('cards')
        },
        onOpenSettings: () => {
          setSettingsSection('ai')
          setActiveNavItem('settings')
        },
        onCreateGroup: () => {
          setActiveNavItem('cards')
        },
      }}
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
        if (action.target === 'library') {
          setActiveNavItem('library')
          return
        }

        if (action.documentId) {
          setPreferredBasicCardsDocumentId(action.documentId)
        }
        setActiveNavItem('cards')
      }}
      onOpenReader={(documentId) => {
        const document = documents.find((item) => item.id === documentId)
        if (!document) return
        openReader(document.id, document.pageCount ?? 1)
      }}
      onOpenCards={(documentId) => {
        setPreferredBasicCardsDocumentId(documentId)
        setActiveNavItem('cards')
      }}
      onDeleteDocument={(documentId) => {
        deleteDocumentMutation.mutate(documentId, {
          onError: (cause) => {
            reportAppError('文档库', cause, {
              title: '删除文档失败',
              showToast: true,
            })
          },
        })
      }}
      onRetryParse={(documentId) => retryParseMutation.mutate(documentId)}
      isDeletingDocument={deleteDocumentMutation.isPending}
    />
  )
}

function liveJobAwareRefetchInterval(query: { state: { data?: Array<{ status: string }> } }) {
  return (query.state.data ?? []).some((job) => isLiveBackgroundJobStatus(job.status))
    ? 2_000
    : 30_000
}

function isLiveBackgroundJobStatus(status: string | undefined) {
  return status === 'queued' || status === 'running'
}

function isTerminalBackgroundJobStatus(status: string | undefined) {
  return status === 'succeeded' || status === 'failed' || status === 'cancelled'
}

function mapDocumentToView(document: DocumentLibraryItem) {
  return {
    id: document.id,
    title: document.title,
    fileType: document.fileType,
    pageCount: document.pageCount,
    fileSizeLabel: '',
    uploadedAtLabel: formatDate(document.updatedAt),
    lastUsedAtLabel: document.lastUsedAt ? formatDate(document.lastUsedAt) : '尚未使用',
    basicCardCount: document.basicCardCount,
    failureReason: document.lastFailureReason,
    status: document.status,
    description: '文档已纳入学习库，可继续阅读或生成 Basic 卡片。',
    tags: [document.fileType.toUpperCase(), document.status],
  }
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return '未知错误，请稍后重试。'
}
