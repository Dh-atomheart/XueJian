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
  useReviewPodcastMutation,
  useStartPodcastMutation,
} from '@/queries'
import { useAppUiStore } from '@/store'
import {
  PodcastOutlineSchema,
  PodcastScriptSchema,
  ScriptEvaluationSchema,
  type AudioFormat,
  type PodcastDurationTier,
  type PodcastEpisode,
  type PodcastLanguage,
  type PodcastOutline,
  type PodcastScript,
  type PodcastStatus,
  type PodcastStyle,
  type ScriptEvaluation,
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
  { value: 'interview', label: '访谈', hint: '主持人追问，嘉宾解释，适合串联复杂概念。' },
  { value: 'deep_dive', label: '深挖', hint: '强调因果链、机制与主题延展。' },
  { value: 'lecture', label: '讲授', hint: '单人系统化梳理，适合复盘与速记。' },
  { value: 'casual', label: '闲聊', hint: '更轻松、更口语化，适合日常收听。' },
  { value: 'exam_prep', label: '冲刺', hint: '高密度考点压缩版，适合考前回顾。' },
]

const DURATION_OPTIONS: Array<{ value: PodcastDurationTier; label: string; hint: string }> = [
  { value: 'short', label: '短', hint: '3-5 分钟' },
  { value: 'medium', label: '中', hint: '8-12 分钟' },
  { value: 'long', label: '长', hint: '15-25 分钟' },
  { value: 'ultra_long', label: '超长', hint: '25 分钟以上' },
]

const LANGUAGE_OPTIONS: Array<{ value: PodcastLanguage; label: string }> = [
  { value: 'zh-CN', label: '中文' },
  { value: 'en-US', label: 'English' },
  { value: 'ja-JP', label: '日本語' },
  { value: 'ko-KR', label: '한국어' },
]

const PROVIDER_OPTIONS: Array<{ value: TTSProviderId; label: string; hint: string }> = [
  { value: 'auto', label: '自动', hint: '优先 OpenAI，失败时回退。' },
  { value: 'openai', label: 'OpenAI', hint: '适合更快生成。' },
  { value: 'edge_tts', label: 'Edge TTS', hint: '本地可用时更稳。' },
]

const FORMAT_OPTIONS: Array<{ value: AudioFormat; label: string }> = [
  { value: 'mp3', label: 'MP3' },
  { value: 'wav', label: 'WAV' },
]

const DURATION_ESTIMATE_MINUTES: Record<PodcastDurationTier, number> = {
  short: 4,
  medium: 10,
  long: 22,
  ultra_long: 36,
}

const DURATION_ESTIMATE_SEGMENTS: Record<PodcastDurationTier, number> = {
  short: 4,
  medium: 8,
  long: 14,
  ultra_long: 22,
}

const TTS_ESTIMATE_COST_PER_1K_CHARS: Record<TTSProviderId, number> = {
  auto: 0.015,
  openai: 0.015,
  edge_tts: 0,
}

