import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsPage } from '@/features/settings/SettingsPage'
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
  name: 'OpenAI Primary',
  model: 'gpt-4o',
  baseUrl: null,
  budgetLimit: null,
  isDefault: true,
  isEnabled: true,
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
})

afterEach(() => {
  cleanup()
})

describe('settings onboarding flow', () => {
  it('keeps the first-run create form open and non-dismissible until a usable model exists', () => {
    setupDefaultMocks([])
    mockedQueries.useStoreApiKeyMutation.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    } as ReturnType<typeof queries.useStoreApiKeyMutation>)

    render(<SettingsPage forcedOnboarding />)

    expect(screen.getByTestId('settings-add-config-form')).toBeInTheDocument()
    expect(screen.getByTestId('settings-toggle-add-config')).toBeDisabled()
  })

  // @acceptance:v4-4-a1
  it('lets forced onboarding repair a config that exists but is still missing a stored key', async () => {
    const storeKey = vi.fn().mockResolvedValue(undefined)

    setupDefaultMocks([missingKeyConfig])
    mockedQueries.useStoreApiKeyMutation.mockReturnValue({
      isPending: false,
      mutateAsync: storeKey,
    } as ReturnType<typeof queries.useStoreApiKeyMutation>)

    render(<SettingsPage forcedOnboarding />)

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
