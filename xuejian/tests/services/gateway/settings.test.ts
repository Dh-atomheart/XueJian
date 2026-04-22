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
    podcastTtsProvider: 'auto',
    podcastOpenaiModel: 'tts-1',
    podcastFishAudioEndpoint: null,
    podcastVoiceOverrides: {},
    podcastOutputFormat: 'mp3',
    podcastSkipReview: true,
    podcastMaxLlmTokens: 100000,
    podcastMaxTtsCharacters: 50000,
    podcastMaxEstimatedCostUsd: 1,
  })
})

// @acceptance:m1-a2
describe('gateway mocks', () => {
  it('returns default settings outside Tauri', async () => {
    const settings = await settingsGateway.get()

    expect(settings.theme).toBe('default')
    expect(settings.language).toBe('zh-CN')
    expect(settings.dailyNewCardLimit).toBe(20)
    expect(settings.podcastTtsProvider).toBe('auto')
    expect(settings.podcastOutputFormat).toBe('mp3')
    expect(settings.podcastSkipReview).toBe(true)
    expect(settings.podcastMaxLlmTokens).toBe(100000)
  })

  // @acceptance:v4-2-a1
  it('updates and re-reads app settings outside Tauri', async () => {
    const updated = await settingsGateway.update({
      theme: 'comic-sketch',
      podcastTtsProvider: 'edge_tts',
      podcastOutputFormat: 'wav',
      podcastSkipReview: false,
      podcastMaxLlmTokens: 25000,
      podcastMaxTtsCharacters: 12000,
      podcastMaxEstimatedCostUsd: 0.35,
    })
    expect(updated.theme).toBe('comic-sketch')
    expect(updated.podcastTtsProvider).toBe('edge_tts')
    expect(updated.podcastOutputFormat).toBe('wav')
    expect(updated.podcastSkipReview).toBe(false)
    expect(updated.podcastMaxEstimatedCostUsd).toBe(0.35)

    const persisted = await settingsGateway.get()
    expect(persisted.theme).toBe('comic-sketch')
    expect(persisted.podcastTtsProvider).toBe('edge_tts')
    expect(persisted.podcastOutputFormat).toBe('wav')
    expect(persisted.podcastSkipReview).toBe(false)
    expect(persisted.podcastMaxTtsCharacters).toBe(12000)
  })

  it('returns an empty API config list outside Tauri', async () => {
    const configs = await apiConfigGateway.list()

    expect(configs).toEqual([])
  })

  // @acceptance:v4-5-a1
  it('persists an openai-compatible API config across mock create, store key, and list calls', async () => {
    const created = await apiConfigGateway.create({
      provider: 'openai_compatible',
      authMode: 'api_key',
      name: 'Local OpenAI Compatible',
      model: 'qwen2.5-14b-instruct',
      baseUrl: 'http://localhost:11434/v1',
      budgetLimit: null,
      isDefault: true,
      isEnabled: true,
    })

    expect(created.provider).toBe('openai_compatible')
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
      provider: 'openai_compatible',
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
      provider: 'openai_compatible',
      authMode: 'api_key',
      name: 'OpenAI Compatible Endpoint',
      model: 'ernie-speed',
      baseUrl: 'https://qianfan.baidubce.com/v2',
      budgetLimit: null,
      isDefault: true,
      isEnabled: true,
      protocol: null,
    })

    expect(created.provider).toBe('openai_compatible')
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