const STATUS_META: Record<
  PodcastStatus,
  { label: string; tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' }
> = {
  queued: { label: '已排队', tone: 'neutral' },
  retrieving: { label: '检索资料', tone: 'info' },
  generating_outline: { label: '构建大纲', tone: 'info' },
  generating_script: { label: '撰写脚本', tone: 'info' },
  evaluating: { label: '评估脚本', tone: 'info' },
  awaiting_review: { label: '等待审阅', tone: 'warning' },
  generating_audio: { label: '生成语音', tone: 'success' },
  stitching: { label: '拼接音频', tone: 'success' },
  ready: { label: '已完成', tone: 'success' },
  failed: { label: '失败', tone: 'danger' },
  cancelled: { label: '已取消', tone: 'neutral' },
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
  const reviewMutation = useReviewPodcastMutation()
  const retryMutation = useRetryPodcastMutation()

  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([])
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')
  const [style, setStyle] = useState<PodcastStyle>('interview')
  const [durationTier, setDurationTier] = useState<PodcastDurationTier>('medium')
  const [language, setLanguage] = useState<PodcastLanguage>('zh-CN')
  const [ttsProvider, setTtsProvider] = useState<TTSProviderId>('auto')
  const [audioFormat, setAudioFormat] = useState<AudioFormat>('mp3')
  const [reviewDraft, setReviewDraft] = useState('')
  const [isPlayerOpen, setIsPlayerOpen] = useState(false)
  const [pageMode, setPageMode] = useState<PodcastPageMode>('create')
  const [now, setNow] = useState(() => Date.now())

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
      if (selectedEpisodeId) {
        setSelectedEpisodeId(null)
      }
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

  const { data: selectedEpisodeData } = usePodcastEpisodeQuery(selectedEpisodeId, {
    refetchInterval: (query) => {
      const episode = query.state.data as PodcastEpisode | null | undefined
      return episode && LIVE_STATUSES.has(episode.status) ? 1800 : false
    },
  })

  const selectedEpisode = selectedEpisodeData ?? selectedEpisodePreview

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
  const parsedEvaluation = useMemo(
    () => parseEvaluation(selectedEpisode?.evaluationJson ?? null),
    [selectedEpisode?.evaluationJson]
  )

  useEffect(() => {
    if (!selectedEpisode?.scriptJson) {
      setReviewDraft('')
      return
    }

    try {
      setReviewDraft(JSON.stringify(JSON.parse(selectedEpisode.scriptJson), null, 2))
    } catch {
      setReviewDraft(selectedEpisode.scriptJson)
    }
  }, [selectedEpisode?.id, selectedEpisode?.scriptJson])

  useEffect(() => {
    if (selectedEpisode?.status !== 'awaiting_review') {
      return
    }

    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [selectedEpisode?.status])

  const isBusy =
    startMutation.isPending ||
    cancelMutation.isPending ||
    deleteMutation.isPending ||
    reviewMutation.isPending ||
    retryMutation.isPending

  async function handleGenerate() {
    if (selectedDocumentIds.length === 0) {
      reportFeedback({
        scope: '播客工坊',
        title: '先选择至少一份文档',
        detail: '播客脚本需要基于已解析文档内容生成。',
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
        title: '已启动播客生成',
        detail: '可以在工作台中继续跟踪大纲、脚本、审阅和音频状态。',
        level: 'info',
        showToast: true,
      })
    } catch (error) {
      reportAppError('播客工坊', error, {
        title: '播客生成启动失败',
        fallbackDetail: '请检查文档解析状态、模型配置和 TTS 提供商设置。',
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

  async function handleReview(action: 'accept' | 'edit' | 'reject') {
    if (!selectedEpisode?.id) return

    try {
      await reviewMutation.mutateAsync({
        episodeId: selectedEpisode.id,
        action,
        editedScriptJson: action === 'edit' ? reviewDraft : undefined,
      })
    } catch (error) {
      reportAppError('播客工坊', error, {
        title: '提交脚本审阅失败',
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

  const liveEpisodeCount = episodes.filter((episode) => LIVE_STATUSES.has(episode.status)).length
  const readyEpisodeCount = episodes.filter((episode) => episode.status === 'ready').length

  const generationEstimate = useMemo(
    () =>
      estimatePodcastGeneration({
        documentCount: selectedDocumentIds.length,
        prompt,
        durationTier,
        language,
        ttsProvider,
      }),
    [durationTier, language, prompt, selectedDocumentIds.length, ttsProvider]
  )

  const estimateWarnings = useMemo(() => {
    if (!appSettings) return []

    const warnings: string[] = []
    if (
      appSettings.podcastMaxLlmTokens > 0 &&
      generationEstimate.llmTokens > appSettings.podcastMaxLlmTokens
    ) {
      warnings.push(
        `估算 LLM Tokens ${formatCompactNumber(generationEstimate.llmTokens)} 超过上限 ${formatCompactNumber(appSettings.podcastMaxLlmTokens)}`
      )
    }
    if (
      appSettings.podcastMaxTtsCharacters > 0 &&
      generationEstimate.ttsCharacters > appSettings.podcastMaxTtsCharacters
    ) {
      warnings.push(
        `估算 TTS 字符 ${formatCompactNumber(generationEstimate.ttsCharacters)} 超过上限 ${formatCompactNumber(appSettings.podcastMaxTtsCharacters)}`
      )
    }
    if (
      appSettings.podcastMaxEstimatedCostUsd > 0 &&
      generationEstimate.estimatedCostUsd > appSettings.podcastMaxEstimatedCostUsd
    ) {
      warnings.push(
        `估算成本 ${formatUsd(generationEstimate.estimatedCostUsd)} 超过上限 ${formatUsd(appSettings.podcastMaxEstimatedCostUsd)}`
      )
    }
    return warnings
  }, [appSettings, generationEstimate])

  const reviewTimeoutSecondsRemaining = useMemo(() => {
    if (
      !appSettings ||
      !selectedEpisode ||
      selectedEpisode.status !== 'awaiting_review' ||
      appSettings.reviewTimeLimit < 0
    ) {
      return null
    }

    const updatedAt = Date.parse(selectedEpisode.updatedAt)
    if (!Number.isFinite(updatedAt)) return null

    const deadline = updatedAt + appSettings.reviewTimeLimit * 60_000
    return Math.max(0, Math.ceil((deadline - now) / 1000))
  }, [appSettings, now, selectedEpisode])

  const selectedDocumentTitles = readyDocuments
    .filter((document) => selectedEpisode?.documentIds.includes(document.id))
    .map((document) => document.title)

  return (
    <>
      <PodcastPageLayout
        actions={
          <>
            <Button onClick={() => void handleGenerate()} disabled={isBusy || readyDocuments.length === 0}>
              生成播客
            </Button>
            <Button variant="outline" onClick={() => setActiveNavItem('settings')}>
              检查设置
            </Button>
          </>
        }
        toolbarChips={[
          { label: `${readyDocuments.length} 份就绪文档` },
          { label: `${liveEpisodeCount} 条进行中`, tone: 'info' },
          { label: `${readyEpisodeCount} 条已完成`, tone: 'success' },
        ]}
        toolbarHint={
          <>
            当前默认输出 {audioFormat.toUpperCase()}，预计 {generationEstimate.durationMinutes}{' '}
            分钟。
          </>
        }
        metrics={[
          { label: '文档来源', value: readyDocuments.length, hint: '仅统计已完成解析的资料' },
          { label: '排队与生成中', value: liveEpisodeCount, hint: '后台会持续轮询最新状态' },
          { label: '已完成节目', value: readyEpisodeCount, hint: '可直接进入播放器' },
          {
            label: '估算成本',
            value: formatUsd(generationEstimate.estimatedCostUsd),
            hint: `${formatCompactNumber(generationEstimate.ttsCharacters)} TTS 字符`,
          },
        ]}
        mode={pageMode}
        onModeChange={setPageMode}
        createWorkbench={
          <>
            <SurfaceSection
              eyebrow="GENERATION BRIEF"
              title="创建播客"
              description="真实 provider、语言、格式和预算限制都在这里生效。"
            >
              <div className="space-y-5">
                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">文档范围</p>
                      <p className="text-xs leading-5 text-muted-foreground">
                        仅展示已完成解析的文档。多选会让节目更像专题串讲。
                      </p>
                    </div>
                    {selectedDocumentIds.length > 0 ? (
                      <button
                        type="button"
                        className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                        onClick={() => setSelectedDocumentIds([])}
                      >
                        清空
                      </button>
                    ) : null}
                  </div>

                  {readyDocuments.length === 0 ? (
                    <WorkspaceEmptyState
                      className="min-h-[180px]"
                      title="还没有可用的播客来源"
                      description="先去文档库导入并解析至少一份文档，再回来生成播客。"
                      action={
                        <Button variant="outline" onClick={() => setActiveNavItem('library')}>
                          前往文档库
                        </Button>
                      }
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
                                : 'border-border/50 bg-card/70 hover:border-foreground/20 hover:bg-card'
                            )}
                          >
                            <p className="text-sm font-medium text-foreground">{document.title}</p>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">
                              {document.pageCount ?? 0} 页 · {document.status}
                            </p>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </section>

                <section className="space-y-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">节目提示词</p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      可选。指定听众、重点章节，或者让脚本更偏考试/实战。
                    </p>
                  </div>
                  <textarea
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    rows={5}
                    className="min-h-[132px] w-full rounded-[18px] border border-border/50 bg-background/50 px-4 py-3 text-sm leading-6 text-foreground outline-none transition-colors focus:border-foreground/25"
                    placeholder="例如：面向备考用户，先讲核心定义，再给一个生活化例子。"
                  />
                </section>

                <OptionGrid
                  title="节目风格"
                  description="风格影响脚本语气、组织方式和节目氛围。"
                  options={STYLE_OPTIONS}
                  value={style}
                  onChange={(value) => setStyle(value as PodcastStyle)}
                />

                <OptionGrid
                  title="时长"
                  description="时长会直接影响估算 token、脚本长度和音频段数。"
                  options={DURATION_OPTIONS}
                  value={durationTier}
                  onChange={(value) => setDurationTier(value as PodcastDurationTier)}
                />

                <div className="grid gap-3 sm:grid-cols-3">
                  <SelectField
                    label="语言"
                    value={language}
                    options={LANGUAGE_OPTIONS}
                    onChange={(value) => setLanguage(value as PodcastLanguage)}
                  />
                  <SelectField
                    label="TTS"
                    value={ttsProvider}
                    options={PROVIDER_OPTIONS}
                    onChange={(value) => setTtsProvider(value as TTSProviderId)}
                  />
                  <SelectField
                    label="格式"
                    value={audioFormat}
                    options={FORMAT_OPTIONS}
                    onChange={(value) => setAudioFormat(value as AudioFormat)}
                  />
                </div>

                <div className="rounded-[18px] border border-border/50 bg-muted/25 p-4">
                  <p className="text-sm font-medium text-foreground">本次估算</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <EstimateStat
                      label="节目时长"
                      value={`${generationEstimate.durationMinutes} 分钟`}
                      hint={`${generationEstimate.segmentCount} 个片段`}
                    />
                    <EstimateStat
                      label="LLM Tokens"
                      value={formatCompactNumber(generationEstimate.llmTokens)}
                      hint="按当前文档与提示词估算"
                    />
                    <EstimateStat
                      label="TTS 字符"
                      value={formatCompactNumber(generationEstimate.ttsCharacters)}
                      hint="语言和时长都会影响"
                    />
                    <EstimateStat
                      label="成本"
                      value={formatUsd(generationEstimate.estimatedCostUsd)}
                      hint="仅作前端估算提醒"
                    />
                  </div>
                </div>

                {estimateWarnings.length > 0 ? (
                  <div className="space-y-2 rounded-[18px] border border-amber-200 bg-amber-50/80 p-4">
                    <p className="text-sm font-medium text-amber-900">预算与上限提醒</p>
                    {estimateWarnings.map((warning) => (
                      <p key={warning} className="text-xs leading-5 text-amber-800">
                        {warning}
                      </p>
                    ))}
                  </div>
                ) : null}

                <Button
                  className="w-full"
                  onClick={() => void handleGenerate()}
                  disabled={isBusy || readyDocuments.length === 0}
                >
                  {startMutation.isPending ? '正在创建 episode…' : '开始生成播客'}
                </Button>
              </div>
            </SurfaceSection>
          </>
        }
        mainStage={
          <div className="space-y-5">
            <SurfaceSection
              eyebrow="EPISODE LIBRARY"
              title="节目队列"
              description="所有 episode 统一走这里的主列表，保持参考编码的主舞台结构。"
            >
              {episodes.length === 0 ? (
                <WorkspaceEmptyState
                  className="min-h-[220px]"
                  title="还没有任何 episode"
                  description="左侧填写 brief 并启动生成后，这里会自动出现新的播客任务。"
                />
              ) : (
                <div className="space-y-2">
                  {episodes.map((episode) => (
                    <EpisodeListItem
                      key={episode.id}
                      episode={episode}
                      active={episode.id === selectedEpisode?.id}
                      onSelect={() => {
                        setSelectedEpisodeId(episode.id)
                        setPageMode('library')
                      }}
                    />
                  ))}
                </div>
              )}
            </SurfaceSection>

            <SurfaceSection
              eyebrow="EPISODE STAGE"
              title={selectedEpisode ? selectedEpisode.title : '主舞台'}
              description={
                selectedEpisode
                  ? selectedEpisode.scopeDescription || '在这里查看脚本、评估、审阅和音频输出。'
                  : '选择一条 episode 后，这里会展开真实的运行信息。'
              }
              data-testid="podcast-stage"
              headerSlot={
                selectedEpisode ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={selectedEpisode.status} />
                    <span className="text-xs text-muted-foreground">
                      更新于 {formatDateTime(selectedEpisode.updatedAt)}
                    </span>
                  </div>
                ) : null
              }
            >
              {!selectedEpisode ? (
                <WorkspaceEmptyState
                  className="min-h-[300px]"
                  title="先选择一条 episode"
                  description="生成启动后，可以在这里集中查看大纲、脚本、评估、审阅与音频段。"
                />
              ) : (
                <div className="space-y-5">
                  <div className="flex flex-wrap gap-2">
                    {selectedEpisode.status === 'ready' ? (
                      <Button onClick={() => setIsPlayerOpen(true)}>打开播放器</Button>
                    ) : null}
                    {LIVE_STATUSES.has(selectedEpisode.status) ? (
                      <Button variant="outline" onClick={() => void handleCancelEpisode()}>
                        取消任务
                      </Button>
                    ) : null}
                    {selectedEpisode.status === 'failed' || selectedEpisode.status === 'cancelled' ? (
                      <Button variant="outline" onClick={() => void handleRetryEpisode()}>
                        重试
                      </Button>
                    ) : null}
                    <Button variant="ghost" onClick={() => void handleDeleteEpisode()}>
                      删除
                    </Button>
                  </div>

                  <div className="grid gap-3 md:grid-cols-4">
                    <EstimateStat
                      label="进度"
                      value={`${Math.round(getEpisodeProgress(selectedEpisode))}%`}
                      hint="根据真实 workflow 状态映射"
                    />
                    <EstimateStat
                      label="段落"
                      value={`${selectedEpisode.completedSegments}/${selectedEpisode.totalSegments}`}
                      hint="脚本与音频片段进度"
                    />
                    <EstimateStat
                      label="语言"
                      value={selectedEpisode.language}
                      hint={selectedEpisode.style}
                    />
                    <EstimateStat
                      label="输出"
                      value={selectedEpisode.audioFormat.toUpperCase()}
                      hint={selectedEpisode.durationTier}
                    />
                  </div>

                  {selectedEpisode.errorMessage ? (
                    <div className="rounded-[18px] border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                      {selectedEpisode.errorMessage}
                    </div>
                  ) : null}

                  {parsedEvaluation ? (
                    <section className="space-y-3">
                      <SectionHeading eyebrow="EVALUATION" title="脚本评估" />
                      <div className="grid gap-3 md:grid-cols-3">
                        <ScoreTile label="准确性" value={parsedEvaluation.accuracy} strong />
                        <ScoreTile label="连贯性" value={parsedEvaluation.coherence} />
                        <ScoreTile label="整体分数" value={parsedEvaluation.overallScore} />
                      </div>
                      {parsedEvaluation.issues.length > 0 || parsedEvaluation.suggestions.length > 0 ? (
                        <div className="grid gap-3 md:grid-cols-2">
                          <BulletPanel
                            title="Issues"
                            items={parsedEvaluation.issues}
                            emptyLabel="当前没有额外问题记录。"
                          />
                          <BulletPanel
                            title="Suggestions"
                            items={parsedEvaluation.suggestions}
                            emptyLabel="当前没有额外改写建议。"
                          />
                        </div>
                      ) : null}
                    </section>
                  ) : null}

                  {parsedOutline ? (
                    <section className="space-y-3">
                      <SectionHeading eyebrow="OUTLINE" title="节目大纲" />
                      <div className="grid gap-3">
                        {parsedOutline.segments.map((segment) => (
                          <div
                            key={`${segment.segmentIndex}-${segment.topic}`}
                            className="rounded-[18px] border border-border/50 bg-card/80 px-4 py-4"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                                  Segment {segment.segmentIndex + 1}
                                </p>
                                <h4 className="mt-1 text-sm font-medium text-foreground">
                                  {segment.topic}
                                </h4>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {formatDuration(segment.targetDurationMs)}
                              </span>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {segment.keyPoints.map((point) => (
                                <span
                                  key={point}
                                  className="rounded-full border border-border/50 bg-muted/25 px-3 py-1 text-xs text-muted-foreground"
                                >
                                  {point}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {selectedEpisode.status === 'awaiting_review' ? (
                    <section className="space-y-3">
                      <SectionHeading eyebrow="REVIEW GATE" title="脚本审阅" />
                      <div className="rounded-[18px] border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm leading-6 text-amber-900">
                        <p>
                          {reviewTimeoutSecondsRemaining === null
                            ? '当前脚本处于人工审阅阶段。'
                            : reviewTimeoutSecondsRemaining > 0
                              ? `若 ${formatCountdown(reviewTimeoutSecondsRemaining)} 内无操作，系统将自动通过并继续生成音频。`
                              : '审阅超时已到，系统会自动继续推进音频生成。'}
                        </p>
                      </div>
                      <textarea
                        value={reviewDraft}
                        onChange={(event) => setReviewDraft(event.target.value)}
                        rows={14}
                        aria-label="脚本审阅草稿 JSON"
                        title="脚本审阅草稿 JSON"
                        placeholder="在这里编辑脚本 JSON，然后保存修改并继续。"
                        className="min-h-[280px] w-full rounded-[18px] border border-border/50 bg-background/50 px-4 py-3 font-mono text-xs leading-6 text-foreground outline-none transition-colors focus:border-foreground/25"
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => void handleReview('accept')}>
                          直接通过
                        </Button>
                        <Button onClick={() => void handleReview('edit')}>保存修改并继续</Button>
                        <Button variant="ghost" onClick={() => void handleReview('reject')}>
                          拒绝并取消
                        </Button>
                      </div>
                    </section>
                  ) : null}

                  {parsedScript ? (
                    <section className="space-y-3">
                      <SectionHeading eyebrow="TRANSCRIPT" title="脚本与对白" />
                      <div className="grid gap-3">
                        {parsedScript.segments.map((segment, index) => (
                          <div
                            key={segment.id}
                            className="rounded-[18px] border border-border/50 bg-card/80 px-4 py-4"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <span className="text-xs text-muted-foreground">
                                  {String(index + 1).padStart(2, '0')}
                                </span>
                                <p className="text-sm font-medium text-foreground">
                                  {segment.speaker}
                                </p>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {formatDuration(segment.durationMs)}
                              </span>
                            </div>
                            <p className="mt-3 text-sm leading-7 text-muted-foreground">
                              {segment.text}
                            </p>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  <section className="space-y-3">
                    <SectionHeading eyebrow="AUDIO OUTPUT" title="音频片段" />
                    {audioSegments.length === 0 ? (
                      <WorkspaceEmptyState
                        className="min-h-[180px]"
                        title="音频片段尚未就绪"
                        description={
                          selectedEpisode.status === 'ready'
                            ? '当前 episode 已完成，但还没有读到音频 segment 元数据。仍然可以尝试打开最终播放器。'
                            : '音频阶段尚未产出可展示的 segment。'
                        }
                      />
                    ) : (
                      <div className="grid gap-3 md:grid-cols-2">
                        {audioSegments.map((segment) => (
                          <div
                            key={segment.id}
                            className="rounded-[18px] border border-border/50 bg-card/80 px-4 py-4"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-medium text-foreground">
                                {segment.speaker}
                              </p>
                              <span className="text-xs text-muted-foreground">
                                {formatDuration(segment.durationMs)}
                              </span>
                            </div>
                            <p className="mt-2 text-xs leading-5 text-muted-foreground">
                              {segment.ttsProvider} · {segment.voiceId}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              )}
            </SurfaceSection>
          </div>
        }
        detailRail={
          <>
            <SidebarCard title="当前 episode" eyebrow="DETAIL">
              {selectedEpisode ? (
                <div className="space-y-3 text-sm">
                  <SidebarRow label="状态" value={STATUS_META[selectedEpisode.status].label} />
                  <SidebarRow label="语言" value={selectedEpisode.language} />
                  <SidebarRow label="风格" value={selectedEpisode.style} />
                  <SidebarRow label="时长档位" value={selectedEpisode.durationTier} />
                  <SidebarRow label="语音引擎" value={selectedEpisode.ttsProvider} />
                  <SidebarRow label="输出格式" value={selectedEpisode.audioFormat.toUpperCase()} />
                </div>
              ) : (
                <p className="text-sm leading-6 text-muted-foreground">
                  选择一条 episode 后显示详细元信息。
                </p>
              )}
            </SidebarCard>

            <SidebarCard title="来源文档" eyebrow="SOURCE DOCS">
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
                  当前没有可展示的来源文档映射。选择 episode 或先在左侧勾选文档。
                </p>
              )}
            </SidebarCard>

            <SidebarCard title="运行说明" eyebrow="RUNTIME">
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  无配置时页面仍然可进入，但生成动作依赖设置页里的真实 provider 与预算规则。
                </p>
                <p>
                  审阅阶段的倒计时、重试、取消和删除都继续连到现有真实 mutation。
                </p>
              </div>
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
  headerSlot,
  children,
  className,
  ...rest
}: {
  eyebrow: string
  title: string
  description?: string
  headerSlot?: ReactNode
  children: ReactNode
  className?: string
} & React.ComponentProps<'div'>) {
  return (
    <Card className={cn('border-border/60 bg-card/90 py-0 shadow-sm', className)} {...rest}>
      <CardContent className="space-y-5 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              {eyebrow}
            </p>
            <h2 className="mt-1 text-xl font-medium text-foreground">{title}</h2>
            {description ? (
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {headerSlot}
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
  action,
  className,
}: {
  title: string
  description: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('rounded-[18px] border border-dashed border-border/60 bg-background/30', className)}>
      <EmptyState title={title} description={description} className="py-10" />
      {action ? <div className="-mt-6 flex justify-center pb-6">{action}</div> : null}
    </div>
  )
}

function EpisodeListItem({
  episode,
  active,
  onSelect,
}: {
  episode: PodcastEpisode
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-[18px] border px-4 py-4 text-left transition-colors',
        active
          ? 'border-foreground/20 bg-card shadow-sm'
          : 'border-border/50 bg-card/70 hover:border-foreground/15 hover:bg-card'
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{episode.title}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {formatDateTime(episode.createdAt)} · {episode.style} · {episode.language}
          </p>
        </div>
        <StatusBadge status={episode.status} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{episode.audioFormat.toUpperCase()}</span>
        <span>·</span>
        <span>{episode.durationTier}</span>
        <span>·</span>
        <span>{Math.round(getEpisodeProgress(episode))}%</span>
      </div>
    </button>
  )
}

function OptionGrid({
  title,
  description,
  options,
  value,
  onChange,
}: {
  title: string
  description: string
  options: Array<{ value: string; label: string; hint?: string }>
  value: string
  onChange: (value: string) => void
}) {
  return (
    <section className="space-y-3">
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const active = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={cn(
                'rounded-[18px] border px-4 py-3 text-left transition-colors',
                active
                  ? 'border-foreground/20 bg-card shadow-sm'
                  : 'border-border/50 bg-card/70 hover:border-foreground/15 hover:bg-card'
              )}
            >
              <p className="text-sm font-medium text-foreground">{option.label}</p>
              {option.hint ? (
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{option.hint}</p>
              ) : null}
            </button>
          )
        })}
      </div>
    </section>
  )
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
}) {
  return (
    <label className="space-y-2">
      <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-[16px] border border-border/50 bg-background/50 px-4 text-sm text-foreground outline-none transition-colors focus:border-foreground/25"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
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

function EstimateStat({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint: string
}) {
  return (
    <div className="rounded-[16px] border border-border/50 bg-card/80 px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-lg font-medium text-foreground">{value}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{hint}</p>
    </div>
  )
}

function ScoreTile({
  label,
  value,
  strong = false,
}: {
  label: string
  value: number
  strong?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-[18px] border px-4 py-4',
        strong ? 'border-foreground/20 bg-card shadow-sm' : 'border-border/50 bg-muted/20'
      )}
    >
      <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{label}</p>
      <p className="mt-3 text-3xl font-medium text-foreground">{value.toFixed(1)}</p>
      <p className="mt-1 text-xs text-muted-foreground">/ 10</p>
    </div>
  )
}

function BulletPanel({
  title,
  items,
  emptyLabel,
}: {
  title: string
  items: string[]
  emptyLabel: string
}) {
  return (
    <div className="rounded-[18px] border border-border/50 bg-card/80 px-4 py-4">
      <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{title}</p>
      <div className="mt-3 space-y-2">
        {items.length === 0 ? (
          <p className="text-sm leading-6 text-muted-foreground">{emptyLabel}</p>
        ) : (
          items.map((item) => (
            <div key={item} className="flex gap-3 text-sm leading-6 text-muted-foreground">
              <span className="mt-[10px] h-1.5 w-1.5 flex-none rounded-full bg-foreground/50" />
              <span>{item}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">{eyebrow}</p>
      <h3 className="mt-1 text-lg font-medium text-foreground">{title}</h3>
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

function parseEvaluation(rawJson: string | null): ScriptEvaluation | null {
  if (!rawJson) return null
  try {
    const payload = JSON.parse(rawJson)
    const result = ScriptEvaluationSchema.safeParse(payload)
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

function formatDuration(durationMs: number) {
  const seconds = Math.max(0, Math.floor(durationMs / 1000))
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
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

function estimatePodcastGeneration({
  documentCount,
  prompt,
  durationTier,
  language,
  ttsProvider,
}: {
  documentCount: number
  prompt: string
  durationTier: PodcastDurationTier
  language: PodcastLanguage
  ttsProvider: TTSProviderId
}) {
  const durationMinutes = DURATION_ESTIMATE_MINUTES[durationTier]
  const segmentCount = DURATION_ESTIMATE_SEGMENTS[durationTier]
  const promptWeight = Math.min(1, prompt.trim().length / 240)
  const charsPerMinute = language === 'en-US' ? 780 : 340

  const llmTokens = Math.round(
    1800 +
      Math.max(1, documentCount) * 700 +
      durationMinutes * 170 +
      segmentCount * 240 +
      promptWeight * 500
  )
  const ttsCharacters = Math.round(durationMinutes * charsPerMinute)
  const estimatedCostUsd =
    (llmTokens / 1000) * 0.0025 +
    (ttsCharacters / 1000) * TTS_ESTIMATE_COST_PER_1K_CHARS[ttsProvider]

  return {
    durationMinutes,
    segmentCount,
    llmTokens,
    ttsCharacters,
    estimatedCostUsd,
  }
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(value)
}

function formatUsd(value: number) {
  return `$${value.toFixed(value < 0.1 ? 3 : 2)}`
}

function formatCountdown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
