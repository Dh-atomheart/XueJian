import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { PodcastPageLayout, type PodcastPageMode } from '@/components/pages/podcast-page'
import { PodcastPlayerModal } from '@/components/podcast/PodcastPlayerModal'
import { Badge, Button, Card, CardContent, EmptyState } from '@/components/ui'
import { reportAppError, reportFeedback } from '@/lib/appFeedback'
import { cn } from '@/lib/utils'
import {
  useAppSettingsQuery,
  useCancelPodcastMutation,
  useDeletePodcastMutation,
  useDocumentsQuery,
  usePodcastAudioSegmentsQuery,
  usePodcastEpisodeQuery,
  usePodcastEpisodesQuery,
  useRetryPodcastMutation,
  useStartPodcastMutation,
} from '@/queries'
import { useAppUiStore } from '@/store'
import {
  PodcastOutlineSchema,
  PodcastScriptSchema,
  type AudioFormat,
  type PodcastDurationTier,
  type PodcastEpisode,
  type PodcastLanguage,
  type PodcastOutline,
  type PodcastScript,
  type PodcastStatus,
  type PodcastStyle,
  type TTSProviderId,
} from '@/types'

const LIVE_STATUSES = new Set<PodcastStatus>([
  'queued',
  'retrieving',
  'generating_outline',
  'generating_script',
  'evaluating',
  'awaiting_review',
  'generating_audio',
  'stitching',
])

const STYLE_OPTIONS: Array<{ value: PodcastStyle; label: string; hint: string }> = [
  { value: 'interview', label: '对话讲解', hint: '双人展开主题，适合建立整体理解。' },
  { value: 'deep_dive', label: '深入解析', hint: '强调核心概念和推理链路。' },
  { value: 'lecture', label: '系统讲述', hint: '单线清晰，适合结构化学习。' },
  { value: 'casual', label: '轻松复盘', hint: '口语化表达，适合快速回顾。' },
  { value: 'exam_prep', label: '考前梳理', hint: '压缩重点，突出易错点。' },
]

const STATUS_META: Record<
  PodcastStatus,
  {
    label: string
    tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger'
    userFacingState: 'queued' | 'running' | 'ready' | 'failed' | 'cancelled'
  }
> = {
  queued: { label: '已排队', tone: 'neutral', userFacingState: 'queued' },
  retrieving: { label: '检索资料', tone: 'info', userFacingState: 'running' },
  generating_outline: { label: '生成大纲', tone: 'info', userFacingState: 'running' },
  generating_script: { label: '撰写脚本', tone: 'info', userFacingState: 'running' },
  evaluating: { label: '质量评估', tone: 'info', userFacingState: 'running' },
  awaiting_review: { label: '等待审阅', tone: 'warning', userFacingState: 'running' },
  generating_audio: { label: '合成音频', tone: 'info', userFacingState: 'running' },
  stitching: { label: '拼接成品', tone: 'info', userFacingState: 'running' },
  ready: { label: '已完成', tone: 'success', userFacingState: 'ready' },
  failed: { label: '生成失败', tone: 'danger', userFacingState: 'failed' },
  cancelled: { label: '已取消', tone: 'neutral', userFacingState: 'cancelled' },
}

const STAGE_LABELS: Record<PodcastEpisode['stageKey'], string> = {
  retrieval: '检索',
  outline: '大纲',
  script: '脚本',
  evaluation: '评估',
  awaiting_review: '审阅',
  audio: '音频',
  ready: '完成',
  failed: '失败',
  cancelled: '取消',
}

