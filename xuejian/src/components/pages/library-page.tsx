import { useEffect, useMemo, useState, type ChangeEvent, type DragEvent } from 'react'
import {
  AlertCircle,
  BookOpen,
  CheckCircle,
  ChevronDown,
  FileText,
  Layers,
  RefreshCcw,
  Search,
  Settings,
  Tag,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyDocuments,
  EmptySearchResults,
  InlineError,
  Input,
  ParsingBanner,
  SkeletonDocRow,
  BackgroundJobPanel,
} from '@/shared/ui'
import { estimateAiCardGeneration } from '@/lib/aiCardGenerationEstimate'
import { cn } from '@/lib/utils'

export interface LibraryPageDocument {
  id: string
  title: string
  fileType: string
  pageCount: number | null
  fileSizeLabel: string
  uploadedAtLabel: string
  lastUsedAtLabel?: string
  basicCardCount?: number
  failureReason?: string | null
  status:
    | 'uploading'
    | 'parsed'
    | 'embedding'
    | 'ready'
    | 'embedding_failed'
    | 'embedding_stale'
    | 'error'
  description?: string
  tags?: string[]
}

export interface LibraryPageCardGroup {
  id: string
  name: string
}

export interface LibraryPageProviderConfig {
  id: string
  label: string
}

export interface LibraryPageAiJob {
  id: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  targetId: string
  payloadJson: string
  resultJson: string | null
  errorMessage: string | null
  progressCurrent: number | null
  progressTotal: number | null
  progressMessage: string | null
  createdAt: Date
  cancelRequestedAt?: Date | null
}

export interface LibraryPageProcessingJob extends LibraryPageAiJob {
  jobType: 'document_parse' | 'document_embedding'
}

export interface LibraryPageAiGenerationRequest {
  documentId: string
  groupId: string
  pageStart: number | null
  pageEnd: number | null
  density: 'low' | 'medium' | 'high'
  providerConfigId: string
}

export interface LibraryPageProps {
  documents: LibraryPageDocument[]
  isLoading?: boolean
  processingJobs?: LibraryPageProcessingJob[]
  aiGeneration?: {
    groups: LibraryPageCardGroup[]
    providers: LibraryPageProviderConfig[]
    jobs: LibraryPageAiJob[]
    isStarting: boolean
    isResuming: boolean
    isCancelling: boolean
    actionError: string | null
    onStart: (request: LibraryPageAiGenerationRequest) => void
    onResume: (jobId: string) => void
    onCancel: (jobId: string) => void
    onOpenCards: (documentId: string) => void
    onOpenSettings: () => void
    onCreateGroup: () => void
  }
  onUpload: () => void
  uploadState?: {
    isRunning: boolean
    message: string | null
    warnings?: string[]
    actions?: Array<{
      id: 'open-settings' | 'open-cards' | 'retry-embedding'
      label: string
      target: 'settings' | 'cards' | 'library'
      documentId?: string | null
    }>
    error: string | null
  }
  onUploadAction?: (action: {
    id: 'open-settings' | 'open-cards' | 'retry-embedding'
    label: string
    target: 'settings' | 'cards' | 'library'
    documentId?: string | null
  }) => void
  onOpenReader: (documentId: string) => void
  onOpenCards: (documentId: string) => void
  onRunEmbedding?: (documentId: string) => void
  onDeleteDocument?: (documentId: string) => void
  onRetryParse?: (documentId: string) => void
  isStartingEmbedding?: boolean
  isDeletingDocument?: boolean
}

const READABLE_STATUSES = new Set<LibraryPageDocument['status']>([
  'parsed',
  'ready',
  'embedding_failed',
  'embedding_stale',
])

const CARD_GENERATION_STATUSES = new Set<LibraryPageDocument['status']>([
  'parsed',
  'ready',
  'embedding_stale',
])

const LIVE_AI_JOB_STATUSES = new Set<LibraryPageAiJob['status']>(['queued', 'running'])
const EMBEDDING_RETRY_LABEL = '\u91cd\u65b0\u751f\u6210\u5411\u91cf'
const EMBEDDING_RUNNING_LABEL = '\u5411\u91cf\u751f\u6210\u4e2d'

function canReadDocument(document: LibraryPageDocument) {
  return READABLE_STATUSES.has(document.status)
}

