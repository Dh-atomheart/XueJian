import { useEffect, useState, type ChangeEvent } from 'react'
import {
  BookOpen,
  Check,
  Edit3,
  HeartPulse,
  KeyRound,
  Loader2,
  Mic,
  Palette,
  Plus,
  Settings,
  Shield,
  Trash2,
  X,
} from 'lucide-react'
import { Badge, Button, Card, CardContent, InlineError, Input } from '@/components/ui'
import { cn } from '@/lib/utils'
import type {
  ApiAuthMode,
  ApiConfig,
  ApiProvider,
  AppSettings,
  ModelProfile,
  WorkflowType,
} from '@/types'

export interface SettingsWorkflowAssignment {
  workflowType: WorkflowType
  label: string
  description: string
  modelProfileId: string | null
}

export type SettingsKeySaveStatus = 'saving' | 'saved' | 'failed'
export type SettingsConnectionStatus = {
  status: 'testing' | 'success' | 'error'
  message?: string
}
export type SettingsWorkflowSaveStatus = 'saving' | 'saved' | 'failed'

export interface SettingsPageProps {
  activeTab: 'ai' | 'learning' | 'podcast' | 'general'
  apiConfigs: ApiConfig[]
  modelProfiles: ModelProfile[]
  workflowAssignments: SettingsWorkflowAssignment[]
  forcedOnboarding?: boolean
  learningSettings: Pick<AppSettings, 'dailyNewCardLimit' | 'reviewTimeLimit'>
  podcastSettings: Pick<
    AppSettings,
    'podcastTtsProvider' | 'podcastOpenaiModel' | 'podcastGoogleTtsModel' | 'podcastOutputFormat'
  >
  generalSettings: Pick<AppSettings, 'language' | 'theme'>
  draftApiKey: string
  selectedApiConfigId: string | null
  isTestingConnection?: boolean
  testResultMessage?: string | null
  testResultTone?: 'success' | 'error' | null
  keySaveStatusByConfigId?: Record<string, SettingsKeySaveStatus>
  connectionStatusByConfigId?: Record<string, SettingsConnectionStatus>
  workflowSaveStatusByWorkflowType?: Record<string, SettingsWorkflowSaveStatus>
  onTabChange: (tab: SettingsPageProps['activeTab']) => void
  onDraftApiKeyChange: (value: string) => void
  onSelectedApiConfigChange: (configId: string) => void
  onTestConnection: () => void
  onTestApiConfigConnection: (configId: string) => void
  onSaveApiKey: () => void
  onCreateApiConfig: (draft: NewApiConfigDraft) => Promise<ApiConfig>
  onLoadApiKey: (configId: string) => Promise<string>
  onSaveApiConfigEdits: (configId: string, patch: ProviderEditDraft) => Promise<void>
  onDeleteApiConfig: (configId: string) => void
  onDeleteApiKey: (configId: string) => Promise<void>
  onCreateModelProfile: (draft: {
    apiConfigId: string
    modelId: string
    displayName: string | null
    capabilitiesJson: string | null
    isEnabled: boolean
    isDefaultForConnection: boolean
  }) => Promise<ModelProfile>
  onUpdateModelProfile: (
    id: string,
    patch: Partial<{
      modelId: string
      displayName: string | null
      capabilitiesJson: string | null
      isEnabled: boolean
      isDefaultForConnection: boolean
    }>
  ) => Promise<void>
  onDeleteModelProfile: (id: string) => Promise<void>
  deletingApiConfigId?: string
  isCreatingApiConfig?: boolean
  isDeletingApiKey?: boolean
  onSetDefaultApiConfig: (configId: string) => void
  onAssignWorkflow: (workflowType: WorkflowType, modelProfileId: string) => void
  onLearningSettingsChange: (patch: Partial<SettingsPageProps['learningSettings']>) => void
  onPodcastSettingsChange: (patch: Partial<SettingsPageProps['podcastSettings']>) => void
  onGeneralSettingsChange: (patch: Partial<SettingsPageProps['generalSettings']>) => void
  onSaveLearning: () => void
  onSavePodcast: () => void
  onSaveGeneral: () => void
}

type ApiConfigDraft = Omit<
  ApiConfig,
  'id' | 'createdAt' | 'hasStoredCredential' | 'hasStoredKey' | 'keyVerifiedAt' | 'keyStatus'
>

export type NewApiConfigDraft = ApiConfigDraft & { apiKey: string }

export interface ProviderEditDraft {
  name: string
  displayName: string
  baseUrl: string | null
  model: string | null
  apiKey: string
}

interface ProviderTemplate {
  id: ApiProvider
  name: string
  kind: 'builtin' | 'custom'
  protocol: ApiConfig['protocol']
  authMode: ApiAuthMode
  defaultBaseUrl: string | null
  defaultModel: string | null
  requiresBaseUrl: boolean
  description: string
}

const PROVIDER_TEMPLATES: ProviderTemplate[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    kind: 'builtin',
    protocol: 'native',
    authMode: 'api_key',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    requiresBaseUrl: false,
    description: '官方 OpenAI API，用户提供 API Key。',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    kind: 'builtin',
    protocol: 'native',
    authMode: 'api_key',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-20250514',
    requiresBaseUrl: false,
    description: '官方 Claude API，用户提供 API Key。',
  },
  {
    id: 'google',
    name: 'Google',
    kind: 'builtin',
    protocol: 'native',
    authMode: 'api_key',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.5-pro',
    requiresBaseUrl: false,
    description: '官方 Gemini API，用户提供 API Key。',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    kind: 'builtin',
    protocol: 'openai-compatible',
    authMode: 'api_key',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    requiresBaseUrl: false,
    description: 'DeepSeek OpenAI-compatible API，用户提供 API Key。',
  },
  {
    id: 'custom_openai',
    name: 'OpenAI-Compatible',
    kind: 'custom',
    protocol: 'openai-compatible',
    authMode: 'api_key',
    defaultBaseUrl: '',
    defaultModel: '',
    requiresBaseUrl: true,
    description: '兼容 OpenAI Chat Completions 协议的任意服务。',
  },
  {
    id: 'custom_anthropic',
    name: 'Anthropic-Compatible',
    kind: 'custom',
    protocol: 'native',
    authMode: 'api_key',
    defaultBaseUrl: '',
    defaultModel: '',
    requiresBaseUrl: true,
    description: '兼容 Anthropic Messages 协议的私有或代理端点。',
  },
  {
    id: 'custom_google',
    name: 'Google-Compatible',
    kind: 'custom',
    protocol: 'native',
    authMode: 'api_key',
    defaultBaseUrl: '',
    defaultModel: '',
    requiresBaseUrl: true,
    description: '兼容 Google Generative Language 协议的服务。',
  },
]

function buildInitialDraft(template: ProviderTemplate) {
  return {
    provider: template.id,
    name: template.kind === 'builtin' ? `${template.name} Primary` : template.name,
    displayName: template.kind === 'builtin' ? `${template.name} Primary` : template.name,
    baseUrl: template.defaultBaseUrl ?? '',
    model: template.defaultModel ?? '',
    apiKey: '',
  }
}

