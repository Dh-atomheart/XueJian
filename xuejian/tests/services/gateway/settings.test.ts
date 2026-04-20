import { apiConfigGateway } from '@/services/gateway/models'
import { resetMockGatewayState } from '@/services/gateway/mockData'
import { orchestrationGateway } from '@/services/gateway/orchestration'
import { settingsGateway } from '@/services/gateway/settings'

beforeEach(async () => {
  resetMockGatewayState()
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

  // @acceptance:v4-5-a1
  it('persists an openai-compatible API config across mock create, store key, and list calls', async () => {
    const created = await apiConfigGateway.create({
      provider: 'custom',
      authMode: 'api_key',
      name: 'Local OpenAI Compatible',
      model: 'qwen2.5-14b-instruct',
      baseUrl: 'http://localhost:11434/v1',
      budgetLimit: null,
      isDefault: true,
      isEnabled: true,
    })

    expect(created.provider).toBe('custom')
    expect(created.protocol).toBe('openai-compatible')
    expect(created.authMode).toBe('api_key')
    expect(created.baseUrl).toBe('http://localhost:11434/v1')
    expect(created.hasStoredCredential).toBe(false)
    expect(created.hasStoredKey).toBe(false)

    await apiConfigGateway.storeApiKey(created.id, 'local-secret-key')

    const configs = await apiConfigGateway.list()

    expect(configs).toHaveLength(1)
    expect(configs[0]).toMatchObject({
      id: created.id,
      provider: 'custom',
      protocol: 'openai-compatible',
      authMode: 'api_key',
      name: 'Local OpenAI Compatible',
      model: 'qwen2.5-14b-instruct',
      baseUrl: 'http://localhost:11434/v1',
      hasStoredCredential: true,
      hasStoredKey: true,
      isDefault: true,
      isEnabled: true,
    })
  })

  it('assigns openai-compatible protocol to qianfan configs outside Tauri', async () => {
    const created = await apiConfigGateway.create({
      provider: 'qianfan',
      authMode: 'api_key',
      name: 'Baidu Qianfan',
      model: 'ernie-speed',
      baseUrl: 'https://qianfan.baidubce.com/v2',
      budgetLimit: null,
      isDefault: true,
      isEnabled: true,
      protocol: null,
    })

    expect(created.provider).toBe('qianfan')
    expect(created.protocol).toBe('openai-compatible')
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
