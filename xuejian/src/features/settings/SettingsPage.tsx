import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Panel } from '@/components/ui/Panel'
import { appThemeOptions } from '@/design-system/themes'
import { reportAppError } from '@/lib/appFeedback'
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
import { useAppUiStore } from '@/store'
import type { ApiConfig, ApiProvider, DiscoveredModel, WorkflowType } from '@/types'
import {
  detectProviderFromKey,
  getKeyStatusBadge,
  getProviderDefinition,
  getRecommendedModel,
  getStoredKeyPlaceholder,
  normalizeLegacyProvider,
  PROVIDER_DEFINITIONS,
  readLegacyAiConfig,
  validateApiKeyFormat,
  WORKFLOW_DEFINITIONS,
} from './byok'

type SettingsSectionId = 'ai' | 'learning' | 'podcast' | 'general'

type ThemeId = 'default' | 'comic-sketch' | 'contrast-paper'

type PodcastTtsProvider = 'auto' | 'openai' | 'edge_tts' | 'elevenlabs' | 'fish_audio'

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
  { value: 'elevenlabs', label: 'ElevenLabs' },
  { value: 'fish_audio', label: 'Fish Audio' },
]

const themeSwatchClassMap: Record<ThemeId, { paper: string; ink: string; accent: string }> = {
  default: {
    paper: 'bg-[#fbfbf9]',
    ink: 'bg-[#1a1a1a]',
    accent: 'bg-[#f8e16c]',
  },
  'comic-sketch': {
    paper: 'bg-[#f6eedf]',
    ink: 'bg-[#2d1d12]',
    accent: 'bg-[#d9804f]',
  },
  'contrast-paper': {
    paper: 'bg-[#ffffff]',
    ink: 'bg-[#111111]',
    accent: 'bg-[#111111]',
  },
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
            overBudget ? 'bg-red-500/70' : 'bg-ink/70'
          )}
        />
      </div>
      <p className={cn('text-xs', overBudget ? 'text-red-600' : 'text-ink-soft')}>
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
  const [migrationAttempted, setMigrationAttempted] = useState(false)
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
  const [selectedTheme, setSelectedTheme] = useState<ThemeId>('default')

  const usableConfigExists = hasUsableApiConfig(apiConfigs)
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
    if (forcedOnboarding) {
      setActiveSection('ai')
    }
  }, [forcedOnboarding])

  useEffect(() => {
    if (!settings) {
      return
    }

    setDailyNewCardLimit(settings.dailyNewCardLimit)
    setReviewTimeLimit(settings.reviewTimeLimit)
    setPodcastTtsProvider(settings.podcastTtsProvider)
    setPodcastOpenaiModel(settings.podcastOpenaiModel)
    setPodcastFishAudioEndpoint(settings.podcastFishAudioEndpoint ?? '')
    setPodcastOutputFormat(settings.podcastOutputFormat)
    setPodcastSkipReview(settings.podcastSkipReview)
    setPodcastVoiceOverrides(formatVoiceOverrides(settings.podcastVoiceOverrides))
    setPodcastMaxLlmTokens(settings.podcastMaxLlmTokens)
    setPodcastMaxTtsCharacters(settings.podcastMaxTtsCharacters)
    setPodcastMaxEstimatedCostUsd(settings.podcastMaxEstimatedCostUsd)
    setSelectedTheme(settings.theme)
  }, [settings])

  useEffect(() => {
    if (forcedOnboarding && !isApiConfigsLoading && apiConfigs.length === 0) {
      setEditorMode('create')
      setForm(buildConfigForm('openai'))
      setIsEditorOpen(true)
    }
  }, [apiConfigs.length, forcedOnboarding, isApiConfigsLoading])

  useEffect(() => {
    if (editorMode !== 'edit' || !form.id || editingConfig) {
      return
    }

    setEditorMode('create')
    setForm(buildConfigForm('openai'))
    setConnectionMessage(null)
    setConnectionTone('info')
    setProviderHint(null)
    setIsEditorOpen(forcedOnboarding)
  }, [editingConfig, editorMode, forcedOnboarding, form.id])

  useEffect(() => {
    if (migrationAttempted || isApiConfigsLoading || apiConfigs.length > 0) {
      return
    }

    const legacy = readLegacyAiConfig()
    setMigrationAttempted(true)
    if (!legacy) {
      return
    }

    const provider = normalizeLegacyProvider(legacy.provider)
    const definition = getProviderDefinition(provider)

    void (async () => {
      try {
        const created = await createApiConfigMutation.mutateAsync({
          provider,
          protocol: inferConfigProtocol(provider),
          authMode: 'api_key',
          name: `迁移自旧版 ${definition?.name ?? provider}`,
          displayName: definition?.name ?? null,
          model: legacy.model || getRecommendedModel(provider),
          baseUrl: legacy.baseUrl ?? definition?.defaultBaseUrl ?? null,
          budgetLimit: null,
          isDefault: true,
          isEnabled: true,
        })

        if (legacy.apiKey) {
          await storeApiKeyMutation.mutateAsync({
            configId: created.id,
            apiKey: legacy.apiKey,
          })
        }
      } catch (error) {
        reportAppError('设置', error, {
          title: '旧版模型配置迁移失败',
          fallbackDetail: '旧版 aiConfig 无法自动迁移，请手动创建新的供应商配置。',
        })
      }
    })()
  }, [
    apiConfigs.length,
    createApiConfigMutation,
    isApiConfigsLoading,
    migrationAttempted,
    storeApiKeyMutation,
  ])

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
      if (!(forcedOnboarding && apiConfigs.length === 0 && !form.apiKey.trim())) {
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

  const handleSaveAppSettings = async () => {
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
      return
    }

    try {
      await updateSettingsMutation.mutateAsync({
        dailyNewCardLimit,
        reviewTimeLimit,
        podcastTtsProvider,
        podcastOpenaiModel: podcastOpenaiModel.trim() || 'tts-1',
        podcastFishAudioEndpoint: podcastFishAudioEndpoint.trim() || null,
        podcastVoiceOverrides: parsedVoiceOverrides,
        podcastOutputFormat,
        podcastSkipReview,
        podcastMaxLlmTokens,
        podcastMaxTtsCharacters,
        podcastMaxEstimatedCostUsd,
      })
    } catch (error) {
      reportAppError('设置', error, {
        title: '应用设置保存失败',
        fallbackDetail: '请检查本地数据库和字段格式。',
      })
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

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">
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
              Settings Workspace
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">设置</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">
              {forcedOnboarding
                ? '首次进入前，请先配置至少一组可用的模型凭证。AI 模型子页会保持在前台，直到系统识别到可用凭证。'
                : '按子页拆分 BYOK、学习偏好、播客参数和通用设置，避免把所有配置塞进一张长表单。'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[240px,minmax(0,1fr)]">
        <Panel variant="panel" className="rounded-[30px] p-3 lg:sticky lg:top-6 lg:h-fit">
          <div className="space-y-2">
            {settingsSections.map((item) => {
              const active = item.id === activeSection
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  className={cn(
                    'w-full rounded-[22px] px-4 py-4 text-left transition-colors',
                    active
                      ? 'border-l-2 border-l-ink bg-ink/5 text-ink'
                      : 'text-ink-muted hover:bg-ink/3 hover:text-ink'
                  )}
                >
                  <p className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                    {item.eyebrow}
                  </p>
                  <p className="mt-1 font-medium">{item.title}</p>
                  <p className="mt-1 text-sm text-ink-muted">{item.description}</p>
                </button>
              )
            })}
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel variant="paperCard" className="rounded-[32px] p-6 md:p-8">
            <p className="text-[11px] uppercase tracking-[0.28em] text-ink-soft">
              {section.eyebrow}
            </p>
            <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-ink">{section.title}</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-muted">
                  {section.description}
                </p>
              </div>
              {activeSection === 'ai' ? (
                <Button
                  variant="outline"
                  onClick={() => resetEditor('openai')}
                  disabled={forcedOnboarding}
                  data-testid="settings-toggle-add-config"
                >
                  添加配置
                </Button>
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
                  {!forcedOnboarding ? (
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
                          apiKeyValidation.severity === 'error' && 'text-red-600',
                          apiKeyValidation.severity === 'success' && 'text-green-700',
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
                            connectionTone === 'success' && 'text-green-700',
                            connectionTone === 'error' && 'text-red-600',
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
                  {!forcedOnboarding ? (
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
            <Panel
              variant="paperCard"
              className="space-y-6 rounded-[32px] border border-line-soft/80 p-6 md:p-8"
            >
              <div className="space-y-2">
                <p className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">学习偏好</p>
                <h3 className="text-xl font-semibold text-ink">把节奏控制在每天都能坚持的范围</h3>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block space-y-2">
                  <span className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                    每日新卡片数量
                  </span>
                  <select
                    value={dailyNewCardLimit}
                    onChange={(event) => setDailyNewCardLimit(Number(event.target.value))}
                    title="每日新卡片数量"
                    className="h-11 w-full rounded-full border border-line-soft bg-paper-card px-4 text-sm text-ink"
                  >
                    {[10, 20, 30, 50].map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-2">
                  <span className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                    每日复习时长上限
                  </span>
                  <select
                    value={reviewTimeLimit}
                    onChange={(event) => setReviewTimeLimit(Number(event.target.value))}
                    title="每日复习时长上限"
                    className="h-11 w-full rounded-full border border-line-soft bg-paper-card px-4 text-sm text-ink"
                  >
                    {[15, 30, 45, 60].map((item) => (
                      <option key={item} value={item}>
                        {item} 分钟
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSaveAppSettings}>保存学习设置</Button>
              </div>
            </Panel>
          ) : null}

          {activeSection === 'podcast' ? (
            <Panel
              variant="paperCard"
              className="space-y-6 rounded-[32px] border border-line-soft/80 p-6 md:p-8"
            >
              <div className="space-y-2">
                <p className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">播客与语音</p>
                <h3 className="text-xl font-semibold text-ink">
                  把生成脚本、TTS 和预算集中在一个面板里
                </h3>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
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
                    Fish Audio Endpoint
                  </span>
                  <Input
                    value={podcastFishAudioEndpoint}
                    onChange={(event) => setPodcastFishAudioEndpoint(event.target.value)}
                    className="h-11 rounded-full px-4"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                    默认输出格式
                  </span>
                  <select
                    value={podcastOutputFormat}
                    onChange={(event) =>
                      setPodcastOutputFormat(event.target.value as PodcastOutputFormat)
                    }
                    title="默认输出格式"
                    className="h-11 w-full rounded-full border border-line-soft bg-paper-card px-4 text-sm text-ink"
                  >
                    <option value="mp3">MP3</option>
                    <option value="wav">WAV</option>
                  </select>
                </label>

                <label className="block space-y-2">
                  <span className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                    最大 LLM Tokens
                  </span>
                  <Input
                    value={String(podcastMaxLlmTokens)}
                    onChange={(event) => setPodcastMaxLlmTokens(Number(event.target.value) || 0)}
                    className="h-11 rounded-full px-4"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                    最大 TTS 字符数
                  </span>
                  <Input
                    value={String(podcastMaxTtsCharacters)}
                    onChange={(event) =>
                      setPodcastMaxTtsCharacters(Number(event.target.value) || 0)
                    }
                    className="h-11 rounded-full px-4"
                  />
                </label>

                <label className="block space-y-2 md:col-span-2">
                  <span className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                    脚本预算上限（USD）
                  </span>
                  <Input
                    value={String(podcastMaxEstimatedCostUsd)}
                    onChange={(event) =>
                      setPodcastMaxEstimatedCostUsd(Number(event.target.value) || 0)
                    }
                    className="h-11 rounded-full px-4"
                  />
                </label>
              </div>

              <label className="flex items-center gap-3 rounded-[22px] border border-line-soft/70 bg-paper-muted/60 px-4 py-3 text-sm text-ink-muted">
                <input
                  type="checkbox"
                  checked={podcastSkipReview}
                  onChange={(event) => setPodcastSkipReview(event.target.checked)}
                />
                跳过播客脚本人工审阅
              </label>

              <label className="block space-y-2">
                <span className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                  Voice Overrides (JSON)
                </span>
                <textarea
                  value={podcastVoiceOverrides}
                  onChange={(event) => setPodcastVoiceOverrides(event.target.value)}
                  className="min-h-[180px] w-full rounded-[24px] border border-line-soft bg-paper-card px-4 py-3 font-mono text-sm text-ink"
                />
              </label>

              <div className="flex justify-end">
                <Button onClick={handleSaveAppSettings}>保存播客设置</Button>
              </div>
            </Panel>
          ) : null}

          {activeSection === 'general' ? (
            <div className="space-y-6">
              <Panel
                variant="paperCard"
                className="rounded-[32px] border border-line-soft/80 p-6 md:p-8"
              >
                <div className="space-y-2">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">主题包</p>
                  <h3 className="text-xl font-semibold text-ink">
                    切换主题时立即预览，不额外增加保存步骤
                  </h3>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-3">
                  {appThemeOptions.map((theme) => {
                    const active = selectedTheme === theme.id
                    const swatchClasses = themeSwatchClassMap[theme.id]
                    return (
                      <button
                        key={theme.id}
                        type="button"
                        onClick={() => {
                          setSelectedTheme(theme.id)
                          updateSettingsMutation.mutate({ theme: theme.id })
                        }}
                        data-testid={`theme-option-${theme.id}`}
                        className={cn(
                          'rounded-[28px] border p-4 text-left transition-colors',
                          active ? 'border-ink/40 bg-ink/5' : 'border-line-soft/80 bg-paper-card'
                        )}
                      >
                        <p className="font-medium text-ink">{theme.label}</p>
                        <p className="mt-1 text-sm text-ink-muted">{theme.description}</p>
                        <div className="mt-4 flex gap-2">
                          <span
                            className={cn(
                              'h-6 w-6 rounded-full border border-line-soft',
                              swatchClasses.paper
                            )}
                          />
                          <span
                            className={cn(
                              'h-6 w-6 rounded-full border border-line-soft',
                              swatchClasses.ink
                            )}
                          />
                          <span
                            className={cn(
                              'h-6 w-6 rounded-full border border-line-soft',
                              swatchClasses.accent
                            )}
                          />
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
                  <p className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">数据管理</p>
                  <h3 className="text-xl font-semibold text-ink">
                    保持导出入口可见，但不把重操作塞进导航
                  </h3>
                </div>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Button variant="outline">导出学习数据</Button>
                  <Button variant="ghost">清除本地缓存</Button>
                </div>
                <div className="mt-6 rounded-[24px] border border-line-soft/70 bg-paper-muted/60 p-4 text-sm text-ink-muted">
                  <p className="font-medium text-ink">关于</p>
                  <p className="mt-2">学笺 XueJian · 纸感工作台 + BYOK 模型系统。</p>
                </div>
              </Panel>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
