import { useEffect } from 'react'
import { apiConfigQueryKeys, useApiConfigsQuery } from '@/queries/apiConfigs'
import { queryClient } from '@/queries/queryClient'
import { apiConfigGateway } from '@/services/gateway/models'
import type { ApiConfig } from '@/types'
import { reportAppError, reportFeedback } from '@/lib/appFeedback'
import {
  clearLegacyAiConfig,
  getProviderDefinition,
  getRecommendedModel,
  normalizeLegacyProvider,
  readLegacyAiConfig,
} from './byok'

export const LEGACY_AI_CONFIG_STORE_KEY = 'xuejian-app-store'
export const LEGACY_AI_CONFIG_MIGRATION_FLAG = 'xuejian-byok-migrated'

type MigrationResult = 'skipped' | 'retired' | 'migrated'

interface MigrateLegacyAiConfigOptions {
  apiConfigs: ApiConfig[]
  createApiConfig?: typeof apiConfigGateway.create
  storeApiKey?: typeof apiConfigGateway.storeApiKey
  setAllWorkflowAssignments?: typeof apiConfigGateway.setAllWorkflowAssignments
  invalidateQueries?: () => Promise<void>
  notifySuccess?: () => void
  notifyError?: (error: unknown) => void
}

function inferConfigProtocol(provider: ApiConfig['provider']): ApiConfig['protocol'] {
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

function hasMigrationFlag() {
  if (typeof window === 'undefined') {
    return false
  }

  return window.localStorage.getItem(LEGACY_AI_CONFIG_MIGRATION_FLAG) === 'true'
}

function markMigrationFlag() {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(LEGACY_AI_CONFIG_MIGRATION_FLAG, 'true')
}

async function invalidateByokQueries() {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: apiConfigQueryKeys.all }),
    queryClient.invalidateQueries({ queryKey: apiConfigQueryKeys.workflowAssignments }),
  ])
}

export async function migrateLegacyAiConfig(
  options: MigrateLegacyAiConfigOptions
): Promise<MigrationResult> {
  if (typeof window === 'undefined') {
    return 'skipped'
  }

  const legacyConfig = readLegacyAiConfig()
  const existingConfigs = options.apiConfigs.length > 0

  if (hasMigrationFlag() || existingConfigs) {
    if (legacyConfig) {
      clearLegacyAiConfig()
    }
    markMigrationFlag()
    return legacyConfig ? 'retired' : 'skipped'
  }

  if (!legacyConfig) {
    return 'skipped'
  }

  const provider = normalizeLegacyProvider(legacyConfig.provider)
  const definition = getProviderDefinition(provider)
  const createApiConfig = options.createApiConfig ?? apiConfigGateway.create
  const storeApiKey = options.storeApiKey ?? apiConfigGateway.storeApiKey
  const setAllWorkflowAssignments =
    options.setAllWorkflowAssignments ?? apiConfigGateway.setAllWorkflowAssignments
  const invalidateQueries = options.invalidateQueries ?? invalidateByokQueries

  try {
    const created = await createApiConfig({
      provider,
      protocol: inferConfigProtocol(provider),
      authMode: 'api_key',
      name: `${definition?.name ?? provider} Migration`,
      displayName: definition?.name ?? null,
      model: legacyConfig.model || getRecommendedModel(provider),
      baseUrl: legacyConfig.baseUrl ?? definition?.defaultBaseUrl ?? null,
      budgetLimit: null,
      isDefault: true,
      isEnabled: true,
    })

    if (legacyConfig.apiKey) {
      await storeApiKey(created.id, legacyConfig.apiKey)
    }

    await setAllWorkflowAssignments(created.id)
    clearLegacyAiConfig()
    markMigrationFlag()
    await invalidateQueries()
    options.notifySuccess?.()
    return 'migrated'
  } catch (error) {
    options.notifyError?.(error)
    return 'skipped'
  }
}

let startupMigrationAttempted = false

export function ByokBootstrap() {
  const { data: configs = [], isLoading } = useApiConfigsQuery()

  useEffect(() => {
    if (startupMigrationAttempted || isLoading) {
      return
    }

    startupMigrationAttempted = true
    void migrateLegacyAiConfig({
      apiConfigs: configs,
      notifySuccess: () => {
        reportFeedback({
          scope: 'BYOK',
          title: 'Legacy AI settings migrated',
          detail: 'Existing local AI settings were moved to the new BYOK configuration system.',
        })
      },
      notifyError: (error) => {
        reportAppError('BYOK', error, {
          title: 'Legacy AI settings migration failed',
          fallbackDetail:
            'The legacy aiConfig payload could not be migrated automatically. Create a new provider configuration manually if needed.',
        })
      },
    })
  }, [configs, isLoading])

  return null
}
