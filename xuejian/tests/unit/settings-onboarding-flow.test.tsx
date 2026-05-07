import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { useAppUiStore } from '@/store'
import type { ApiConfig, AppSettings } from '@/types'
import * as queries from '@/queries'

vi.mock('@/components/stats', () => ({
  StudyStatsCard: () => <div>Study Stats</div>,
}))

vi.mock('@/queries', async () => {
  const actual = await vi.importActual<typeof import('@/queries')>('@/queries')

  return {
    ...actual,
    useApiConfigsQuery: vi.fn(),
    useActiveEmbeddingProfileQuery: vi.fn(),
    useCreateApiConfigMutation: vi.fn(),
    useCreateEmbeddingProfileMutation: vi.fn(),
    useDeleteApiConfigMutation: vi.fn(),
    useDeleteApiKeyMutation: vi.fn(),
    useDeleteModelProfileMutation: vi.fn(),
    useEmbeddingProfilesQuery: vi.fn(),
    useFetchProviderModelsMutation: vi.fn(),
    useModelProfilesQuery: vi.fn(),
    useProviderBudgetUsageQuery: vi.fn(),
    useResetProviderBudgetUsageMutation: vi.fn(),
    useCreateModelProfileMutation: vi.fn(),
    useSetDefaultApiConfigMutation: vi.fn(),
    useSetActiveEmbeddingProfileMutation: vi.fn(),
    useSetAllWorkflowAssignmentsMutation: vi.fn(),
    useSetWorkflowAssignmentMutation: vi.fn(),
    useStoreApiKeyMutation: vi.fn(),
    useTestApiConnectionMutation: vi.fn(),
    useAppSettingsQuery: vi.fn(),
    useUpdateApiConfigMutation: vi.fn(),
    useUpdateAppSettingsMutation: vi.fn(),
    useUpdateModelProfileMutation: vi.fn(),
    useWorkflowAssignmentsQuery: vi.fn(),
  }
})

const appSettings: AppSettings = {
  theme: 'light',
  language: 'zh-CN',
  dailyNewCardLimit: 20,
  reviewTimeLimit: 30,
  podcastTtsProvider: 'auto',
  podcastOpenaiModel: 'tts-1',
  podcastGoogleTtsModel: 'gemini-2.5-flash-preview-tts',
  podcastFishAudioEndpoint: null,
  podcastVoiceOverrides: {},
  podcastOutputFormat: 'mp3',
  podcastSkipReview: true,
  podcastMaxLlmTokens: 100000,
  podcastMaxTtsCharacters: 50000,
  podcastMaxEstimatedCostUsd: 1,
}

const missingKeyConfig: ApiConfig = {
  id: 'cfg-missing-key',
  provider: 'openai',
  protocol: 'native',
  authMode: 'api_key',
  name: 'OpenAI Primary',
  model: 'gpt-4o',
  baseUrl: null,
  budgetLimit: null,
  isDefault: true,
  isEnabled: true,
  hasStoredCredential: false,
  hasStoredKey: false,
  keyVerifiedAt: null,
  keyStatus: 'none',
  displayName: 'OpenAI Primary',
  createdAt: new Date('2026-04-18T10:00:00.000Z'),
}

const storedKeyConfig: ApiConfig = {
  ...missingKeyConfig,
  id: 'cfg-stored-key',
  hasStoredCredential: true,
  hasStoredKey: true,
  keyStatus: 'stored',
}

const mockedQueries = vi.mocked(queries)