function canGenerateCards(document: LibraryPageDocument) {
  return CARD_GENERATION_STATUSES.has(document.status)
}

function jobPayloadDocumentId(payloadJson: string) {
  try {
    const value = JSON.parse(payloadJson) as { documentId?: unknown; document_id?: unknown }
    return typeof value.documentId === 'string'
      ? value.documentId
      : typeof value.document_id === 'string'
        ? value.document_id
        : null
  } catch {
    return null
  }
}

function jobMatchesDocument(job: LibraryPageAiJob, documentId: string) {
  return job.targetId === documentId || jobPayloadDocumentId(job.payloadJson) === documentId
}

function pickCurrentAiJob(jobs: LibraryPageAiJob[], documentId: string) {
  const matching = jobs
    .filter((job) => jobMatchesDocument(job, documentId))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  return matching.find((job) => LIVE_AI_JOB_STATUSES.has(job.status)) ?? matching[0] ?? null
}

function pickCurrentProcessingJob(jobs: LibraryPageProcessingJob[], documentId: string) {
  const matching = jobs
    .filter((job) => jobMatchesDocument(job, documentId))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

  return matching.find((job) => LIVE_AI_JOB_STATUSES.has(job.status)) ?? matching[0] ?? null
}

function processingJobProgress(job: LibraryPageProcessingJob | null) {
  if (!job) return 0
  if (job.status === 'succeeded') return 100
  const total = job.progressTotal ?? 0
  const current = job.progressCurrent ?? 0
  if (total <= 0) return 0
  return Math.min(100, Math.max(0, (current / total) * 100))
}

function UploadDropzone({
  onClose,
  onUpload,
  isUploading,
}: {
  onClose: () => void
  onUpload: () => void
  isUploading: boolean
}) {
  const [dragOver, setDragOver] = useState(false)

  async function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragOver(false)
    if (isUploading || event.dataTransfer.files.length === 0) return
    onUpload()
  }

  return (
    <div
      className={cn(
        'relative mb-4 rounded-lg border border-dashed p-6 text-center transition-all',
        dragOver ? 'border-ink/30 bg-highlight-yellow/10' : 'border-line-soft bg-paper-card/55'
      )}
      onDragOver={(event) => {
        event.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => void handleDrop(event)}
    >
      <div className="flex flex-col items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-line-soft bg-paper-muted">
          <Upload className="h-5 w-5 text-ink-soft" />
        </div>
        <p className="text-sm font-medium text-ink">导入学习文档</p>
        <p className="text-xs text-ink-muted">支持 PDF 格式。</p>
        <Button variant="outline" size="sm" onClick={onUpload} disabled={isUploading}>
          <Upload className="h-3.5 w-3.5" />
          {isUploading ? '正在导入...' : '选择文件'}
        </Button>
      </div>
      <button
        className="absolute right-3 top-3 rounded p-0.5 text-ink-soft hover:text-ink"
        onClick={onClose}
        title="关闭导入面板"
        aria-label="关闭导入面板"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

function DocumentStatusBadge({ status }: { status: LibraryPageDocument['status'] }) {
  const config = {
    ready: {
      label: '可阅读',
      className: 'bg-highlight-green/18 text-ink border-highlight-green/30',
      icon: CheckCircle,
    },
    parsed: {
      label: '已解析',
      className: 'bg-highlight-green/18 text-ink border-highlight-green/30',
      icon: CheckCircle,
    },
    embedding: {
      label: '处理中',
      className: 'bg-highlight-yellow/20 text-ink border-highlight-yellow/40',
      icon: RefreshCcw,
    },
    uploading: {
      label: '导入中',
      className: 'bg-highlight-yellow/20 text-ink border-highlight-yellow/40',
      icon: RefreshCcw,
    },
    embedding_stale: {
      label: '可阅读',
      className: 'bg-highlight-green/18 text-ink border-highlight-green/30',
      icon: CheckCircle,
    },
    embedding_failed: {
      label: '可阅读',
      className: 'bg-highlight-green/18 text-ink border-highlight-green/30',
      icon: CheckCircle,
    },
    error: {
      label: '解析失败',
      className: 'bg-destructive/10 text-destructive border-destructive/20',
      icon: AlertCircle,
    },
  } as const

  const entry = config[status] ?? config.error
  const Icon = entry.icon
  return (
    <Badge
      variant="outline"
      className={cn('gap-1 rounded-md border text-xs font-normal', entry.className)}
    >
      <Icon
        className={cn(
          'h-3 w-3',
          (status === 'embedding' || status === 'uploading') && 'animate-spin'
        )}
      />
      {entry.label}
    </Badge>
  )
}

function DocumentListItem({
  document,
  isSelected,
  onClick,
}: {
  document: LibraryPageDocument
  isSelected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left transition',
        isSelected
          ? 'border-ink/20 bg-paper-card shadow-card'
          : 'border-line-soft bg-paper-base/70 hover:border-ink/15 hover:bg-paper-card'
      )}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink">{document.title}</p>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-ink-muted">
          <Badge variant="secondary" className="h-4 rounded px-1 text-[10px] font-normal">
            {document.fileType.toUpperCase()}
          </Badge>
          <span>{document.pageCount ?? '--'} 页</span>
          {document.basicCardCount != null ? <span>{document.basicCardCount} 张卡</span> : null}
          <span>最近 {document.lastUsedAtLabel ?? document.uploadedAtLabel}</span>
        </div>
      </div>
      <DocumentStatusBadge status={document.status} />
    </button>
  )
}

