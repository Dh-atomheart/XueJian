import { z } from 'zod'
import { apiConfigSchema, apiConnectionTestResultSchema, embeddingProfileSchema } from '@/types'
import type {
  ApiAuthMode,
  ApiConfig,
  ApiConnectionTestResult,
  EmbeddingProfile,
  ModelProfile,
} from '@/types'
import { invoke, invokeWithSchema } from './index'

type ApiConfigDraft = Omit<ApiConfig, 'id' | 'createdAt' | 'hasStoredCredential' | 'hasStoredKey'>
type ApiConfigUpdate = Partial<
  Omit<ApiConfig, 'id' | 'createdAt' | 'hasStoredCredential' | 'hasStoredKey'>
>

/**
 * API 配置相关命令。
 * `modelGateway` 作为兼容别名保留，避免 UI 层直接依赖旧命名。
 */
export const apiConfigGateway = {
  async list(): Promise<ApiConfig[]> {
    return invokeWithSchema('list_api_configs', z.array(apiConfigSchema))
  },

  async get(id: string): Promise<ApiConfig | null> {
    return invokeWithSchema('get_api_config', apiConfigSchema.nullable(), { id })
  },

  async create(data: ApiConfigDraft): Promise<ApiConfig> {
    return invokeWithSchema('create_api_config', apiConfigSchema, { data })
  },

  async update(id: string, data: ApiConfigUpdate): Promise<ApiConfig> {
    return invokeWithSchema('update_api_config', apiConfigSchema, { id, data })
  },

  async delete(id: string): Promise<void> {
    return invoke<void>('delete_api_config', { id })
  },

  async testConnection(data: {
    provider: ApiConfig['provider']
    authMode: ApiAuthMode
    apiKey: string
    baseUrl?: string | null
    model?: string | null
  }): Promise<ApiConnectionTestResult> {
    return invokeWithSchema('test_api_connection', apiConnectionTestResultSchema, { data })
  },

  async setDefault(id: string): Promise<void> {
    return invoke<void>('set_default_api_config', { id })
  },

  async storeApiKey(configId: string, apiKey: string): Promise<void> {
    return invoke<void>('store_api_key', { data: { configId, apiKey } })
  },
}

export const embeddingProfileGateway = {
  async list(): Promise<EmbeddingProfile[]> {
    return invokeWithSchema('list_embedding_profiles', z.array(embeddingProfileSchema))
  },

  async getActive(): Promise<EmbeddingProfile | null> {
    return invokeWithSchema('get_active_embedding_profile', embeddingProfileSchema.nullable())
  },

  async create(data: {
    provider: EmbeddingProfile['provider']
    model: string
    dimensions: number
    distanceMetric?: 'cosine'
    isActive: boolean
    revision: number
  }): Promise<EmbeddingProfile> {
    return invokeWithSchema('create_embedding_profile', embeddingProfileSchema, { data })
  },

  async setActive(id: string): Promise<EmbeddingProfile> {
    return invokeWithSchema('set_active_embedding_profile', embeddingProfileSchema, { id })
  },
}

export const modelGateway: {
  list: () => Promise<ModelProfile[]>
  get: (id: string) => Promise<ModelProfile | null>
  create: (data: ApiConfigDraft) => Promise<ModelProfile>
  update: (id: string, data: ApiConfigUpdate) => Promise<ModelProfile>
  delete: (id: string) => Promise<void>
  testConnection: (data: {
    provider: ApiConfig['provider']
    authMode: ApiAuthMode
    apiKey: string
    baseUrl?: string | null
    model?: string | null
  }) => Promise<ApiConnectionTestResult>
  setDefault: (id: string) => Promise<void>
  storeApiKey: (configId: string, apiKey: string) => Promise<void>
} = apiConfigGateway
