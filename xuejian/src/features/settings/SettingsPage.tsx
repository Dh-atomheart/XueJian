import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Panel } from '@/components/ui/Panel'
import { appThemeOptions } from '@/design-system/themes'
import { reportAppError, reportFeedback } from '@/lib/appFeedback'
import { cn } from '@/lib/utils'
import {
  hasUsableApiConfig,
  useApiConfigsQuery,
  useAppSettingsQuery,
  useCreateApiConfigMutation,
  useDeleteApiConfigMutation,
  useDeleteApiKeyMutation,
  useFetchProviderModelsMutation,
  useProviderBudgetUsageQuery,
  useResetProviderBudgetUsageMutation,
  useSetAllWorkflowAssignmentsMutation,
  useSetDefaultApiConfigMutation,
  useSetWorkflowAssignmentMutation,
  useStoreApiKeyMutation,
  useTestApiConnectionMutation,
  useUpdateApiConfigMutation,
  useUpdateAppSettingsMutation,
  useWorkflowAssignmentsQuery,
} from '@/queries'
import { cardsGateway } from '@/services/gateway/cards'
import { useAppUiStore } from '@/store'
import type {
  ApiConfig,
  ApiProvider,
  AppSettings,
  AppThemeId,
  ContentDifficultyId,
  DiscoveredModel,
  LearningGoalId,
  StudyContentPreferenceId,
  StudyTimeSlotId,
  WorkflowType,
} from '@/types'
import {
  detectProviderFromKey,
  getKeyStatusBadge,
  getProviderDefinition,
  getRecommendedModel,
  getStoredKeyPlaceholder,
  PROVIDER_DEFINITIONS,
  validateApiKeyFormat,
  WORKFLOW_DEFINITIONS,
} from './byok'

type SettingsSectionId = 'ai' | 'learning' | 'podcast' | 'general'

type PodcastTtsProvider = 'auto' | 'openai' | 'edge_tts'

type PodcastOutputFormat = 'mp3' | 'wav'

interface ConfigFormState {
  id: string | null
  provider: ApiProvider
  name: string
  displayName: string
  model: string
  baseUrl: string
  apiKey: string
  budgetLimit: string
  isDefault: boolean
  isEnabled: boolean
}

const settingsSections: Array<{
  id: SettingsSectionId
  title: string
  eyebrow: string
  description: string
}> = [
  {
    id: 'ai',
    title: 'AI 模型',
    eyebrow: 'BYOK',
    description: '供应商配置、模型发现与工作流分配。',
  },
  {
    id: 'learning',
    title: '学习偏好',
    eyebrow: 'Study',
    description: '每日新卡数量与复习时长上限。',
  },
  {
    id: 'podcast',
    title: '播客与语音',
    eyebrow: 'Podcast',
    description: 'TTS 提供商、输出格式与预算上限。',
  },
  {
    id: 'general',
    title: '通用',
    eyebrow: 'General',
    description: '主题、语言与本地数据面板。',
  },
]

const podcastProviderOptions: Array<{ value: PodcastTtsProvider; label: string }> = [
  { value: 'auto', label: '自动选择' },
  { value: 'openai', label: 'OpenAI TTS' },
  { value: 'edge_tts', label: 'Edge TTS' },
]

const languageOptions: Array<{ value: AppSettings['language']; label: string }> = [
  { value: 'zh-CN', label: '中文（简体）' },
  { value: 'en-US', label: 'English (US)' },
]

const learningGoalOptions: Array<{
  value: LearningGoalId
  label: string
  description: string
}> = [
  {
    value: 'knowledge_understanding',
    label: '知识理解',
    description: '深入理解知识概念与脉络。',
  },
  {
    value: 'memory_strengthening',
    label: '记忆强化',
    description: '强化记忆与长期留存。',
  },
  {
    value: 'applied_practice',
    label: '应用实践',
    description: '学以致用并解决问题。',
  },
  {
    value: 'exam_preparation',
    label: '考试备考',
    description: '面向考试与训练节奏。',
  },
  {
    value: 'interest_exploration',
    label: '兴趣探索',
    description: '拓展视野与关联学习。',
  },
]

const dailyStudyMinuteOptions = [15, 30, 45, 60, 90]
const dailyNewCardOptions = [10, 20, 30, 50]
const reviewTimeLimitOptions = [15, 30, 45, 60]

const studyTimePreferenceOptions: Array<{
  value: AppSettings['studyTimePreference']
  label: string
}> = [
  { value: 'flexible', label: '灵活安排' },
  { value: 'morning', label: '上午' },
  { value: 'afternoon', label: '下午' },
  { value: 'evening', label: '晚上' },
  { value: 'late_night', label: '深夜' },
]

const studyTimeSlotOptions: Array<{
  value: StudyTimeSlotId
  label: string
  timeRange: string
}> = [
  { value: 'morning', label: '上午', timeRange: '06:00 - 12:00' },
  { value: 'afternoon', label: '下午', timeRange: '12:00 - 18:00' },
  { value: 'evening', label: '晚上', timeRange: '18:00 - 22:00' },
  { value: 'late_night', label: '深夜', timeRange: '22:00 - 06:00' },
]

const studyContentPreferenceOptions: Array<{
  value: StudyContentPreferenceId
  label: string
}> = [
  { value: 'psychology', label: '心理学' },
  { value: 'cognitive_science', label: '认知科学' },
  { value: 'education', label: '教育学' },
  { value: 'neuroscience', label: '神经科学' },
  { value: 'philosophy', label: '哲学' },
  { value: 'sociology', label: '社会学' },
  { value: 'economics', label: '经济学' },
  { value: 'history', label: '历史学' },
  { value: 'artificial_intelligence', label: '人工智能' },
  { value: 'data_science', label: '数据科学' },
  { value: 'self_improvement', label: '自我提升' },
  { value: 'other', label: '其他' },
]

const contentDifficultyOptions: Array<{
  value: ContentDifficultyId
  label: string
}> = [
  { value: 'introductory', label: '入门' },
  { value: 'beginner', label: '初级' },
  { value: 'intermediate', label: '中级' },
  { value: 'advanced', label: '高级' },
  { value: 'expert', label: '专家级' },
]

const defaultVoiceOptions: Array<{ value: string; label: string }> = [
  { value: 'gentle_female_xiaoxiao', label: '温和女声 · 晓晓' },
  { value: 'calm_female_chenxi', label: '知性女声 · 晨曦' },
  { value: 'warm_male_yunjian', label: '沉稳男声 · 云简' },
  { value: 'bright_male_yunfan', label: '明亮男声 · 云帆' },
]

const readingModeOptions: Array<{
  value: AppSettings['readingMode']
  label: string
}> = [
  { value: 'natural', label: '自然流畅（推荐）' },
  { value: 'focus', label: '专注拆解' },
  { value: 'narration', label: '叙述播报' },
]

const podcastStyleOptions: Array<{
  value: AppSettings['defaultPodcastStyle']
  label: string
}> = [
  { value: 'deep_dive', label: 'Deep Dive' },
  { value: 'lecture', label: 'Lecture' },
  { value: 'interview', label: 'Interview' },
  { value: 'casual', label: 'Casual' },
  { value: 'exam_prep', label: 'Exam Prep' },
]

const podcastEpisodeDurationOptions = [5, 10, 15, 20, 30]

const podcastStructureOptions: Array<{
  value: AppSettings['podcastContentStructure']
  label: string
}> = [
  { value: 'summary_then_details', label: '总分结构' },
  { value: 'problem_solution', label: '问题-解决' },
  { value: 'story_driven', label: '故事线索' },
  { value: 'question_driven', label: '问答串联' },
]

const podcastBackgroundMusicOptions: Array<{
  value: AppSettings['podcastBackgroundMusic']
  label: string
}> = [
  { value: 'off', label: '关闭' },
  { value: 'soft_piano', label: '钢琴轻音' },
  { value: 'light_ambient', label: '氛围铺底' },
  { value: 'study_lofi', label: '学习 Lo-fi' },
]

const voiceInputLanguageOptions: Array<{
  value: AppSettings['voiceInputLanguage']
  label: string
}> = [
  { value: 'zh-CN', label: '中文（简体）' },
  { value: 'en-US', label: 'English (US)' },
]

const defaultSettingsSnapshot: AppSettings = {
  theme: 'default',
  language: 'zh-CN',
  dailyNewCardLimit: 20,
  reviewTimeLimit: 30,
  learningGoal: 'knowledge_understanding',
  dailyStudyMinutes: 30,
  studyTimePreference: 'evening',
  studyTimePreferences: ['afternoon', 'evening'],
  studyContentPreferences: ['psychology', 'cognitive_science', 'self_improvement', 'education'],
  contentDifficultyPreference: 'intermediate',
  podcastTtsProvider: 'auto',
  podcastOpenaiModel: 'tts-1',
  podcastFishAudioEndpoint: null,
  podcastVoiceOverrides: {},
  defaultVoice: 'gentle_female_xiaoxiao',
  speechRate: 1,
  speechPitch: 0,
  speechVolume: 0.8,
  readingMode: 'natural',
  defaultPodcastStyle: 'lecture',
  podcastEpisodeDurationMinutes: 15,
  podcastContentStructure: 'summary_then_details',
  podcastBackgroundMusic: 'soft_piano',
  podcastIntroOutroEnabled: true,
  voiceInputLanguage: 'zh-CN',
  voiceInterruptEnabled: true,
  podcastAutoPlayNextEpisode: true,
  podcastOutputFormat: 'mp3',
  podcastSkipReview: true,
  podcastMaxLlmTokens: 100000,
  podcastMaxTtsCharacters: 50000,
  podcastMaxEstimatedCostUsd: 1,
}

function resolveSettingsSnapshot(
  source: Partial<AppSettings> | null | undefined
): AppSettings {
  return {
    ...defaultSettingsSnapshot,
    ...source,
    studyTimePreferences:
      source?.studyTimePreferences && source.studyTimePreferences.length > 0
        ? [...source.studyTimePreferences]
        : source?.studyTimePreference && source.studyTimePreference !== 'flexible'
          ? [source.studyTimePreference]
          : [...defaultSettingsSnapshot.studyTimePreferences],
    studyContentPreferences:
      source?.studyContentPreferences && source.studyContentPreferences.length > 0
        ? [...source.studyContentPreferences]
        : [...defaultSettingsSnapshot.studyContentPreferences],
    podcastFishAudioEndpoint:
      source && Object.prototype.hasOwnProperty.call(source, 'podcastFishAudioEndpoint')
        ? source.podcastFishAudioEndpoint ?? null
        : defaultSettingsSnapshot.podcastFishAudioEndpoint,
    podcastVoiceOverrides: source?.podcastVoiceOverrides ?? defaultSettingsSnapshot.podcastVoiceOverrides,
  }
}

function toggleSelection<T extends string>(current: T[], value: T, allowEmpty = false) {
  if (current.includes(value)) {
    return current.length === 1 && !allowEmpty ? current : current.filter((item) => item !== value)
  }

  return [...current, value]
}

function getOptionLabel<T extends string>(
  options: Array<{ value: T; label: string }>,
  value: T
) {
  return options.find((option) => option.value === value)?.label ?? value
}

function formatSelectionSummary<T extends string>(
  options: Array<{ value: T; label: string }>,
  values: T[]
) {
  if (values.length === 0) {
    return '未设置'
  }

  return values.map((value) => getOptionLabel(options, value)).join('，')
}