function setupDefaultMocks(configs: ApiConfig[]) {
  mockedQueries.useApiConfigsQuery.mockReturnValue({
    data: configs,
    isLoading: false,
  } as ReturnType<typeof queries.useApiConfigsQuery>)
  mockedQueries.useEmbeddingProfilesQuery.mockReturnValue({
    data: [],
    isLoading: false,
  } as ReturnType<typeof queries.useEmbeddingProfilesQuery>)
  mockedQueries.useActiveEmbeddingProfileQuery.mockReturnValue({
    data: null,
    isLoading: false,
  } as ReturnType<typeof queries.useActiveEmbeddingProfileQuery>)
  mockedQueries.useWorkflowAssignmentsQuery.mockReturnValue({
    data: [],
    isLoading: false,
  } as ReturnType<typeof queries.useWorkflowAssignmentsQuery>)
  mockedQueries.useModelProfilesQuery.mockReturnValue({
    data: configs
      .filter((config) => config.model)
      .map((config) => ({
        id: `profile-${config.id}`,
        apiConfigId: config.id,
        modelId: config.model ?? 'unknown',
        displayName: config.displayName ?? config.name,
        capabilitiesJson: '[]',
        isEnabled: true,
        isDefaultForConnection: true,
        createdAt: new Date('2026-04-18T10:00:00.000Z'),
        updatedAt: new Date('2026-04-18T10:00:00.000Z'),
        apiConfig: config,
      })),
    isLoading: false,
  } as ReturnType<typeof queries.useModelProfilesQuery>)
  mockedQueries.useAppSettingsQuery.mockReturnValue({
    data: appSettings,
  } as ReturnType<typeof queries.useAppSettingsQuery>)
  mockedQueries.useCreateApiConfigMutation.mockReturnValue({
    isPending: false,
    mutateAsync: vi.fn(),
  } as ReturnType<typeof queries.useCreateApiConfigMutation>)
  mockedQueries.useUpdateApiConfigMutation.mockReturnValue({
    isPending: false,
    mutateAsync: vi.fn(async ({ id, data }: { id: string; data: Partial<ApiConfig> }) => {
      const existing = configs.find((config) => config.id === id) ?? missingKeyConfig
      return {
        ...existing,
        ...data,
        id,
        protocol: existing.protocol,
        hasStoredCredential: existing.hasStoredCredential,
        hasStoredKey: existing.hasStoredKey,
        keyVerifiedAt: existing.keyVerifiedAt,
        keyStatus: existing.keyStatus,
        createdAt: existing.createdAt,
      }
    }),
  } as ReturnType<typeof queries.useUpdateApiConfigMutation>)
  mockedQueries.useDeleteApiConfigMutation.mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
    variables: undefined,
  } as ReturnType<typeof queries.useDeleteApiConfigMutation>)
  mockedQueries.useDeleteApiKeyMutation.mockReturnValue({
    isPending: false,
    mutateAsync: vi.fn(),
  } as ReturnType<typeof queries.useDeleteApiKeyMutation>)
  mockedQueries.useCreateModelProfileMutation.mockReturnValue({
    isPending: false,
    mutateAsync: vi.fn(),
  } as ReturnType<typeof queries.useCreateModelProfileMutation>)
  mockedQueries.useCreateEmbeddingProfileMutation.mockReturnValue({
    isPending: false,
    mutateAsync: vi.fn(),
  } as ReturnType<typeof queries.useCreateEmbeddingProfileMutation>)
  mockedQueries.useUpdateModelProfileMutation.mockReturnValue({
    isPending: false,
    mutateAsync: vi.fn(),
  } as ReturnType<typeof queries.useUpdateModelProfileMutation>)
  mockedQueries.useDeleteModelProfileMutation.mockReturnValue({
    isPending: false,
    mutateAsync: vi.fn(),
  } as ReturnType<typeof queries.useDeleteModelProfileMutation>)
  mockedQueries.useFetchProviderModelsMutation.mockReturnValue({
    isPending: false,
    mutateAsync: vi.fn().mockResolvedValue([]),
  } as ReturnType<typeof queries.useFetchProviderModelsMutation>)
  mockedQueries.useProviderBudgetUsageQuery.mockReturnValue({
    data: null,
    isLoading: false,
  } as ReturnType<typeof queries.useProviderBudgetUsageQuery>)
  mockedQueries.useResetProviderBudgetUsageMutation.mockReturnValue({
    mutate: vi.fn(),
  } as ReturnType<typeof queries.useResetProviderBudgetUsageMutation>)
  mockedQueries.useSetDefaultApiConfigMutation.mockReturnValue({
    mutate: vi.fn(),
  } as ReturnType<typeof queries.useSetDefaultApiConfigMutation>)
  mockedQueries.useSetActiveEmbeddingProfileMutation.mockReturnValue({
    isPending: false,
    mutateAsync: vi.fn(),
  } as ReturnType<typeof queries.useSetActiveEmbeddingProfileMutation>)
  mockedQueries.useSetWorkflowAssignmentMutation.mockReturnValue({
    mutateAsync: vi.fn(),
  } as ReturnType<typeof queries.useSetWorkflowAssignmentMutation>)
  mockedQueries.useSetAllWorkflowAssignmentsMutation.mockReturnValue({
    mutate: vi.fn(),
  } as ReturnType<typeof queries.useSetAllWorkflowAssignmentsMutation>)
  mockedQueries.useTestApiConnectionMutation.mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue({ success: true, message: 'ok' }),
  } as ReturnType<typeof queries.useTestApiConnectionMutation>)
  mockedQueries.useUpdateAppSettingsMutation.mockReturnValue({
    isPending: false,
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue(appSettings),
  } as ReturnType<typeof queries.useUpdateAppSettingsMutation>)
}

