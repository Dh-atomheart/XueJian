import type { AppSettings } from '@/types'
import { appSettingsSchema } from '@/types'
import { invokeWithSchema } from './index'

/**
 * 设置相关命令
 */
export const settingsGateway = {
  async get(): Promise<AppSettings> {
    return invokeWithSchema('get_settings', appSettingsSchema)
  },

  async update(data: Partial<AppSettings>): Promise<AppSettings> {
    return invokeWithSchema('update_settings', appSettingsSchema, { data })
  },
}