function getSectionGlyph(sectionId: SettingsSectionId) {
  switch (sectionId) {
    case 'ai':
      return 'AI'
    case 'learning':
      return '学'
    case 'podcast':
      return '播'
    case 'general':
      return '通'
    default:
      return '设'
  }
}

function getBudgetMeterWidthClass(progress: number) {
  if (progress <= 6) return 'w-[6%]'
  if (progress <= 10) return 'w-[10%]'
  if (progress <= 20) return 'w-[20%]'
  if (progress <= 30) return 'w-[30%]'
  if (progress <= 40) return 'w-[40%]'
  if (progress <= 50) return 'w-[50%]'
  if (progress <= 60) return 'w-[60%]'
  if (progress <= 70) return 'w-[70%]'
  if (progress <= 80) return 'w-[80%]'
  if (progress <= 90) return 'w-[90%]'
  return 'w-full'
}

function formatVoiceOverrides(value: Record<string, string>) {
  return JSON.stringify(value, null, 2)
}

function buildConfigForm(provider: ApiProvider, existing?: ApiConfig | null): ConfigFormState {
  const definition = getProviderDefinition(provider)
  return {
    id: existing?.id ?? null,
    provider,
    name: existing?.name ?? definition?.name ?? '新的模型配置',
    displayName: existing?.displayName ?? '',
    model: existing?.model ?? getRecommendedModel(provider) ?? '',
    baseUrl: existing?.baseUrl ?? definition?.defaultBaseUrl ?? '',
    apiKey: '',
    budgetLimit: existing?.budgetLimit == null ? '' : String(existing.budgetLimit),
    isDefault: existing?.isDefault ?? false,
    isEnabled: existing?.isEnabled ?? true,
  }
}

function getConfigTitle(config: ApiConfig) {
  return config.displayName?.trim() || config.name
}

function getConfigSubtitle(config: ApiConfig) {
  const providerName = getProviderDefinition(config.provider)?.name ?? config.provider
  const modelName = config.model ?? '未设置模型'
  return `${providerName} · ${modelName}`
}

function parseBudgetLimit(value: string) {
  if (!value.trim()) {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeBaseUrl(provider: ApiProvider, baseUrl: string) {
  const definition = getProviderDefinition(provider)
  const trimmed = baseUrl.trim()
  if (trimmed) {
    return trimmed
  }
  return definition?.defaultBaseUrl ?? ''
}

function inferConfigProtocol(provider: ApiProvider): ApiConfig['protocol'] {
  if (
    provider === 'openai' ||
    provider === 'anthropic' ||
    provider === 'google' ||
    provider === 'custom_anthropic' ||
    provider === 'custom_google'
  ) {
    return 'native'
  }

  return 'openai-compatible'
}

function ConfigBudgetMeter({ config }: { config: ApiConfig }) {
  const { data } = useProviderBudgetUsageQuery(config.id)
  if (config.budgetLimit == null) {
    return <p className="text-xs text-ink-soft">未设置预算上限</p>
  }

  const used = data?.estimatedCostUsd ?? 0
  const progress = config.budgetLimit <= 0 ? 100 : Math.min(100, (used / config.budgetLimit) * 100)
  const overBudget = config.budgetLimit <= 0 || used >= config.budgetLimit
  const progressWidthClass = getBudgetMeterWidthClass(progress)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-ink-muted">
        <span>月度预算</span>
        <span>
          ${used.toFixed(2)} / ${config.budgetLimit.toFixed(2)}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-paper-muted">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            progressWidthClass,
            overBudget ? 'bg-highlight-pink/70' : 'bg-ink/70'
          )}
        />
      </div>
      <p className={cn('text-xs', overBudget ? 'text-ink' : 'text-ink-soft')}>
        {overBudget
          ? '预算已触顶，不会自动切换其他供应商。'
          : `本月已运行 ${data?.workflowRunsCount ?? 0} 次`}
      </p>
    </div>
  )
}