export function PodcastPage() {
  const setActiveNavItem = useAppUiStore((state) => state.setActiveNavItem)
  const { data: appSettings } = useAppSettingsQuery()
  const { data: documents = [] } = useDocumentsQuery()
  const { data: episodes = [] } = usePodcastEpisodesQuery({ refetchInterval: 2500 })

  const readyDocuments = useMemo(
    () => documents.filter((document) => document.status === 'ready'),
    [documents]
  )

  const startMutation = useStartPodcastMutation()
  const cancelMutation = useCancelPodcastMutation()
  const deleteMutation = useDeletePodcastMutation()
  const retryMutation = useRetryPodcastMutation()

  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([])
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')
  const [style, setStyle] = useState<PodcastStyle>('interview')
  const [durationTier] = useState<PodcastDurationTier>('medium')
  const [language] = useState<PodcastLanguage>('zh-CN')
  const [ttsProvider, setTtsProvider] = useState<TTSProviderId>('auto')
  const [audioFormat, setAudioFormat] = useState<AudioFormat>('mp3')
  const [isPlayerOpen, setIsPlayerOpen] = useState(false)
  const [pageMode, setPageMode] = useState<PodcastPageMode>('create')

  useEffect(() => {
    if (readyDocuments.length > 0 && selectedDocumentIds.length === 0) {
      setSelectedDocumentIds([readyDocuments[0].id])
    }
  }, [readyDocuments, selectedDocumentIds.length])

  useEffect(() => {
    if (!appSettings) return
    setTtsProvider((current) => (current === 'auto' ? appSettings.podcastTtsProvider : current))
    setAudioFormat((current) => (current === 'mp3' ? appSettings.podcastOutputFormat : current))
  }, [appSettings])

  useEffect(() => {
    if (episodes.length === 0) {
      setSelectedEpisodeId(null)
      return
    }
    if (!selectedEpisodeId || !episodes.some((episode) => episode.id === selectedEpisodeId)) {
      setSelectedEpisodeId(episodes[0].id)
    }
  }, [episodes, selectedEpisodeId])

  const selectedEpisodePreview = useMemo(
    () => episodes.find((episode) => episode.id === selectedEpisodeId) ?? null,
    [episodes, selectedEpisodeId]
  )

  const selectedEpisodeQuery = usePodcastEpisodeQuery(selectedEpisodeId, {
    refetchInterval: (query) => {
      const episode = query.state.data as PodcastEpisode | null | undefined
      return episode && LIVE_STATUSES.has(episode.status) ? 1800 : false
    },
  })
  const selectedEpisode = selectedEpisodeQuery.data ?? selectedEpisodePreview

  const { data: audioSegments = [] } = usePodcastAudioSegmentsQuery(selectedEpisode?.id ?? null, {
    enabled: Boolean(selectedEpisode?.id),
    refetchInterval: selectedEpisode && LIVE_STATUSES.has(selectedEpisode.status) ? 1800 : false,
  })

  const parsedScript = useMemo(
    () => parseScript(selectedEpisode?.scriptJson ?? null),
    [selectedEpisode?.scriptJson]
  )
  const parsedOutline = useMemo(
    () => parseOutline(selectedEpisode?.outlineJson ?? null),
    [selectedEpisode?.outlineJson]
  )

  const isBusy =
    startMutation.isPending ||
    cancelMutation.isPending ||
    deleteMutation.isPending ||
    retryMutation.isPending

  const runningEpisodeCount = episodes.filter((episode) => LIVE_STATUSES.has(episode.status)).length
  const readyEpisodeCount = episodes.filter((episode) => episode.status === 'ready').length

  const selectedDocumentTitles = readyDocuments
    .filter((document) => selectedEpisode?.documentIds.includes(document.id))
    .map((document) => document.title)

  const selectedSourceCount = selectedDocumentIds.length
  const selectedEpisodeStageLabel = selectedEpisode ? getEpisodeStageLabel(selectedEpisode) : null
  const selectedEpisodeErrorSummary = selectedEpisode
    ? getEpisodeErrorSummary(selectedEpisode)
    : null
  const selectedEpisodeUsesFallback = selectedEpisode
    ? isFallbackEpisode(selectedEpisode)
    : false

  async function handleGenerate() {
    if (selectedDocumentIds.length === 0) {
      reportFeedback({
        scope: '播客工坊',
        title: '请先选择文档',
        detail: '至少选择一篇已处理完成的文档，再交给 Agent 生成播客。',
        level: 'warning',
        showToast: true,
      })
      return
    }

    try {
      const episode = await startMutation.mutateAsync({
        documentIds: selectedDocumentIds,
        prompt: prompt.trim() || undefined,
        style,
        language,
        durationTier,
        ttsProvider,
        audioFormat,
      })
      setSelectedEpisodeId(episode.id)
      setPageMode('library')
      setIsPlayerOpen(false)
      reportFeedback({
        scope: '播客工坊',
        title: '已开始生成',
        detail: 'Agent 正在检索材料、生成脚本并推进音频合成。',
        level: 'info',
        showToast: true,
      })
    } catch (error) {
      reportAppError('播客工坊', error, {
        title: '播客生成失败',
        fallbackDetail: '生成任务没有成功启动，请检查模型配置或稍后重试。',
        showToast: true,
      })
    }
  }

  async function handleCancelEpisode() {
    if (!selectedEpisode?.id) return
    try {
      await cancelMutation.mutateAsync(selectedEpisode.id)
    } catch (error) {
      reportAppError('播客工坊', error, {
        title: '取消播客失败',
        showToast: true,
      })
    }
  }

  async function handleDeleteEpisode() {
    if (!selectedEpisode?.id) return
    try {
      await deleteMutation.mutateAsync(selectedEpisode.id)
      if (selectedEpisodeId === selectedEpisode.id) {
        setSelectedEpisodeId(null)
      }
    } catch (error) {
      reportAppError('播客工坊', error, {
        title: '删除播客失败',
        showToast: true,
      })
    }
  }

  async function handleRetryEpisode() {
    if (!selectedEpisode?.id) return
    try {
      const episode = await retryMutation.mutateAsync(selectedEpisode.id)
      setSelectedEpisodeId(episode.id)
      setPageMode('library')
    } catch (error) {
      reportAppError('播客工坊', error, {
        title: '重试播客失败',
        showToast: true,
      })
    }
  }

  function toggleDocument(documentId: string) {
    setSelectedDocumentIds((current) =>
      current.includes(documentId)
        ? current.filter((id) => id !== documentId)
        : [...current, documentId]
    )
  }

  return (
    <>
      <PodcastPageLayout
        actions={
          <>
            <Button onClick={() => void handleGenerate()} disabled={isBusy || readyDocuments.length === 0}>
              生成播客
            </Button>
            <Button variant="outline" onClick={() => setActiveNavItem('settings')}>
              模型设置
            </Button>
          </>
        }
        toolbarChips={[
          { label: `${readyDocuments.length} 篇可用文档` },
          { label: `${runningEpisodeCount} 个进行中任务`, tone: 'info' },
          { label: `${readyEpisodeCount} 个已完成成品`, tone: 'success' },
        ]}
        toolbarHint="用户只需要给出材料和意图，其余步骤由 Agent 自动推进。"
        metrics={[
          { label: '已选文档', value: selectedSourceCount, hint: '生成前只保留必要输入。' },
          {
            label: '播客模式',
            value: STYLE_OPTIONS.find((item) => item.value === style)?.label ?? style,
            hint: '决定叙述方式。',
          },
          { label: '进行中', value: runningEpisodeCount, hint: '任务状态会自动刷新。' },
          { label: '已完成', value: readyEpisodeCount, hint: '完成后可直接播放。' },
        ]}
        mode={pageMode}
        onModeChange={setPageMode}
        createWorkbench={
          <div className="space-y-5">
            <SurfaceSection
              eyebrow="SOURCE"
              title="选择文档"
              description="只勾选这次要转成播客的文档。播客会直接基于这些材料生成。"
            >
              {readyDocuments.length === 0 ? (
                <WorkspaceEmptyState
                  title="暂无可用文档"
                  description="先导入并处理文档，等状态变为 ready 后再生成播客。"
                />
              ) : (
                <div className="space-y-2">
                  {readyDocuments.map((document) => {
                    const active = selectedDocumentIds.includes(document.id)
                    return (
                      <button
                        key={document.id}
                        type="button"
                        onClick={() => toggleDocument(document.id)}
                        className={cn(
                          'w-full rounded-[18px] border px-4 py-3 text-left transition-colors',
                          active
                            ? 'border-foreground/20 bg-card shadow-sm'
                            : 'border-border/50 bg-card/70 hover:border-foreground/15 hover:bg-card'
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">
                              {document.title}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              已就绪，可直接用于播客生成
                            </p>
                          </div>
                          <Badge
                            className={cn(
                              'rounded-md border-0',
                              active
                                ? 'bg-foreground text-background'
                                : 'bg-muted text-muted-foreground'
                            )}
                          >
                            {active ? '已选' : '可选'}
                          </Badge>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </SurfaceSection>

            <SurfaceSection
              eyebrow="MODE"
              title="选择模式"
              description="控制播客的讲述风格。其他高级参数继续使用系统默认值。"
            >
              <div className="grid gap-2">
                {STYLE_OPTIONS.map((option) => {
                  const active = option.value === style
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setStyle(option.value)}
                      className={cn(
                        'rounded-[18px] border px-4 py-3 text-left transition-colors',
                        active
                          ? 'border-foreground/20 bg-card shadow-sm'
                          : 'border-border/50 bg-card/70 hover:border-foreground/15 hover:bg-card'
                      )}
                    >
                      <p className="text-sm font-medium text-foreground">{option.label}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{option.hint}</p>
                    </button>
                  )
                })}
              </div>
            </SurfaceSection>

            <SurfaceSection
              eyebrow="PROMPT"
              title="补充提示词"
              description="可选。只填写你想强调的受众、角度或表达方式。"
            >
              <label className="block space-y-2">
                <span className="text-sm font-medium text-foreground">生成要求</span>
                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="例如：请整理成一段面向考试复习的中文播客，先讲重点，再讲易错点。"
                  className="min-h-[140px] w-full rounded-[18px] border border-border/50 bg-background/50 px-4 py-3 text-sm text-foreground outline-none transition-colors focus:border-foreground/25"
                />
              </label>
              <Button
                className="w-full"
                onClick={() => void handleGenerate()}
                disabled={isBusy || selectedDocumentIds.length === 0}
              >
                交给 Agent 生成
              </Button>
            </SurfaceSection>
          </div>
        }
        mainStage={
          <SurfaceSection
            eyebrow="LIBRARY"
            title="播客历史"
            description="生成中的任务会自动推进。完成后可直接播放，失败后可重试。"
            className="min-h-[720px]"
          >
            {episodes.length === 0 ? (
              <WorkspaceEmptyState
                className="min-h-[320px]"
                title="还没有播客成品"
                description="选择文档并发起生成后，这里会显示历史任务和可播放结果。"
              />
            ) : (
              <div className="space-y-3">
                {episodes.map((episode) => {
                  const active = selectedEpisode?.id === episode.id
                  const statusMeta = STATUS_META[episode.status]
                  return (
                    <button
                      key={episode.id}
                      type="button"
                      onClick={() => setSelectedEpisodeId(episode.id)}
                      className={cn(
                        'w-full rounded-[18px] border px-4 py-4 text-left transition-colors',
                        active
                          ? 'border-foreground/20 bg-card shadow-sm'
                          : 'border-border/50 bg-card/70 hover:border-foreground/15 hover:bg-card'
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {episode.title}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            {formatDateTime(episode.createdAt)} | {episode.language} |{' '}
                            {STYLE_OPTIONS.find((item) => item.value === episode.style)?.label ??
                              episode.style}
                          </p>
                        </div>
                        <StatusBadge status={episode.status} />
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>
                          {statusMeta.userFacingState === 'running' ? 'Agent 执行中' : statusMeta.label}
                        </span>
                        <span>|</span>
                        <span>{getEpisodeStageLabel(episode)}</span>
                        <span>|</span>
                        <span>{episode.audioFormat.toUpperCase()}</span>
                        <span>|</span>
                        <span>{Math.round(getEpisodeProgress(episode))}%</span>
                      </div>
                      {episode.errorCode || episode.errorStage ? (
                        <div
                          className="mt-3 rounded-[14px] border border-amber-200/70 bg-amber-50 px-3 py-2 text-xs text-amber-800"
                          data-testid={`podcast-episode-stage-panel-${episode.id}`}
                        >
                          <span>{episode.errorCode ?? 'workflow_issue'}</span>
                          {episode.errorStage ? <span> | {episode.errorStage}</span> : null}
                          <span> | {episode.retryable ? 'retryable' : 'manual fix required'}</span>
                        </div>
                      ) : null}
                      {isFallbackEpisode(episode) ? (
                        <div className="mt-3 rounded-[14px] border border-amber-200/70 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                          Fallback workflow used | orchestration or TTS chain did not fully execute.
                        </div>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            )}
          </SurfaceSection>
        }
        detailRail={
          <>
            <SidebarCard title="当前任务" eyebrow="DETAIL">
              {selectedEpisode ? (
                <div className="space-y-3">
                  <SidebarRow label="状态" value={STATUS_META[selectedEpisode.status].label} />
                  <SidebarRow
                    label="模式"
                    value={
                      STYLE_OPTIONS.find((item) => item.value === selectedEpisode.style)?.label ??
                      selectedEpisode.style
                    }
                  />
                  <SidebarRow label="语言" value={selectedEpisode.language} />
                  <SidebarRow label="格式" value={selectedEpisode.audioFormat.toUpperCase()} />
                  <SidebarRow
                    label="Stage"
                    value={selectedEpisodeStageLabel ?? selectedEpisode.stageKey}
                  />
                  <SidebarRow
                    label="Retry"
                    value={selectedEpisode.retryable ? 'Allowed' : 'Manual intervention'}
                  />
                  {selectedEpisodeErrorSummary ? (
                    <div
                      className="rounded-[16px] border border-amber-200/70 bg-amber-50 px-4 py-3 text-sm text-amber-900"
                      data-testid="podcast-error-panel"
                    >
                      {selectedEpisodeErrorSummary}
                    </div>
                  ) : null}
                  {selectedEpisodeUsesFallback ? (
                    <div className="rounded-[16px] border border-amber-200/70 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      This episode was completed through a fallback path. Script and audio readiness
                      should not be treated as proof that the native orchestration chain is healthy.
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2 pt-2">
                    {selectedEpisode.status === 'ready' ? (
                      <Button size="sm" onClick={() => setIsPlayerOpen(true)}>
                        播放
                      </Button>
                    ) : null}
                    {LIVE_STATUSES.has(selectedEpisode.status) ? (
                      <Button size="sm" variant="outline" onClick={() => void handleCancelEpisode()}>
                        取消
                      </Button>
                    ) : null}
                    {(selectedEpisode.status === 'failed' || selectedEpisode.status === 'cancelled') &&
                    selectedEpisode.retryable ? (
                      <Button size="sm" variant="outline" onClick={() => void handleRetryEpisode()}>
                        重试
                      </Button>
                    ) : null}
                    <Button size="sm" variant="outline" onClick={() => void handleDeleteEpisode()}>
                      删除
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm leading-6 text-muted-foreground">
                  选择一个任务后，这里会显示当前状态和可执行操作。
                </p>
              )}
            </SidebarCard>

            <SidebarCard title="来源文档" eyebrow="SOURCES">
              {selectedDocumentTitles.length > 0 ? (
                <div className="space-y-2">
                  {selectedDocumentTitles.map((title) => (
                    <div
                      key={title}
                      className="rounded-[16px] border border-border/50 bg-card/80 px-3 py-3 text-sm text-foreground"
                    >
                      {title}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm leading-6 text-muted-foreground">
                  当前任务关联的文档会显示在这里。
                </p>
              )}
            </SidebarCard>

            <SidebarCard title="内容概览" eyebrow="PREVIEW">
              {selectedEpisode ? (
                <div className="space-y-4">
                  <PreviewBlock
                    title="脚本片段"
                    content={
                      parsedScript?.segments[0]?.text ?? '脚本生成完成后，这里会显示开场片段。'
                    }
                  />
                  <PreviewBlock
                    title="大纲主题"
                    content={
                      parsedOutline?.segments[0]?.topic ?? '大纲生成完成后，这里会显示首个主题。'
                    }
                  />
                  <PreviewBlock
                    title="音频段数"
                    content={
                      audioSegments.length > 0
                        ? `${audioSegments.length} 段`
                        : '音频完成后，这里会显示切分结果。'
                    }
                  />
                </div>
              ) : (
                <p className="text-sm leading-6 text-muted-foreground">
                  生成内容的概览会显示在这里。
                </p>
              )}
            </SidebarCard>
          </>
        }
      />

      <PodcastPlayerModal
        open={isPlayerOpen}
        episodeId={selectedEpisode?.id ?? null}
        onClose={() => setIsPlayerOpen(false)}
      />
    </>
  )
}

function SurfaceSection({
  eyebrow,
  title,
  description,
  children,
  className,
}: {
  eyebrow: string
  title: string
  description?: string
  children: ReactNode
  className?: string
}) {
  return (
    <Card className={cn('border-border/60 bg-card/90 py-0 shadow-sm', className)}>
      <CardContent className="space-y-5 p-5">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            {eyebrow}
          </p>
          <h2 className="mt-1 text-xl font-medium text-foreground">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {children}
      </CardContent>
    </Card>
  )
}

function SidebarCard({
  title,
  eyebrow,
  children,
}: {
  title: string
  eyebrow: string
  children: ReactNode
}) {
  return (
    <Card className="border-border/60 bg-card/90 py-0 shadow-sm">
      <CardContent className="space-y-4 p-5">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            {eyebrow}
          </p>
          <h3 className="mt-1 text-base font-medium text-foreground">{title}</h3>
        </div>
        {children}
      </CardContent>
    </Card>
  )
}

function WorkspaceEmptyState({
  title,
  description,
  className,
}: {
  title: string
  description: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'rounded-[18px] border border-dashed border-border/60 bg-background/30',
        className
      )}
    >
      <EmptyState title={title} description={description} className="py-10" />
    </div>
  )
}

function SidebarRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/50 pb-3 last:border-b-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  )
}

function PreviewBlock({ title, content }: { title: string; content: string }) {
  return (
    <div className="rounded-[16px] border border-border/50 bg-card/80 px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{title}</p>
      <p className="mt-2 text-sm leading-6 text-foreground">{content}</p>
    </div>
  )
}

function StatusBadge({ status }: { status: PodcastStatus }) {
  const meta = STATUS_META[status]
  const toneClass =
    meta.tone === 'success'
      ? 'bg-emerald-100 text-emerald-700'
      : meta.tone === 'warning'
        ? 'bg-amber-100 text-amber-700'
        : meta.tone === 'danger'
          ? 'bg-destructive/10 text-destructive'
          : meta.tone === 'info'
            ? 'bg-sky-100 text-sky-700'
            : 'bg-muted text-muted-foreground'

  return <Badge className={cn('rounded-md border-0 font-normal', toneClass)}>{meta.label}</Badge>
}

function parseScript(rawJson: string | null): PodcastScript | null {
  if (!rawJson) return null
  try {
    const payload = JSON.parse(rawJson)
    const result = PodcastScriptSchema.safeParse(payload)
    return result.success ? result.data : null
  } catch {
    return null
  }
}

function parseOutline(rawJson: string | null): PodcastOutline | null {
  if (!rawJson) return null
  try {
    const payload = JSON.parse(rawJson)
    const result = PodcastOutlineSchema.safeParse(payload)
    return result.success ? result.data : null
  } catch {
    return null
  }
}

function getEpisodeProgress(episode: PodcastEpisode) {
  const segmentProgress =
    episode.totalSegments > 0 ? episode.completedSegments / Math.max(episode.totalSegments, 1) : 0

  switch (episode.status) {
    case 'queued':
      return 6
    case 'retrieving':
      return 14
    case 'generating_outline':
      return 28
    case 'generating_script':
      return 32 + segmentProgress * 28
    case 'evaluating':
      return 68
    case 'awaiting_review':
      return 74
    case 'generating_audio':
      return 76 + segmentProgress * 16
    case 'stitching':
      return 95
    case 'ready':
    case 'failed':
    case 'cancelled':
      return 100
  }
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function getEpisodeStageLabel(episode: PodcastEpisode) {
  return STAGE_LABELS[episode.stageKey] ?? episode.stageKey
}

function getEpisodeErrorSummary(episode: PodcastEpisode) {
  if (!episode.errorCode && !episode.errorStage && !episode.errorMessage) return null

  const parts = [
    episode.errorCode,
    episode.errorStage ? `stage:${episode.errorStage}` : null,
    episode.errorMessage,
    episode.retryable ? '可重试' : '需人工处理',
  ].filter(Boolean)

  return parts.join(' | ')
}

function isFallbackEpisode(episode: PodcastEpisode) {
  return episode.errorCode === 'fallback_used'
}
