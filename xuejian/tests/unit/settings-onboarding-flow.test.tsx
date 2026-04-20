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
    useSetDefaultApiConfigMutation: vi.fn(),
    useStoreApiKeyMutation: vi.fn(),
    useTestApiConnectionMutation: vi.fn(),
    useAppSettingsQuery: vi.fn(),
    useUpdateAppSettingsMutation: vi.fn(),
  }
})

const appSettings: AppSettings = {
  theme: 'default',
  language: 'zh-CN',
  dailyNewCardLimit: 20,
  reviewTimeLimit: 30,
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
  createdAt: new Date('2026-04-18T10:00:00.000Z'),
}

const mockedQueries = vi.mocked(queries)

function setupDefaultMocks(configs: ApiConfig[]) {
  mockedQueries.useApiConfigsQuery.mockReturnValue({
    data: configs,
    isLoading: false,
  } as ReturnType<typeof queries.useApiConfigsQuery>)
  mockedQueries.useAppSettingsQuery.mockReturnValue({
    data: appSettings,
  } as ReturnType<typeof queries.useAppSettingsQuery>)
  mockedQueries.useCreateApiConfigMutation.mockReturnValue({
    isPending: false,
    mutateAsync: vi.fn(),
  } as ReturnType<typeof queries.useCreateApiConfigMutation>)
  mockedQueries.useDeleteApiConfigMutation.mockReturnValue({
    mutate: vi.fn(),
  } as ReturnType<typeof queries.useDeleteApiConfigMutation>)
  mockedQueries.useSetDefaultApiConfigMutation.mockReturnValue({
    mutate: vi.fn(),
  } as ReturnType<typeof queries.useSetDefaultApiConfigMutation>)
  mockedQueries.useTestApiConnectionMutation.mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue({ success: true, message: 'ok' }),
  } as ReturnType<typeof queries.useTestApiConnectionMutation>)
  mockedQueries.useUpdateAppSettingsMutation.mockReturnValue({
    isPending: false,
    mutate: vi.fn(),
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
    fireEvent.click(screen.getByRole('button', { name: 'OpenAI-Compatible' }))

    expect(
      screen.getByText(
        '输入兼容 OpenAI Chat Completions 的服务基地址。当前不内置任何厂商定向预设。'
      )
    ).toBeInTheDocument()
    // "Coding Plan" vendor preset must not appear
    expect(screen.queryByText(/Coding Plan/i)).not.toBeInTheDocument()
  })

  it('shows 百度千帆 as an explicit provider option', () => {
    setupDefaultMocks([])
    mockedQueries.useStoreApiKeyMutation.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    } as ReturnType<typeof queries.useStoreApiKeyMutation>)

    renderWithProviders(<SettingsPage />)

    fireEvent.click(screen.getByTestId('settings-toggle-add-config'))

    expect(screen.getByRole('button', { name: '百度千帆' })).toBeInTheDocument()
  })

  it('auto-fills Qianfan base URL when 百度千帆 is selected', () => {
    setupDefaultMocks([])
    mockedQueries.useStoreApiKeyMutation.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    } as ReturnType<typeof queries.useStoreApiKeyMutation>)

    renderWithProviders(<SettingsPage />)

    fireEvent.click(screen.getByTestId('settings-toggle-add-config'))
    fireEvent.click(screen.getByRole('button', { name: '百度千帆' }))

    const baseUrlInput = screen.getByTestId('settings-add-config-base-url') as HTMLInputElement
    expect(baseUrlInput.value).toBe('https://qianfan.baidubce.com/v2')
  })

  it('enables save for 百度千帆 when name and apiKey are filled (no manual base URL needed)', () => {
    setupDefaultMocks([])
    mockedQueries.useStoreApiKeyMutation.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    } as ReturnType<typeof queries.useStoreApiKeyMutation>)

    renderWithProviders(<SettingsPage />)

    fireEvent.click(screen.getByTestId('settings-toggle-add-config'))
    fireEvent.click(screen.getByRole('button', { name: '百度千帆' }))

    fireEvent.change(screen.getByTestId('settings-add-config-name'), {
      target: { value: '千帆 Pro' },
    })
    fireEvent.change(screen.getByTestId('settings-add-config-key'), {
      target: { value: 'qianfan-api-key-12345' },
    })

    expect(screen.getByTestId('settings-save-config')).not.toBeDisabled()
  })

  it('keeps the first-run create form open and non-dismissible until a usable model exists', () => {
    setupDefaultMocks([])
    mockedQueries.useStoreApiKeyMutation.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    } as ReturnType<typeof queries.useStoreApiKeyMutation>)

    renderWithProviders(<SettingsPage forcedOnboarding />)

    expect(screen.getByTestId('settings-add-config-form')).toBeInTheDocument()
    expect(screen.getByTestId('settings-toggle-add-config')).toBeDisabled()
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
