import { invoke } from './index'

interface AppSettings {
  theme: 'default' | 'dark' | 'light'
  language: 'zh-CN' | 'en-US'
  dailyNewCardLimit: number
  reviewTimeLimit: number
}

/**
 * 设置相关命令
 */
export const settingsGateway = {
  async get(): Promise<AppSettings> {
    return invoke<AppSettings>('get_settings')
  },

  async update(settings: Partial<AppSettings>): Promise<void> {
    return invoke<void>('update_settings', { settings })
  },
}