function ProviderConfigCard({
  config,
  assignedWorkflowNames,
  onEdit,
  onManageKey,
  onSetDefault,
  onDelete,
  onResetBudget,
  isDeleting = false,
}: {
  config: ApiConfig
  assignedWorkflowNames: string[]
  onEdit: (config: ApiConfig) => void
  onManageKey: (config: ApiConfig) => void
  onSetDefault: (configId: string) => void
  onDelete: (config: ApiConfig) => void
  onResetBudget: (configId: string) => void
  isDeleting?: boolean
}) {
  return (
    <Panel variant="paperCard" className="space-y-4 rounded-[28px] border border-line-soft/80 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">
            {getProviderDefinition(config.provider)?.name ?? config.provider}
          </p>
          <h3 className="text-lg font-semibold text-ink">{getConfigTitle(config)}</h3>
          <p className="text-sm text-ink-muted">{getConfigSubtitle(config)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-paper-muted px-3 py-1 text-ink-muted">
            {getKeyStatusBadge(config)}
          </span>
          {config.isDefault ? (
            <span className="rounded-full bg-ink px-3 py-1 text-paper-base">默认</span>
          ) : null}
          {!config.isEnabled ? (
            <span className="rounded-full bg-paper-muted px-3 py-1 text-ink-muted">已禁用</span>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 text-sm text-ink-muted sm:grid-cols-2">
        <div>
          <p className="mb-1 text-[11px] uppercase tracking-[0.18em] text-ink-soft">存储密钥</p>
          <p>{config.hasStoredKey ? getStoredKeyPlaceholder(config.provider) : '未存储'}</p>
        </div>
        <div>
          <p className="mb-1 text-[11px] uppercase tracking-[0.18em] text-ink-soft">Base URL</p>
          <p className="truncate">{config.baseUrl ?? '使用供应商默认端点'}</p>
        </div>
      </div>

      <ConfigBudgetMeter config={config} />

      {assignedWorkflowNames.length > 0 ? (
        <div className="rounded-[22px] border border-line-soft/70 bg-paper-muted/70 p-3">
          <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-ink-soft">
            当前绑定工作流
          </p>
          <div className="flex flex-wrap gap-2 text-xs text-ink-muted">
            {assignedWorkflowNames.map((name) => (
              <span key={name} className="rounded-full border border-line-soft/70 px-3 py-1">
                {name}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => onEdit(config)} disabled={isDeleting}>
          编辑配置
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onManageKey(config)}
          disabled={isDeleting}
          data-testid={`settings-manage-key-${config.id}`}
        >
          管理 Key
        </Button>
        {!config.isDefault ? (
          <Button variant="ghost" size="sm" onClick={() => onSetDefault(config.id)} disabled={isDeleting}>
            设为默认
          </Button>
        ) : null}
        {config.budgetLimit != null ? (
          <Button variant="ghost" size="sm" onClick={() => onResetBudget(config.id)} disabled={isDeleting}>
            重置预算
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(config)}
          disabled={isDeleting}
          data-testid={`settings-delete-config-${config.id}`}
        >
          删除
        </Button>
      </div>
    </Panel>
  )
}

function WorkflowAssignmentPanel({
  assignments,
  configs,
  onAssign,
  onAssignAll,
}: {
  assignments: Partial<Record<WorkflowType, string>>
  configs: ApiConfig[]
  onAssign: (workflowType: WorkflowType, apiConfigId: string) => void
  onAssignAll: (apiConfigId: string) => void
}) {
  const usableConfigs = configs.filter((config) => config.isEnabled && config.hasStoredCredential)
  const [quickAssignId, setQuickAssignId] = useState('')

  useEffect(() => {
    if (!quickAssignId && usableConfigs.length > 0) {
      setQuickAssignId(usableConfigs[0].id)
    }
  }, [quickAssignId, usableConfigs])

  return (
    <Panel variant="paperCard" className="space-y-5 rounded-[30px] border border-line-soft/80 p-6">
      <div className="space-y-2">
        <p className="text-[11px] uppercase tracking-[0.24em] text-ink-soft">工作流模型分配</p>
        <h3 className="text-xl font-semibold text-ink">把不同成本和能力分配给不同工作流</h3>
        <p className="text-sm text-ink-muted">
          每个工作流都可以绑定不同配置；没有绑定时，Python 编排会回退到默认模型。
        </p>
      </div>

      <div className="space-y-3">
        {WORKFLOW_DEFINITIONS.map((workflow) => {
          const selectedConfigId = assignments[workflow.type] ?? ''
          const assignedConfig = usableConfigs.find((config) => config.id === selectedConfigId)

          return (
            <div
              key={workflow.type}
              className="grid gap-3 rounded-[24px] border border-line-soft/70 bg-paper-muted/50 p-4 lg:grid-cols-[minmax(0,1fr),220px,auto] lg:items-center"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">
                  {workflow.icon} {workflow.name}
                </p>
                <p className="mt-1 text-sm text-ink-muted">{workflow.description}</p>
                <p className="mt-2 text-xs text-ink-soft">
                  {assignedConfig ? getConfigSubtitle(assignedConfig) : '未分配，回退到默认模型'}
                </p>
              </div>
              <select
                value={selectedConfigId}
                onChange={(event) => onAssign(workflow.type, event.target.value)}
                title={`${workflow.name} 配置`}
                className="h-10 rounded-full border border-line-soft bg-paper-card px-4 text-sm text-ink"
              >
                <option value="">跟随默认模型</option>
                {usableConfigs.map((config) => (
                  <option key={config.id} value={config.id}>
                    {getConfigTitle(config)}
                  </option>
                ))}
              </select>
              <div className="text-right text-xs text-ink-soft">即时保存</div>
            </div>
          )
        })}
      </div>

      <div className="rounded-[24px] border border-dashed border-line-soft bg-paper-base/70 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-medium text-ink">⚡ 快速设置：全部工作流使用同一配置</p>
            <p className="text-sm text-ink-muted">
              适合先把整个系统切到一个稳定供应商，再逐步细分。
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <select
              value={quickAssignId}
              onChange={(event) => setQuickAssignId(event.target.value)}
              title="快速设置配置"
              className="h-10 min-w-[220px] rounded-full border border-line-soft bg-paper-card px-4 text-sm text-ink"
            >
              {usableConfigs.length === 0 ? <option value="">暂无可用配置</option> : null}
              {usableConfigs.map((config) => (
                <option key={config.id} value={config.id}>
                  {getConfigTitle(config)}
                </option>
              ))}
            </select>
            <Button onClick={() => onAssignAll(quickAssignId)} disabled={!quickAssignId}>
              应用到全部工作流
            </Button>
          </div>
        </div>
      </div>
    </Panel>
  )
}

function SectionMetric({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail?: string
}) {
  return (
    <div className="rounded-[24px] border border-line-soft/70 bg-paper-muted/55 p-4">
      <p className="text-[11px] uppercase tracking-[0.2em] text-ink-soft">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
      {detail ? <p className="mt-2 text-sm text-ink-muted">{detail}</p> : null}
    </div>
  )
}

function OptionChip({
  active,
  label,
  meta,
  onClick,
  className,
}: {
  active: boolean
  label: string
  meta?: string
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-[22px] border px-4 py-3 text-left transition-colors',
        active
          ? 'border-ink/35 bg-ink/5 text-ink shadow-card'
          : 'border-line-soft/70 bg-paper-card text-ink-muted hover:border-ink/20 hover:text-ink',
        className
      )}
    >
      <p className="text-sm font-medium">{label}</p>
      {meta ? <p className="mt-1 text-xs text-ink-soft">{meta}</p> : null}
    </button>
  )
}

function SectionToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[24px] border border-line-soft/70 bg-paper-card px-4 py-4">
      <div>
        <p className="font-medium text-ink">{label}</p>
        <p className="mt-1 text-sm text-ink-muted">{description}</p>
      </div>
      <button
        type="button"
        aria-pressed={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-8 w-14 rounded-full border transition-colors',
          checked ? 'border-ink/35 bg-ink' : 'border-line-soft bg-paper-muted'
        )}
      >
        <span
          className={cn(
            'absolute top-1 h-6 w-6 rounded-full bg-paper-base transition-transform',
            checked ? 'translate-x-7' : 'translate-x-1'
          )}
        />
      </button>
    </div>
  )
}

function RangeField({
  label,
  description,
  value,
  min,
  max,
  step,
  onChange,
  formatter,
}: {
  label: string
  description: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  formatter: (value: number) => string
}) {
  return (
    <div className="rounded-[24px] border border-line-soft/70 bg-paper-card px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-ink">{label}</p>
          <p className="mt-1 text-sm text-ink-muted">{description}</p>
        </div>
        <span className="text-sm text-ink-soft">{formatter(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-4 w-full"
        style={{ accentColor: 'rgb(var(--ink))' }}
      />
    </div>
  )
}

function SummaryRow({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line-soft/55 py-3 last:border-b-0">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="max-w-[180px] text-right text-sm font-medium text-ink">{value}</span>
    </div>
  )
}

export function SettingsPage({ forcedOnboarding = false }: { forcedOnboarding?: boolean }) {
  const setActiveNavItem = useAppUiStore((state) => state.setActiveNavItem)
  const storeActiveSection = useAppUiStore((state) => state.activeSettingsSection)
  const setStoreSection = useAppUiStore((state) => state.setSettingsSection)
  const { data: settings } = useAppSettingsQuery()
  const { data: apiConfigs = [], isLoading: isApiConfigsLoading } = useApiConfigsQuery()
  const { data: workflowAssignments = [] } = useWorkflowAssignmentsQuery()

  const createApiConfigMutation = useCreateApiConfigMutation()
  const updateApiConfigMutation = useUpdateApiConfigMutation()
  const deleteApiConfigMutation = useDeleteApiConfigMutation()
  const deleteApiKeyMutation = useDeleteApiKeyMutation()
  const setDefaultApiConfigMutation = useSetDefaultApiConfigMutation()
  const storeApiKeyMutation = useStoreApiKeyMutation()
  const testConnectionMutation = useTestApiConnectionMutation()
  const updateSettingsMutation = useUpdateAppSettingsMutation()
  const resetProviderBudgetUsageMutation = useResetProviderBudgetUsageMutation()
  const setWorkflowAssignmentMutation = useSetWorkflowAssignmentMutation()
  const setAllWorkflowAssignmentsMutation = useSetAllWorkflowAssignmentsMutation()
  const fetchProviderModelsMutation = useFetchProviderModelsMutation()

  // 从 store 读取当前活动子页，通过 setStoreSection 写回 store
  const activeSection: SettingsSectionId = storeActiveSection
  const setActiveSection = setStoreSection

  const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create')
  const [isEditorOpen, setIsEditorOpen] = useState(forcedOnboarding)
  const [form, setForm] = useState<ConfigFormState>(() => buildConfigForm('openai'))
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null)
  const [connectionTone, setConnectionTone] = useState<'success' | 'error' | 'info'>('info')
  const [providerHint, setProviderHint] = useState<string | null>(null)
  const [fetchedModelsByProvider, setFetchedModelsByProvider] = useState<
    Partial<Record<ApiProvider, DiscoveredModel[]>>
  >({})
  const [dailyNewCardLimit, setDailyNewCardLimit] = useState(20)
  const [reviewTimeLimit, setReviewTimeLimit] = useState(30)
  const [podcastTtsProvider, setPodcastTtsProvider] = useState<PodcastTtsProvider>('auto')
  const [podcastOpenaiModel, setPodcastOpenaiModel] = useState('tts-1')
  const [podcastFishAudioEndpoint, setPodcastFishAudioEndpoint] = useState('')
  const [podcastOutputFormat, setPodcastOutputFormat] = useState<PodcastOutputFormat>('mp3')
  const [podcastSkipReview, setPodcastSkipReview] = useState(true)
  const [podcastVoiceOverrides, setPodcastVoiceOverrides] = useState('{}')
  const [podcastMaxLlmTokens, setPodcastMaxLlmTokens] = useState(100000)
  const [podcastMaxTtsCharacters, setPodcastMaxTtsCharacters] = useState(50000)
  const [podcastMaxEstimatedCostUsd, setPodcastMaxEstimatedCostUsd] = useState(1)
  const [selectedTheme, setSelectedTheme] = useState<AppThemeId>('default')
  const [selectedLanguage, setSelectedLanguage] = useState<AppSettings['language']>('zh-CN')
  const [learningGoal, setLearningGoal] = useState<LearningGoalId>('knowledge_understanding')
  const [dailyStudyMinutes, setDailyStudyMinutes] = useState(30)
  const [studyTimePreference, setStudyTimePreference] =
    useState<AppSettings['studyTimePreference']>('evening')
  const [studyTimePreferences, setStudyTimePreferences] = useState<StudyTimeSlotId[]>([
    'afternoon',
    'evening',
  ])
  const [studyContentPreferences, setStudyContentPreferences] = useState<
    StudyContentPreferenceId[]
  >(['psychology', 'cognitive_science', 'self_improvement', 'education'])
  const [contentDifficultyPreference, setContentDifficultyPreference] =
    useState<ContentDifficultyId>('intermediate')
  const [defaultVoice, setDefaultVoice] = useState('gentle_female_xiaoxiao')
  const [speechRate, setSpeechRate] = useState(1)
  const [speechPitch, setSpeechPitch] = useState(0)
  const [speechVolume, setSpeechVolume] = useState(0.8)
  const [readingMode, setReadingMode] = useState<AppSettings['readingMode']>('natural')
  const [defaultPodcastStyle, setDefaultPodcastStyle] =
    useState<AppSettings['defaultPodcastStyle']>('lecture')
  const [podcastEpisodeDurationMinutes, setPodcastEpisodeDurationMinutes] = useState(15)
  const [podcastContentStructure, setPodcastContentStructure] =
    useState<AppSettings['podcastContentStructure']>('summary_then_details')
  const [podcastBackgroundMusic, setPodcastBackgroundMusic] =
    useState<AppSettings['podcastBackgroundMusic']>('soft_piano')
  const [podcastIntroOutroEnabled, setPodcastIntroOutroEnabled] = useState(true)
  const [voiceInputLanguage, setVoiceInputLanguage] =
    useState<AppSettings['voiceInputLanguage']>('zh-CN')
  const [voiceInterruptEnabled, setVoiceInterruptEnabled] = useState(true)
  const [podcastAutoPlayNextEpisode, setPodcastAutoPlayNextEpisode] = useState(true)
  const [savingSection, setSavingSection] = useState<SettingsSectionId | null>(null)
  const [isExportingLearningData, setIsExportingLearningData] = useState(false)
  const [isExportingCardsCsv, setIsExportingCardsCsv] = useState(false)
  const [isClearingUiCache, setIsClearingUiCache] = useState(false)
  const [hasInitializedSetupGuide, setHasInitializedSetupGuide] = useState(false)

  const usableConfigExists = hasUsableApiConfig(apiConfigs)
  const showSetupGuide = forcedOnboarding || (!isApiConfigsLoading && !usableConfigExists)
  const currentProviderDefinition = getProviderDefinition(form.provider)
  const editingConfig = useMemo(
    () => (form.id ? (apiConfigs.find((config) => config.id === form.id) ?? null) : null),
    [apiConfigs, form.id]
  )
  const currentModels = useMemo(() => {
    const fetched = fetchedModelsByProvider[form.provider]
    if (fetched && fetched.length > 0) {
      return fetched
    }
    return currentProviderDefinition?.presetModels ?? []
  }, [currentProviderDefinition, fetchedModelsByProvider, form.provider])
  const workflowAssignmentMap = useMemo(
    () =>
      Object.fromEntries(
        workflowAssignments.map((assignment) => [assignment.workflowType, assignment.apiConfigId])
      ) as Partial<Record<WorkflowType, string>>,
    [workflowAssignments]
  )
  const deletingConfigId =
    deleteApiConfigMutation.isPending && typeof deleteApiConfigMutation.variables === 'string'
      ? deleteApiConfigMutation.variables
      : null

  useEffect(() => {
    if (!showSetupGuide || hasInitializedSetupGuide) {
      return
    }

    if (apiConfigs.length === 0) {
      setEditorMode('create')
      setForm(buildConfigForm('openai'))
      setIsEditorOpen(true)
      setConnectionMessage('当前未检测到可用模型配置，请先补充至少一组可用凭证。')
      setConnectionTone('info')
    } else {
      setIsEditorOpen(true)
    }

    setHasInitializedSetupGuide(true)
  }, [apiConfigs.length, hasInitializedSetupGuide, showSetupGuide])

  useEffect(() => {
    setActiveNavItem('settings')
    setActiveSection('ai')
  }, [setActiveNavItem, setActiveSection])

  useEffect(() => {
    if (!settings) {
      return
    }

    const snapshot = resolveSettingsSnapshot(settings)

    setDailyNewCardLimit(snapshot.dailyNewCardLimit)
    setReviewTimeLimit(snapshot.reviewTimeLimit)
    setSelectedLanguage(snapshot.language)
    setLearningGoal(snapshot.learningGoal)
    setDailyStudyMinutes(snapshot.dailyStudyMinutes)
    setStudyTimePreference(snapshot.studyTimePreference)
    setStudyTimePreferences(snapshot.studyTimePreferences)
    setStudyContentPreferences(snapshot.studyContentPreferences)
    setContentDifficultyPreference(snapshot.contentDifficultyPreference)
    setPodcastTtsProvider(snapshot.podcastTtsProvider)
    setPodcastOpenaiModel(snapshot.podcastOpenaiModel)
    setPodcastFishAudioEndpoint(snapshot.podcastFishAudioEndpoint ?? '')
    setPodcastOutputFormat(snapshot.podcastOutputFormat)
    setPodcastSkipReview(snapshot.podcastSkipReview)
    setPodcastVoiceOverrides(formatVoiceOverrides(snapshot.podcastVoiceOverrides))
    setPodcastMaxLlmTokens(snapshot.podcastMaxLlmTokens)
    setPodcastMaxTtsCharacters(snapshot.podcastMaxTtsCharacters)
    setPodcastMaxEstimatedCostUsd(snapshot.podcastMaxEstimatedCostUsd)
    setDefaultVoice(snapshot.defaultVoice)
    setSpeechRate(snapshot.speechRate)
    setSpeechPitch(snapshot.speechPitch)
    setSpeechVolume(snapshot.speechVolume)
    setReadingMode(snapshot.readingMode)
    setDefaultPodcastStyle(snapshot.defaultPodcastStyle)
    setPodcastEpisodeDurationMinutes(snapshot.podcastEpisodeDurationMinutes)
    setPodcastContentStructure(snapshot.podcastContentStructure)
    setPodcastBackgroundMusic(snapshot.podcastBackgroundMusic)
    setPodcastIntroOutroEnabled(snapshot.podcastIntroOutroEnabled)
    setVoiceInputLanguage(snapshot.voiceInputLanguage)
    setVoiceInterruptEnabled(snapshot.voiceInterruptEnabled)
    setPodcastAutoPlayNextEpisode(snapshot.podcastAutoPlayNextEpisode)
    setSelectedTheme(snapshot.theme)
  }, [settings])

  useEffect(() => {
    if (editorMode !== 'edit' || !form.id || editingConfig) {
      return
    }

    setEditorMode('create')
    setForm(buildConfigForm('openai'))
    setConnectionMessage(null)
    setConnectionTone('info')
    setProviderHint(null)
    setIsEditorOpen(false)
  }, [editingConfig, editorMode, form.id])

  const resetEditor = (provider: ApiProvider = 'openai') => {
    setEditorMode('create')
    setForm(buildConfigForm(provider))
    setConnectionMessage(null)
    setConnectionTone('info')
    setProviderHint(null)
    setIsEditorOpen(true)
    setActiveSection('ai')
  }

  const openEditConfig = (config: ApiConfig) => {
    setEditorMode('edit')
    setForm(buildConfigForm(config.provider, config))
    setConnectionMessage(null)
    setConnectionTone('info')
    setProviderHint(null)
    setIsEditorOpen(true)
    setActiveSection('ai')
  }

  const updateForm = <K extends keyof ConfigFormState>(key: K, value: ConfigFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const handleProviderSelect = (provider: ApiProvider) => {
    const existing = editorMode === 'edit' ? editingConfig : null
    const next = buildConfigForm(provider, existing?.provider === provider ? existing : null)
    next.name = form.name.trim() ? form.name : next.name
    next.displayName = form.displayName
    next.apiKey = form.apiKey
    next.budgetLimit = form.budgetLimit
    setForm(next)
    setConnectionMessage(null)
  }

  const handleApiKeyChange = (value: string) => {
    updateForm('apiKey', value)
    if (!value.trim()) {
      setProviderHint(null)
      return
    }

    const detection = detectProviderFromKey(value)
    setProviderHint(detection.message)
    if (detection.provider && currentProviderDefinition?.kind === 'custom') {
      const definition = getProviderDefinition(detection.provider)
      setForm((current) => ({
        ...current,
        provider: detection.provider!,
        model: current.model || getRecommendedModel(detection.provider!) || '',
        baseUrl: current.baseUrl || definition?.defaultBaseUrl || '',
      }))
    }
  }

  const apiKeyValidation = validateApiKeyFormat(form.apiKey, form.provider)
  const requiresBaseUrl = Boolean(currentProviderDefinition?.requiresBaseUrl)
  const needsKeyInput = editorMode === 'create' || !editingConfig?.hasStoredKey
  const canSaveConfig =
    form.name.trim().length > 0 &&
    form.model.trim().length > 0 &&
    (!requiresBaseUrl || normalizeBaseUrl(form.provider, form.baseUrl).length > 0) &&
    (!needsKeyInput || form.apiKey.trim().length > 0)

  const handleTestConnection = async () => {
    if (!form.apiKey.trim()) {
      setConnectionTone('error')
      setConnectionMessage('请先输入 API Key，再执行连接测试。')
      return
    }

    try {
      const result = await testConnectionMutation.mutateAsync({
        configId: form.id,
        provider: form.provider,
        authMode: 'api_key',
        apiKey: form.apiKey.trim(),
        baseUrl: normalizeBaseUrl(form.provider, form.baseUrl) || null,
        model: form.model.trim() || null,
      })
      setConnectionTone(result.success ? 'success' : 'error')
      setConnectionMessage(result.message)
    } catch (error) {
      reportAppError('设置', error, {
        title: '连接测试失败',
        fallbackDetail: '请检查网络、Base URL 和 API Key。',
      })
    }
  }

  const handleSaveConfig = async () => {
    const normalizedModel = form.model.trim()
    const normalizedName = form.name.trim()
    const normalizedDisplayName = form.displayName.trim() || null
    const normalizedBaseUrl = normalizeBaseUrl(form.provider, form.baseUrl) || null

    if (!normalizedName || !normalizedModel) {
      setConnectionTone('error')
      setConnectionMessage('请先填写配置名称和模型。')
      return
    }

    if (needsKeyInput && !form.apiKey.trim()) {
      setConnectionTone('error')
      setConnectionMessage('创建配置前需要先存储 API Key。')
      return
    }

    const payload = {
      provider: form.provider,
      protocol: inferConfigProtocol(form.provider),
      authMode: 'api_key' as const,
      name: normalizedName,
      displayName: normalizedDisplayName,
      model: normalizedModel,
      baseUrl: normalizedBaseUrl,
      budgetLimit: parseBudgetLimit(form.budgetLimit),
      isDefault: form.isDefault,
      isEnabled: form.isEnabled,
    }

    try {
      const config =
        editorMode === 'edit' && form.id
          ? await updateApiConfigMutation.mutateAsync({ id: form.id, data: payload })
          : await createApiConfigMutation.mutateAsync(payload)

      if (form.apiKey.trim()) {
        await storeApiKeyMutation.mutateAsync({
          configId: config.id,
          apiKey: form.apiKey.trim(),
        })
      }

      setConnectionTone('success')
      setConnectionMessage('配置已保存。')
      setProviderHint(null)
      if (!(showSetupGuide && apiConfigs.length === 0 && !form.apiKey.trim())) {
        setIsEditorOpen(false)
      }
    } catch (error) {
      reportAppError('设置', error, {
        title: '保存配置失败',
        fallbackDetail: '请检查供应商、模型名以及 IPC 返回结构是否匹配。',
      })
    }
  }

  const handleDeleteConfig = (config: ApiConfig) => {
    const referenced = workflowAssignments.filter(
      (assignment) => assignment.apiConfigId === config.id
    )
    if (referenced.length > 0) {
      reportAppError('设置', new Error('配置仍被工作流引用'), {
        title: '请先重新分配工作流',
        fallbackDetail: `当前配置仍绑定：${referenced
          .map(
            (assignment) =>
              WORKFLOW_DEFINITIONS.find((item) => item.type === assignment.workflowType)?.name ??
              assignment.workflowType
          )
          .join('、')}`,
      })
      return
    }

    if (!window.confirm(`确定删除配置“${getConfigTitle(config)}”吗？`)) {
      return
    }

    deleteApiConfigMutation.mutate(config.id)
  }

  const handleDeleteStoredKey = async () => {
    if (!form.id || !editingConfig?.hasStoredKey) {
      return
    }

    if (!window.confirm(`确定删除配置“${getConfigTitle(editingConfig)}”当前存储的 API Key 吗？`)) {
      return
    }

    try {
      const deleteStart = performance.now()
      console.info('[Perf][BYOK] deleteStoredKey click', {
        configId: form.id,
        startedAt: new Date().toISOString(),
      })
      await deleteApiKeyMutation.mutateAsync(form.id)
      console.info('[Perf][BYOK] deleteStoredKey mutate resolved', {
        configId: form.id,
        durationMs: Number((performance.now() - deleteStart).toFixed(2)),
      })
      updateForm('apiKey', '')
      setConnectionTone('success')
      setConnectionMessage('已删除当前存储的 API Key。再次使用前需要重新输入并保存。')
    } catch (error) {
      reportAppError('设置', error, {
        title: '删除 API Key 失败',
        fallbackDetail: '请检查本地 Stronghold 存储和配置 ID 是否有效。',
      })
    }
  }

  const handleAssignWorkflow = (workflowType: WorkflowType, apiConfigId: string) => {
    if (!apiConfigId) {
      return
    }
    setWorkflowAssignmentMutation.mutate({ workflowType, apiConfigId })
  }

  const handleAssignAll = (apiConfigId: string) => {
    if (!apiConfigId) {
      return
    }
    setAllWorkflowAssignmentsMutation.mutate(apiConfigId)
  }

  const handleResetBudgetUsage = (configId: string) => {
    if (!window.confirm('确定重置该配置本月的预算统计吗？')) {
      return
    }
    resetProviderBudgetUsageMutation.mutate(configId)
  }

  const handleFetchModels = async () => {
    const definition = currentProviderDefinition
    if (!definition || !definition.modelsEndpoint) {
      setConnectionTone('info')
      setConnectionMessage(`${definition?.name ?? '当前供应商'} 不支持自动模型发现。`)
      return
    }

    if (!form.apiKey.trim()) {
      setConnectionTone('error')
      setConnectionMessage('拉取模型前需要先填写 API Key。')
      return
    }

    try {
      const models = await fetchProviderModelsMutation.mutateAsync({
        provider: form.provider,
        apiKey: form.apiKey.trim(),
        baseUrl: normalizeBaseUrl(form.provider, form.baseUrl) || null,
      })
      setFetchedModelsByProvider((current) => ({ ...current, [form.provider]: models }))
      if (!form.model && models.length > 0) {
        updateForm('model', models[0].id)
      }
      setConnectionTone('success')
      setConnectionMessage(`已从服务器拉取 ${models.length} 个模型。`)
    } catch (error) {
      reportAppError('设置', error, {
        title: '拉取模型失败',
        fallbackDetail: '请确认供应商支持 /models 接口，或切换到手动输入模型名称。',
      })
    }
  }

  const parsePodcastVoiceOverrides = () => {
    let parsedVoiceOverrides: Record<string, string>
    try {
      const parsed = JSON.parse(podcastVoiceOverrides || '{}')
      if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
        throw new Error('voice override 必须是 JSON 对象')
      }
      parsedVoiceOverrides = Object.fromEntries(
        Object.entries(parsed).map(([key, value]) => {
          if (typeof value !== 'string') {
            throw new Error('voice override 的值必须是字符串')
          }
          return [key, value]
        })
      )
    } catch (error) {
      reportAppError('设置', error, {
        title: 'Voice Overrides 格式错误',
        fallbackDetail: 'voice override 需要是合法 JSON，例如 {"openai:zh-CN:host":"alloy"}。',
      })
      return null
    }

    return parsedVoiceOverrides
  }

  const saveSettingsPatch = async (
    sectionId: SettingsSectionId,
    payload: Partial<AppSettings>,
    errorTitle: string
  ) => {
    setSavingSection(sectionId)
    try {
      await updateSettingsMutation.mutateAsync(payload)
    } catch (error) {
      reportAppError('设置', error, {
        title: errorTitle,
        fallbackDetail: '请检查本地数据库与字段格式后重试。',
      })
    } finally {
      setSavingSection((current) => (current === sectionId ? null : current))
    }
  }

  const handleSaveLearningSettings = async () => {
    await saveSettingsPatch(
      'learning',
      {
        dailyNewCardLimit,
        reviewTimeLimit,
        learningGoal,
        dailyStudyMinutes,
        studyTimePreference,
        studyTimePreferences,
        studyContentPreferences,
        contentDifficultyPreference,
      },
      '学习偏好保存失败'
    )
  }

  const handleSavePodcastSettings = async () => {
    const parsedVoiceOverrides = parsePodcastVoiceOverrides()
    if (!parsedVoiceOverrides) {
      return
    }

    await saveSettingsPatch(
      'podcast',
      {
        podcastTtsProvider,
        podcastOpenaiModel: podcastOpenaiModel.trim() || 'tts-1',
        podcastFishAudioEndpoint: podcastFishAudioEndpoint.trim() || null,
        podcastVoiceOverrides: parsedVoiceOverrides,
        defaultVoice,
        speechRate,
        speechPitch,
        speechVolume,
        readingMode,
        defaultPodcastStyle,
        podcastEpisodeDurationMinutes,
        podcastContentStructure,
        podcastBackgroundMusic,
        podcastIntroOutroEnabled,
        voiceInputLanguage,
        voiceInterruptEnabled,
        podcastAutoPlayNextEpisode,
        podcastOutputFormat,
        podcastSkipReview,
        podcastMaxLlmTokens,
        podcastMaxTtsCharacters,
        podcastMaxEstimatedCostUsd,
      },
      '播客与语音设置保存失败'
    )
  }

  const handleSaveGeneralSettings = async () => {
    await saveSettingsPatch(
      'general',
      {
        theme: selectedTheme,
        language: selectedLanguage,
      },
      '通用设置保存失败'
    )
  }

  const handleThemeSelect = (themeId: AppThemeId) => {
    setSelectedTheme(themeId)
    updateSettingsMutation.mutate({ theme: themeId })
  }

  const handleRestoreLearningDefaults = () => {
    setDailyNewCardLimit(defaultSettingsSnapshot.dailyNewCardLimit)
    setReviewTimeLimit(defaultSettingsSnapshot.reviewTimeLimit)
    setLearningGoal(defaultSettingsSnapshot.learningGoal)
    setDailyStudyMinutes(defaultSettingsSnapshot.dailyStudyMinutes)
    setStudyTimePreference(defaultSettingsSnapshot.studyTimePreference)
    setStudyTimePreferences([...defaultSettingsSnapshot.studyTimePreferences])
    setStudyContentPreferences([...defaultSettingsSnapshot.studyContentPreferences])
    setContentDifficultyPreference(defaultSettingsSnapshot.contentDifficultyPreference)
  }

  const handleRestorePodcastDefaults = () => {
    setPodcastTtsProvider(defaultSettingsSnapshot.podcastTtsProvider)
    setPodcastOpenaiModel(defaultSettingsSnapshot.podcastOpenaiModel)
    setPodcastFishAudioEndpoint(defaultSettingsSnapshot.podcastFishAudioEndpoint ?? '')
    setPodcastOutputFormat(defaultSettingsSnapshot.podcastOutputFormat)
    setPodcastSkipReview(defaultSettingsSnapshot.podcastSkipReview)
    setPodcastVoiceOverrides(formatVoiceOverrides(defaultSettingsSnapshot.podcastVoiceOverrides))
    setPodcastMaxLlmTokens(defaultSettingsSnapshot.podcastMaxLlmTokens)
    setPodcastMaxTtsCharacters(defaultSettingsSnapshot.podcastMaxTtsCharacters)
    setPodcastMaxEstimatedCostUsd(defaultSettingsSnapshot.podcastMaxEstimatedCostUsd)
    setDefaultVoice(defaultSettingsSnapshot.defaultVoice)
    setSpeechRate(defaultSettingsSnapshot.speechRate)
    setSpeechPitch(defaultSettingsSnapshot.speechPitch)
    setSpeechVolume(defaultSettingsSnapshot.speechVolume)
    setReadingMode(defaultSettingsSnapshot.readingMode)
    setDefaultPodcastStyle(defaultSettingsSnapshot.defaultPodcastStyle)
    setPodcastEpisodeDurationMinutes(defaultSettingsSnapshot.podcastEpisodeDurationMinutes)
    setPodcastContentStructure(defaultSettingsSnapshot.podcastContentStructure)
    setPodcastBackgroundMusic(defaultSettingsSnapshot.podcastBackgroundMusic)
    setPodcastIntroOutroEnabled(defaultSettingsSnapshot.podcastIntroOutroEnabled)
    setVoiceInputLanguage(defaultSettingsSnapshot.voiceInputLanguage)
    setVoiceInterruptEnabled(defaultSettingsSnapshot.voiceInterruptEnabled)
    setPodcastAutoPlayNextEpisode(defaultSettingsSnapshot.podcastAutoPlayNextEpisode)
  }

  const handleRestoreGeneralDefaults = () => {
    setSelectedTheme(defaultSettingsSnapshot.theme)
    setSelectedLanguage(defaultSettingsSnapshot.language)
    updateSettingsMutation.mutate({ theme: defaultSettingsSnapshot.theme })
  }

  const handleExportLearningData = async () => {
    setIsExportingLearningData(true)
    try {
      const result = await cardsGateway.pickAndExportApkg()
      if (result) {
        reportFeedback({
          scope: '设置',
          title: '学习数据已导出',
          detail: result.outputPath,
        })
      }
    } catch (error) {
      reportAppError('设置', error, {
        title: '导出学习数据失败',
        fallbackDetail: '请确认导出位置可写并重试。',
      })
    } finally {
      setIsExportingLearningData(false)
    }
  }

  const handleExportCardsCsv = async () => {
    setIsExportingCardsCsv(true)
    try {
      const result = await cardsGateway.pickAndExportCsv()
      if (result) {
        reportFeedback({
          scope: '设置',
          title: '卡片 CSV 已导出',
          detail: result.outputPath,
        })
      }
    } catch (error) {
      reportAppError('设置', error, {
        title: '导出 CSV 失败',
        fallbackDetail: '请确认导出位置可写并重试。',
      })
    } finally {
      setIsExportingCardsCsv(false)
    }
  }

  const handleClearUiCache = async () => {
    if (!window.confirm('确认清理界面缓存吗？这不会删除已经导入的学习数据。')) {
      return
    }

    setIsClearingUiCache(true)
    try {
      window.localStorage.removeItem('xuejian-app-store')
      window.sessionStorage.clear()
      reportFeedback({
        scope: '设置',
        title: '界面缓存已清理',
        detail: '已移除本地界面缓存，下次启动将按最新设置重新构建。',
      })
    } catch (error) {
      reportAppError('设置', error, {
        title: '清理界面缓存失败',
        fallbackDetail: '请关闭应用后重试。',
      })
    } finally {
      setIsClearingUiCache(false)
    }
  }

  const assignedWorkflowNamesByConfigId = useMemo(() => {
    const result = new Map<string, string[]>()
    for (const assignment of workflowAssignments) {
      const workflowName =
        WORKFLOW_DEFINITIONS.find((definition) => definition.type === assignment.workflowType)
          ?.name ?? assignment.workflowType
      const names = result.get(assignment.apiConfigId) ?? []
      names.push(workflowName)
      result.set(assignment.apiConfigId, names)
    }
    return result
  }, [workflowAssignments])

  const section = settingsSections.find((item) => item.id === activeSection) ?? settingsSections[0]
  const configuredApiCount = apiConfigs.length
  const readyApiCount = apiConfigs.filter(
    (config) => config.isEnabled && config.hasStoredCredential
  ).length
  const preferredStudyTimeLabel = getOptionLabel(
    studyTimePreferenceOptions,
    studyTimePreference
  )
  const activeStudyTimeLabel = formatSelectionSummary(studyTimeSlotOptions, studyTimePreferences)
  const activeContentSummary = formatSelectionSummary(
    studyContentPreferenceOptions,
    studyContentPreferences
  )
  const learningGoalLabel = getOptionLabel(learningGoalOptions, learningGoal)
  const difficultyLabel = getOptionLabel(contentDifficultyOptions, contentDifficultyPreference)

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="space-y-2">
          <button
            onClick={() => setActiveNavItem('home')}
            className="inline-flex items-center gap-2 text-sm text-ink-muted transition-colors hover:text-ink"
            type="button"
          >
            <span aria-hidden="true">←</span>
            返回首页
          </button>
          <div>
            <p className="text-[11px] uppercase tracking-[0.32em] text-ink-soft">
              SETTINGS
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">设置</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">
              {showSetupGuide
                ? '首次进入前，请先配置至少一组可用的模型凭证。AI 模型子页会保持在前台，直到系统识别到可用凭证。'
                : '按子页拆分 BYOK、学习偏好、播客参数和通用设置，避免把所有配置塞进一张长表单。'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px,minmax(0,1fr)]">
        <Panel
          variant="panel"
          className="rounded-[32px] border border-line-soft/70 bg-paper-base/95 p-3 lg:sticky lg:top-6 lg:h-fit"
        >
          <div className="space-y-2">
            {settingsSections.map((item) => {
              const active = item.id === activeSection
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  className={cn(
                    'w-full rounded-[24px] px-4 py-4 text-left transition-colors',
                    active
                      ? 'bg-ink/5 text-ink shadow-card'
                      : 'text-ink-muted hover:bg-ink/3 hover:text-ink'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] border text-sm font-semibold',
                        active
                          ? 'border-ink/25 bg-paper-base text-ink'
                          : 'border-line-soft/70 bg-paper-muted/50 text-ink-soft'
                      )}
                    >
                      {getSectionGlyph(item.id)}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                        {item.eyebrow}
                      </p>
                      <p className="mt-1 font-medium">{item.title}</p>
                      <p className="mt-1 text-sm text-ink-muted">{item.description}</p>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel
            variant="paperCard"
            className="overflow-hidden rounded-[32px] border border-line-soft/80 p-6 md:p-8"
          >
            <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[22px] border border-line-soft/70 bg-paper-muted/60 text-lg font-semibold text-ink">
                  {getSectionGlyph(section.id)}
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.28em] text-ink-soft">
                    {section.eyebrow}
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-ink">{section.title}</h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-muted">
                    {section.description}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                {activeSection === 'ai' ? (
                  <Button
                    variant="outline"
                    onClick={() => resetEditor('openai')}
                    data-testid="settings-toggle-add-config"
                  >
                    添加供应商
                  </Button>
                ) : null}
                {activeSection === 'learning' ? (
                  <Button variant="outline" onClick={handleRestoreLearningDefaults}>
                    恢复默认设置
                  </Button>
                ) : null}
                {activeSection === 'podcast' ? (
                  <Button variant="outline" onClick={handleRestorePodcastDefaults}>
                    恢复默认设置
                  </Button>
                ) : null}
                {activeSection === 'general' ? (
                  <Button variant="outline" onClick={handleRestoreGeneralDefaults}>
                    恢复默认设置
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {activeSection === 'ai' ? (
                <>
                  <SectionMetric
                    label="已配置供应商"
                    value={String(configuredApiCount)}
                    detail={`其中 ${readyApiCount} 个已具备可用凭证`}
                  />
                  <SectionMetric
                    label="默认策略"
                    value={usableConfigExists ? '已就绪' : '待补齐'}
                    detail={usableConfigExists ? '工作流可以分配到稳定配置' : '请先补充至少一组可用 Key'}
                  />
                  <SectionMetric
                    label="工作流分配"
                    value={String(workflowAssignments.length)}
                    detail="不同任务可绑定不同成本与能力的模型"
                  />
                </>
              ) : null}

              {activeSection === 'learning' ? (
                <>
                  <SectionMetric
                    label="每日时长"
                    value={`${dailyStudyMinutes} 分钟`}
                    detail={`${dailyNewCardLimit} 张新卡 / ${reviewTimeLimit} 分钟复习上限`}
                  />
                  <SectionMetric
                    label="学习目标"
                    value={learningGoalLabel}
                    detail={`内容难度当前为${difficultyLabel}`}
                  />
                  <SectionMetric
                    label="推荐时段"
                    value={preferredStudyTimeLabel}
                    detail={activeStudyTimeLabel}
                  />
                </>
              ) : null}

              {activeSection === 'podcast' ? (
                <>
                  <SectionMetric
                    label="默认语音"
                    value={getOptionLabel(defaultVoiceOptions, defaultVoice)}
                    detail={`${Math.round(speechVolume * 100)}% 音量 · ${readingMode}`}
                  />
                  <SectionMetric
                    label="播客风格"
                    value={getOptionLabel(podcastStyleOptions, defaultPodcastStyle)}
                    detail={`${podcastEpisodeDurationMinutes} 分钟 / ${podcastOutputFormat.toUpperCase()}`}
                  />
                  <SectionMetric
                    label="语音输入"
                    value={getOptionLabel(voiceInputLanguageOptions, voiceInputLanguage)}
                    detail={podcastAutoPlayNextEpisode ? '启用自动播放下一集' : '手动控制下一集播放'}
                  />
                </>
              ) : null}

              {activeSection === 'general' ? (
                <>
                  <SectionMetric
                    label="官方主题"
                    value={
                      appThemeOptions.find((theme) => theme.id === selectedTheme)?.label ??
                      selectedTheme
                    }
                    detail="保留唯一官方纸感主题"
                  />
                  <SectionMetric
                    label="界面语言"
                    value={getOptionLabel(languageOptions, selectedLanguage)}
                    detail="语言修改需要点击保存通用设置"
                  />
                  <SectionMetric
                    label="数据导出"
                    value="APKG / CSV"
                    detail="学习数据和卡片导出入口集中在当前面板"
                  />
                </>
              ) : null}
            </div>
          </Panel>

          {activeSection === 'ai' ? (
            <>
              <Panel
                variant="paperCard"
                className="rounded-[32px] border border-line-soft/80 p-6 md:p-8"
              >
                <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                  <div className="max-w-2xl">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                      供应商配置
                    </p>
                    <h3 className="mt-2 text-xl font-semibold text-ink">
                      把模型配置拆成可维护的供应商卡片
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-ink-muted">
                      预置 OpenAI、Anthropic、Google、DeepSeek，并保留三种自定义协议模板。Key
                      只进入本地宿主的安全存储，不会写入 SQLite。
                    </p>
                  </div>
                  <div className="rounded-[24px] border border-line-soft/70 bg-paper-muted/70 px-4 py-3 text-sm text-ink-muted">
                    <p className="font-medium text-ink">可用配置</p>
                    <p className="mt-1 text-2xl font-semibold text-ink">{apiConfigs.length}</p>
                    <p className="mt-1">已满足工作流运行条件：{usableConfigExists ? '是' : '否'}</p>
                  </div>
                </div>

                {showSetupGuide ? (
                  <div
                    className="mt-6 rounded-[28px] border border-[#ceb18f]/70 bg-[#fbf4ea] px-5 py-4 text-sm text-[#7c5c39]"
                    data-testid="settings-setup-callout"
                  >
                    {apiConfigs.length === 0
                      ? '当前未检测到可用模型配置。你可以先创建并验证一组凭证，其他设置子页仍可继续浏览。'
                      : '当前已有模型配置，但系统尚未检测到可用凭证。请检查 Key、连接状态或重新验证。'}
                  </div>
                ) : null}

                {apiConfigs.length === 0 ? (
                  <div className="mt-6 rounded-[28px] border border-dashed border-line-soft bg-paper-muted/40 px-6 py-10 text-center">
                    <p className="text-lg font-medium text-ink">还没有任何 API 配置</p>
                    <p className="mt-2 text-sm text-ink-muted">
                      先创建一张供应商卡片，再把工作流分配到合适模型上。
                    </p>
                  </div>
                ) : (
                  <div className="mt-6 grid gap-4 xl:grid-cols-2">
                    {apiConfigs.map((config) => (
                      <ProviderConfigCard
                        key={config.id}
                        config={config}
                        assignedWorkflowNames={assignedWorkflowNamesByConfigId.get(config.id) ?? []}
                        onEdit={openEditConfig}
                        onManageKey={openEditConfig}
                        onSetDefault={(configId) => setDefaultApiConfigMutation.mutate(configId)}
                        onDelete={handleDeleteConfig}
                        onResetBudget={handleResetBudgetUsage}
                        isDeleting={deletingConfigId === config.id}
                      />
                    ))}
                  </div>
                )}
              </Panel>

              <Panel
                variant="paperCard"
                className={cn(
                  'rounded-[32px] border border-line-soft/80 p-6 md:p-8',
                  !isEditorOpen && 'hidden'
                )}
                data-testid={
                  editorMode === 'create'
                    ? 'settings-add-config-form'
                    : 'settings-update-config-form'
                }
              >
                <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                      {editorMode === 'create' ? '创建配置' : '编辑配置'}
                    </p>
                    <h3 className="mt-2 text-xl font-semibold text-ink">
                      {editorMode === 'create'
                        ? '新增一个可复用的供应商配置'
                        : `更新 ${editingConfig ? getConfigTitle(editingConfig) : '当前配置'}`}
                    </h3>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">
                      供应商、模型、预算和 Key 分开保存。连接测试会更新 keyStatus，但不会把明文 Key
                      回传给前端。
                    </p>
                  </div>
                  {isEditorOpen ? (
                    <Button variant="ghost" onClick={() => setIsEditorOpen(false)}>
                      收起表单
                    </Button>
                  ) : null}
                </div>

                <div className="mt-6 grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
                  {PROVIDER_DEFINITIONS.map((definition) => {
                    const active = definition.id === form.provider
                    return (
                      <button
                        key={definition.id}
                        type="button"
                        onClick={() => handleProviderSelect(definition.id)}
                        className={cn(
                          'rounded-[24px] border p-4 text-left transition-colors',
                          active
                            ? 'border-ink/40 bg-ink/5 text-ink'
                            : 'border-line-soft/80 bg-paper-card text-ink-muted hover:border-ink/20 hover:text-ink'
                        )}
                      >
                        <p className="text-[11px] uppercase tracking-[0.18em] text-ink-soft">
                          {definition.kind === 'preset' ? 'Preset' : 'Custom'}
                        </p>
                        <p className="mt-2 font-medium">{definition.name}</p>
                        <p className="mt-2 text-sm leading-6 text-ink-muted">
                          {definition.description}
                        </p>
                      </button>
                    )
                  })}
                </div>

                <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr),minmax(0,1fr)]">
                  <div className="space-y-4">
                    <label className="block space-y-2">
                      <span className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                        配置名称
                      </span>
                      <Input
                        value={form.name}
                        onChange={(event) => updateForm('name', event.target.value)}
                        data-testid={
                          editorMode === 'create'
                            ? 'settings-add-config-name'
                            : 'settings-update-config-name'
                        }
                        placeholder="例如：OpenAI Primary"
                        className="h-11 rounded-full px-4"
                      />
                    </label>

                    <label className="block space-y-2">
                      <span className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                        显示名称
                      </span>
                      <Input
                        value={form.displayName}
                        onChange={(event) => updateForm('displayName', event.target.value)}
                        placeholder="可选：用于工作流分配和卡片标题"
                        className="h-11 rounded-full px-4"
                      />
                    </label>

                    <label className="block space-y-2">
                      <span className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                        API Key
                      </span>
                      <Input
                        type="password"
                        value={form.apiKey}
                        onChange={(event) => handleApiKeyChange(event.target.value)}
                        data-testid={
                          editorMode === 'create'
                            ? 'settings-add-config-key'
                            : 'settings-update-config-key'
                        }
                        placeholder={
                          editingConfig?.hasStoredKey
                            ? `${getStoredKeyPlaceholder(form.provider)} · 留空表示保持现有 Key`
                            : '粘贴或输入新的 API Key'
                        }
                        className="h-11 rounded-full px-4"
                      />
                    </label>

                    <div className="rounded-[22px] border border-line-soft/70 bg-paper-muted/60 px-4 py-3 text-sm">
                      <p className="font-medium text-ink">Key 校验</p>
                      <p
                        className={cn(
                          'mt-1',
                          apiKeyValidation.severity === 'error' && 'text-ink',
                          apiKeyValidation.severity === 'success' && 'text-ink',
                          apiKeyValidation.severity === 'info' && 'text-ink-muted'
                        )}
                      >
                        {form.apiKey
                          ? apiKeyValidation.message
                          : '输入 Key 后会尝试识别供应商并进行格式校验。'}
                      </p>
                      {providerHint ? (
                        <p className="mt-1 text-xs text-ink-soft">{providerHint}</p>
                      ) : null}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block space-y-2">
                        <span className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                          模型
                        </span>
                        {currentModels.length > 0 ? (
                          <select
                            value={form.model}
                            onChange={(event) => updateForm('model', event.target.value)}
                            title="模型"
                            className="h-11 w-full rounded-full border border-line-soft bg-paper-card px-4 text-sm text-ink"
                          >
                            <option value="">选择模型</option>
                            {currentModels.map((model) => (
                              <option key={model.id} value={model.id}>
                                {model.displayName}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <Input
                            value={form.model}
                            onChange={(event) => updateForm('model', event.target.value)}
                            placeholder="手动输入模型名称"
                            className="h-11 rounded-full px-4"
                          />
                        )}
                      </label>

                      <label className="block space-y-2">
                        <span className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                          月度预算（USD）
                        </span>
                        <Input
                          value={form.budgetLimit}
                          onChange={(event) => updateForm('budgetLimit', event.target.value)}
                          placeholder="留空表示不限额"
                          className="h-11 rounded-full px-4"
                        />
                      </label>
                    </div>

                    <label className="block space-y-2">
                      <span className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                        Base URL
                      </span>
                      <Input
                        value={form.baseUrl}
                        onChange={(event) => updateForm('baseUrl', event.target.value)}
                        data-testid="settings-add-config-base-url"
                        placeholder={
                          currentProviderDefinition?.defaultBaseUrl ??
                          'https://your-endpoint.example.com'
                        }
                        className="h-11 rounded-full px-4"
                      />
                      <p className="text-xs text-ink-soft">
                        {currentProviderDefinition?.requiresBaseUrl
                          ? '此供应商必须填写 Base URL。'
                          : currentProviderDefinition?.defaultBaseUrl
                            ? `留空时使用默认端点：${currentProviderDefinition.defaultBaseUrl}`
                            : '可选：覆盖默认端点。'}
                      </p>
                    </label>

                    <div className="flex flex-wrap gap-3">
                      <label className="inline-flex items-center gap-2 rounded-full border border-line-soft px-4 py-2 text-sm text-ink-muted">
                        <input
                          type="checkbox"
                          checked={form.isDefault}
                          onChange={(event) => updateForm('isDefault', event.target.checked)}
                        />
                        设为默认回退模型
                      </label>
                      <label className="inline-flex items-center gap-2 rounded-full border border-line-soft px-4 py-2 text-sm text-ink-muted">
                        <input
                          type="checkbox"
                          checked={form.isEnabled}
                          onChange={(event) => updateForm('isEnabled', event.target.checked)}
                        />
                        启用该配置
                      </label>
                    </div>

                    <div className="rounded-[22px] border border-line-soft/70 bg-paper-muted/60 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-medium text-ink">模型发现与连接测试</p>
                          <p className="mt-1 text-sm text-ink-muted">
                            {currentProviderDefinition?.modelsEndpoint
                              ? '支持从服务器拉取更多模型；推荐先做轻量连接验证，再决定是否保存。'
                              : '该供应商不支持自动模型发现，但仍可手动输入模型名并测试连接。'}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            onClick={handleFetchModels}
                            disabled={fetchProviderModelsMutation.isPending}
                          >
                            从服务器拉取更多模型
                          </Button>
                          <Button variant="outline" onClick={handleTestConnection}>
                            验证连接
                          </Button>
                        </div>
                      </div>
                      {connectionMessage ? (
                        <p
                          className={cn(
                            'mt-3 text-sm',
                            connectionTone === 'success' && 'text-ink',
                            connectionTone === 'error' && 'text-ink',
                            connectionTone === 'info' && 'text-ink-muted'
                          )}
                        >
                          {connectionMessage}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <Button
                    onClick={handleSaveConfig}
                    disabled={
                      !canSaveConfig ||
                      createApiConfigMutation.isPending ||
                      updateApiConfigMutation.isPending
                    }
                    data-testid={
                      editorMode === 'create' ? 'settings-save-config' : 'settings-update-save-key'
                    }
                  >
                    {editorMode === 'create' ? '保存配置' : '保存更改'}
                  </Button>
                  {editorMode === 'edit' && editingConfig?.hasStoredKey ? (
                    <Button
                      variant="ghost"
                      onClick={handleDeleteStoredKey}
                      disabled={deleteApiKeyMutation.isPending}
                      data-testid="settings-delete-key"
                    >
                      删除 Key
                    </Button>
                  ) : null}
                  {isEditorOpen ? (
                    <Button variant="outline" onClick={() => setIsEditorOpen(false)}>
                      取消
                    </Button>
                  ) : null}
                </div>
              </Panel>

              <WorkflowAssignmentPanel
                assignments={workflowAssignmentMap}
                configs={apiConfigs}
                onAssign={handleAssignWorkflow}
                onAssignAll={handleAssignAll}
              />
            </>
          ) : null}

          {activeSection === 'learning' ? (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr),300px]">
              <div className="space-y-6">
                <Panel
                  variant="paperCard"
                  className="rounded-[32px] border border-line-soft/80 p-6 md:p-8"
                >
                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                      学习目标
                    </p>
                    <h3 className="text-xl font-semibold text-ink">定义这轮学习要优先实现什么</h3>
                    <p className="text-sm leading-6 text-ink-muted">
                      系统会依据你的目标调整推荐内容、复习节奏与解释方式。
                    </p>
                  </div>
                  <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    {learningGoalOptions.map((option) => (
                      <OptionChip
                        key={option.value}
                        active={learningGoal === option.value}
                        label={option.label}
                        meta={option.description}
                        onClick={() => setLearningGoal(option.value)}
                      />
                    ))}
                  </div>
                </Panel>

                <Panel
                  variant="paperCard"
                  className="rounded-[32px] border border-line-soft/80 p-6 md:p-8"
                >
                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                      每日节奏
                    </p>
                    <h3 className="text-xl font-semibold text-ink">把学习时长和任务强度控制在可持续区间</h3>
                  </div>

                  <div className="mt-6 space-y-6">
                    <div>
                      <p className="text-sm font-medium text-ink">每日学习时长</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-5">
                        {dailyStudyMinuteOptions.map((item) => (
                          <OptionChip
                            key={item}
                            active={dailyStudyMinutes === item}
                            label={`${item} 分钟`}
                            onClick={() => setDailyStudyMinutes(item)}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="grid gap-6 md:grid-cols-2">
                      <div>
                        <p className="text-sm font-medium text-ink">每日新卡数量</p>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          {dailyNewCardOptions.map((item) => (
                            <OptionChip
                              key={item}
                              active={dailyNewCardLimit === item}
                              label={`${item} 张`}
                              onClick={() => setDailyNewCardLimit(item)}
                            />
                          ))}
                        </div>
                      </div>

                      <div>
                        <p className="text-sm font-medium text-ink">复习时长上限</p>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          {reviewTimeLimitOptions.map((item) => (
                            <OptionChip
                              key={item}
                              active={reviewTimeLimit === item}
                              label={`${item} 分钟`}
                              onClick={() => setReviewTimeLimit(item)}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </Panel>

                <Panel
                  variant="paperCard"
                  className="rounded-[32px] border border-line-soft/80 p-6 md:p-8"
                >
                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                      学习时间偏好
                    </p>
                    <h3 className="text-xl font-semibold text-ink">先选整体节奏，再标出最适合你的时段</h3>
                  </div>

                  <div className="mt-6 space-y-6">
                    <div>
                      <p className="text-sm font-medium text-ink">默认推荐时段</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                        {studyTimePreferenceOptions.map((option) => (
                          <OptionChip
                            key={option.value}
                            active={studyTimePreference === option.value}
                            label={option.label}
                            onClick={() => setStudyTimePreference(option.value)}
                          />
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="text-sm font-medium text-ink">活跃学习时段</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {studyTimeSlotOptions.map((option) => (
                          <OptionChip
                            key={option.value}
                            active={studyTimePreferences.includes(option.value)}
                            label={option.label}
                            meta={option.timeRange}
                            onClick={() =>
                              setStudyTimePreferences((current) =>
                                toggleSelection(current, option.value)
                              )
                            }
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </Panel>

                <Panel
                  variant="paperCard"
                  className="rounded-[32px] border border-line-soft/80 p-6 md:p-8"
                >
                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                      学习内容偏好
                    </p>
                    <h3 className="text-xl font-semibold text-ink">选择你希望系统优先推送的主题领域</h3>
                  </div>

                  <div className="mt-6 flex flex-wrap gap-3">
                    {studyContentPreferenceOptions.map((option) => (
                      <OptionChip
                        key={option.value}
                        active={studyContentPreferences.includes(option.value)}
                        label={option.label}
                        onClick={() =>
                          setStudyContentPreferences((current) =>
                            toggleSelection(current, option.value)
                          )
                        }
                        className="min-w-[132px]"
                      />
                    ))}
                  </div>
                  <p className="mt-4 text-sm text-ink-soft">
                    已选择 {studyContentPreferences.length} 个偏好领域
                  </p>
                </Panel>

                <Panel
                  variant="paperCard"
                  className="rounded-[32px] border border-line-soft/80 p-6 md:p-8"
                >
                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                      内容难度
                    </p>
                    <h3 className="text-xl font-semibold text-ink">控制解释深度与推荐内容的复杂度</h3>
                  </div>

                  <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    {contentDifficultyOptions.map((option) => (
                      <OptionChip
                        key={option.value}
                        active={contentDifficultyPreference === option.value}
                        label={option.label}
                        onClick={() => setContentDifficultyPreference(option.value)}
                      />
                    ))}
                  </div>
                </Panel>
              </div>

              <Panel
                variant="paperCard"
                className="h-fit space-y-4 rounded-[32px] border border-line-soft/80 p-6 xl:sticky xl:top-6"
              >
                <div className="space-y-2">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                    偏好概览
                  </p>
                  <h3 className="text-xl font-semibold text-ink">当前学习设置摘要</h3>
                </div>
                <SummaryRow label="学习目标" value={learningGoalLabel} />
                <SummaryRow label="每日时长" value={`${dailyStudyMinutes} 分钟`} />
                <SummaryRow label="推荐时段" value={preferredStudyTimeLabel} />
                <SummaryRow label="活跃时段" value={activeStudyTimeLabel} />
                <SummaryRow label="内容领域" value={activeContentSummary} />
                <SummaryRow label="内容难度" value={difficultyLabel} />

                <div className="grid gap-3 pt-2">
                  <Button
                    onClick={handleSaveLearningSettings}
                    disabled={savingSection === 'learning'}
                  >
                    {savingSection === 'learning' ? '正在保存…' : '保存偏好设置'}
                  </Button>
                  <Button variant="outline" onClick={handleRestoreLearningDefaults}>
                    恢复默认设置
                  </Button>
                </div>
              </Panel>
            </div>
          ) : null}

          {activeSection === 'podcast' ? (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr),300px]">
              <div className="space-y-6">
                <Panel
                  variant="paperCard"
                  className="rounded-[32px] border border-line-soft/80 p-6 md:p-8"
                >
                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                      语音合成设置
                    </p>
                    <h3 className="text-xl font-semibold text-ink">先确定默认声线，再细调收听体验</h3>
                  </div>

                  <div className="mt-6 grid gap-4 md:grid-cols-2">
                    <label className="block space-y-2">
                      <span className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                        默认语音
                      </span>
                      <select
                        value={defaultVoice}
                        onChange={(event) => setDefaultVoice(event.target.value)}
                        title="默认语音"
                        className="h-11 w-full rounded-full border border-line-soft bg-paper-card px-4 text-sm text-ink"
                      >
                        {defaultVoiceOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block space-y-2">
                      <span className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                        朗读模式
                      </span>
                      <select
                        value={readingMode}
                        onChange={(event) =>
                          setReadingMode(event.target.value as AppSettings['readingMode'])
                        }
                        title="朗读模式"
                        className="h-11 w-full rounded-full border border-line-soft bg-paper-card px-4 text-sm text-ink"
                      >
                        {readingModeOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="mt-6 grid gap-4 xl:grid-cols-3">
                    <RangeField
                      label="语速"
                      description="控制播客与文本朗读的整体语速。"
                      value={speechRate}
                      min={0.75}
                      max={1.5}
                      step={0.05}
                      onChange={setSpeechRate}
                      formatter={(value) => `${value.toFixed(2)}x`}
                    />
                    <RangeField
                      label="语调"
                      description="微调声音偏低沉或偏明亮。"
                      value={speechPitch}
                      min={-0.5}
                      max={0.5}
                      step={0.05}
                      onChange={setSpeechPitch}
                      formatter={(value) => `${Math.round(value * 100)}%`}
                    />
                    <RangeField
                      label="音量"
                      description="作为播客播放与预览的默认音量。"
                      value={speechVolume}
                      min={0}
                      max={1}
                      step={0.05}
                      onChange={setSpeechVolume}
                      formatter={(value) => `${Math.round(value * 100)}%`}
                    />
                  </div>
                </Panel>

                <Panel
                  variant="paperCard"
                  className="rounded-[32px] border border-line-soft/80 p-6 md:p-8"
                >
                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                      播客生成设置
                    </p>
                    <h3 className="text-xl font-semibold text-ink">定义默认节目风格、结构和氛围</h3>
                  </div>

                  <div className="mt-6 space-y-6">
                    <div>
                      <p className="text-sm font-medium text-ink">默认播客风格</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {podcastStyleOptions.map((option) => (
                          <OptionChip
                            key={option.value}
                            active={defaultPodcastStyle === option.value}
                            label={option.label}
                            onClick={() => setDefaultPodcastStyle(option.value)}
                          />
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="text-sm font-medium text-ink">单集时长</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
                        {podcastEpisodeDurationOptions.map((item) => (
                          <OptionChip
                            key={item}
                            active={podcastEpisodeDurationMinutes === item}
                            label={`${item} 分钟`}
                            onClick={() => setPodcastEpisodeDurationMinutes(item)}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="block space-y-2">
                        <span className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                          内容结构
                        </span>
                        <select
                          value={podcastContentStructure}
                          onChange={(event) =>
                            setPodcastContentStructure(
                              event.target.value as AppSettings['podcastContentStructure']
                            )
                          }
                          title="内容结构"
                          className="h-11 w-full rounded-full border border-line-soft bg-paper-card px-4 text-sm text-ink"
                        >
                          {podcastStructureOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block space-y-2">
                        <span className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                          背景音乐
                        </span>
                        <select
                          value={podcastBackgroundMusic}
                          onChange={(event) =>
                            setPodcastBackgroundMusic(
                              event.target.value as AppSettings['podcastBackgroundMusic']
                            )
                          }
                          title="背景音乐"
                          className="h-11 w-full rounded-full border border-line-soft bg-paper-card px-4 text-sm text-ink"
                        >
                          {podcastBackgroundMusicOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <SectionToggle
                        label="自动添加片头片尾"
                        description="为播客生成开场和结尾提示语。"
                        checked={podcastIntroOutroEnabled}
                        onChange={setPodcastIntroOutroEnabled}
                      />
                      <SectionToggle
                        label="跳过人工审阅"
                        description="生成脚本后直接进入后续语音合成流程。"
                        checked={podcastSkipReview}
                        onChange={setPodcastSkipReview}
                      />
                    </div>
                  </div>
                </Panel>

                <Panel
                  variant="paperCard"
                  className="rounded-[32px] border border-line-soft/80 p-6 md:p-8"
                >
                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                      语音交互与引擎
                    </p>
                    <h3 className="text-xl font-semibold text-ink">集中管理输入语言、TTS 路由和预算限制</h3>
                  </div>

                  <div className="mt-6 grid gap-4 md:grid-cols-2">
                    <label className="block space-y-2">
                      <span className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                        语音输入语言
                      </span>
                      <select
                        value={voiceInputLanguage}
                        onChange={(event) =>
                          setVoiceInputLanguage(
                            event.target.value as AppSettings['voiceInputLanguage']
                          )
                        }
                        title="语音输入语言"
                        className="h-11 w-full rounded-full border border-line-soft bg-paper-card px-4 text-sm text-ink"
                      >
                        {voiceInputLanguageOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block space-y-2">
                      <span className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                        默认 TTS 提供商
                      </span>
                      <select
                        value={podcastTtsProvider}
                        onChange={(event) =>
                          setPodcastTtsProvider(event.target.value as PodcastTtsProvider)
                        }
                        title="默认 TTS 提供商"
                        className="h-11 w-full rounded-full border border-line-soft bg-paper-card px-4 text-sm text-ink"
                      >
                        {podcastProviderOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block space-y-2">
                      <span className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                        OpenAI TTS 模型
                      </span>
                      <Input
                        value={podcastOpenaiModel}
                        onChange={(event) => setPodcastOpenaiModel(event.target.value)}
                        className="h-11 rounded-full px-4"
                      />
                    </label>

                    <label className="block space-y-2">
                      <span className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                        输出格式
                      </span>
                      <select
                        value={podcastOutputFormat}
                        onChange={(event) =>
                          setPodcastOutputFormat(event.target.value as PodcastOutputFormat)
                        }
                        title="输出格式"
                        className="h-11 w-full rounded-full border border-line-soft bg-paper-card px-4 text-sm text-ink"
                      >
                        <option value="mp3">MP3</option>
                        <option value="wav">WAV</option>
                      </select>
                    </label>
                  </div>

                  <div className="mt-6 grid gap-4 md:grid-cols-3">
                    <label className="block space-y-2">
                      <span className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                        最大 LLM Tokens
                      </span>
                      <Input
                        type="number"
                        value={String(podcastMaxLlmTokens)}
                        onChange={(event) =>
                          setPodcastMaxLlmTokens(Number(event.target.value) || 0)
                        }
                        className="h-11 rounded-full px-4"
                      />
                    </label>

                    <label className="block space-y-2">
                      <span className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                        最大 TTS 字符数
                      </span>
                      <Input
                        type="number"
                        value={String(podcastMaxTtsCharacters)}
                        onChange={(event) =>
                          setPodcastMaxTtsCharacters(Number(event.target.value) || 0)
                        }
                        className="h-11 rounded-full px-4"
                      />
                    </label>

                    <label className="block space-y-2">
                      <span className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                        脚本预算上限（USD）
                      </span>
                      <Input
                        type="number"
                        step="0.1"
                        value={String(podcastMaxEstimatedCostUsd)}
                        onChange={(event) =>
                          setPodcastMaxEstimatedCostUsd(Number(event.target.value) || 0)
                        }
                        className="h-11 rounded-full px-4"
                      />
                    </label>
                  </div>

                  <div className="mt-6 grid gap-4 md:grid-cols-2">
                    <SectionToggle
                      label="允许语音打断"
                      description="在播客播放过程中接收并响应新的语音输入。"
                      checked={voiceInterruptEnabled}
                      onChange={setVoiceInterruptEnabled}
                    />
                    <SectionToggle
                      label="自动播放下一集"
                      description="当前集播放完成后自动衔接下一集。"
                      checked={podcastAutoPlayNextEpisode}
                      onChange={setPodcastAutoPlayNextEpisode}
                    />
                  </div>

                  <label className="mt-6 block space-y-2">
                    <span className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                      Voice Overrides (JSON)
                    </span>
                    <textarea
                      value={podcastVoiceOverrides}
                      onChange={(event) => setPodcastVoiceOverrides(event.target.value)}
                      className="min-h-[180px] w-full rounded-[24px] border border-line-soft bg-paper-card px-4 py-3 font-mono text-sm text-ink"
                    />
                  </label>
                </Panel>
              </div>

              <Panel
                variant="paperCard"
                className="h-fit space-y-4 rounded-[32px] border border-line-soft/80 p-6 xl:sticky xl:top-6"
              >
                <div className="space-y-2">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                    播放摘要
                  </p>
                  <h3 className="text-xl font-semibold text-ink">当前播客与语音配置</h3>
                </div>
                <SummaryRow
                  label="默认语音"
                  value={getOptionLabel(defaultVoiceOptions, defaultVoice)}
                />
                <SummaryRow
                  label="朗读模式"
                  value={getOptionLabel(readingModeOptions, readingMode)}
                />
                <SummaryRow
                  label="播客风格"
                  value={getOptionLabel(podcastStyleOptions, defaultPodcastStyle)}
                />
                <SummaryRow label="单集时长" value={`${podcastEpisodeDurationMinutes} 分钟`} />
                <SummaryRow
                  label="背景音乐"
                  value={getOptionLabel(podcastBackgroundMusicOptions, podcastBackgroundMusic)}
                />
                <SummaryRow
                  label="语音输入"
                  value={getOptionLabel(voiceInputLanguageOptions, voiceInputLanguage)}
                />
                <SummaryRow label="输出格式" value={podcastOutputFormat.toUpperCase()} />

                <div className="grid gap-3 pt-2">
                  <Button
                    onClick={handleSavePodcastSettings}
                    disabled={savingSection === 'podcast'}
                  >
                    {savingSection === 'podcast' ? '正在保存…' : '保存设置'}
                  </Button>
                  <Button variant="outline" onClick={handleRestorePodcastDefaults}>
                    恢复默认设置
                  </Button>
                </div>
              </Panel>
            </div>
          ) : null}

          {activeSection === 'general' ? (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr),320px]">
              <div className="space-y-6">
                <Panel
                  variant="paperCard"
                  className="rounded-[32px] border border-line-soft/80 p-6 md:p-8"
                >
                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">主题包</p>
                    <h3 className="text-xl font-semibold text-ink">
                      保留唯一官方主题，并让切换立即生效
                    </h3>
                    <p className="text-sm leading-6 text-ink-muted">
                      旧版实验主题已退役，当前只维护统一的纸感视觉系统。
                    </p>
                  </div>

                  <div className="mt-6 grid gap-4">
                    {appThemeOptions.map((theme) => {
                      const active = selectedTheme === theme.id
                      return (
                        <button
                          key={theme.id}
                          type="button"
                          onClick={() => handleThemeSelect(theme.id)}
                          data-testid={`theme-option-${theme.id}`}
                          className={cn(
                            'rounded-[28px] border p-5 text-left transition-colors',
                            active
                              ? 'border-ink/35 bg-ink/5 shadow-card'
                              : 'border-line-soft/80 bg-paper-card'
                          )}
                        >
                          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                            <div>
                              <p className="font-medium text-ink">{theme.label}</p>
                              <p className="mt-1 text-sm text-ink-muted">{theme.description}</p>
                            </div>
                            <div className="flex gap-2">
                              <span
                                className="h-8 w-8 rounded-full border border-line-soft"
                                style={{ backgroundColor: theme.preview.paper }}
                              />
                              <span
                                className="h-8 w-8 rounded-full border border-line-soft"
                                style={{ backgroundColor: theme.preview.ink }}
                              />
                              <span
                                className="h-8 w-8 rounded-full border border-line-soft"
                                style={{ backgroundColor: theme.preview.accent }}
                              />
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </Panel>

                <Panel
                  variant="paperCard"
                  className="rounded-[32px] border border-line-soft/80 p-6 md:p-8"
                >
                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                      语言与显示
                    </p>
                    <h3 className="text-xl font-semibold text-ink">设置界面语言与基础体验偏好</h3>
                  </div>

                  <div className="mt-6 grid gap-3 md:grid-cols-2">
                    {languageOptions.map((option) => (
                      <OptionChip
                        key={option.value}
                        active={selectedLanguage === option.value}
                        label={option.label}
                        onClick={() => setSelectedLanguage(option.value)}
                      />
                    ))}
                  </div>

                  <div className="mt-6 rounded-[24px] border border-line-soft/70 bg-paper-muted/55 p-4 text-sm text-ink-muted">
                    <p className="font-medium text-ink">保存提示</p>
                    <p className="mt-2">
                      主题切换会立即应用；语言和其他通用配置在点击“保存通用设置”后统一写入。
                    </p>
                  </div>
                </Panel>

                <Panel
                  variant="paperCard"
                  className="rounded-[32px] border border-line-soft/80 p-6 md:p-8"
                >
                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">关于</p>
                    <h3 className="text-xl font-semibold text-ink">当前界面基于新的官方纸感工作台</h3>
                  </div>

                  <div className="mt-6 rounded-[24px] border border-line-soft/70 bg-paper-muted/55 p-5 text-sm leading-6 text-ink-muted">
                    <p className="font-medium text-ink">学笺 XueJian</p>
                    <p className="mt-2">
                      以纸感工作台为统一视觉语言，连接 BYOK 模型配置、学习计划、播客生成与知识工作流。
                    </p>
                  </div>
                </Panel>
              </div>

              <div className="space-y-6 xl:sticky xl:top-6 xl:h-fit">
                <Panel
                  variant="paperCard"
                  className="rounded-[32px] border border-line-soft/80 p-6"
                >
                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                      数据管理
                    </p>
                    <h3 className="text-xl font-semibold text-ink">导出与缓存操作</h3>
                  </div>

                  <div className="mt-6 grid gap-3">
                    <Button
                      variant="outline"
                      onClick={handleExportLearningData}
                      disabled={isExportingLearningData}
                    >
                      {isExportingLearningData ? '正在导出学习数据…' : '导出学习数据'}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleExportCardsCsv}
                      disabled={isExportingCardsCsv}
                    >
                      {isExportingCardsCsv ? '正在导出卡片 CSV…' : '导出卡片 CSV'}
                    </Button>
                    <Button variant="ghost" onClick={handleClearUiCache} disabled={isClearingUiCache}>
                      {isClearingUiCache ? '正在清理缓存…' : '清理界面缓存'}
                    </Button>
                  </div>
                </Panel>

                <Panel
                  variant="paperCard"
                  className="rounded-[32px] border border-line-soft/80 p-6"
                >
                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                      通用摘要
                    </p>
                    <h3 className="text-xl font-semibold text-ink">当前系统状态</h3>
                  </div>
                  <SummaryRow
                    label="主题"
                    value={
                      appThemeOptions.find((theme) => theme.id === selectedTheme)?.label ??
                      selectedTheme
                    }
                  />
                  <SummaryRow
                    label="语言"
                    value={getOptionLabel(languageOptions, selectedLanguage)}
                  />
                  <SummaryRow label="模型配置" value={`${configuredApiCount} 个供应商配置`} />
                  <SummaryRow label="可用凭证" value={`${readyApiCount} 个已就绪`} />

                  <div className="grid gap-3 pt-2">
                    <Button
                      onClick={handleSaveGeneralSettings}
                      disabled={savingSection === 'general'}
                    >
                      {savingSection === 'general' ? '正在保存…' : '保存通用设置'}
                    </Button>
                    <Button variant="outline" onClick={handleRestoreGeneralDefaults}>
                      恢复默认设置
                    </Button>
                  </div>
                </Panel>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