function DocumentList({
  documents,
  processingJobs = [],
  isLoading,
  searchQuery,
  selectedId,
  onSelect,
  onUpload,
}: {
  documents: LibraryPageDocument[]
  processingJobs?: LibraryPageProcessingJob[]
  isLoading: boolean
  searchQuery: string
  selectedId: string | null
  onSelect: (id: string) => void
  onUpload: () => void
}) {
  const processingState = useMemo(() => {
    const liveJob = processingJobs.find((job) => LIVE_AI_JOB_STATUSES.has(job.status))
    if (liveJob) {
      const document = documents.find((doc) => jobMatchesDocument(liveJob, doc.id))
      if (document) {
        return {
          document,
          job: liveJob,
          progress: processingJobProgress(liveJob),
        }
      }
    }

    const document = documents.find(
      (doc) => doc.status === 'embedding' || doc.status === 'uploading'
    )
    const job = document ? pickCurrentProcessingJob(processingJobs, document.id) : null
    return document
      ? {
          document,
          job,
          progress: processingJobProgress(job),
        }
      : null
  }, [documents, processingJobs])

  return (
    <Card>
      <CardContent className="p-4">
        {processingState ? (
          <div className="mb-3">
            <ParsingBanner
              filename={processingState.document.title}
              progress={processingState.progress}
            />
          </div>
        ) : null}

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((item) => (
              <SkeletonDocRow key={item} />
            ))}
          </div>
        ) : documents.length === 0 && searchQuery.trim() === '' ? (
          <EmptyDocuments onUpload={onUpload} />
        ) : documents.length === 0 ? (
          <EmptySearchResults query={searchQuery} />
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => (
              <DocumentListItem
                key={doc.id}
                document={doc}
                isSelected={selectedId === doc.id}
                onClick={() => onSelect(doc.id)}
              />
            ))}
          </div>
        )}

        <p className="mt-4 text-center text-xs text-ink-soft">共 {documents.length} 个文档</p>
      </CardContent>
    </Card>
  )
}

