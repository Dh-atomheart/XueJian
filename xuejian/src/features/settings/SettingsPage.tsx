import { useCallback, useEffect, useState } from 'react'
import { appThemeOptions, resolveAppThemeId } from '@/design-system/themes'
import { Button, Input, Panel } from '@/components/ui'
import { StudyStatsCard } from '@/components/stats'
import { cn } from '@/lib/utils'
import {
  hasUsableApiConfig,
  useApiConfigsQuery,
  useCreateApiConfigMutation,
  useDeleteApiConfigMutation,
  useSetDefaultApiConfigMutation,
  useStoreApiKeyMutation,
  useTestApiConnectionMutation,
  useAppSettingsQuery,
  useUpdateAppSettingsMutation,
} from '@/queries'
import type { ApiConfig, AppThemeId } from '@/types'

type Provider = ApiConfig['provider']

const PROVIDERS: { value: Provider; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'custom', label: '自定义端点' },
]

const THEME_SWATCH_CLASSES: Record<AppThemeId, { paper: string; ink: string; accent: string }> = {
  default: {
    paper: 'theme-swatch-paper-default',
    ink: 'theme-swatch-ink-default',
    accent: 'theme-swatch-accent-default',
  },
  'comic-sketch': {
    paper: 'theme-swatch-paper-comic-sketch',
    ink: 'theme-swatch-ink-comic-sketch',
    accent: 'theme-swatch-accent-comic-sketch',
  },
  'contrast-paper': {
    paper: 'theme-swatch-paper-contrast-paper',
    ink: 'theme-swatch-ink-contrast-paper',
    accent: 'theme-swatch-accent-contrast-paper',
  },
}

interface SettingsPageProps {
  forcedOnboarding?: boolean
}

