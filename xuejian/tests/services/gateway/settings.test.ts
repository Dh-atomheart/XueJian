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
    podcastGoogleTtsModel: 'gemini-2.5-flash-preview-tts',
    podcastFishAudioEndpoint: null,
    podcastVoiceOverrides: {},
    podcastOutputFormat: 'mp3',
    podcastSkipReview: true,
    podcastMaxLlmTokens: 100000,
    podcastMaxTtsCharacters: 50000,
    podcastMaxEstimatedCostUsd: 1,
  })
})

describe('gateway mocks', () => {
  it('returns redesigned default settings outside Tauri', async () => {
    const settings = await settingsGateway.get()

    expect(settings.theme).toBe('default')
    expect(settings.language).toBe('zh-CN')
    expect(settings.dailyNewCardLimit).toBe(20)
    expect(settings.podcastTtsProvider).toBe('auto')
    expect(settings.podcastGoogleTtsModel).toBe('gemini-2.5-flash-preview-tts')
    expect(settings.podcastOutputFormat).toBe('mp3')
    expect(settings.podcastSkipReview).toBe(true)
    expect(settings.podcastMaxLlmTokens).toBe(100000)
    expect(settings.learningGoal).toBe('knowledge_understanding')
    expect(settings.dailyStudyMinutes).toBe(30)
    expect(settings.studyTimePreference).toBe('evening')
    expect(settings.studyTimePreferences).toEqual(['afternoon', 'evening'])
    expect(settings.studyContentPreferences).toEqual([
      'psychology',
      'cognitive_science',
      'self_improvement',
      'education',
    ])
    expect(settings.defaultVoice).toBe('gentle_female_xiaoxiao')
    expect(settings.speechRate).toBe(1)
    expect(settings.defaultPodcastStyle).toBe('lecture')
    expect(settings.podcastBackgroundMusic).toBe('soft_piano')
    expect(settings.voiceInputLanguage).toBe('zh-CN')
  })

  it('updates and re-reads app settings outside Tauri', async () => {
    const updated = await settingsGateway.update({
      theme: 'default',
      learningGoal: 'exam_preparation',
      studyTimePreferences: ['morning', 'evening'],
      podcastTtsProvider: 'edge_tts',
      podcastGoogleTtsModel: 'gemini-2.5-flash-preview-tts',
      podcastOutputFormat: 'wav',
      podcastSkipReview: false,
      podcastMaxLlmTokens: 25000,
      podcastMaxTtsCharacters: 12000,
      podcastMaxEstimatedCostUsd: 0.35,
      defaultPodcastStyle: 'deep_dive',
    })

    expect(updated.theme).toBe('default')
    expect(updated.learningGoal).toBe('exam_preparation')
    expect(updated.studyTimePreferences).toEqual(['morning', 'evening'])
    expect(updated.podcastTtsProvider).toBe('edge_tts')
    expect(updated.podcastGoogleTtsModel).toBe('gemini-2.5-flash-preview-tts')
    expect(updated.podcastOutputFormat).toBe('wav')
    expect(updated.podcastSkipReview).toBe(false)
    expect(updated.podcastMaxEstimatedCostUsd).toBe(0.35)
    expect(updated.defaultPodcastStyle).toBe('deep_dive')

    const persisted = await settingsGateway.get()
    expect(persisted.theme).toBe('default')
    expect(persisted.learningGoal).toBe('exam_preparation')
    expect(persisted.studyTimePreferences).toEqual(['morning', 'evening'])
    expect(persisted.podcastTtsProvider).toBe('edge_tts')
    expect(persisted.podcastGoogleTtsModel).toBe('gemini-2.5-flash-preview-tts')
    expect(persisted.podcastOutputFormat).toBe('wav')
    expect(persisted.podcastSkipReview).toBe(false)
    expect(persisted.podcastMaxTtsCharacters).toBe(12000)
    expect(persisted.defaultPodcastStyle).toBe('deep_dive')
  })

  it('returns an empty API config list outside Tauri', async () => {
    const configs = await apiConfigGateway.list()
    expect(configs).toEqual([])
  })

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

    expect(created.provider).toBe('custom_openai')
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
      provider: 'custom_openai',
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

    expect(created.provider).toBe('custom_openai')
    expect(created.protocol).toBe('openai-compatible')
  })

  it('still accepts legacy openai_compatible input while normalizing output', async () => {
    const created = await apiConfigGateway.create({
      provider: 'openai_compatible',
      authMode: 'api_key',
      name: 'Legacy Compatible Input',
      model: 'qwen2.5-14b-instruct',
      baseUrl: 'http://localhost:11434/v1',
      budgetLimit: null,
      isDefault: false,
      isEnabled: true,
    })

    expect(created.provider).toBe('custom_openai')
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
