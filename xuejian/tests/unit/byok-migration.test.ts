import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiConfig } from '@/types'
import {
  LEGACY_AI_CONFIG_MIGRATION_FLAG,
  migrateLegacyAiConfig,
} from '@/features/settings/byokMigration'

const STORE_KEY = 'xuejian-app-store'

function makeConfig(overrides: Partial<ApiConfig> = {}): ApiConfig {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    provider: 'openai',
    protocol: 'native',
    authMode: 'api_key',
    name: 'Primary',
    baseUrl: null,
    model: 'gpt-4o-mini',
    budgetLimit: null,
    isDefault: true,
    isEnabled: true,
    hasStoredCredential: true,
    hasStoredKey: true,
    keyVerifiedAt: null,
    keyStatus: 'stored',
    displayName: 'Primary',
    createdAt: new Date('2026-04-23T00:00:00.000Z'),
    ...overrides,
  }
}

function seedLegacyStore() {
  window.localStorage.setItem(
    STORE_KEY,
    JSON.stringify({
      state: {
        aiConfig: {
          provider: 'openai',
          model: 'gpt-4o',
          apiKey: 'sk-test-key',
          baseUrl: 'https://api.openai.com/v1',
        },
      },
    })
  )
}

describe('legacy BYOK migration', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  it('migrates legacy aiConfig into the new BYOK system on startup', async () => {
    seedLegacyStore()
    const createApiConfig = vi.fn().mockResolvedValue(makeConfig())
    const storeApiKey = vi.fn().mockResolvedValue(undefined)
    const setAllWorkflowAssignments = vi.fn().mockResolvedValue([])
    const invalidateQueries = vi.fn().mockResolvedValue(undefined)
    const notifySuccess = vi.fn()

    const result = await migrateLegacyAiConfig({
      apiConfigs: [],
      createApiConfig,
      storeApiKey,
      setAllWorkflowAssignments,
      invalidateQueries,
      notifySuccess,
    })

    expect(result).toBe('migrated')
    expect(createApiConfig).toHaveBeenCalledOnce()
    expect(storeApiKey).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', 'sk-test-key')
    expect(setAllWorkflowAssignments).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111')
    expect(invalidateQueries).toHaveBeenCalledOnce()
    expect(notifySuccess).toHaveBeenCalledOnce()
    expect(window.localStorage.getItem(LEGACY_AI_CONFIG_MIGRATION_FLAG)).toBe('true')

    const stored = JSON.parse(window.localStorage.getItem(STORE_KEY) ?? '{}')
    expect(stored.state.aiConfig).toBeNull()
  })

  it('retires legacy aiConfig without recreating configs when new configs already exist', async () => {
    seedLegacyStore()
    const createApiConfig = vi.fn()

    const result = await migrateLegacyAiConfig({
      apiConfigs: [makeConfig()],
      createApiConfig,
    })

    expect(result).toBe('retired')
    expect(createApiConfig).not.toHaveBeenCalled()
    expect(window.localStorage.getItem(LEGACY_AI_CONFIG_MIGRATION_FLAG)).toBe('true')

    const stored = JSON.parse(window.localStorage.getItem(STORE_KEY) ?? '{}')
    expect(stored.state.aiConfig).toBeNull()
  })
})