export function SettingsPage({ forcedOnboarding = false }: SettingsPageProps) {
  const { data: configs = [], isLoading } = useApiConfigsQuery()
  const { data: appSettings } = useAppSettingsQuery()
  const createConfig = useCreateApiConfigMutation()
  const deleteConfig = useDeleteApiConfigMutation()
  const setDefault = useSetDefaultApiConfigMutation()
  const storeKey = useStoreApiKeyMutation()
  const testConn = useTestApiConnectionMutation()
  const updateSettings = useUpdateAppSettingsMutation()

  const [showForm, setShowForm] = useState(forcedOnboarding)
  const [editingKeyConfigId, setEditingKeyConfigId] = useState<string | null>(null)

  const currentThemeId = resolveAppThemeId(appSettings?.theme)
  const hasConfiguredModel = hasUsableApiConfig(configs)
  const editingKeyConfig = configs.find((config) => config.id === editingKeyConfigId) ?? null
  const shouldShowCreateForm = forcedOnboarding ? !editingKeyConfig : showForm && !editingKeyConfig

  useEffect(() => {
    if (forcedOnboarding) {
      setShowForm(true)
    }
  }, [forcedOnboarding])

  useEffect(() => {
    if (!editingKeyConfigId) {
      return
    }

    const matchingConfig = configs.find((config) => config.id === editingKeyConfigId)
    if (!matchingConfig || matchingConfig.hasStoredKey) {
      setEditingKeyConfigId(null)
    }
  }, [configs, editingKeyConfigId])

  const handleThemeChange = useCallback(
    (theme: AppThemeId) => {
      if (theme === currentThemeId || updateSettings.isPending) {
        return
      }

      updateSettings.mutate({ theme })
    },
    [currentThemeId, updateSettings]
  )

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      {/* Header */}
      <div>
        <p className="text-xs uppercase tracking-[0.26em] text-ink-soft">Settings</p>
        <h1 className="mt-1 font-display text-2xl text-ink">模型与偏好</h1>
        <p className="mt-1 text-sm text-ink-muted">
          配置 AI 模型凭证，所有 API Key 仅存储在本地 Stronghold 密钥库中。
        </p>
      </div>

      {forcedOnboarding ? (
        <Panel variant="paperCard" className="rounded-[24px] border border-highlight-yellow/40 bg-highlight-yellow/10 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-ink-soft">First Run Setup</p>
          <h2 className="mt-2 font-ui text-lg text-ink">先完成模型密钥配置，再进入其他功能</h2>
          <p className="mt-2 text-sm leading-6 text-ink-muted">
            学笺依赖本地保存的模型密钥来驱动卡片生成、知识问答和后续 AI 流程。完成至少一个可用配置后，主界面会自动解锁。
          </p>
        </Panel>
      ) : null}

      {/* Model configs */}
      <Panel variant="paperCard" className="space-y-4 rounded-[24px] p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-ui text-lg text-ink">模型配置</h2>
          <Button
            variant="sketch"
            size="sm"
            data-testid="settings-toggle-add-config"
            disabled={forcedOnboarding}
            onClick={() => {
              setEditingKeyConfigId(null)
              setShowForm(!showForm)
            }}
          >
            {showForm ? '取消' : '添加配置'}
          </Button>
        </div>

        {forcedOnboarding && !hasConfiguredModel ? (
          <p className="text-xs leading-5 text-ink-soft">
            Finish one usable model setup before leaving this page. If a config already exists but its key is missing, repair that key here.
          </p>
        ) : null}

        {editingKeyConfig ? (
          <UpdateApiKeyForm
            config={editingKeyConfig}
            storeKey={storeKey}
            testConn={testConn}
            onSaved={() => {
              setEditingKeyConfigId(null)
              setShowForm(false)
            }}
            onCancel={() => setEditingKeyConfigId(null)}
          />
        ) : null}

        {shouldShowCreateForm && (
          <AddConfigForm
            forcedOnboarding={forcedOnboarding}
            onCreated={() => setShowForm(false)}
            createConfig={createConfig}
            storeKey={storeKey}
            testConn={testConn}
          />
        )}

        {isLoading ? (
          <p className="py-4 text-center text-sm text-ink-muted">加载中…</p>
        ) : configs.length === 0 && !showForm ? (
          <div className="py-6 text-center">
            <p className="text-sm text-ink-muted">
              尚未配置任何模型。添加第一个 API 配置来开始使用 AI 功能。
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {configs.map((config) => (
              <ConfigRow
                key={config.id}
                config={config}
                isManagingKey={editingKeyConfigId === config.id}
                onManageKey={() => {
                  setEditingKeyConfigId(config.id)
                  setShowForm(false)
                }}
                onSetDefault={() => setDefault.mutate(config.id)}
                onDelete={() => deleteConfig.mutate(config.id)}
              />
            ))}
          </ul>
        )}
      </Panel>

      {/* Minimal stats overview */}
      <Panel variant="paperCard" className="rounded-[24px] p-6">
        <h2 className="mb-3 font-ui text-lg text-ink">学习概览</h2>
        <StudyStatsCard />
        {appSettings && (
          <div className="mt-4 flex gap-6 text-sm text-ink-muted">
            <span>
              每日新卡上限: <span className="text-ink">{appSettings.dailyNewCardLimit}</span>
            </span>
            <span>
              复习时限: <span className="text-ink">{appSettings.reviewTimeLimit} 分钟</span>
            </span>
          </div>
        )}
      </Panel>

      {/* Preferences (read-only display for now) */}
      <Panel variant="paperCard" className="rounded-[24px] p-6">
        <h2 className="mb-3 font-ui text-lg text-ink">偏好设置</h2>
        {appSettings ? (
          <div className="space-y-4 text-sm text-ink-muted">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-ui text-sm text-ink">主题包</p>
                <p className="mt-1 text-xs leading-5 text-ink-soft">
                  主题只覆盖 token 与资源，不会改动阅读器、学习页和设置页的业务交互。
                </p>
              </div>
              <span className="text-xs text-ink-soft">
                {updateSettings.isPending ? '保存中…' : '已保存在本地设置'}
              </span>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {appThemeOptions.map((themeOption) => {
                const isActive = currentThemeId === themeOption.id

                return (
                  <button
                    key={themeOption.id}
                    type="button"
                    data-testid={`theme-option-${themeOption.id}`}
                    aria-current={isActive ? 'true' : undefined}
                    disabled={updateSettings.isPending}
                    onClick={() => handleThemeChange(themeOption.id)}
                    className={cn(
                      'rounded-[20px] border px-4 py-4 text-left transition-colors',
                      isActive
                        ? 'border-ink/30 bg-paper-card shadow-card'
                        : 'border-line-soft bg-paper-muted/55 hover:border-ink/20 hover:bg-paper-card'
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-ui text-sm text-ink">{themeOption.label}</p>
                        <p className="mt-1 text-xs leading-5 text-ink-muted">
                          {themeOption.description}
                        </p>
                      </div>
                      <span
                        className={cn(
                          'rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.18em]',
                          isActive
                            ? 'border-ink/20 bg-ink text-paper-base'
                            : 'border-ink/10 bg-paper-base text-ink-soft'
                        )}
                      >
                        {isActive ? '当前' : '可用'}
                      </span>
                    </div>

                    <div className="mt-4 flex items-center gap-2">
                      <span
                        className={cn(
                          'theme-swatch h-5 w-5 rounded-full border border-ink/10',
                          THEME_SWATCH_CLASSES[themeOption.id].paper
                        )}
                      />
                      <span
                        className={cn(
                          'theme-swatch h-5 w-5 rounded-full border border-ink/10',
                          THEME_SWATCH_CLASSES[themeOption.id].ink
                        )}
                      />
                      <span
                        className={cn(
                          'theme-swatch h-5 w-5 rounded-full border border-ink/10',
                          THEME_SWATCH_CLASSES[themeOption.id].accent
                        )}
                      />
                    </div>
                  </button>
                )
              })}
            </div>

            <div className="flex justify-between rounded-xl border border-line-soft bg-paper-base/70 px-4 py-3">
              <span>当前主题</span>
              <span className="text-ink">{appThemeOptions.find((theme) => theme.id === currentThemeId)?.label}</span>
            </div>

            <div className="flex justify-between rounded-xl border border-line-soft bg-paper-base/70 px-4 py-3">
              <span>语言</span>
              <span className="text-ink">{appSettings.language}</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-ink-muted">加载中…</p>
        )}
      </Panel>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function ConfigRow({
  config,
  isManagingKey,
  onManageKey,
  onSetDefault,
  onDelete,
}: {
  config: ApiConfig
  isManagingKey: boolean
  onManageKey: () => void
  onSetDefault: () => void
  onDelete: () => void
}) {
  return (
    <li className="flex items-center justify-between gap-4 rounded-xl border border-line-soft bg-paper-card/60 px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-ui text-sm text-ink">{config.name}</span>
          <span className="rounded-full border border-ink/10 bg-paper-muted px-2 py-0.5 text-[10px] uppercase tracking-wider text-ink-soft">
            {config.provider}
          </span>
          <span
            className={cn(
              'rounded-full border px-2 py-0.5 text-[10px]',
              config.hasStoredKey
                ? 'border-highlight-green/40 bg-highlight-green/10 text-ink-muted'
                : 'border-highlight-pink/40 bg-highlight-pink/10 text-ink-muted'
            )}
          >
            {config.hasStoredKey ? '已存密钥' : '缺少密钥'}
          </span>
          {config.isDefault && (
            <span className="rounded-full border border-highlight-green/40 bg-highlight-green/10 px-2 py-0.5 text-[10px] text-ink-muted">
              默认
            </span>
          )}
        </div>
        {config.model && <p className="mt-0.5 text-xs text-ink-soft">{config.model}</p>}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          data-testid={`settings-manage-key-${config.id}`}
          onClick={onManageKey}
        >
          {isManagingKey ? 'Editing Key' : config.hasStoredKey ? 'Update Key' : 'Add Key'}
        </Button>
        {!config.isDefault && (
          <Button variant="ghost" size="sm" onClick={onSetDefault}>
            设为默认
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onDelete}>
          删除
        </Button>
      </div>
    </li>
  )
}

/* ------------------------------------------------------------------ */

function AddConfigForm({
  forcedOnboarding,
  onCreated,
  createConfig,
  storeKey,
  testConn,
}: {
  forcedOnboarding: boolean
  onCreated: () => void
  createConfig: ReturnType<typeof useCreateApiConfigMutation>
  storeKey: ReturnType<typeof useStoreApiKeyMutation>
  testConn: ReturnType<typeof useTestApiConnectionMutation>
}) {
  const [provider, setProvider] = useState<Provider>('openai')
  const [name, setName] = useState('')
  const [model, setModel] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [isTesting, setIsTesting] = useState(false)

  const handleTestConnection = useCallback(async () => {
    if (!apiKey) return
    setIsTesting(true)
    setTestResult(null)
    try {
      const result = await testConn.mutateAsync({
        provider,
        apiKey,
        baseUrl: baseUrl || null,
      })
      setTestResult(result)
    } catch {
      setTestResult({ success: false, message: '连接测试失败' })
    } finally {
      setIsTesting(false)
    }
  }, [apiKey, provider, baseUrl, testConn])

  const handleSubmit = useCallback(async () => {
    if (!name || !apiKey) return
    try {
      const config = await createConfig.mutateAsync({
        provider,
        name,
        model: model || null,
        baseUrl: baseUrl || null,
        budgetLimit: null,
        isDefault: true,
        isEnabled: true,
      })
      await storeKey.mutateAsync({ configId: config.id, apiKey })
      setApiKey('')
      onCreated()
    } catch {
      // mutation error handled by TanStack Query
    }
  }, [name, apiKey, provider, model, baseUrl, createConfig, storeKey, onCreated])

  return (
    <div
      className="space-y-3 rounded-xl border border-dashed border-line-soft bg-paper-muted/40 p-4"
      data-testid="settings-add-config-form"
    >
      {forcedOnboarding ? (
        <p className="text-xs leading-5 text-ink-soft">
          Add one working model config first. The app will unlock as soon as the key is stored locally.
        </p>
      ) : null}

      {/* Provider */}
      <div className="flex gap-2">
        {PROVIDERS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => setProvider(p.value)}
            className={`rounded-lg border px-3 py-1.5 font-ui text-xs transition-colors ${
              provider === p.value
                ? 'border-ink/30 bg-paper-card text-ink'
                : 'border-transparent text-ink-muted hover:bg-paper-card/60'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Fields */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block font-ui text-xs text-ink-soft">配置名称</label>
          <Input
            data-testid="settings-add-config-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="如: My OpenAI"
          />
        </div>
        <div>
          <label className="mb-1 block font-ui text-xs text-ink-soft">模型</label>
          <Input
            data-testid="settings-add-config-model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="如: gpt-4o"
          />
        </div>
      </div>

      {provider === 'custom' && (
        <div>
          <label className="mb-1 block font-ui text-xs text-ink-soft">Base URL</label>
          <Input
            data-testid="settings-add-config-base-url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.example.com/v1"
          />
        </div>
      )}

      <div>
        <label className="mb-1 block font-ui text-xs text-ink-soft">API Key</label>
        <Input
          data-testid="settings-add-config-key"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-..."
          autoComplete="off"
        />
        <p className="mt-1 text-[11px] text-ink-soft">
          Key 仅存储于本地 Stronghold 密钥库，不进入数据库或网络日志。
        </p>
      </div>

      {/* Test result */}
      {testResult && (
        <div
          className={`rounded-lg border px-3 py-2 text-xs ${
            testResult.success
              ? 'border-highlight-green/40 bg-highlight-green/10 text-ink-muted'
              : 'border-highlight-pink/40 bg-highlight-pink/10 text-ink-muted'
          }`}
        >
          {testResult.message}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-1">
        <Button
          variant="outline"
          size="sm"
          data-testid="settings-test-connection"
          onClick={handleTestConnection}
          disabled={!apiKey || isTesting}
        >
          {isTesting ? '测试中…' : '测试连接'}
        </Button>
        <Button
          variant="default"
          size="sm"
          data-testid="settings-save-config"
          onClick={handleSubmit}
          disabled={!name || !apiKey || createConfig.isPending}
        >
          {createConfig.isPending ? '保存中…' : '保存配置'}
        </Button>
      </div>
    </div>
  )
}

function UpdateApiKeyForm({
  config,
  storeKey,
  testConn,
  onSaved,
  onCancel,
}: {
  config: ApiConfig
  storeKey: ReturnType<typeof useStoreApiKeyMutation>
  testConn: ReturnType<typeof useTestApiConnectionMutation>
  onSaved: () => void
  onCancel: () => void
}) {
  const [apiKey, setApiKey] = useState('')
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [isTesting, setIsTesting] = useState(false)

  const handleTestConnection = useCallback(async () => {
    if (!apiKey) return

    setIsTesting(true)
    setTestResult(null)

    try {
      const result = await testConn.mutateAsync({
        provider: config.provider,
        apiKey,
        baseUrl: config.baseUrl,
      })
      setTestResult(result)
    } catch {
      setTestResult({ success: false, message: 'Connection test failed' })
    } finally {
      setIsTesting(false)
    }
  }, [apiKey, config.baseUrl, config.provider, testConn])

  const handleSubmit = useCallback(async () => {
    if (!apiKey) return

    try {
      await storeKey.mutateAsync({ configId: config.id, apiKey })
      setApiKey('')
      onSaved()
    } catch {
      // mutation error handled by TanStack Query
    }
  }, [apiKey, config.id, onSaved, storeKey])

  return (
    <div
      className="space-y-3 rounded-xl border border-dashed border-line-soft bg-paper-muted/40 p-4"
      data-testid="settings-update-key-form"
    >
      <div className="space-y-1">
        <p className="font-ui text-sm text-ink">{config.name}</p>
        <p className="text-xs text-ink-soft">
          Update the locally stored API key for {config.provider}
          {config.model ? ` / ${config.model}` : ''}.
        </p>
      </div>

      <div>
        <label className="mb-1 block font-ui text-xs text-ink-soft">API Key</label>
        <Input
          data-testid="settings-update-config-key"
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder="sk-..."
          autoComplete="off"
        />
      </div>

      {testResult ? (
        <div
          className={cn(
            'rounded-lg border px-3 py-2 text-xs',
            testResult.success
              ? 'border-highlight-green/40 bg-highlight-green/10 text-ink-muted'
              : 'border-highlight-pink/40 bg-highlight-pink/10 text-ink-muted'
          )}
        >
          {testResult.message}
        </div>
      ) : null}

      <div className="flex items-center gap-3 pt-1">
        <Button
          variant="outline"
          size="sm"
          data-testid="settings-update-test-connection"
          onClick={handleTestConnection}
          disabled={!apiKey || isTesting}
        >
          {isTesting ? 'Testing...' : 'Test Connection'}
        </Button>
        <Button
          variant="default"
          size="sm"
          data-testid="settings-update-save-key"
          onClick={handleSubmit}
          disabled={!apiKey || storeKey.isPending}
        >
          {storeKey.isPending ? 'Saving...' : 'Save Key'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
