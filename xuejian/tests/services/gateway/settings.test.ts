import { apiConfigGateway } from '@/services/gateway/models'
import { orchestrationGateway } from '@/services/gateway/orchestration'
import { settingsGateway } from '@/services/gateway/settings'

beforeEach(async () => {
  await settingsGateway.update({
    theme: 'default',
    language: 'zh-CN',
    dailyNewCardLimit: 20,
    reviewTimeLimit: 30,
  })
})

// @acceptance:m1-a2
describe('gateway mocks', () => {
  it('returns default settings outside Tauri', async () => {
    const settings = await settingsGateway.get()

    expect(settings.theme).toBe('default')
    expect(settings.language).toBe('zh-CN')
    expect(settings.dailyNewCardLimit).toBe(20)
  })

  // @acceptance:v4-2-a1
  it('updates and re-reads app settings outside Tauri', async () => {
    const updated = await settingsGateway.update({ theme: 'comic-sketch' })
    expect(updated.theme).toBe('comic-sketch')

    const persisted = await settingsGateway.get()
    expect(persisted.theme).toBe('comic-sketch')
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
