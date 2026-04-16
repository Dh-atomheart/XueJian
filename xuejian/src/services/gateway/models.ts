import { invoke } from './index'
import type { ModelProfile } from '@/types'

/**
 * 模型配置相关命令
 */
export const modelGateway = {
  async list(): Promise<ModelProfile[]> {
    return invoke<ModelProfile[]>('get_model_profiles')
  },

  async get(id: string): Promise<ModelProfile | null> {
    return invoke<ModelProfile | null>('get_model_profile', { id })
  },

  async create(profile: Omit<ModelProfile, 'id' | 'createdAt'>): Promise<ModelProfile> {
    return invoke<ModelProfile>('create_model_profile', { profile })
  },

  async update(id: string, profile: Partial<ModelProfile>): Promise<ModelProfile> {
    return invoke<ModelProfile>('update_model_profile', { id, profile })
  },

  async delete(id: string): Promise<void> {
    return invoke<void>('delete_model_profile', { id })
  },

  async testConnection(id: string): Promise<{ success: boolean; message: string }> {
    return invoke<{ success: boolean; message: string }>('test_model_connection', { id })
  },

  async setDefault(id: string): Promise<void> {
    return invoke<void>('set_default_model_profile', { id })
  },
}