function PageHeader() {
  return (
    <div className="mb-6">
      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">SETTINGS</p>
      <h1 className="mt-1 text-2xl font-medium text-foreground" data-testid="app-shell-page-title">
        设置
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">恢复参考编码中的设置导航、Provider 卡片和分区式布局，同时保留真实 BYOK 与工作流分配能力。</p>
    </div>
  )
}

function SettingsNav({
  activeTab,
  onTabChange,
}: {
  activeTab: SettingsPageProps['activeTab']
  onTabChange: SettingsPageProps['onTabChange']
}) {
  const items = [
    { id: 'ai', icon: Settings, label: 'AI 模型' },
    { id: 'learning', icon: BookOpen, label: '学习偏好' },
    { id: 'podcast', icon: Mic, label: '播客与语音' },
    { id: 'general', icon: Palette, label: '通用' },
  ] as const

  return (
    <div className="w-48 shrink-0 space-y-1">
      {items.map((item) => {
        const Icon = item.icon
        return (
          <button
            key={item.id}
            aria-label={item.id === 'podcast' ? 'Podcast' : item.label}
            onClick={() => onTabChange(item.id)}
            className={cn(
              'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              activeTab === item.id ? 'bg-foreground/5 text-foreground' : 'text-muted-foreground hover:bg-foreground/[0.03] hover:text-foreground'
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

function ProviderCard({
  config,
  selected,
  onSelect,
  onSetDefault,
}: {
  config: ApiConfig
  selected: boolean
  onSelect: () => void
  onSetDefault: () => void
}) {
  const providerLetter = config.provider[0]?.toUpperCase() ?? '?'
  return (
    <Card className={cn('cursor-pointer border-border/50 bg-card transition-all', selected && 'ring-1 ring-foreground/15')} onClick={onSelect}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted/50 text-sm font-semibold text-foreground">{providerLetter}</div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground">{config.displayName?.trim() || config.name}</span>
                {config.hasStoredCredential ? (
                  <Badge variant="secondary" className="rounded-md bg-chart-1/15 text-chart-1">
                    已连接
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="rounded-md bg-muted text-muted-foreground">
                    未连接
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{config.model ?? '未设置模型'}</p>
            </div>
          </div>
          {!config.isDefault ? (
            <Button variant="ghost" size="sm" className="h-8 rounded-lg px-2 text-xs" onClick={(e) => { e.stopPropagation(); onSetDefault() }}>
              设为默认
            </Button>
          ) : (
            <Badge variant="outline">默认</Badge>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function AiModelSettings(props: Pick<SettingsPageProps, 'apiConfigs' | 'draftApiKey' | 'selectedApiConfigId' | 'isTestingConnection' | 'testResultMessage' | 'testResultTone' | 'keySaveStatusByConfigId' | 'workflowAssignments' | 'workflowSaveStatusByWorkflowType' | 'onDraftApiKeyChange' | 'onSelectedApiConfigChange' | 'onTestConnection' | 'onSaveApiKey' | 'onSetDefaultApiConfig' | 'onAssignWorkflow'>) {
  const selectedConfig = props.apiConfigs.find((config) => config.id === props.selectedApiConfigId) ?? props.apiConfigs[0] ?? null
  return (
    <div className="space-y-6">
      <Card className="border-border/50 bg-card">
        <CardContent className="p-6" data-testid="settings-workflow-assignments">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-medium text-foreground">BYOK 供应商配置</h3>
              <p className="mt-1 text-sm text-muted-foreground">继续使用真实 api config 查询和存储，不引入样稿里的 mock store。</p>
            </div>
            <Button variant="outline" size="sm" className="gap-2 rounded-lg">
              <Plus className="h-4 w-4" />
              新增供应商
            </Button>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
            {props.apiConfigs.map((config) => (
              <ProviderCard
                key={config.id}
                config={config}
                selected={selectedConfig?.id === config.id}
                onSelect={() => props.onSelectedApiConfigChange(config.id)}
                onSetDefault={() => props.onSetDefaultApiConfig(config.id)}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card">
        <CardContent className="p-6">
          <h4 className="text-sm font-medium text-foreground">连接测试与 Key 存储</h4>
          <div className="mt-4 flex gap-3">
            <Input
              type="password"
              placeholder={selectedConfig ? `为 ${selectedConfig.name} 输入 API Key` : '选择一个供应商后输入 API Key'}
              value={props.draftApiKey}
              onChange={(event: ChangeEvent<HTMLInputElement>) => props.onDraftApiKeyChange(event.target.value)}
              disabled={!selectedConfig}
              className="h-10 rounded-lg"
            />
            <Button variant="outline" className="gap-2 rounded-lg" onClick={props.onTestConnection} disabled={!selectedConfig || !props.draftApiKey.trim() || props.isTestingConnection}>
              {props.isTestingConnection ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
              测试连接
            </Button>
            <Button className="gap-2 rounded-lg" onClick={props.onSaveApiKey} disabled={!selectedConfig || !props.draftApiKey.trim()}>
              <KeyRound className="h-4 w-4" />
              保存 Key
            </Button>
          </div>
          {props.testResultMessage ? (
            <div className="mt-4">
              <InlineError message={props.testResultMessage} />
            </div>
          ) : null}
        </CardContent>
      </Card>

      {props.workflowAssignments.length > 0 ? (
      <Card className="border-border/50 bg-card">
        <CardContent className="p-6">
          <h4 className="text-sm font-medium text-foreground">工作流模型分配</h4>
          <p className="mt-1 text-xs text-muted-foreground">按工作流绑定当前真实配置。</p>
          <div className="mt-4 space-y-3">
            {props.workflowAssignments.map((assignment) => (
              <div key={assignment.workflowType} className="flex items-center justify-between border-b border-border/30 py-3 last:border-0">
                <div>
                  <p className="text-sm font-medium text-foreground">{assignment.label}</p>
                  <p className="text-xs text-muted-foreground">{assignment.description}</p>
                  {props.workflowSaveStatusByWorkflowType?.[assignment.workflowType] ? (
                    <p
                      className={cn(
                        'mt-1 text-xs',
                        props.workflowSaveStatusByWorkflowType[assignment.workflowType] === 'failed'
                          ? 'text-destructive'
                          : 'text-muted-foreground'
                      )}
                    >
                      {props.workflowSaveStatusByWorkflowType[assignment.workflowType] === 'saving'
                        ? '保存中...'
                        : props.workflowSaveStatusByWorkflowType[assignment.workflowType] === 'saved'
                          ? '已保存'
                          : '保存失败'}
                    </p>
                  ) : null}
                </div>
                <select
                  value={assignment.modelProfileId ?? ''}
                  onChange={(event) => props.onAssignWorkflow(assignment.workflowType, event.target.value)}
                  className="h-9 min-w-52 rounded-lg border border-border/50 bg-background px-3 text-sm text-foreground"
                >
                  <option value="">未分配</option>
                  {props.apiConfigs.map((config) => (
                    <option
                      key={config.id}
                      value={config.id}
                      disabled={
                        props.keySaveStatusByConfigId?.[config.id] === 'saving' ||
                        (!config.hasStoredCredential &&
                          props.keySaveStatusByConfigId?.[config.id] !== 'saved' &&
                          config.authMode !== 'adc')
                      }
                    >
                      {config.displayName?.trim() || config.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      ) : null}
    </div>
  )
}

export function EnhancedProviderCard({
  config,
  selected,
  disabled,
  keySaveStatus,
  connectionStatus,
  onSelect,
  onSetDefault,
  onTestConnection,
  onManageKey,
  onDelete,
}: {
  config: ApiConfig
  selected: boolean
  disabled?: boolean
  keySaveStatus?: SettingsKeySaveStatus
  connectionStatus?: SettingsConnectionStatus
  onSelect: () => void
  onSetDefault: () => void
  onTestConnection: () => void
  onManageKey: () => void
  onDelete: () => void
}) {
  const providerLetter = config.provider[0]?.toUpperCase() ?? '?'
  const title = config.displayName?.trim() || config.name
  const canTestConnection =
    config.hasStoredCredential || keySaveStatus === 'saved' || config.authMode === 'adc'
  const isTestingConnection = connectionStatus?.status === 'testing'

  return (
    <Card
      className={cn(
        'cursor-pointer border-border/50 bg-card transition-all',
        selected && 'ring-1 ring-foreground/15',
        disabled && 'opacity-60'
      )}
      onClick={disabled ? undefined : onSelect}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted/50 text-sm font-semibold text-foreground">
              {providerLetter}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate font-medium text-foreground">{title}</span>
                <Badge
                  variant="secondary"
                  className={cn(
                    'rounded-md',
                    config.hasStoredCredential
                      ? 'bg-chart-1/15 text-chart-1'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {config.hasStoredCredential ? '已连接' : '未连接'}
                </Badge>
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {config.model ?? '未设置模型'}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
          {config.isDefault ? (
            <Badge variant="outline">默认</Badge>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 rounded-lg px-2 text-xs"
              disabled={disabled}
              onClick={(event) => {
                event.stopPropagation()
                onSetDefault()
              }}
            >
              设为默认
            </Button>
          )}
            <Button
              variant="ghost"
              size="icon-sm"
              className={cn(
                'rounded-lg text-muted-foreground',
                connectionStatus?.status === 'success' && 'text-chart-1',
                connectionStatus?.status === 'error' && 'text-destructive'
              )}
              aria-label={`测试 ${title} 连接`}
              title="测试连接"
              data-testid={`settings-test-config-${config.id}`}
              disabled={disabled || isTestingConnection || keySaveStatus === 'saving' || !canTestConnection}
              onClick={(event) => {
                event.stopPropagation()
                onTestConnection()
              }}
            >
              {isTestingConnection ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <HeartPulse className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
        {keySaveStatus || connectionStatus?.message ? (
          <div className="mt-3 space-y-1 text-xs">
            {keySaveStatus === 'saving' ? (
              <p className="text-muted-foreground">API Key 保存中...</p>
            ) : null}
            {keySaveStatus === 'failed' ? (
              <p className="text-destructive">API Key 保存失败，请重新保存。</p>
            ) : null}
            {connectionStatus?.message ? (
              <p
                className={cn(
                  connectionStatus.status === 'success' ? 'text-chart-1' : 'text-destructive'
                )}
              >
                {connectionStatus.message}
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="mt-4 flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-lg px-2 text-xs"
            data-testid={`settings-manage-key-${config.id}`}
            disabled={disabled}
            onClick={(event) => {
              event.stopPropagation()
              onManageKey()
            }}
          >
            <KeyRound className="h-3.5 w-3.5" />
            管理 Key
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 rounded-lg px-2 text-xs text-muted-foreground"
            data-testid={`settings-delete-config-${config.id}`}
            disabled={disabled}
            onClick={(event) => {
              event.stopPropagation()
              onDelete()
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            删除
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function EditableProviderCard({
  config,
  selected,
  disabled,
  keySaveStatus,
  connectionStatus,
  onSelect,
  onSetDefault,
  onTestConnection,
  onLoadApiKey,
  onSaveEdits,
  onDelete,
}: {
  config: ApiConfig
  selected: boolean
  disabled?: boolean
  keySaveStatus?: SettingsKeySaveStatus
  connectionStatus?: SettingsConnectionStatus
  onSelect: () => void
  onSetDefault: () => void
  onTestConnection: () => void
  onLoadApiKey: () => Promise<string>
  onSaveEdits: (patch: ProviderEditDraft) => Promise<void>
  onDelete: () => void
}) {
  const providerLetter = config.provider[0]?.toUpperCase() ?? '?'
  const title = config.displayName?.trim() || config.name
  const canUseCredential =
    config.hasStoredCredential || keySaveStatus === 'saved' || config.authMode === 'adc'
  const isTestingConnection = connectionStatus?.status === 'testing'
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState({
    name: config.name,
    displayName: config.displayName?.trim() || config.name,
    model: config.model ?? '',
    baseUrl: config.baseUrl ?? '',
    apiKey: '',
  })
  const [isLoadingKey, setIsLoadingKey] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  useEffect(() => {
    if (isEditing) return
    setDraft({
      name: config.name,
      displayName: config.displayName?.trim() || config.name,
      model: config.model ?? '',
      baseUrl: config.baseUrl ?? '',
      apiKey: '',
    })
  }, [config, isEditing])

  const openEditor = () => {
    setIsEditing(true)
    setEditError(null)
    setDraft({
      name: config.name,
      displayName: config.displayName?.trim() || config.name,
      model: config.model ?? '',
      baseUrl: config.baseUrl ?? '',
      apiKey: '',
    })
    if (config.hasStoredKey || keySaveStatus === 'saved') {
      setIsLoadingKey(true)
      void onLoadApiKey()
        .then((apiKey) => setDraft((state) => ({ ...state, apiKey })))
        .catch((error) => {
          setEditError(error instanceof Error ? error.message : 'API Key 加载失败')
        })
        .finally(() => setIsLoadingKey(false))
    }
  }

  const saveEdits = () => {
    const nextName = draft.name.trim()
    const nextDisplayName = draft.displayName.trim() || nextName
    const nextApiKey = draft.apiKey.trim()
    if (!nextName || !nextApiKey) {
      setEditError('配置名称和 API Key 不能为空。')
      return
    }
    setIsSaving(true)
    setEditError(null)
    void onSaveEdits({
      name: nextName,
      displayName: nextDisplayName,
      model: draft.model.trim() || null,
      baseUrl: draft.baseUrl.trim() || null,
      apiKey: nextApiKey,
    })
      .then(() => setIsEditing(false))
      .catch((error) => {
        setEditError(error instanceof Error ? error.message : '供应商保存失败')
      })
      .finally(() => setIsSaving(false))
  }

  return (
    <div className="[perspective:1200px]">
      <Card
        className={cn(
          'relative border-border/50 bg-card transition-all duration-300 [transform-style:preserve-3d]',
          !isEditing && 'cursor-pointer',
          selected && 'ring-1 ring-foreground/15',
          disabled && 'opacity-60',
          isEditing && '[transform:rotateY(180deg)]'
        )}
        onClick={disabled || isEditing ? undefined : onSelect}
      >
        <CardContent
          className={cn(
            'min-h-[246px] p-4 [backface-visibility:hidden]',
            isEditing && 'absolute inset-0'
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted/50 text-sm font-semibold text-foreground">
                {providerLetter}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium text-foreground">{title}</span>
                  <Badge
                    variant="secondary"
                    className={cn(
                      'rounded-md',
                      canUseCredential ? 'bg-chart-1/15 text-chart-1' : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {canUseCredential ? '已保存 Key' : '未保存 Key'}
                  </Badge>
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {config.model ?? '未配置模型'}
                </p>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {config.baseUrl ?? '默认 Base URL'}
                </p>
              </div>
            </div>
            {config.isDefault ? (
              <Badge variant="outline">默认</Badge>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 rounded-lg px-2 text-xs"
                disabled={disabled}
                onClick={(event) => {
                  event.stopPropagation()
                  onSetDefault()
                }}
              >
                设为默认
              </Button>
            )}
          </div>

          {keySaveStatus || connectionStatus?.message ? (
            <div className="mt-3 space-y-1 text-xs">
              {keySaveStatus === 'saving' ? (
                <p className="text-muted-foreground">API Key 正在保存...</p>
              ) : null}
              {keySaveStatus === 'failed' ? (
                <p className="text-destructive">API Key 保存失败，请重新编辑保存。</p>
              ) : null}
              {connectionStatus?.message ? (
                <p
                  className={cn(
                    connectionStatus.status === 'success' ? 'text-chart-1' : 'text-destructive'
                  )}
                >
                  {connectionStatus.message}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="absolute inset-x-4 bottom-4 flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-lg px-2 text-xs"
              data-testid={`settings-manage-key-${config.id}`}
              disabled={disabled}
              onClick={(event) => {
                event.stopPropagation()
                openEditor()
              }}
            >
              <Edit3 className="h-3.5 w-3.5" />
              编辑
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className={cn(
                'rounded-lg text-muted-foreground',
                connectionStatus?.status === 'success' && 'text-chart-1',
                connectionStatus?.status === 'error' && 'text-destructive'
              )}
              aria-label={`测试 ${title} 连接`}
              title="测试连接"
              data-testid={`settings-test-config-${config.id}`}
              disabled={disabled || isTestingConnection || keySaveStatus === 'saving' || !canUseCredential}
              onClick={(event) => {
                event.stopPropagation()
                onTestConnection()
              }}
            >
              {isTestingConnection ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <HeartPulse className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-8 rounded-lg px-2 text-xs text-muted-foreground"
              data-testid={`settings-delete-config-${config.id}`}
              disabled={disabled}
              onClick={(event) => {
                event.stopPropagation()
                onDelete()
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              删除
            </Button>
          </div>
        </CardContent>

        <CardContent
          className={cn(
            'p-4 [backface-visibility:hidden] [transform:rotateY(180deg)]',
            !isEditing && 'absolute inset-0'
          )}
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-foreground">编辑供应商</p>
              <Button
                variant="ghost"
                size="icon-sm"
                className="rounded-lg"
                onClick={() => {
                  setIsEditing(false)
                  setEditError(null)
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <Input
              data-testid={`settings-edit-config-name-${config.id}`}
              value={draft.displayName}
              onChange={(event) =>
                setDraft((state) => ({
                  ...state,
                  displayName: event.target.value,
                  name: event.target.value,
                }))
              }
              placeholder="配置名称"
              className="h-9 rounded-lg"
            />
            <Input
              data-testid={`settings-edit-config-model-${config.id}`}
              value={draft.model}
              onChange={(event) => setDraft((state) => ({ ...state, model: event.target.value }))}
              placeholder="模型"
              className="h-9 rounded-lg"
            />
            <Input
              data-testid={`settings-edit-config-base-url-${config.id}`}
              value={draft.baseUrl}
              onChange={(event) => setDraft((state) => ({ ...state, baseUrl: event.target.value }))}
              placeholder="Base URL"
              className="h-9 rounded-lg"
            />
            <Input
              data-testid={`settings-edit-config-key-${config.id}`}
              type="text"
              value={draft.apiKey}
              onChange={(event) => setDraft((state) => ({ ...state, apiKey: event.target.value }))}
              placeholder={isLoadingKey ? 'API Key 加载中...' : 'API Key'}
              disabled={isLoadingKey}
              className="h-9 rounded-lg"
            />
            {editError ? <InlineError message={editError} /> : null}
            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="ghost"
                size="sm"
                className="rounded-lg"
                onClick={() => {
                  setIsEditing(false)
                  setEditError(null)
                }}
              >
                取消
              </Button>
              <Button
                data-testid={`settings-edit-save-${config.id}`}
                size="sm"
                className="rounded-lg"
                disabled={isLoadingKey || isSaving || keySaveStatus === 'saving'}
                onClick={saveEdits}
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                保存
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function AddProviderForm({
  onCreateApiConfig,
  isCreating,
}: {
  onCreateApiConfig: SettingsPageProps['onCreateApiConfig']
  isCreating?: boolean
}) {
  const [selectedProvider, setSelectedProvider] = useState<ApiProvider>('openai')
  const selectedTemplate =
    PROVIDER_TEMPLATES.find((template) => template.id === selectedProvider) ?? PROVIDER_TEMPLATES[0]
  const [draft, setDraft] = useState(buildInitialDraft(selectedTemplate))
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    setDraft(buildInitialDraft(selectedTemplate))
    setErrorMessage(null)
  }, [selectedTemplate])

  const isBaseUrlValid = !selectedTemplate.requiresBaseUrl || draft.baseUrl.trim().length > 0
  const canSave = draft.name.trim().length > 0 && draft.apiKey.trim().length > 0 && isBaseUrlValid

  return (
    <div
      data-testid="settings-add-config-form"
      className="mt-5 rounded-lg border border-border/60 bg-background/60 p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-medium text-foreground">选择供应商模板</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            内置供应商不会自动创建配置，保存后才会加入列表。
          </p>
        </div>
        <Badge variant="outline">{selectedTemplate.kind === 'builtin' ? '内置' : '自定义'}</Badge>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
        {PROVIDER_TEMPLATES.map((template) => (
          <button
            key={template.id}
            type="button"
            className={cn(
              'rounded-lg border border-border/60 bg-card px-3 py-3 text-left transition-colors hover:bg-muted/40',
              selectedProvider === template.id && 'border-foreground/30 bg-foreground/[0.04]'
            )}
            onClick={() => setSelectedProvider(template.id)}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-foreground">{template.name}</span>
              {selectedProvider === template.id ? <Check className="h-4 w-4 text-chart-1" /> : null}
            </div>
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {template.description}
            </p>
          </button>
        ))}
      </div>

      {selectedTemplate.requiresBaseUrl ? (
        <p className="mt-3 text-xs text-muted-foreground">此供应商必须填写 Base URL。</p>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">配置名称</span>
          <Input
            data-testid="settings-add-config-name"
            value={draft.name}
            onChange={(event) =>
              setDraft((state) => ({ ...state, name: event.target.value, displayName: event.target.value }))
            }
            className="h-10 rounded-lg"
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">模型</span>
          <Input
            value={draft.model}
            onChange={(event) => setDraft((state) => ({ ...state, model: event.target.value }))}
            placeholder="例如 gpt-4o 或 claude-sonnet-4"
            className="h-10 rounded-lg"
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Base URL</span>
          <Input
            data-testid="settings-add-config-base-url"
            value={draft.baseUrl}
            onChange={(event) => setDraft((state) => ({ ...state, baseUrl: event.target.value }))}
            placeholder="https://api.example.com/v1"
            className="h-10 rounded-lg"
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">API Key</span>
          <Input
            data-testid="settings-add-config-key"
            type="password"
            value={draft.apiKey}
            onChange={(event) => setDraft((state) => ({ ...state, apiKey: event.target.value }))}
            placeholder="保存到本地密钥库"
            className="h-10 rounded-lg"
          />
        </label>
      </div>

      {errorMessage ? (
        <div className="mt-4">
          <InlineError message={errorMessage} />
        </div>
      ) : null}

      <div className="mt-4 flex justify-end">
        <Button
          data-testid="settings-save-config"
          className="rounded-lg"
          disabled={!canSave || isCreating}
          onClick={() => {
            setErrorMessage(null)
            void onCreateApiConfig({
              provider: selectedProvider,
              protocol: selectedTemplate.protocol,
              authMode: selectedTemplate.authMode,
              name: draft.name.trim(),
              displayName: draft.displayName.trim() || draft.name.trim(),
              baseUrl: draft.baseUrl.trim() || null,
              model: draft.model.trim() || null,
              budgetLimit: null,
              isDefault: false,
              isEnabled: true,
              apiKey: draft.apiKey.trim(),
            }).catch((error) => {
              setErrorMessage(error instanceof Error ? error.message : '供应商配置保存失败')
            })
          }}
        >
          {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          保存供应商
        </Button>
      </div>
    </div>
  )
}

function KeyManagementPanel({
  config,
  draftApiKey,
  isDeletingApiKey,
  onDraftApiKeyChange,
  onSaveApiKey,
  onDeleteApiKey,
  onClose,
}: {
  config: ApiConfig
  draftApiKey: string
  isDeletingApiKey?: boolean
  onDraftApiKeyChange: SettingsPageProps['onDraftApiKeyChange']
  onSaveApiKey: SettingsPageProps['onSaveApiKey']
  onDeleteApiKey: SettingsPageProps['onDeleteApiKey']
  onClose: () => void
}) {
  return (
    <Card className="border-border/50 bg-card">
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h4 className="text-sm font-medium text-foreground">管理 API Key</h4>
            <p className="mt-1 text-xs text-muted-foreground">
              {config.displayName?.trim() || config.name}
            </p>
          </div>
          <Button variant="ghost" size="icon-sm" className="rounded-lg" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div data-testid="settings-update-config-form" className="mt-4 flex gap-3">
          <Input
            data-testid="settings-update-config-key"
            type="password"
            value={draftApiKey}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onDraftApiKeyChange(event.target.value)}
            placeholder="输入新的 API Key"
            className="h-10 rounded-lg"
          />
          <Button
            data-testid="settings-update-save-key"
            className="rounded-lg"
            disabled={!draftApiKey.trim()}
            onClick={onSaveApiKey}
          >
            <KeyRound className="h-4 w-4" />
            保存 Key
          </Button>
          <Button
            data-testid="settings-delete-key"
            variant="outline"
            className="rounded-lg"
            disabled={isDeletingApiKey || !config.hasStoredKey}
            onClick={() => {
              if (window.confirm('确定删除这个供应商的 API Key？')) {
                void onDeleteApiKey(config.id)
              }
            }}
          >
            {isDeletingApiKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            删除 Key
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function EnhancedAiModelSettings(
  props: Pick<
    SettingsPageProps,
    | 'apiConfigs'
    | 'modelProfiles'
    | 'draftApiKey'
    | 'selectedApiConfigId'
    | 'forcedOnboarding'
    | 'isTestingConnection'
    | 'testResultMessage'
    | 'testResultTone'
    | 'keySaveStatusByConfigId'
    | 'connectionStatusByConfigId'
    | 'workflowSaveStatusByWorkflowType'
    | 'workflowAssignments'
    | 'onDraftApiKeyChange'
    | 'onSelectedApiConfigChange'
    | 'onTestConnection'
    | 'onTestApiConfigConnection'
    | 'onSaveApiKey'
    | 'onCreateApiConfig'
    | 'onLoadApiKey'
    | 'onSaveApiConfigEdits'
    | 'onDeleteApiConfig'
    | 'onDeleteApiKey'
    | 'onCreateModelProfile'
    | 'onUpdateModelProfile'
    | 'onDeleteModelProfile'
    | 'deletingApiConfigId'
    | 'isCreatingApiConfig'
    | 'isDeletingApiKey'
    | 'onSetDefaultApiConfig'
    | 'onAssignWorkflow'
  >
) {
  const [isAddingConfig, setIsAddingConfig] = useState(Boolean(props.forcedOnboarding))
  const [managedConfigId, setManagedConfigId] = useState<string | null>(null)
  const [newModelId, setNewModelId] = useState('')
  const [newModelDisplayName, setNewModelDisplayName] = useState('')
  const [isCreatingModelProfile, setIsCreatingModelProfile] = useState(false)
  const [createModelProfileError, setCreateModelProfileError] = useState<string | null>(null)
  const selectedConfig =
    props.apiConfigs.find((config) => config.id === props.selectedApiConfigId) ?? props.apiConfigs[0] ?? null
  const managedConfig = props.apiConfigs.find((config) => config.id === managedConfigId) ?? null
  const selectedProfiles = props.modelProfiles.filter(
    (profile) => profile.apiConfigId === selectedConfig?.id
  )

  useEffect(() => {
    if (props.forcedOnboarding) {
      setIsAddingConfig(true)
    }
  }, [props.forcedOnboarding])

  useEffect(() => {
    if (managedConfigId && !props.apiConfigs.some((config) => config.id === managedConfigId)) {
      setManagedConfigId(null)
    }
  }, [managedConfigId, props.apiConfigs])

  useEffect(() => {
    setNewModelId('')
    setNewModelDisplayName('')
    setCreateModelProfileError(null)
  }, [selectedConfig?.id])

  const hasConfigs = props.apiConfigs.length > 0
  const showSetupCallout = props.forcedOnboarding || !hasConfigs
  const availableWorkflowProfiles = props.modelProfiles.filter((profile) => {
    const config = profile.apiConfig ?? props.apiConfigs.find((item) => item.id === profile.apiConfigId)
    if (!profile.isEnabled || !config) {
      return false
    }
    if (props.keySaveStatusByConfigId?.[config.id] === 'saving') {
      return false
    }
    return config.hasStoredCredential || config.authMode === 'adc'
  })

  if (true) {
    return (
      <div className="space-y-6">
        <Card className="border-border/50 bg-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-medium text-foreground">BYOK 连接</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  连接负责 Provider、端点、认证与预算。模型在连接下单独管理。
                </p>
              </div>
              <Button
                data-testid="settings-toggle-add-config"
                variant="outline"
                size="sm"
                className="gap-2 rounded-lg"
                onClick={() => setIsAddingConfig((value) => !value)}
              >
                <Plus className="h-4 w-4" />
                新增连接
              </Button>
            </div>

            {showSetupCallout ? (
              <div
                data-testid="settings-setup-callout"
                className="mt-4 rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground"
              >
                先创建一个连接并保存 Key，然后在连接下添加模型档案，再把工作流分配到具体模型。
              </div>
            ) : null}

            {isAddingConfig ? (
              <AddProviderForm
                onCreateApiConfig={async (draft) => {
                  const created = await props.onCreateApiConfig(draft)
                  setIsAddingConfig(false)
                  return created
                }}
                isCreating={props.isCreatingApiConfig}
              />
            ) : null}

            <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
              {props.apiConfigs.map((config) => {
                const isDeleting = props.deletingApiConfigId === config.id
                const profileCount = props.modelProfiles.filter(
                  (profile) => profile.apiConfigId === config.id
                ).length
                return (
                  <div key={config.id} className="space-y-2">
                    <EditableProviderCard
                      config={config}
                      disabled={isDeleting}
                      selected={selectedConfig?.id === config.id}
                      keySaveStatus={props.keySaveStatusByConfigId?.[config.id]}
                      connectionStatus={props.connectionStatusByConfigId?.[config.id]}
                      onSelect={() => props.onSelectedApiConfigChange(config.id)}
                      onSetDefault={() => props.onSetDefaultApiConfig(config.id)}
                      onTestConnection={() => props.onTestApiConfigConnection(config.id)}
                      onLoadApiKey={() => props.onLoadApiKey(config.id)}
                      onSaveEdits={(patch) => props.onSaveApiConfigEdits(config.id, patch)}
                      onDelete={() => props.onDeleteApiConfig(config.id)}
                    />
                    <div className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                      {profileCount} 个模型档案
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {selectedConfig ? (
          <>
            <Card className="border-border/50 bg-card">
              <CardContent className="space-y-5 p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h4 className="text-sm font-medium text-foreground">连接详情</h4>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {selectedConfig.displayName?.trim() || selectedConfig.name}
                    </p>
                  </div>
                  <Badge variant="outline">{selectedProfiles.length} 个模型档案</Badge>
                </div>

                <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
                  <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
                    <div className="text-xs text-muted-foreground">Provider</div>
                    <div className="mt-1 text-foreground">{selectedConfig.provider}</div>
                  </div>
                  <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
                    <div className="text-xs text-muted-foreground">Base URL</div>
                    <div className="mt-1 break-all text-foreground">
                      {selectedConfig.baseUrl ?? '使用默认端点'}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
                    <div className="text-xs text-muted-foreground">认证方式</div>
                    <div className="mt-1 text-foreground">{selectedConfig.authMode}</div>
                  </div>
                  <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
                    <div className="text-xs text-muted-foreground">预算</div>
                    <div className="mt-1 text-foreground">
                      {selectedConfig.budgetLimit == null ? '未设置' : `$${selectedConfig.budgetLimit}`}
                    </div>
                  </div>
                </div>

                <div>
                  <h5 className="text-sm font-medium text-foreground">API Key</h5>
                  <div className="mt-3 flex flex-col gap-3 md:flex-row">
                    <Input
                      type="password"
                      value={props.draftApiKey}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        props.onDraftApiKeyChange(event.target.value)
                      }
                      placeholder={`为 ${selectedConfig.displayName?.trim() || selectedConfig.name} 输入 API Key`}
                      className="h-10 rounded-lg"
                    />
                    <Button
                      variant="outline"
                      className="gap-2 rounded-lg"
                      onClick={props.onTestConnection}
                      disabled={!props.draftApiKey.trim() || props.isTestingConnection}
                    >
                      {props.isTestingConnection ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Shield className="h-4 w-4" />
                      )}
                      测试连接
                    </Button>
                    <Button
                      className="gap-2 rounded-lg"
                      onClick={props.onSaveApiKey}
                      disabled={!props.draftApiKey.trim()}
                    >
                      <KeyRound className="h-4 w-4" />
                      保存 Key
                    </Button>
                    <Button
                      variant="outline"
                      className="rounded-lg"
                      disabled={!selectedConfig.hasStoredKey || props.isDeletingApiKey}
                      onClick={() => void props.onDeleteApiKey(selectedConfig.id)}
                    >
                      {props.isDeletingApiKey ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                      删除 Key
                    </Button>
                  </div>
                  {props.testResultMessage ? (
                    <div className="mt-3">
                      <InlineError message={props.testResultMessage ?? ''} />
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-card">
              <CardContent className="space-y-5 p-6">
                <div>
                  <h4 className="text-sm font-medium text-foreground">模型档案</h4>
                  <p className="mt-1 text-xs text-muted-foreground">
                    同一连接下可维护多个模型，并分别分配给不同工作流。
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                  <Input
                    value={newModelId}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      setNewModelId(event.target.value)
                      if (createModelProfileError) {
                        setCreateModelProfileError(null)
                      }
                    }}
                    placeholder="模型 ID，例如 gpt-4.1"
                    className="h-10 rounded-lg"
                  />
                  <Input
                    value={newModelDisplayName}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      setNewModelDisplayName(event.target.value)
                      if (createModelProfileError) {
                        setCreateModelProfileError(null)
                      }
                    }}
                    placeholder="显示名，可选"
                    className="h-10 rounded-lg"
                  />
                  <Button
                    data-testid="settings-create-model-profile"
                    className="rounded-lg"
                    disabled={!newModelId.trim() || isCreatingModelProfile}
                    onClick={async () => {
                      if (!selectedConfig || !newModelId.trim()) return
                      const nextModelId = newModelId.trim()
                      const duplicateProfile = selectedProfiles.find(
                        (profile) => profile.modelId.trim() === nextModelId
                      )
                      if (duplicateProfile) {
                        setCreateModelProfileError(
                          `该连接下已存在模型档案“${duplicateProfile.displayName?.trim() || duplicateProfile.modelId}”。`
                        )
                        return
                      }

                      setCreateModelProfileError(null)
                      setIsCreatingModelProfile(true)
                      try {
                        await props.onCreateModelProfile({
                          apiConfigId: selectedConfig.id,
                          modelId: nextModelId,
                          displayName: newModelDisplayName.trim() || null,
                          capabilitiesJson: '[]',
                          isEnabled: true,
                          isDefaultForConnection: selectedProfiles.length === 0,
                        })
                        setNewModelId('')
                        setNewModelDisplayName('')
                      } catch (error) {
                        setCreateModelProfileError(
                          error instanceof Error ? error.message : '创建模型档案失败'
                        )
                      } finally {
                        setIsCreatingModelProfile(false)
                      }
                    }}
                  >
                    {isCreatingModelProfile ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    新增档案
                  </Button>
                </div>
                {createModelProfileError ? <InlineError message={createModelProfileError} /> : null}

                <div className="space-y-3">
                  {selectedProfiles.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border/60 px-4 py-6 text-sm text-muted-foreground">
                      当前连接还没有模型档案。先添加一个模型档案，然后再做工作流分配。
                    </div>
                  ) : (
                    selectedProfiles.map((profile) => (
                      <div
                        key={profile.id}
                        className="flex flex-col gap-3 rounded-xl border border-border/50 p-4 md:flex-row md:items-center md:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-foreground">
                              {profile.displayName?.trim() || profile.modelId}
                            </span>
                            {profile.isDefaultForConnection ? <Badge variant="outline">默认</Badge> : null}
                            {!profile.isEnabled ? <Badge variant="secondary">已禁用</Badge> : null}
                          </div>
                          <p className="mt-1 break-all text-xs text-muted-foreground">
                            {profile.modelId}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {!profile.isDefaultForConnection ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-lg"
                              onClick={() =>
                                void props.onUpdateModelProfile(profile.id, {
                                  isDefaultForConnection: true,
                                })
                              }
                            >
                              设为默认
                            </Button>
                          ) : null}
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-lg"
                            onClick={() =>
                              void props.onUpdateModelProfile(profile.id, {
                                isEnabled: !profile.isEnabled,
                              })
                            }
                          >
                            {profile.isEnabled ? '禁用' : '启用'}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-lg"
                            onClick={() => void props.onDeleteModelProfile(profile.id)}
                          >
                            删除
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-card">
              <CardContent className="p-6" data-testid="settings-workflow-assignments">
                <h4 className="text-sm font-medium text-foreground">工作流分配</h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  工作流绑定到模型档案，而不是直接绑定连接。
                </p>
                <div className="mt-4 space-y-3">
                  {props.workflowAssignments.map((assignment) => (
                    <div
                      key={assignment.workflowType}
                      className="flex flex-col gap-3 border-b border-border/30 py-3 last:border-0 md:flex-row md:items-center md:justify-between"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">{assignment.label}</p>
                        <p className="text-xs text-muted-foreground">{assignment.description}</p>
                      </div>
                      <select
                        value={assignment.modelProfileId ?? ''}
                        onChange={(event) =>
                          props.onAssignWorkflow(assignment.workflowType, event.target.value)
                        }
                        className="h-9 min-w-64 rounded-lg border border-border/50 bg-background px-3 text-sm text-foreground"
                      >
                        <option value="">未分配</option>
                        {availableWorkflowProfiles.map((profile) => {
                          const config =
                            profile.apiConfig ?? props.apiConfigs.find((item) => item.id === profile.apiConfigId)
                          return (
                            <option key={profile.id} value={profile.id}>
                              {config?.displayName?.trim() || config?.name || config?.provider || 'Provider'} /{' '}
                              {profile.displayName?.trim() || profile.modelId}
                            </option>
                          )
                        })}
                      </select>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card className="border-border/50 bg-card">
        <CardContent className="p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-medium text-foreground">BYOK 供应商配置</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                使用真实 API 配置和本地密钥库存储，不保存明文密钥。
              </p>
            </div>
            <Button
              data-testid="settings-toggle-add-config"
              variant="outline"
              size="sm"
              className="gap-2 rounded-lg"
              onClick={() => setIsAddingConfig((value) => !value)}
            >
              <Plus className="h-4 w-4" />
              新增供应商
            </Button>
          </div>

          {showSetupCallout ? (
            <div
              data-testid="settings-setup-callout"
              className="mt-4 rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground"
            >
              添加一个供应商并保存 API Key 后，文档解析、卡片生成和知识问答即可使用真实模型。
            </div>
          ) : null}

          {isAddingConfig ? (
            <AddProviderForm
              onCreateApiConfig={async (draft) => {
                const created = await props.onCreateApiConfig(draft)
                setIsAddingConfig(false)
                return created
              }}
              isCreating={props.isCreatingApiConfig}
            />
          ) : null}

          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
            {props.apiConfigs.map((config) => {
              const isDeleting = props.deletingApiConfigId === config.id
              return (
                <EditableProviderCard
                  key={config.id}
                  config={config}
                  disabled={isDeleting}
                  selected={selectedConfig?.id === config.id}
                  keySaveStatus={props.keySaveStatusByConfigId?.[config.id]}
                  connectionStatus={props.connectionStatusByConfigId?.[config.id]}
                  onSelect={() => props.onSelectedApiConfigChange(config.id)}
                  onSetDefault={() => props.onSetDefaultApiConfig(config.id)}
                  onTestConnection={() => props.onTestApiConfigConnection(config.id)}
                  onLoadApiKey={() => props.onLoadApiKey(config.id)}
                  onSaveEdits={(patch) => props.onSaveApiConfigEdits(config.id, patch)}
                  onDelete={() => props.onDeleteApiConfig(config.id)}
                />
              )
            })}
          </div>
        </CardContent>
      </Card>

      {false && managedConfig ? (
        <KeyManagementPanel
          config={managedConfig as ApiConfig}
          draftApiKey={props.draftApiKey}
          isDeletingApiKey={props.isDeletingApiKey}
          onDraftApiKeyChange={props.onDraftApiKeyChange}
          onSaveApiKey={props.onSaveApiKey}
          onDeleteApiKey={props.onDeleteApiKey}
          onClose={() => setManagedConfigId(null)}
        />
      ) : false ? (
        <Card className="border-border/50 bg-card">
          <CardContent className="p-6">
            <h4 className="text-sm font-medium text-foreground">连接测试与 Key 存储</h4>
            <div className="mt-4 flex gap-3">
              <Input
                type="password"
                placeholder={selectedConfig ? `为 ${selectedConfig.name} 输入 API Key` : '选择一个供应商后输入 API Key'}
                value={props.draftApiKey}
                onChange={(event: ChangeEvent<HTMLInputElement>) => props.onDraftApiKeyChange(event.target.value)}
                disabled={!selectedConfig}
                className="h-10 rounded-lg"
              />
              <Button variant="outline" className="gap-2 rounded-lg" onClick={props.onTestConnection} disabled={!selectedConfig || !props.draftApiKey.trim() || props.isTestingConnection}>
                {props.isTestingConnection ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                测试连接
              </Button>
              <Button className="gap-2 rounded-lg" onClick={props.onSaveApiKey} disabled={!selectedConfig || !props.draftApiKey.trim()}>
                <KeyRound className="h-4 w-4" />
                保存 Key
              </Button>
            </div>
            {props.testResultMessage ? (
              <div className="mt-4">
                <InlineError message={props.testResultMessage ?? ''} />
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {false ? (
      <Card className="border-border/50 bg-card">
        <CardContent className="p-6">
          <h4 className="text-sm font-medium text-foreground">工作流模型分配</h4>
          <p className="mt-1 text-xs text-muted-foreground">按工作流绑定当前真实配置。</p>
          <div className="mt-4 space-y-3">
            {props.workflowAssignments.map((assignment) => (
              <div key={assignment.workflowType} className="flex items-center justify-between border-b border-border/30 py-3 last:border-0">
                <div>
                  <p className="text-sm font-medium text-foreground">{assignment.label}</p>
                  <p className="text-xs text-muted-foreground">{assignment.description}</p>
                  {props.workflowSaveStatusByWorkflowType?.[assignment.workflowType] ? (
                    <p
                      className={cn(
                        'mt-1 text-xs',
                        props.workflowSaveStatusByWorkflowType[assignment.workflowType] === 'failed'
                          ? 'text-destructive'
                          : 'text-muted-foreground'
                      )}
                    >
                      {props.workflowSaveStatusByWorkflowType[assignment.workflowType] === 'saving'
                        ? '保存中...'
                        : props.workflowSaveStatusByWorkflowType[assignment.workflowType] === 'saved'
                          ? '已保存'
                          : '保存失败'}
                    </p>
                  ) : null}
                </div>
                <select
                  value={assignment.modelProfileId ?? ''}
                  onChange={(event) => props.onAssignWorkflow(assignment.workflowType, event.target.value)}
                  className="h-9 min-w-52 rounded-lg border border-border/50 bg-background px-3 text-sm text-foreground"
                >
                  <option value="">未分配</option>
                  {props.apiConfigs.map((config) => (
                    <option
                      key={config.id}
                      value={config.id}
                      disabled={
                        props.keySaveStatusByConfigId?.[config.id] === 'saving' ||
                        (!config.hasStoredCredential &&
                          props.keySaveStatusByConfigId?.[config.id] !== 'saved' &&
                          config.authMode !== 'adc')
                      }
                    >
                      {config.displayName?.trim() || config.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      ) : null}
    </div>
  )
}

export function SettingsPage(props: SettingsPageProps) {
  return (
    <div className="h-full overflow-y-auto p-6">
      <PageHeader />
      <div className="flex gap-8">
        <SettingsNav activeTab={props.activeTab} onTabChange={props.onTabChange} />
        <div className="flex-1">
          {props.activeTab === 'ai' ? (
            <EnhancedAiModelSettings {...props} />
          ) : null}

          {props.activeTab === 'learning' ? (
            <Card className="border-border/50 bg-card">
              <CardContent className="space-y-6 p-6">
                <div>
                  <h3 className="text-base font-medium text-foreground">学习偏好</h3>
                  <p className="mt-1 text-sm text-muted-foreground">保留真实设置写入，只重做信息架构和控件层。</p>
                </div>
                <div>
                  <p className="mb-3 text-sm font-medium text-foreground">每日新卡上限</p>
                  <div className="grid grid-cols-4 gap-3">
                    {[10, 20, 30, 50].map((count) => (
                      <Button key={count} variant="outline" className={cn('rounded-lg', props.learningSettings.dailyNewCardLimit === count && 'border-foreground/30 bg-foreground/5')} onClick={() => props.onLearningSettingsChange({ dailyNewCardLimit: count })}>
                        {count}
                      </Button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-3 text-sm font-medium text-foreground">每日复习时长上限</p>
                  <div className="grid grid-cols-4 gap-3">
                    {[15, 30, 45, 60].map((count) => (
                      <Button key={count} variant="outline" className={cn('rounded-lg', props.learningSettings.reviewTimeLimit === count && 'border-foreground/30 bg-foreground/5')} onClick={() => props.onLearningSettingsChange({ reviewTimeLimit: count })}>
                        {count} 分钟
                      </Button>
                    ))}
                  </div>
                </div>
                <Button className="rounded-lg" onClick={props.onSaveLearning}>
                  保存学习设置
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {props.activeTab === 'podcast' ? (
            <Card className="border-border/50 bg-card">
              <CardContent className="space-y-6 p-6">
                <div>
                  <h3 className="text-base font-medium text-foreground">播客与语音</h3>
                  <p className="mt-1 text-sm text-muted-foreground">保留真实播客设置项，但切换到参考页的分区式骨架。</p>
                </div>
                <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
                  <p className="text-sm text-muted-foreground">
                    选择文章、模式和提示词后，Agent 会直接完成播客生成。预算、余额、审核等控制项保留在系统内部，不再由用户手动处理。
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {false ? (
                  <>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-foreground">默认 TTS 提供商</span>
                    <select
                      value="auto"
                      onChange={() => {}}
                      className="h-10 w-full rounded-lg border border-border/50 bg-background px-3 text-sm text-foreground"
                    >
                      <option value="auto">自动</option>
                      <option value="openai">OpenAI TTS</option>
                      <option value="edge_tts">Edge TTS</option>
                    </select>
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-foreground">OpenAI TTS 模型</span>
                    <Input value="" readOnly className="h-10 rounded-lg" />
                  </label>
                  </>
                  ) : null}
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-foreground">默认 TTS 提供商</span>
                    <select
                      value={props.podcastSettings.podcastTtsProvider}
                      onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                        props.onPodcastSettingsChange({
                          podcastTtsProvider:
                            event.target.value as SettingsPageProps['podcastSettings']['podcastTtsProvider'],
                        })
                      }
                      className="h-10 w-full rounded-lg border border-border/50 bg-background px-3 text-sm text-foreground"
                    >
                      <option value="auto">自动</option>
                      <option value="google">Google TTS</option>
                      <option value="openai">OpenAI TTS</option>
                      <option value="edge_tts">Edge TTS</option>
                    </select>
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-foreground">Google TTS 模型</span>
                    <Input
                      value={props.podcastSettings.podcastGoogleTtsModel}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        props.onPodcastSettingsChange({ podcastGoogleTtsModel: event.target.value })
                      }
                      className="h-10 rounded-lg"
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-foreground">OpenAI TTS 模型</span>
                    <Input
                      value={props.podcastSettings.podcastOpenaiModel}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        props.onPodcastSettingsChange({ podcastOpenaiModel: event.target.value })
                      }
                      className="h-10 rounded-lg"
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-foreground">输出格式</span>
                    <select
                      value={props.podcastSettings.podcastOutputFormat}
                      onChange={(event: ChangeEvent<HTMLSelectElement>) => props.onPodcastSettingsChange({ podcastOutputFormat: event.target.value as SettingsPageProps['podcastSettings']['podcastOutputFormat'] })}
                      className="h-10 w-full rounded-lg border border-border/50 bg-background px-3 text-sm text-foreground"
                    >
                      <option value="mp3">MP3</option>
                      <option value="wav">WAV</option>
                    </select>
                  </label>
                </div>
                <Button className="rounded-lg" onClick={props.onSavePodcast}>
                  保存播客设置
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {props.activeTab === 'general' ? (
            <Card className="border-border/50 bg-card">
              <CardContent className="space-y-6 p-6">
                <div>
                  <h3 className="text-base font-medium text-foreground">通用</h3>
                  <p className="mt-1 text-sm text-muted-foreground">这里保留真实主题与语言设置接口。</p>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-foreground">语言</span>
                    <select value={props.generalSettings.language} onChange={(event: ChangeEvent<HTMLSelectElement>) => props.onGeneralSettingsChange({ language: event.target.value as SettingsPageProps['generalSettings']['language'] })} className="h-10 w-full rounded-lg border border-border/50 bg-background px-3 text-sm text-foreground">
                      <option value="zh-CN">中文（简体）</option>
                      <option value="en-US">English (US)</option>
                    </select>
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-foreground">主题</span>
                    <Input value={props.generalSettings.theme} onChange={(event: ChangeEvent<HTMLInputElement>) => props.onGeneralSettingsChange({ theme: event.target.value as AppSettings['theme'] })} className="h-10 rounded-lg" />
                  </label>
                </div>
                <Button className="rounded-lg" onClick={props.onSaveGeneral}>
                  保存通用设置
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  )
}