function AiGenerationPanel({
  document,
  config,
}: {
  document: LibraryPageDocument
  config: NonNullable<LibraryPageProps['aiGeneration']>
}) {
  const [scope, setScope] = useState<'all' | 'range'>('all')
  const [groupId, setGroupId] = useState(config.groups[0]?.id ?? '')
  const [providerConfigId, setProviderConfigId] = useState(config.providers[0]?.id ?? '')
  const [density, setDensity] = useState<'low' | 'medium' | 'high'>('medium')
  const [pageStart, setPageStart] = useState('')
  const [pageEnd, setPageEnd] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const job = pickCurrentAiJob(config.jobs, document.id)
  const hasGroup = config.groups.length > 0
  const hasProvider = config.providers.length > 0
  const isLiveJob = Boolean(job && LIVE_AI_JOB_STATUSES.has(job.status))
  const canGenerate = canGenerateCards(document)
  const estimateRange = parsePageRange(scope, pageStart, pageEnd, document.pageCount)
  const generationEstimate = estimateRange.ok
    ? estimateAiCardGeneration({
        density,
        pageCount: document.pageCount,
        pageStart: estimateRange.pageStart,
        pageEnd: estimateRange.pageEnd,
      })
    : null

  useEffect(() => {
    if (!groupId && config.groups[0]) setGroupId(config.groups[0].id)
  }, [config.groups, groupId])

  useEffect(() => {
    if (!providerConfigId && config.providers[0]) setProviderConfigId(config.providers[0].id)
  }, [config.providers, providerConfigId])

  function submit() {
    setValidationError(null)
    if (!hasProvider) {
      setValidationError('请先配置可用的 AI Provider。')
      return
    }
    if (!hasGroup) {
      setValidationError('请先创建卡片分组。')
      return
    }
    if (!canGenerate) {
      setValidationError('当前文档状态不支持生成卡片。')
      return
    }

    const range = parsePageRange(scope, pageStart, pageEnd, document.pageCount)
    if (!range.ok) {
      setValidationError(range.message)
      return
    }

    config.onStart({
      documentId: document.id,
      groupId,
      providerConfigId,
      density,
      pageStart: range.pageStart,
      pageEnd: range.pageEnd,
    })
  }

  return (
    <div
      className="mt-5 rounded-lg border border-line-soft bg-paper-base/75 p-4"
      data-testid="library-ai-generation-panel"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-medium text-ink">AI 生成 Basic 卡片</p>
          <p className="mt-1 text-xs leading-5 text-ink-muted">
            从当前文档提取要点，生成可编辑、可追溯来源的 Basic 卡片。
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={submit}
          disabled={config.isStarting || isLiveJob || !canGenerate}
          data-testid="library-start-ai-generation"
        >
          <Layers className="h-3.5 w-3.5" />
          {config.isStarting ? '正在启动...' : '生成卡片'}
        </Button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Field label="卡片分组">
          <select
            value={groupId}
            onChange={(event) => setGroupId(event.target.value)}
            className="border-input h-9 w-full rounded-lg border bg-paper-card px-3 text-sm text-ink outline-none focus-visible:border-ring"
            disabled={!hasGroup}
            data-testid="library-ai-group"
          >
            {config.groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Provider">
          <select
            value={providerConfigId}
            onChange={(event) => setProviderConfigId(event.target.value)}
            className="border-input h-9 w-full rounded-lg border bg-paper-card px-3 text-sm text-ink outline-none focus-visible:border-ring"
            disabled={!hasProvider}
            data-testid="library-ai-provider"
          >
            {config.providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="生成范围">
          <select
            value={scope}
            onChange={(event) => setScope(event.target.value as typeof scope)}
            className="border-input h-9 w-full rounded-lg border bg-paper-card px-3 text-sm text-ink outline-none focus-visible:border-ring"
            data-testid="library-ai-scope"
          >
            <option value="all">整份文档</option>
            <option value="range">指定页码</option>
          </select>
        </Field>
        <Field label="卡片密度">
          <select
            value={density}
            onChange={(event) => setDensity(event.target.value as typeof density)}
            className="border-input h-9 w-full rounded-lg border bg-paper-card px-3 text-sm text-ink outline-none focus-visible:border-ring"
            data-testid="library-ai-density"
          >
            <option value="low">低</option>
            <option value="medium">中</option>
            <option value="high">高</option>
          </select>
        </Field>
        {scope === 'range' ? (
          <>
            <Field label="起始页">
              <Input
                value={pageStart}
                onChange={(event) => setPageStart(event.target.value)}
                inputMode="numeric"
                data-testid="library-ai-page-start"
              />
            </Field>
            <Field label="结束页">
              <Input
                value={pageEnd}
                onChange={(event) => setPageEnd(event.target.value)}
                inputMode="numeric"
                data-testid="library-ai-page-end"
              />
            </Field>
          </>
        ) : null}
      </div>

      {generationEstimate ? (
        <p
          className="mt-3 rounded-md border border-line-soft bg-paper-card px-3 py-2 text-xs text-ink-muted"
          data-testid="library-ai-generation-estimate"
        >
          预计 {generationEstimate.pageCount} 页，约 {generationEstimate.cardCount} 张卡片
        </p>
      ) : null}

      {!hasProvider ? (
        <Notice>
          <span>当前没有可用 Provider。</span>
          <Button variant="outline" size="sm" className="h-7" onClick={config.onOpenSettings}>
            <Settings className="h-3.5 w-3.5" />
            去设置
          </Button>
        </Notice>
      ) : null}
      {!hasGroup ? (
        <Notice>
          <span>还没有卡片分组。</span>
          <Button variant="outline" size="sm" className="h-7" onClick={config.onCreateGroup}>
            新建分组
          </Button>
        </Notice>
      ) : null}
      {validationError || config.actionError ? (
        <div className="mt-3">
          <InlineError message={validationError ?? config.actionError ?? ''} />
        </div>
      ) : null}
      {job ? (
        <BackgroundJobPanel
          job={job}
          title="AI 制卡任务"
          className="mt-3"
          onCancel={isLiveJob ? config.onCancel : undefined}
          onRetry={job.status === 'failed' ? config.onResume : undefined}
          onOpenResult={
            job.status === 'succeeded' ? () => config.onOpenCards(document.id) : undefined
          }
          isCancelling={config.isCancelling}
          isRetrying={config.isResuming}
          cancelButtonTestId="library-cancel-ai-generation"
          retryButtonTestId="library-resume-ai-generation"
        />
      ) : null}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1 text-xs text-ink-muted">
      <span>{label}</span>
      {children}
    </label>
  )
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-highlight-yellow/40 bg-highlight-yellow/12 px-3 py-2 text-xs text-ink-muted">
      {children}
    </div>
  )
}

function DocumentDetailPanel({
  document,
  aiGeneration,
  onOpenReader,
  onOpenCards,
  onRunEmbedding,
  onDeleteDocument,
  onRetryParse,
  isStartingEmbedding,
  isDeletingDocument,
}: {
  document: LibraryPageDocument | null
  aiGeneration?: LibraryPageProps['aiGeneration']
  onOpenReader: (documentId: string) => void
  onOpenCards: (documentId: string) => void
  onRunEmbedding?: (documentId: string) => void
  onDeleteDocument?: (documentId: string) => void
  onRetryParse?: (documentId: string) => void
  isStartingEmbedding?: boolean
  isDeletingDocument?: boolean
}) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  if (!document) {
    return (
      <Card>
        <CardContent className="flex min-h-[420px] flex-col items-center justify-center gap-3 p-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-line-soft">
            <FileText className="h-6 w-6 text-ink-soft" strokeWidth={1.5} />
          </div>
          <p className="text-sm text-ink-muted">选择一个文档查看详情。</p>
        </CardContent>
      </Card>
    )
  }

  const readable = canReadDocument(document)
  const canGenerate = canGenerateCards(document)
  const parseFailed = document.status === 'error'
  const embeddingFailed = document.status === 'embedding_failed'
  const canRunEmbedding =
    Boolean(onRunEmbedding) &&
    (document.status === 'parsed' ||
      document.status === 'embedding_failed' ||
      document.status === 'embedding_stale')
  const cardActionVisible = !parseFailed
  const aiJob = aiGeneration ? pickCurrentAiJob(aiGeneration.jobs, document.id) : null
  const aiRunning = Boolean(aiJob && LIVE_AI_JOB_STATUSES.has(aiJob.status))
  const deleteDisabled =
    !onDeleteDocument ||
    isDeletingDocument ||
    document.status === 'uploading' ||
    document.status === 'embedding' ||
    aiRunning

  const statusNotice =
    document.status === 'error'
      ? {
          title: '解析失败',
          detail:
            document.failureReason ??
            '文档无法完成解析。请检查文件是否包含可复制文本，或重试解析流程。',
        }
      : document.status === 'embedding_failed'
        ? {
            title: '文档可阅读',
            detail: '文档正文和 Basic 卡片功能可继续使用，后续检索增强不会进入本轮 MVP 闭环。',
          }
        : document.status === 'parsed'
          ? {
              title: '已解析，尚未生成卡片',
              detail: '可以先打开 Reader 阅读，也可以从下方启动 Basic 卡片生成。',
            }
          : document.status === 'embedding_stale'
            ? {
                title: '文档可阅读',
                detail: '当前 MVP 闭环只需要 Reader、卡片和复习，后续检索增强不阻塞学习。',
              }
            : null

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-paper-muted">
            <FileText className="h-5 w-5 text-ink-soft" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-medium leading-tight text-ink">{document.title}</h3>
            <div className="mt-1.5 flex items-center gap-2">
              <DocumentStatusBadge status={document.status} />
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-destructive hover:text-destructive"
            data-testid="library-delete-document"
            aria-label="删除文档"
            title="删除文档"
            onClick={() => {
              if (deleteDisabled) return
              setDeleteConfirmOpen(true)
            }}
            disabled={deleteDisabled}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        <p className="mt-3 text-xs text-ink-muted">
          {document.pageCount ?? '--'} 页 · {document.basicCardCount ?? 0} 张 Basic 卡 · 最近使用{' '}
          {document.lastUsedAtLabel ?? document.uploadedAtLabel}
        </p>

        {statusNotice ? (
          <div className="mt-5 rounded-lg border border-highlight-yellow/35 bg-highlight-yellow/10 p-4">
            <div className="mb-2 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-ink-muted" />
              <p className="text-sm font-medium text-ink">{statusNotice.title}</p>
            </div>
            <p className="text-xs leading-relaxed text-ink-muted">{statusNotice.detail}</p>
            {canRunEmbedding ? (
              <Button
                variant="outline"
                size="sm"
                className="mt-3 h-8"
                data-testid="library-run-embedding"
                onClick={() => onRunEmbedding?.(document.id)}
                disabled={isStartingEmbedding}
              >
                <RefreshCcw className={cn('h-3.5 w-3.5', isStartingEmbedding && 'animate-spin')} />
                {isStartingEmbedding ? EMBEDDING_RUNNING_LABEL : EMBEDDING_RETRY_LABEL}
              </Button>
            ) : null}
          </div>
        ) : document.description ? (
          <div className="mt-5">
            <p className="mb-1.5 text-xs font-medium text-ink-muted">摘要</p>
            <p className="text-sm leading-relaxed text-ink-muted">{document.description}</p>
          </div>
        ) : null}

        {document.tags?.length ? (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {document.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="gap-1 rounded-md text-xs font-normal">
                <Tag className="h-3 w-3" />
                {tag}
              </Badge>
            ))}
          </div>
        ) : null}

        {parseFailed ? (
          <div className="mt-4">
            <InlineError message="解析失败后不能生成卡片。请先重试解析。" />
          </div>
        ) : embeddingFailed ? (
          <div className="mt-4">
            <InlineError message="后续检索增强未完成，但当前文档仍可阅读和制卡。" />
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            className="min-w-[150px] flex-1"
            data-testid="library-open-reader"
            onClick={() => onOpenReader(document.id)}
            disabled={!readable}
          >
            <BookOpen className="h-4 w-4" />
            打开 Reader
          </Button>
          {parseFailed ? (
            <Button
              variant="outline"
              className="min-w-[150px] flex-1"
              data-testid="library-retry-parse"
              onClick={() => onRetryParse?.(document.id)}
              disabled={!onRetryParse}
            >
              <RefreshCcw className="h-4 w-4" />
              重试解析
            </Button>
          ) : cardActionVisible ? (
            <Button
              variant="outline"
              className="min-w-[150px] flex-1"
              data-testid="library-open-cards"
              onClick={() => onOpenCards(document.id)}
              disabled={!readable}
            >
              <Layers className="h-4 w-4" />
              管理卡片
            </Button>
          ) : null}
        </div>

        {aiGeneration && canGenerate ? (
          <AiGenerationPanel document={document} config={aiGeneration} />
        ) : null}
      </CardContent>
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除文档</DialogTitle>
            <DialogDescription>
              将从文档库移除“{document.title}”。已有 Basic
              卡片不会在这里自动删除，但会失去继续从该文档打开来源的稳定入口。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setDeleteConfirmOpen(false)
                onDeleteDocument?.(document.id)
              }}
              disabled={isDeletingDocument}
            >
              删除文档
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

