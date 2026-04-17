import { apiConfigGateway } from '@/services/gateway/models'
import { orchestrationGateway } from '@/services/gateway/orchestration'
import { settingsGateway } from '@/services/gateway/settings'

describe('gateway mocks', () => {
  it('returns default settings outside Tauri', async () => {
    const settings = await settingsGateway.get()

    expect(settings.theme).toBe('default')
    expect(settings.language).toBe('zh-CN')
    expect(settings.dailyNewCardLimit).toBe(20)
  })

  it('returns an empty API config list outside Tauri', async () => {
    const configs = await apiConfigGateway.list()

    expect(configs).toEqual([])
  })

  it('returns orchestration health and manifest mocks outside Tauri', async () => {
    const [health, manifest] = await Promise.all([
      orchestrationGateway.getHealth(),
      orchestrationGateway.getManifest(),
    ])

    expect(health.status).toBe('stopped')
    expect(manifest.protocolVersion).toBe('xuejian-orchestration/v1')
    expect(manifest.modelGatewayCommands.length).toBeGreaterThan(0)
  })
})
