import { useEffect, useMemo, useState } from 'react'
import { PodcastPlayerModal } from '@/components/podcast/PodcastPlayerModal'
import { Button, Panel, SketchEmptyState } from '@/components/ui'
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
  { value: 'interview', label: '访谈', hint: '主持人提问，嘉宾解释。' },
  { value: 'deep_dive', label: '深挖', hint: '追机制、讲因果、拉长线。' },
  { value: 'lecture', label: '讲授', hint: '单人系统梳理，适合复盘。' },
  { value: 'casual', label: '闲聊', hint: '更口语、更轻松的节奏。' },
  { value: 'exam_prep', label: '冲刺', hint: '高密度考点压缩版。' },
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
  { value: 'auto', label: '自动', hint: '优先 OpenAI，不可用时回退。' },
  { value: 'openai', label: 'OpenAI', hint: '适合快速生成。' },
  { value: 'edge_tts', label: 'Edge TTS', hint: '本地可用时稳定兜底。' },
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

const STATUS_META: Record<PodcastStatus, { label: string; tone: string }> = {
  queued: { label: '已排队', tone: 'border-stone-300 bg-stone-100 text-stone-700' },
  retrieving: { label: '检索资料', tone: 'border-sky-200 bg-sky-50 text-sky-700' },
  generating_outline: { label: '构建大纲', tone: 'border-cyan-200 bg-cyan-50 text-cyan-700' },
  generating_script: { label: '撰写脚本', tone: 'border-indigo-200 bg-indigo-50 text-indigo-700' },
  evaluating: { label: '评估脚本', tone: 'border-violet-200 bg-violet-50 text-violet-700' },
  awaiting_review: { label: '等待审阅', tone: 'border-amber-200 bg-amber-50 text-amber-800' },
  generating_audio: {
    label: '生成语音',
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  stitching: { label: '拼接音频', tone: 'border-teal-200 bg-teal-50 text-teal-700' },
  ready: { label: '已完成', tone: 'border-green-200 bg-green-50 text-green-700' },
  failed: { label: '失败', tone: 'border-rose-200 bg-rose-50 text-rose-700' },
  cancelled: { label: '已取消', tone: 'border-zinc-200 bg-zinc-100 text-zinc-700' },
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
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (readyDocuments.length > 0 && selectedDocumentIds.length === 0) {
      setSelectedDocumentIds([readyDocuments[0].id])
    }
  }, [readyDocuments, selectedDocumentIds.length])

  useEffect(() => {
    if (!appSettings) {
      return
    }

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
        detail: '播客脚本需要基于已解析的文档内容生成。',
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
      setIsPlayerOpen(false)
      reportFeedback({
        scope: '播客工坊',
        title: '已开始生成播客',
        detail: '你可以在右侧跟踪阶段进度、脚本和音频状态。',
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
    if (!appSettings) {
      return []
    }

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
    if (!Number.isFinite(updatedAt)) {
      return null
    }

    const deadline = updatedAt + appSettings.reviewTimeLimit * 60_000
    return Math.max(0, Math.ceil((deadline - now) / 1000))
  }, [appSettings, now, selectedEpisode])

  return (
    <>
      <div className="mx-auto flex w-full max-w-[1380px] flex-col gap-6 p-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-ui text-[11px] uppercase tracking-[0.24em] text-ink-soft">
              Podcast Workflow Studio
            </p>
            <h1 className="mt-2 font-display text-3xl text-ink">播客工坊</h1>
            <p className="mt-2 max-w-2xl font-body text-sm leading-6 text-ink-muted">
              把一组文档压缩成可听的学习节目。左侧配置生成策略，右侧跟踪 episode
              的检索、大纲、脚本、评估和音频状态。
            </p>
          </div>

          <div className="grid min-w-[260px] grid-cols-3 gap-3">
            <MetricTile label="已就绪文档" value={readyDocuments.length} hint="可作为播客来源" />
            <MetricTile label="进行中" value={liveEpisodeCount} hint="后台持续刷新" />
            <MetricTile
              label="音频成品"
              value={episodes.filter((episode) => episode.status === 'ready').length}
              hint="可直接播放"
            />
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,430px)_minmax(0,1fr)]">
          <div className="space-y-6">
            <Panel variant="paperCard" className="rounded-[28px] border border-line-soft/80 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-ui text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                    Generation Brief
                  </p>
                  <h2 className="mt-2 font-display text-2xl text-ink">新建一条学习播客</h2>
                </div>
                <div className="rounded-full border border-ink/10 bg-paper-muted/70 px-3 py-1 font-latin text-[11px] tracking-wide text-ink-soft">
                  {selectedDocumentIds.length} Docs Selected
                </div>
              </div>

              <div className="mt-6 space-y-6">
                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-ink">文档范围</p>
                      <p className="text-xs leading-5 text-ink-muted">
                        仅展示已完成解析的文档。多选会让大纲更像一档专题串讲节目。
                      </p>
                    </div>
                    {selectedDocumentIds.length > 0 ? (
                      <button
                        type="button"
                        className="font-ui text-xs tracking-wide text-ink-soft hover:text-ink"
                        onClick={() => setSelectedDocumentIds([])}
                      >
                        清空
                      </button>
                    ) : null}
                  </div>

                  {readyDocuments.length === 0 ? (
                    <SketchEmptyState
                      illustration="podcast"
                      size="sm"
                      title="还没有可用的播客来源"
                      description="先去文档库导入并解析至少一份文档，再回来生成播客。"
                      action={
                        <Button variant="outline" onClick={() => setActiveNavItem('library')}>
                          前往文档库
                        </Button>
                      }
                    />
                  ) : (
                    <div className="grid gap-2">
                      {readyDocuments.map((document) => {
                        const active = selectedDocumentIds.includes(document.id)
                        return (
                          <button
                            key={document.id}
                            type="button"
                            onClick={() => toggleDocument(document.id)}
                            className={cn(
                              'group flex items-start justify-between rounded-[20px] border px-4 py-3 text-left transition-all',
                              active
                                ? 'border-ink/20 bg-paper-muted/70 shadow-paper'
                                : 'border-line-soft/70 bg-paper-base hover:border-ink/15 hover:bg-paper-muted/45'
                            )}
                          >
                            <div>
                              <p className="font-body text-sm text-ink">{document.title}</p>
                              <p className="mt-1 text-xs leading-5 text-ink-muted">
                                {document.pageCount ?? 0} 页 · 状态 {document.status}
                              </p>
                            </div>
                            <div
                              className={cn(
                                'mt-0.5 h-5 w-5 rounded-full border transition-colors',
                                active ? 'border-ink bg-ink' : 'border-line-soft bg-paper-base'
                              )}
                            >
                              {active ? (
                                <span className="block text-center text-[11px] text-paper-base">
                                  ✓
                                </span>
                              ) : null}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </section>

                <section className="space-y-3">
                  <div>
                    <p className="text-sm font-medium text-ink">节目提示词</p>
                    <p className="text-xs leading-5 text-ink-muted">
                      可选。用来指定听众视角、重点章节、是否要偏实战或偏考试。
                    </p>
                  </div>
                  <textarea
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    rows={5}
                    placeholder="例如：请重点解释第 2、4 节之间的逻辑关系，并用更适合考前复习的方式讲述。"
                    className="min-h-[128px] w-full rounded-[22px] border border-line-soft bg-paper-card px-4 py-3 font-body text-sm leading-6 text-ink shadow-paper outline-none transition-colors placeholder:text-ink-soft focus:border-ink/30"
                  />
                </section>

                <OptionGrid
                  title="播客风格"
                  description="决定脚本的叙事方式和说话节奏。"
                  options={STYLE_OPTIONS}
                  value={style}
                  onChange={(value) => setStyle(value as PodcastStyle)}
                />

                <OptionGrid
                  title="时长档位"
                  description="更长的节目会触发更多检索片段和更细的大纲。"
                  options={DURATION_OPTIONS}
                  value={durationTier}
                  onChange={(value) => setDurationTier(value as PodcastDurationTier)}
                />

                <SimpleToggleGroup
                  title="语言"
                  options={LANGUAGE_OPTIONS}
                  value={language}
                  onChange={(value) => setLanguage(value as PodcastLanguage)}
                />

                <OptionGrid
                  title="TTS 提供商"
                  description="当前 UI 暴露 provider 选择，具体可用性取决于本地配置与环境。"
                  options={PROVIDER_OPTIONS}
                  value={ttsProvider}
                  onChange={(value) => setTtsProvider(value as TTSProviderId)}
                />

                <SimpleToggleGroup
                  title="输出格式"
                  options={FORMAT_OPTIONS}
                  value={audioFormat}
                  onChange={(value) => setAudioFormat(value as AudioFormat)}
                />

                <div className="rounded-[22px] border border-dashed border-line-soft bg-paper-muted/50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-lg text-ink">准备好后直接开工</p>
                      <p className="mt-1 text-sm leading-6 text-ink-muted">
                        生成后会自动出现在右侧库中，并持续刷新脚本与音频阶段进度。
                      </p>
                    </div>
                    <Button
                      size="lg"
                      disabled={
                        selectedDocumentIds.length === 0 || readyDocuments.length === 0 || isBusy
                      }
                      onClick={() => {
                        void handleGenerate()
                      }}
                    >
                      {startMutation.isPending ? '正在启动播客...' : '生成播客'}
                    </Button>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <EstimateStat
                      label="预计时长"
                      value={`${generationEstimate.durationMinutes} min`}
                      hint={`${generationEstimate.segmentCount} 个脚本段落`}
                    />
                    <EstimateStat
                      label="LLM Tokens"
                      value={formatCompactNumber(generationEstimate.llmTokens)}
                      hint="含检索、大纲、脚本与评估"
                    />
                    <EstimateStat
                      label="TTS 字符"
                      value={formatCompactNumber(generationEstimate.ttsCharacters)}
                      hint={`${ttsProvider === 'auto' ? '自动路由' : ttsProvider} 估算`}
                    />
                    <EstimateStat
                      label="预估成本"
                      value={formatUsd(generationEstimate.estimatedCostUsd)}
                      hint={
                        appSettings?.podcastSkipReview
                          ? '当前配置会跳过人工审阅'
                          : `无操作 ${appSettings?.reviewTimeLimit ?? 30} 分钟后自动通过`
                      }
                    />
                  </div>

                  {estimateWarnings.length > 0 ? (
                    <div className="mt-4 rounded-[18px] border border-amber-200 bg-amber-50/80 px-4 py-3">
                      <p className="font-ui text-[11px] uppercase tracking-[0.2em] text-amber-800">
                        Budget Guard
                      </p>
                      <div className="mt-2 space-y-1.5 text-sm leading-6 text-amber-900">
                        {estimateWarnings.map((warning) => (
                          <p key={warning}>{warning}</p>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </Panel>

            <Panel variant="paperCard" className="rounded-[28px] border border-line-soft/80 p-6">
              <p className="font-ui text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                Workflow Notes
              </p>
              <div className="mt-4 space-y-3 text-sm leading-6 text-ink-muted">
                <p>1. 检索阶段会优先走 hybrid RRF，如果嵌入不可用会回退到 FTS5。</p>
                <p>2. 大纲、脚本和评估会持续写回 episode，右侧可直接看到中间产物。</p>
                <p>3. 音频阶段会逐条保存 audio segment 元数据，完成后再拼成最终文件。</p>
              </div>
            </Panel>
          </div>

          <div className="space-y-6">
            <Panel variant="paperCard" className="rounded-[28px] border border-line-soft/80 p-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="font-ui text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                    Episode Library
                  </p>
                  <h2 className="mt-2 font-display text-2xl text-ink">播客库</h2>
                </div>
                <span className="rounded-full border border-ink/10 bg-paper-muted/70 px-3 py-1 font-latin text-[11px] tracking-wide text-ink-soft">
                  {episodes.length} Episodes
                </span>
              </div>

              <div className="mt-5 space-y-3">
                {episodes.length === 0 ? (
                  <SketchEmptyState
                    illustration="podcast"
                    title="还没有任何播客 episode"
                    description="左侧启动第一条播客后，这里会成为你的节目库与过程追踪面板。"
                    size="sm"
                  />
                ) : (
                  episodes.map((episode) => {
                    const progress = getEpisodeProgress(episode)
                    return (
                      <button
                        key={episode.id}
                        type="button"
                        onClick={() => setSelectedEpisodeId(episode.id)}
                        className={cn(
                          'w-full rounded-[22px] border px-4 py-4 text-left transition-all',
                          selectedEpisodeId === episode.id
                            ? 'border-ink/20 bg-paper-muted/70 shadow-paper'
                            : 'border-line-soft/70 bg-paper-base hover:border-ink/15 hover:bg-paper-muted/45'
                        )}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-body text-sm text-ink">{episode.title}</p>
                              <StatusBadge status={episode.status} />
                            </div>
                            <p className="mt-1 text-xs leading-5 text-ink-muted">
                              {episode.documentIds.length} 份文档 ·{' '}
                              {formatDateTime(episode.updatedAt)}
                            </p>
                          </div>
                          <p className="font-latin text-xs tracking-wide text-ink-soft">
                            {episode.durationMs > 0
                              ? formatDuration(episode.durationMs)
                              : `Stage ${episode.currentStage}/6`}
                          </p>
                        </div>

                        <div className="mt-3">
                          <progress
                            className="h-2 w-full overflow-hidden rounded-full [appearance:none] [&::-moz-progress-bar]:bg-ink/80 [&::-webkit-progress-bar]:bg-paper-muted [&::-webkit-progress-value]:bg-ink/80"
                            max={100}
                            value={progress}
                          />
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
            </Panel>

            <Panel variant="paperCard" className="rounded-[28px] border border-line-soft/80 p-6">
              {selectedEpisode ? (
                <div className="space-y-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="font-ui text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                        Episode Inspector
                      </p>
                      <h2 className="mt-2 font-display text-2xl text-ink">
                        {selectedEpisode.title}
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-ink-muted">
                        {parsedScript?.description ?? '系统会在这里逐步展示脚本、评分和音频产物。'}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={selectedEpisode.status} />
                      {selectedEpisode.status === 'ready' ? (
                        <Button variant="outline" size="sm" onClick={() => setIsPlayerOpen(true)}>
                          打开播放器
                        </Button>
                      ) : null}
                      {LIVE_STATUSES.has(selectedEpisode.status) ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleCancelEpisode()}
                        >
                          取消
                        </Button>
                      ) : null}
                      {selectedEpisode.status === 'failed' ||
                      selectedEpisode.status === 'cancelled' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleRetryEpisode()}
                        >
                          重试
                        </Button>
                      ) : null}
                      {!LIVE_STATUSES.has(selectedEpisode.status) ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleDeleteEpisode()}
                        >
                          删除
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-[22px] border border-line-soft/70 bg-paper-muted/55 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-ink">阶段进度</p>
                        <p className="mt-1 text-xs leading-5 text-ink-muted">
                          当前位于第 {selectedEpisode.currentStage}/6 阶段，共{' '}
                          {selectedEpisode.totalSegments} 个细分单元。
                        </p>
                      </div>
                      <p className="font-latin text-sm tracking-wide text-ink-soft">
                        {Math.round(getEpisodeProgress(selectedEpisode))}%
                      </p>
                    </div>
                    <progress
                      className="mt-3 h-2 w-full overflow-hidden rounded-full [appearance:none] [&::-moz-progress-bar]:bg-ink/80 [&::-webkit-progress-bar]:bg-paper-base [&::-webkit-progress-value]:bg-ink/80"
                      max={100}
                      value={getEpisodeProgress(selectedEpisode)}
                    />

                    {selectedEpisode.errorMessage ? (
                      <p className="mt-3 text-sm leading-6 text-rose-700">
                        {selectedEpisode.errorMessage}
                      </p>
                    ) : null}
                  </div>

                  <div className="grid gap-3 md:grid-cols-4">
                    <MetricTile
                      label="来源文档"
                      value={selectedEpisode.documentIds.length}
                      hint="当前 episode 绑定"
                    />
                    <MetricTile
                      label="时长档位"
                      value={selectedEpisode.durationTier}
                      hint="影响检索和段落数"
                    />
                    <MetricTile
                      label="语言"
                      value={selectedEpisode.language}
                      hint="脚本与语音语言"
                    />
                    <MetricTile
                      label="TTS"
                      value={selectedEpisode.ttsProvider}
                      hint={selectedEpisode.audioFormat.toUpperCase()}
                    />
                  </div>

                  {parsedEvaluation ? (
                    <section className="space-y-3">
                      <div>
                        <p className="font-ui text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                          Evaluation
                        </p>
                        <h3 className="mt-2 font-display text-xl text-ink">脚本评估</h3>
                      </div>
                      <div className="grid gap-3 md:grid-cols-5">
                        <ScoreTile label="Coherence" value={parsedEvaluation.coherence} />
                        <ScoreTile label="Accuracy" value={parsedEvaluation.accuracy} />
                        <ScoreTile label="Style" value={parsedEvaluation.styleConsistency} />
                        <ScoreTile label="Natural" value={parsedEvaluation.naturalness} />
                        <ScoreTile label="Overall" value={parsedEvaluation.overallScore} strong />
                      </div>
                      {parsedEvaluation.issues.length > 0 ||
                      parsedEvaluation.suggestions.length > 0 ? (
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
                      <div className="flex items-end justify-between gap-3">
                        <div>
                          <p className="font-ui text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                            Outline
                          </p>
                          <h3 className="mt-2 font-display text-xl text-ink">节目大纲</h3>
                        </div>
                        <p className="font-latin text-xs tracking-wide text-ink-soft">
                          {formatDuration(parsedOutline.totalTargetDurationMs)} Target
                        </p>
                      </div>

                      <div className="grid gap-3">
                        {parsedOutline.segments.map((segment) => (
                          <div
                            key={`${segment.segmentIndex}-${segment.topic}`}
                            className="rounded-[22px] border border-line-soft/70 bg-paper-base px-4 py-4"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="font-ui text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                                  Segment {segment.segmentIndex + 1}
                                </p>
                                <h4 className="mt-1 text-sm font-medium text-ink">
                                  {segment.topic}
                                </h4>
                              </div>
                              <span className="rounded-full border border-ink/10 bg-paper-muted/70 px-3 py-1 font-latin text-[11px] tracking-wide text-ink-soft">
                                {formatDuration(segment.targetDurationMs)}
                              </span>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {segment.keyPoints.map((point) => (
                                <span
                                  key={point}
                                  className="rounded-full border border-line-soft bg-paper-muted/60 px-3 py-1 text-xs text-ink-muted"
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
                      <div>
                        <p className="font-ui text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                          Review Gate
                        </p>
                        <h3 className="mt-2 font-display text-xl text-ink">脚本审阅</h3>
                        <p className="mt-1 text-sm leading-6 text-ink-muted">
                          如果你想微调内容，现在可以直接编辑脚本 JSON 并继续生成音频。
                        </p>
                      </div>

                      <div className="rounded-[18px] border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm leading-6 text-amber-900">
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
                        className="min-h-[280px] w-full rounded-[22px] border border-line-soft bg-paper-card px-4 py-3 font-mono text-xs leading-6 text-ink shadow-paper outline-none transition-colors focus:border-ink/30"
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
                      <div className="flex items-end justify-between gap-3">
                        <div>
                          <p className="font-ui text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                            Transcript
                          </p>
                          <h3 className="mt-2 font-display text-xl text-ink">脚本与对白</h3>
                        </div>
                        <p className="font-latin text-xs tracking-wide text-ink-soft">
                          {parsedScript.segments.length} Segments
                        </p>
                      </div>

                      <div className="grid gap-3">
                        {parsedScript.segments.map((segment, index) => (
                          <div
                            key={segment.id}
                            className="rounded-[22px] border border-line-soft/70 bg-paper-base px-4 py-4"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <span className="font-latin text-[11px] tracking-wide text-ink-soft">
                                  {String(index + 1).padStart(2, '0')}
                                </span>
                                <p className="text-sm font-medium text-ink">{segment.speaker}</p>
                              </div>
                              <span className="rounded-full border border-line-soft bg-paper-muted/60 px-3 py-1 font-latin text-[11px] tracking-wide text-ink-soft">
                                {formatDuration(segment.durationMs)}
                              </span>
                            </div>
                            <p className="mt-3 text-sm leading-7 text-ink-muted">{segment.text}</p>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  <section className="space-y-3">
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <p className="font-ui text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                          Audio Output
                        </p>
                        <h3 className="mt-2 font-display text-xl text-ink">音频片段</h3>
                      </div>
                      {selectedEpisode.audioPath ? (
                        <Button variant="outline" size="sm" onClick={() => setIsPlayerOpen(true)}>
                          播放最终音频
                        </Button>
                      ) : null}
                    </div>

                    {audioSegments.length === 0 ? (
                      <div className="rounded-[22px] border border-dashed border-line-soft bg-paper-muted/40 px-4 py-5 text-sm leading-6 text-ink-muted">
                        {selectedEpisode.status === 'ready'
                          ? '当前 episode 已完成，但还没有读到音频 segment 元数据。你仍然可以尝试打开最终播放器。'
                          : '音频阶段尚未产生可展示的 segment。'}
                      </div>
                    ) : (
                      <div className="grid gap-3 md:grid-cols-2">
                        {audioSegments.map((segment) => (
                          <div
                            key={segment.id}
                            className="rounded-[20px] border border-line-soft/70 bg-paper-base px-4 py-4"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-medium text-ink">{segment.speaker}</p>
                              <span className="font-latin text-[11px] tracking-wide text-ink-soft">
                                {formatDuration(segment.durationMs)}
                              </span>
                            </div>
                            <p className="mt-2 text-xs leading-5 text-ink-muted">
                              {segment.ttsProvider} · {segment.voiceId}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              ) : (
                <SketchEmptyState
                  illustration="note"
                  title="还没有选中 episode"
                  description="在上方播客库里选择一条 episode，这里会展开它的大纲、脚本、评估和音频信息。"
                />
              )}
            </Panel>
          </div>
        </div>
      </div>

      <PodcastPlayerModal
        open={isPlayerOpen}
        episodeId={selectedEpisode?.id ?? null}
        onClose={() => setIsPlayerOpen(false)}
      />
    </>
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
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="text-xs leading-5 text-ink-muted">{description}</p>
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
                'rounded-[20px] border px-4 py-3 text-left transition-all',
                active
                  ? 'border-ink/20 bg-paper-muted/70 shadow-paper'
                  : 'border-line-soft/70 bg-paper-base hover:border-ink/15 hover:bg-paper-muted/45'
              )}
            >
              <p className="text-sm font-medium text-ink">{option.label}</p>
              {option.hint ? (
                <p className="mt-1 text-xs leading-5 text-ink-muted">{option.hint}</p>
              ) : null}
            </button>
          )
        })}
      </div>
    </section>
  )
}

function SimpleToggleGroup({
  title,
  options,
  value,
  onChange,
}: {
  title: string
  options: Array<{ value: string; label: string }>
  value: string
  onChange: (value: string) => void
}) {
  return (
    <section className="space-y-3">
      <p className="text-sm font-medium text-ink">{title}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-full border px-4 py-2 text-sm transition-colors',
              option.value === value
                ? 'border-ink bg-ink text-paper-base'
                : 'border-line-soft bg-paper-base text-ink-muted hover:border-ink/20 hover:text-ink'
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </section>
  )
}

function StatusBadge({ status }: { status: PodcastStatus }) {
  const meta = STATUS_META[status]
  return (
    <span
      className={cn(
        'rounded-full border px-3 py-1 text-[11px] font-medium tracking-wide',
        meta.tone
      )}
    >
      {meta.label}
    </span>
  )
}

function MetricTile({
  label,
  value,
  hint,
}: {
  label: string
  value: string | number
  hint: string
}) {
  return (
    <div className="rounded-[22px] border border-line-soft/70 bg-paper-card px-4 py-4 shadow-paper">
      <p className="font-ui text-[11px] uppercase tracking-[0.22em] text-ink-soft">{label}</p>
      <p className="mt-3 font-display text-2xl text-ink">{value}</p>
      <p className="mt-2 text-xs leading-5 text-ink-muted">{hint}</p>
    </div>
  )
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
    <div className="rounded-[18px] border border-line-soft/70 bg-paper-base px-4 py-3">
      <p className="font-ui text-[11px] uppercase tracking-[0.22em] text-ink-soft">{label}</p>
      <p className="mt-2 font-display text-xl text-ink">{value}</p>
      <p className="mt-1 text-xs leading-5 text-ink-muted">{hint}</p>
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
        'rounded-[22px] border px-4 py-4',
        strong
          ? 'border-ink/20 bg-paper-muted/75 shadow-paper'
          : 'border-line-soft/70 bg-paper-base'
      )}
    >
      <p className="font-ui text-[11px] uppercase tracking-[0.22em] text-ink-soft">{label}</p>
      <p className="mt-3 font-display text-3xl text-ink">{value.toFixed(1)}</p>
      <p className="mt-1 text-xs text-ink-muted">/ 10</p>
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
    <div className="rounded-[22px] border border-line-soft/70 bg-paper-base px-4 py-4">
      <p className="font-ui text-[11px] uppercase tracking-[0.22em] text-ink-soft">{title}</p>
      <div className="mt-3 space-y-2">
        {items.length === 0 ? (
          <p className="text-sm leading-6 text-ink-muted">{emptyLabel}</p>
        ) : (
          items.map((item) => (
            <div key={item} className="flex gap-3 text-sm leading-6 text-ink-muted">
              <span className="mt-[10px] h-1.5 w-1.5 flex-none rounded-full bg-ink/50" />
              <span>{item}</span>
            </div>
          ))
        )}
      </div>
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
  if (Number.isNaN(date.getTime())) {
    return value
  }

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
  const charsPerMinute =
    language === 'en-US' ? 780 : 340

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
