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
    useCreateApiConfigMutation: vi.fn(),
    useDeleteApiConfigMutation: vi.fn(),
    useDeleteApiKeyMutation: vi.fn(),
    useFetchProviderModelsMutation: vi.fn(),
    useProviderBudgetUsageQuery: vi.fn(),
    useResetProviderBudgetUsageMutation: vi.fn(),
    useSetDefaultApiConfigMutation: vi.fn(),
    useSetAllWorkflowAssignmentsMutation: vi.fn(),
    useSetWorkflowAssignmentMutation: vi.fn(),
    useStoreApiKeyMutation: vi.fn(),
    useTestApiConnectionMutation: vi.fn(),
    useAppSettingsQuery: vi.fn(),
    useUpdateApiConfigMutation: vi.fn(),
    useUpdateAppSettingsMutation: vi.fn(),
    useWorkflowAssignmentsQuery: vi.fn(),
  }
})

const appSettings: AppSettings = {
  theme: 'default',
  language: 'zh-CN',
  dailyNewCardLimit: 20,
  reviewTimeLimit: 30,
  podcastTtsProvider: 'auto',
  podcastOpenaiModel: 'tts-1',
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
  mockedQueries.useWorkflowAssignmentsQuery.mockReturnValue({
    data: [],
    isLoading: false,
  } as ReturnType<typeof queries.useWorkflowAssignmentsQuery>)
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
  mockedQueries.useSetWorkflowAssignmentMutation.mockReturnValue({
    mutate: vi.fn(),
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
  useAppUiStore.setState({ feedbackLog: [], activeNotices: [], isFeedbackPanelOpen: false })
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
  it('keeps the openai-compatible provider generic without vendor presets', () => {
    setupDefaultMocks([])
    mockedQueries.useStoreApiKeyMutation.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    } as ReturnType<typeof queries.useStoreApiKeyMutation>)

    renderWithProviders(<SettingsPage />)

    fireEvent.click(screen.getByTestId('settings-toggle-add-config'))
    fireEvent.click(screen.getByText('OpenAI-Compatible').closest('button')!)

    expect(screen.getByText('兼容 OpenAI Chat Completions 协议的任意服务。')).toBeInTheDocument()
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

    fireEvent.click(screen.getByRole('button', { name: /Podcast/i }))

    expect(screen.getByRole('heading', { name: '播客与语音' })).toBeInTheDocument()
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

  it('lets users delete a stored key without deleting the config', async () => {
    const deleteKey = vi.fn().mockResolvedValue(undefined)
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    setupDefaultMocks([storedKeyConfig])
    mockedQueries.useDeleteApiKeyMutation.mockReturnValue({
      isPending: false,
      mutateAsync: deleteKey,
    } as ReturnType<typeof queries.useDeleteApiKeyMutation>)

    renderWithProviders(<SettingsPage />)

    fireEvent.click(screen.getByTestId(`settings-manage-key-${storedKeyConfig.id}`))
    fireEvent.click(screen.getByTestId('settings-delete-key'))

    await waitFor(() => {
      expect(deleteKey).toHaveBeenCalledWith(storedKeyConfig.id)
    })
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
    mockedQueries.useWorkflowAssignmentsQuery.mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof queries.useWorkflowAssignmentsQuery>)
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
    mockedQueries.useSetWorkflowAssignmentMutation.mockReturnValue({
      mutate: vi.fn(),
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
    expect(screen.getByTestId('settings-update-config-form')).toBeInTheDocument()

    configsState = []
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <SettingsPage />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.queryByTestId('settings-update-config-form')).not.toBeInTheDocument()
    })
  })

  // @acceptance:v4-4-a1
  it('lets forced onboarding repair a config that exists but is still missing a stored key', async () => {
    const storeKey = vi.fn().mockResolvedValue(undefined)

    setupDefaultMocks([missingKeyConfig])
    mockedQueries.useStoreApiKeyMutation.mockReturnValue({
      isPending: false,
      mutateAsync: storeKey,
    } as ReturnType<typeof queries.useStoreApiKeyMutation>)

    renderWithProviders(<SettingsPage forcedOnboarding />)

    fireEvent.click(screen.getByTestId(`settings-manage-key-${missingKeyConfig.id}`))
    fireEvent.change(screen.getByTestId('settings-update-config-key'), {
      target: { value: 'sk-repaired-key' },
    })
    fireEvent.click(screen.getByTestId('settings-update-save-key'))

    await waitFor(() => {
      expect(storeKey).toHaveBeenCalledWith({
        configId: missingKeyConfig.id,
        apiKey: 'sk-repaired-key',
      })
    })
  })
})