beforeEach(() => {
  vi.clearAllMocks()
  useAppUiStore.setState({
    feedbackLog: [],
    activeNotices: [],
    isFeedbackPanelOpen: false,
    activeSettingsSection: 'ai',
  })
})

afterEach(() => {
  cleanup()
})

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe('settings onboarding flow', () => {
  it('keeps app settings query disabled on the default AI tab', () => {
    useAppUiStore.setState({ activeSettingsSection: 'ai' })
    setupDefaultMocks([storedKeyConfig])

    renderWithProviders(<SettingsPage />)

    expect(mockedQueries.useAppSettingsQuery).toHaveBeenCalledWith({
      enabled: false,
      staleTime: 60_000,
    })
    expect(mockedQueries.useModelProfilesQuery).toHaveBeenCalledWith({ staleTime: 60_000 })
    expect(mockedQueries.useWorkflowAssignmentsQuery).toHaveBeenCalledWith({ staleTime: 60_000 })
  })

  it('enables app settings query only after entering a settings tab that needs it', () => {
    useAppUiStore.setState({ activeSettingsSection: 'learning' })
    setupDefaultMocks([storedKeyConfig])

    renderWithProviders(<SettingsPage />)

    expect(mockedQueries.useAppSettingsQuery).toHaveBeenCalledWith({
      enabled: true,
      staleTime: 60_000,
    })
  })

  it('uses a constrained theme select and saves dark mode', () => {
    const updateSettings = vi.fn()
    useAppUiStore.setState({ activeSettingsSection: 'general' })
    setupDefaultMocks([storedKeyConfig])
    mockedQueries.useUpdateAppSettingsMutation.mockReturnValue({
      isPending: false,
      mutate: updateSettings,
      mutateAsync: vi.fn().mockResolvedValue(appSettings),
    } as ReturnType<typeof queries.useUpdateAppSettingsMutation>)

    renderWithProviders(<SettingsPage />)

    const themeSelect = screen.getByTestId('settings-theme-select')
    expect(themeSelect).toHaveValue('light')
    expect(screen.getByRole('option', { name: 'Light' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Dark' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'System' })).toBeInTheDocument()

    fireEvent.change(themeSelect, { target: { value: 'dark' } })
    fireEvent.click(screen.getByRole('button', { name: '保存通用设置' }))

    expect(updateSettings).toHaveBeenCalledWith({
      language: 'zh-CN',
      theme: 'dark',
    })
  })

  it('renders the settings shell while model and workflow data are still loading', () => {
    setupDefaultMocks([storedKeyConfig])
    mockedQueries.useModelProfilesQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof queries.useModelProfilesQuery>)
    mockedQueries.useWorkflowAssignmentsQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof queries.useWorkflowAssignmentsQuery>)

    renderWithProviders(<SettingsPage />)

    expect(screen.getByTestId('settings-toggle-add-config')).toBeInTheDocument()
    expect(screen.getByTestId(`settings-manage-key-${storedKeyConfig.id}`)).toBeInTheDocument()
  })

  it('keeps the openai-compatible provider generic without vendor presets', () => {
    setupDefaultMocks([])
    mockedQueries.useStoreApiKeyMutation.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    } as ReturnType<typeof queries.useStoreApiKeyMutation>)

    renderWithProviders(<SettingsPage />)

    fireEvent.click(screen.getByTestId('settings-toggle-add-config'))
    fireEvent.click(screen.getByText('OpenAI-Compatible').closest('button')!)

    expect(screen.getByText('兼容 OpenAI Chat Completions 协议的服务。')).toBeInTheDocument()
    expect(screen.getByText('此供应商必须填写 Base URL。')).toBeInTheDocument()
    expect(screen.queryByText('百度千帆')).not.toBeInTheDocument()
  })

  it('shows custom protocol templates as explicit provider options', () => {
    setupDefaultMocks([])
    mockedQueries.useStoreApiKeyMutation.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    } as ReturnType<typeof queries.useStoreApiKeyMutation>)

    renderWithProviders(<SettingsPage />)

    fireEvent.click(screen.getByTestId('settings-toggle-add-config'))

    expect(screen.getByText('OpenAI-Compatible')).toBeInTheDocument()
    expect(screen.getByText('Anthropic-Compatible')).toBeInTheDocument()
    expect(screen.getByText('Google-Compatible')).toBeInTheDocument()
  })

  it('auto-fills DeepSeek base URL when DeepSeek is selected', () => {
    setupDefaultMocks([])
    mockedQueries.useStoreApiKeyMutation.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    } as ReturnType<typeof queries.useStoreApiKeyMutation>)

    renderWithProviders(<SettingsPage />)

    fireEvent.click(screen.getByTestId('settings-toggle-add-config'))
    fireEvent.click(screen.getByText('DeepSeek').closest('button')!)

    const baseUrlInput = screen.getByTestId('settings-add-config-base-url') as HTMLInputElement
    expect(baseUrlInput.value).toBe('https://api.deepseek.com/v1')
  })

  it('enables save for DeepSeek when name and apiKey are filled', () => {
    setupDefaultMocks([])
    mockedQueries.useStoreApiKeyMutation.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    } as ReturnType<typeof queries.useStoreApiKeyMutation>)

    renderWithProviders(<SettingsPage />)

    fireEvent.click(screen.getByTestId('settings-toggle-add-config'))
    fireEvent.click(screen.getByText('DeepSeek').closest('button')!)

    fireEvent.change(screen.getByTestId('settings-add-config-name'), {
      target: { value: 'DeepSeek Primary' },
    })
    fireEvent.change(screen.getByTestId('settings-add-config-key'), {
      target: { value: 'sk-deepseek-api-key-12345' },
    })

    expect(screen.getByTestId('settings-save-config')).not.toBeDisabled()
  })

  it('defaults first-run users into the AI setup flow without blocking the page', () => {
    setupDefaultMocks([])
    mockedQueries.useStoreApiKeyMutation.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    } as ReturnType<typeof queries.useStoreApiKeyMutation>)

    renderWithProviders(<SettingsPage forcedOnboarding />)

    expect(screen.getByTestId('settings-add-config-form')).toBeInTheDocument()
    expect(screen.getByTestId('settings-toggle-add-config')).not.toBeDisabled()
    expect(screen.getByTestId('settings-setup-callout')).toBeInTheDocument()
  })

  it('keeps other settings sections reachable during setup guidance', () => {
    setupDefaultMocks([])
    mockedQueries.useStoreApiKeyMutation.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    } as ReturnType<typeof queries.useStoreApiKeyMutation>)

    renderWithProviders(<SettingsPage forcedOnboarding />)

    expect(screen.queryByRole('button', { name: /Podcast/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '学习' }))

    expect(screen.getByRole('heading', { name: '学习' })).toBeInTheDocument()
  })

  it('reports an error instead of failing silently when config save fails', async () => {
    const createConfig = vi.fn().mockRejectedValue(new Error('后端返回的配置缺少 protocol 字段'))
    const storeKey = vi.fn().mockResolvedValue(undefined)

    setupDefaultMocks([])
    mockedQueries.useCreateApiConfigMutation.mockReturnValue({
      isPending: false,
      mutateAsync: createConfig,
    } as ReturnType<typeof queries.useCreateApiConfigMutation>)
    mockedQueries.useStoreApiKeyMutation.mockReturnValue({
      isPending: false,
      mutateAsync: storeKey,
    } as ReturnType<typeof queries.useStoreApiKeyMutation>)

    renderWithProviders(<SettingsPage />)

    fireEvent.click(screen.getByTestId('settings-toggle-add-config'))
    fireEvent.change(screen.getByTestId('settings-add-config-name'), {
      target: { value: 'Broken Config' },
    })
    fireEvent.change(screen.getByTestId('settings-add-config-key'), {
      target: { value: 'broken-key' },
    })
    fireEvent.click(screen.getByTestId('settings-save-config'))

    await waitFor(() => {
      expect(useAppUiStore.getState().feedbackLog[0]?.title).toBe('保存配置失败')
      expect(useAppUiStore.getState().feedbackLog[0]?.detail).toContain('protocol')
    })

    expect(storeKey).not.toHaveBeenCalled()
  })

  it('closes the add provider form without waiting for key storage', async () => {
    const createdConfig: ApiConfig = {
      ...storedKeyConfig,
      id: 'cfg-created-google',
      provider: 'google',
      name: 'Google Primary',
      displayName: 'Google Primary',
      hasStoredCredential: false,
      hasStoredKey: false,
      keyStatus: 'none',
    }
    const createConfig = vi.fn().mockResolvedValue(createdConfig)
    const storeKey = vi.fn(
      () =>
        new Promise<void>(() => {
          // Keep storage pending to prove provider creation is not blocked by Stronghold.
        })
    )

    setupDefaultMocks([])
    mockedQueries.useCreateApiConfigMutation.mockReturnValue({
      isPending: false,
      mutateAsync: createConfig,
    } as ReturnType<typeof queries.useCreateApiConfigMutation>)
    mockedQueries.useStoreApiKeyMutation.mockReturnValue({
      isPending: false,
      mutateAsync: storeKey,
    } as ReturnType<typeof queries.useStoreApiKeyMutation>)

    renderWithProviders(<SettingsPage />)

    fireEvent.click(screen.getByTestId('settings-toggle-add-config'))
    fireEvent.click(screen.getByText('Google').closest('button')!)
    fireEvent.change(screen.getByTestId('settings-add-config-key'), {
      target: { value: 'google-key' },
    })
    fireEvent.click(screen.getByTestId('settings-save-config'))

    await waitFor(() => {
      expect(createConfig).toHaveBeenCalled()
      expect(storeKey).toHaveBeenCalledWith({ configId: createdConfig.id, apiKey: 'google-key' })
      expect(screen.queryByTestId('settings-add-config-form')).not.toBeInTheDocument()
    })
  })

  it('tests a stored provider from the provider card without exposing the api key', async () => {
    const testConnection = vi.fn()
    setupDefaultMocks([storedKeyConfig])
    mockedQueries.useTestApiConnectionMutation.mockReturnValue({
      isPending: false,
      mutate: testConnection,
    } as ReturnType<typeof queries.useTestApiConnectionMutation>)

    renderWithProviders(<SettingsPage />)

    fireEvent.click(screen.getByTestId(`settings-test-config-${storedKeyConfig.id}`))

    expect(testConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        configId: storedKeyConfig.id,
        provider: storedKeyConfig.provider,
        apiKey: null,
      }),
      expect.any(Object)
    )
  })

  it('blocks duplicate model ids before calling create_model_profile', async () => {
    const createModelProfile = vi.fn()

    setupDefaultMocks([storedKeyConfig])
    mockedQueries.useCreateModelProfileMutation.mockReturnValue({
      isPending: false,
      mutateAsync: createModelProfile,
    } as ReturnType<typeof queries.useCreateModelProfileMutation>)

    renderWithProviders(<SettingsPage />)

    fireEvent.change(screen.getByPlaceholderText('模型 ID，例如 gpt-4.1'), {
      target: { value: storedKeyConfig.model },
    })
    fireEvent.click(screen.getByTestId('settings-create-model-profile'))

    await waitFor(() => {
      expect(createModelProfile).not.toHaveBeenCalled()
      expect(screen.getByText(/该连接下已存在模型档案/)).toBeInTheDocument()
    })
  })

  it('no longer shows a separate embedding panel', () => {
    setupDefaultMocks([storedKeyConfig])

    renderWithProviders(<SettingsPage />)

    expect(screen.queryByTestId('settings-embedding-panel')).not.toBeInTheDocument()
  })

  it('keeps stored api keys masked when users edit a provider card', async () => {
    setupDefaultMocks([storedKeyConfig])

    renderWithProviders(<SettingsPage />)

    fireEvent.click(screen.getByTestId(`settings-manage-key-${storedKeyConfig.id}`))

    await waitFor(() => {
      expect(screen.getByTestId(`settings-edit-config-key-${storedKeyConfig.id}`)).toHaveValue('')
      expect(screen.getByPlaceholderText('留空则保持现有 API Key')).toBeInTheDocument()
      expect(screen.getByText('已保存 API Key；留空表示保持不变。')).toBeInTheDocument()
    })
  })

  it('saves metadata-only edits without re-reading or re-writing a stored api key', async () => {
    const updateConfig = vi.fn().mockResolvedValue(storedKeyConfig)
    const storeKey = vi.fn().mockResolvedValue(undefined)

    setupDefaultMocks([storedKeyConfig])
    mockedQueries.useUpdateApiConfigMutation.mockReturnValue({
      isPending: false,
      mutateAsync: updateConfig,
    } as ReturnType<typeof queries.useUpdateApiConfigMutation>)
    mockedQueries.useStoreApiKeyMutation.mockReturnValue({
      isPending: false,
      mutateAsync: storeKey,
    } as ReturnType<typeof queries.useStoreApiKeyMutation>)

    renderWithProviders(<SettingsPage />)

    fireEvent.click(screen.getByTestId(`settings-manage-key-${storedKeyConfig.id}`))
    fireEvent.change(screen.getByTestId(`settings-edit-config-model-${storedKeyConfig.id}`), {
      target: { value: 'gpt-4.1' },
    })
    fireEvent.click(screen.getByTestId(`settings-edit-save-${storedKeyConfig.id}`))

    await waitFor(() => {
      expect(updateConfig).toHaveBeenCalledWith({
        id: storedKeyConfig.id,
        data: expect.objectContaining({
          name: storedKeyConfig.name,
          displayName: storedKeyConfig.displayName,
          model: 'gpt-4.1',
          baseUrl: storedKeyConfig.baseUrl,
        }),
      })
    })

    expect(storeKey).not.toHaveBeenCalled()
  })

  it('disables a config card while that config is being deleted', () => {
    setupDefaultMocks([storedKeyConfig])
    mockedQueries.useDeleteApiConfigMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: true,
      variables: storedKeyConfig.id,
    } as ReturnType<typeof queries.useDeleteApiConfigMutation>)

    renderWithProviders(<SettingsPage />)

    expect(screen.getByTestId(`settings-delete-config-${storedKeyConfig.id}`)).toBeDisabled()
    expect(screen.getByTestId(`settings-manage-key-${storedKeyConfig.id}`)).toBeDisabled()
  })

  it('resets the edit form when the currently edited config disappears', async () => {
    let configsState: ApiConfig[] = [storedKeyConfig]

    mockedQueries.useApiConfigsQuery.mockImplementation(
      () =>
        ({
          data: configsState,
          isLoading: false,
        }) as ReturnType<typeof queries.useApiConfigsQuery>
    )
    mockedQueries.useEmbeddingProfilesQuery.mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof queries.useEmbeddingProfilesQuery>)
    mockedQueries.useActiveEmbeddingProfileQuery.mockReturnValue({
      data: null,
      isLoading: false,
    } as ReturnType<typeof queries.useActiveEmbeddingProfileQuery>)
    mockedQueries.useWorkflowAssignmentsQuery.mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof queries.useWorkflowAssignmentsQuery>)
    mockedQueries.useModelProfilesQuery.mockReturnValue({
      data: configsState.map((config) => ({
        id: `profile-${config.id}`,
        apiConfigId: config.id,
        modelId: config.model ?? 'unknown',
        displayName: config.displayName ?? config.name,
        capabilitiesJson: '[]',
        isEnabled: true,
        isDefaultForConnection: true,
        createdAt: new Date('2026-04-18T10:00:00.000Z'),
        updatedAt: new Date('2026-04-18T10:00:00.000Z'),
        apiConfig: config,
      })),
      isLoading: false,
    } as ReturnType<typeof queries.useModelProfilesQuery>)
    mockedQueries.useAppSettingsQuery.mockReturnValue({
      data: appSettings,
    } as ReturnType<typeof queries.useAppSettingsQuery>)
    mockedQueries.useCreateApiConfigMutation.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    } as ReturnType<typeof queries.useCreateApiConfigMutation>)
    mockedQueries.useUpdateApiConfigMutation.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    } as ReturnType<typeof queries.useUpdateApiConfigMutation>)
    mockedQueries.useDeleteApiConfigMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      variables: undefined,
    } as ReturnType<typeof queries.useDeleteApiConfigMutation>)
    mockedQueries.useDeleteApiKeyMutation.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    } as ReturnType<typeof queries.useDeleteApiKeyMutation>)
    mockedQueries.useCreateModelProfileMutation.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    } as ReturnType<typeof queries.useCreateModelProfileMutation>)
    mockedQueries.useCreateEmbeddingProfileMutation.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    } as ReturnType<typeof queries.useCreateEmbeddingProfileMutation>)
    mockedQueries.useUpdateModelProfileMutation.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    } as ReturnType<typeof queries.useUpdateModelProfileMutation>)
    mockedQueries.useDeleteModelProfileMutation.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    } as ReturnType<typeof queries.useDeleteModelProfileMutation>)
    mockedQueries.useFetchProviderModelsMutation.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn().mockResolvedValue([]),
    } as ReturnType<typeof queries.useFetchProviderModelsMutation>)
    mockedQueries.useProviderBudgetUsageQuery.mockReturnValue({
      data: null,
      isLoading: false,
    } as ReturnType<typeof queries.useProviderBudgetUsageQuery>)
    mockedQueries.useResetProviderBudgetUsageMutation.mockReturnValue({
      mutate: vi.fn(),
    } as ReturnType<typeof queries.useResetProviderBudgetUsageMutation>)
    mockedQueries.useSetDefaultApiConfigMutation.mockReturnValue({
      mutate: vi.fn(),
    } as ReturnType<typeof queries.useSetDefaultApiConfigMutation>)
    mockedQueries.useSetActiveEmbeddingProfileMutation.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    } as ReturnType<typeof queries.useSetActiveEmbeddingProfileMutation>)
    mockedQueries.useSetWorkflowAssignmentMutation.mockReturnValue({
      mutateAsync: vi.fn(),
    } as ReturnType<typeof queries.useSetWorkflowAssignmentMutation>)
    mockedQueries.useSetAllWorkflowAssignmentsMutation.mockReturnValue({
      mutate: vi.fn(),
    } as ReturnType<typeof queries.useSetAllWorkflowAssignmentsMutation>)
    mockedQueries.useStoreApiKeyMutation.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    } as ReturnType<typeof queries.useStoreApiKeyMutation>)
    mockedQueries.useTestApiConnectionMutation.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ success: true, message: 'ok' }),
    } as ReturnType<typeof queries.useTestApiConnectionMutation>)
    mockedQueries.useUpdateAppSettingsMutation.mockReturnValue({
      isPending: false,
      mutate: vi.fn(),
      mutateAsync: vi.fn().mockResolvedValue(appSettings),
    } as ReturnType<typeof queries.useUpdateAppSettingsMutation>)

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const view = render(
      <QueryClientProvider client={queryClient}>
        <SettingsPage />
      </QueryClientProvider>
    )

    fireEvent.click(screen.getByTestId(`settings-manage-key-${storedKeyConfig.id}`))
    expect(screen.getByTestId(`settings-edit-config-key-${storedKeyConfig.id}`)).toBeInTheDocument()

    configsState = []
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <SettingsPage />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.queryByTestId(`settings-edit-config-key-${storedKeyConfig.id}`)).not.toBeInTheDocument()
    })
  })

  // @acceptance:v4-4-a1
  it('lets forced onboarding repair a config that exists but is still missing a stored key', async () => {
    const updateConfig = vi.fn().mockResolvedValue(missingKeyConfig)
    const storeKey = vi.fn().mockResolvedValue(undefined)

    setupDefaultMocks([missingKeyConfig])
    mockedQueries.useUpdateApiConfigMutation.mockReturnValue({
      isPending: false,
      mutateAsync: updateConfig,
    } as ReturnType<typeof queries.useUpdateApiConfigMutation>)
    mockedQueries.useStoreApiKeyMutation.mockReturnValue({
      isPending: false,
      mutateAsync: storeKey,
    } as ReturnType<typeof queries.useStoreApiKeyMutation>)

    renderWithProviders(<SettingsPage forcedOnboarding />)

    fireEvent.click(screen.getByTestId(`settings-manage-key-${missingKeyConfig.id}`))
    fireEvent.change(screen.getByTestId(`settings-edit-config-key-${missingKeyConfig.id}`), {
      target: { value: 'sk-repaired-key' },
    })
    fireEvent.click(screen.getByTestId(`settings-edit-save-${missingKeyConfig.id}`))

    await waitFor(() => {
      expect(updateConfig).toHaveBeenCalledWith({
        id: missingKeyConfig.id,
        data: expect.objectContaining({
          name: missingKeyConfig.name,
          displayName: missingKeyConfig.displayName,
          model: missingKeyConfig.model,
          baseUrl: missingKeyConfig.baseUrl,
        }),
      })
      expect(storeKey).toHaveBeenCalledWith({
        configId: missingKeyConfig.id,
        apiKey: 'sk-repaired-key',
      })
    })
  })
})