export function LibraryPage(props: LibraryPageProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [showUpload, setShowUpload] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(props.documents[0]?.id ?? null)

  useEffect(() => {
    if (selectedId && props.documents.some((doc) => doc.id === selectedId)) return
    setSelectedId(props.documents[0]?.id ?? null)
  }, [props.documents, selectedId])

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return props.documents
    return props.documents.filter((doc) =>
      `${doc.title} ${doc.fileType}`.toLowerCase().includes(query)
    )
  }, [props.documents, searchQuery])

  const selectedDocument =
    filtered.find((doc) => doc.id === selectedId) ??
    props.documents.find((doc) => doc.id === selectedId) ??
    null

  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="mb-4 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
          <Input
            value={searchQuery}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setSearchQuery(event.target.value)}
            placeholder="搜索文档标题或类型"
            className="h-9 rounded-lg border-line-soft bg-paper-card pl-9 text-sm"
          />
        </div>
        <Button variant="outline" size="sm" className="h-9 gap-2">
          状态 <ChevronDown className="h-3 w-3" />
        </Button>
        <Button size="sm" className="h-9 gap-2" onClick={() => setShowUpload((value) => !value)}>
          <Upload className="h-4 w-4" />
          {props.uploadState?.isRunning ? '导入中' : '导入文档'}
        </Button>
      </div>

      {showUpload ? (
        <div className="mb-4">
          <UploadDropzone
            onClose={() => setShowUpload(false)}
            onUpload={props.onUpload}
            isUploading={Boolean(props.uploadState?.isRunning)}
          />
          {props.uploadState?.message ? (
            <p className="mt-2 text-xs text-ink-muted">{props.uploadState.message}</p>
          ) : null}
          {props.uploadState?.warnings?.length ? (
            <div className="mt-3 space-y-2" data-testid="library-upload-warnings">
              {props.uploadState.warnings.map((warning) => (
                <div
                  key={warning}
                  className="rounded-lg border border-highlight-yellow/35 bg-highlight-yellow/12 px-3 py-2 text-xs leading-5 text-ink-muted"
                >
                  {warning}
                </div>
              ))}
            </div>
          ) : null}
          {props.uploadState?.actions?.length ? (
            <div className="mt-3 flex flex-wrap gap-2" data-testid="library-upload-actions">
              {props.uploadState.actions.map((action) => (
                <Button
                  key={`${action.id}-${action.documentId ?? 'default'}`}
                  size="sm"
                  variant={action.target === 'cards' ? 'default' : 'outline'}
                  onClick={() => props.onUploadAction?.(action)}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          ) : null}
          {props.uploadState?.error ? <InlineError message={props.uploadState.error} /> : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DocumentList
          documents={filtered}
          processingJobs={props.processingJobs}
          isLoading={Boolean(props.isLoading)}
          searchQuery={searchQuery}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onUpload={props.onUpload}
        />
        <DocumentDetailPanel
          document={selectedDocument}
          aiGeneration={props.aiGeneration}
          onOpenReader={props.onOpenReader}
          onOpenCards={props.onOpenCards}
          onRunEmbedding={props.onRunEmbedding}
          onDeleteDocument={props.onDeleteDocument}
          onRetryParse={props.onRetryParse}
          isStartingEmbedding={props.isStartingEmbedding}
          isDeletingDocument={props.isDeletingDocument}
        />
      </div>
    </div>
  )
}

function parsePageRange(
  scope: 'all' | 'range',
  startValue: string,
  endValue: string,
  pageCount: number | null
): { ok: true; pageStart: number | null; pageEnd: number | null } | { ok: false; message: string } {
  if (scope === 'all') return { ok: true, pageStart: null, pageEnd: null }
  const pageStart = Number.parseInt(startValue, 10)
  const pageEnd = Number.parseInt(endValue, 10)
  if (
    !Number.isInteger(pageStart) ||
    !Number.isInteger(pageEnd) ||
    pageStart <= 0 ||
    pageEnd <= 0
  ) {
    return { ok: false, message: '请输入有效的起止页码。' }
  }
  if (pageStart > pageEnd) return { ok: false, message: '起始页不能大于结束页。' }
  if (pageCount && pageEnd > pageCount) {
    return { ok: false, message: `结束页不能超过文档总页数 ${pageCount}。` }
  }
  return { ok: true, pageStart, pageEnd }
}
