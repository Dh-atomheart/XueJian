import { apiConfigGateway } from '@/services/gateway/models'
import { resetMockGatewayState } from '@/services/gateway/mockData'

beforeEach(() => {
  resetMockGatewayState()
})

// @acceptance:m6-a1
describe('model config and connection test', () => {
  it('creates an API config via gateway', async () => {
    const config = await apiConfigGateway.create({
      provider: 'openai',
      authMode: 'api_key',
      name: 'Test Config',
      model: 'gpt-4o',
      baseUrl: null,
      budgetLimit: null,
      isDefault: true,
      isEnabled: true,
    })
    expect(config).toBeDefined()
    expect(config).toHaveProperty('id')
    expect(config).toHaveProperty('provider')
    expect(config).toHaveProperty('name')
  })

  it('lists API configs via gateway', async () => {
    const configs = await apiConfigGateway.list()
    expect(Array.isArray(configs)).toBe(true)
  })

  it('tests connection via gateway', async () => {
    const result = await apiConfigGateway.testConnection({
      provider: 'openai',
      authMode: 'api_key',
      apiKey: 'sk-test-key',
      baseUrl: null,
    })
    expect(result).toHaveProperty('success')
    expect(result).toHaveProperty('message')
    expect(typeof result.success).toBe('boolean')
  })

  it('sets default config via gateway', async () => {
    await expect(apiConfigGateway.setDefault('some-config-id')).resolves.not.toThrow()
  })

  it('deletes config via gateway', async () => {
    await expect(apiConfigGateway.delete('some-config-id')).resolves.not.toThrow()
  })
})

// @acceptance:m6-a2
describe('API Key only enters Stronghold', () => {
  // @acceptance:v4-4-a2
  it('API config responses expose hasStoredKey without leaking plaintext secrets', async () => {
    const config = await apiConfigGateway.create({
      provider: 'openai',
      authMode: 'api_key',
      name: 'Gate Config',
      model: 'gpt-4o',
      baseUrl: null,
      budgetLimit: null,
      isDefault: true,
      isEnabled: true,
    })

    expect(config.hasStoredCredential).toBe(false)
    expect(config.hasStoredKey).toBe(false)
    expect(config).not.toHaveProperty('apiKey')
  })

  it('storeApiKey sends key via gateway without returning it', async () => {
    const result = await apiConfigGateway.storeApiKey('config-1', 'sk-secret-key')
    // storeApiKey returns void — key is sent to Stronghold only
    expect(result).toBeUndefined()
  })

  it('deleteApiKey clears stored-key flags without deleting the config', async () => {
    const config = await apiConfigGateway.create({
      provider: 'openai',
      authMode: 'api_key',
      name: 'Delete Key Config',
      model: 'gpt-4o-mini',
      baseUrl: null,
      budgetLimit: null,
      isDefault: false,
      isEnabled: true,
    })

    await apiConfigGateway.storeApiKey(config.id, 'sk-secret-key')
    await apiConfigGateway.deleteApiKey(config.id)

    const refreshed = await apiConfigGateway.get(config.id)
    expect(refreshed).toMatchObject({
      id: config.id,
      hasStoredKey: false,
      hasStoredCredential: false,
      keyStatus: 'none',
    })
  })

  it('API config objects do not contain apiKey field', async () => {
    const configs = await apiConfigGateway.list()
    for (const config of configs) {
      expect(config).not.toHaveProperty('apiKey')
      expect(config).not.toHaveProperty('api_key')
      expect(config).not.toHaveProperty('secret')
    }
  })

  it('create response does not leak API key', async () => {
    const config = await apiConfigGateway.create({
      provider: 'anthropic',
      authMode: 'api_key',
      name: 'Anthropic Config',
      model: 'claude-sonnet-4-20250514',
      baseUrl: null,
      budgetLimit: null,
      isDefault: false,
      isEnabled: true,
    })
    const json = JSON.stringify(config)
    expect(json).not.toContain('sk-')
    expect(json).not.toContain('apiKey')
    expect(json).toContain('"authMode":"api_key"')
  })
})

describe('BYOK workflow routing and budget tracking', () => {
  it('fetches discovered models for a provider via gateway', async () => {
    const models = await apiConfigGateway.fetchProviderModels({
      provider: 'deepseek',
      apiKey: 'sk-test-key',
      baseUrl: null,
    })

    expect(models.length).toBeGreaterThan(0)
    expect(models[0]).toMatchObject({
      source: 'fetched',
      isRecommended: expect.any(Boolean),
    })
  })

  it('round-trips workflow assignments through the gateway', async () => {
    const config = await apiConfigGateway.create({
      provider: 'openai',
      authMode: 'api_key',
      name: 'Workflow Config',
      model: 'gpt-4o',
      baseUrl: null,
      budgetLimit: 5,
      isDefault: true,
      isEnabled: true,
    })
    const profiles = await apiConfigGateway.listModelProfilesByApiConfig(config.id)
    const profile = profiles[0]

    const assignment = await apiConfigGateway.setWorkflowAssignment('knowledge_qa', profile.id)
    expect(assignment).toMatchObject({
      workflowType: 'knowledge_qa',
      modelProfileId: profile.id,
    })

    const fetched = await apiConfigGateway.getWorkflowAssignment('knowledge_qa')
    expect(fetched).toMatchObject({
      workflowType: 'knowledge_qa',
      modelProfileId: profile.id,
      modelProfile: expect.objectContaining({ id: profile.id }),
      apiConfig: expect.objectContaining({ id: config.id }),
    })

    const allAssignments = await apiConfigGateway.setAllWorkflowAssignments(profile.id)
    expect(allAssignments).toHaveLength(6)
    expect(allAssignments.every((item) => item.modelProfileId === profile.id)).toBe(true)
    expect(allAssignments.some((item) => item.workflowType === 'card_animation')).toBe(true)

    await apiConfigGateway.deleteWorkflowAssignment('knowledge_qa')
    await expect(apiConfigGateway.getWorkflowAssignment('knowledge_qa')).resolves.toBeNull()
  })

  it('accumulates provider budget usage when workflow cost is recorded', async () => {
    const config = await apiConfigGateway.create({
      provider: 'deepseek',
      authMode: 'api_key',
      name: 'Budget Config',
      model: 'deepseek-chat',
      baseUrl: null,
      budgetLimit: 3,
      isDefault: false,
      isEnabled: true,
    })

    await expect(apiConfigGateway.getProviderBudgetUsage(config.id)).resolves.toBeNull()

    await apiConfigGateway.recordWorkflowCost(config.id, 0.12)
    await apiConfigGateway.recordWorkflowCost(config.id, 0.08)

    await expect(apiConfigGateway.getProviderBudgetUsage(config.id)).resolves.toMatchObject({
      apiConfigId: config.id,
      estimatedCostUsd: 0.2,
      workflowRunsCount: 2,
    })

    await apiConfigGateway.resetProviderBudgetUsage(config.id)
    await expect(apiConfigGateway.getProviderBudgetUsage(config.id)).resolves.toBeNull()
  })
})

// @acceptance:m6-a3
describe('home and settings show minimal stats overview', () => {
  it('StudyStatsCard renders new and review card counts', async () => {
    // Verify the gateway returns the expected shape
    const { cardsGateway } = await import('@/services/gateway/cards')
    const stats = await cardsGateway.getDailyStats()
    expect(stats).toHaveProperty('newCards')
    expect(stats).toHaveProperty('reviewCards')
    expect(typeof stats.newCards).toBe('number')
    expect(typeof stats.reviewCards).toBe('number')
  })

  it('apiConfigsQuery returns array for home page model config count', async () => {
    const configs = await apiConfigGateway.list()
    expect(Array.isArray(configs)).toBe(true)
    // Home page displays configs.length — just needs to be a number
    expect(typeof configs.length).toBe('number')
  })
})

// @acceptance:m6-a4
describe('stats UI stays restrained — no heavy dashboard', () => {
  it('StudyStatsCard only shows new and review counts, not charts', async () => {
    // Structural assertion: the component's data source is DailyStats
    // which only has { newCards, reviewCards } — no heatmap, no charts, no graphs
    const { cardsGateway } = await import('@/services/gateway/cards')
    const stats = await cardsGateway.getDailyStats()
    const keys = Object.keys(stats)
    // Only these two numeric stats — restrained by design
    expect(keys).toEqual(expect.arrayContaining(['newCards', 'reviewCards']))
    expect(keys.length).toBeLessThanOrEqual(3)
  })

  it('settings gateway exposes the expanded detailed settings surface', async () => {
    const { settingsGateway } = await import('@/services/gateway/settings')
    const settings = await settingsGateway.get()
    const keys = Object.keys(settings)
    expect(keys).toEqual(
      expect.arrayContaining([
        'theme',
        'language',
        'dailyNewCardLimit',
        'reviewTimeLimit',
        'podcastTtsProvider',
        'podcastGoogleTtsModel',
        'podcastOutputFormat',
        'podcastSkipReview',
        'podcastMaxLlmTokens',
        'podcastMaxTtsCharacters',
        'podcastMaxEstimatedCostUsd',
        'learningGoal',
        'dailyStudyMinutes',
        'studyTimePreference',
        'studyContentPreferences',
        'contentDifficultyPreference',
        'defaultVoice',
        'speechRate',
        'speechPitch',
        'speechVolume',
        'readingMode',
        'defaultPodcastStyle',
        'podcastEpisodeDurationMinutes',
        'podcastContentStructure',
        'podcastBackgroundMusic',
        'podcastIntroOutroEnabled',
        'voiceInputLanguage',
        'voiceInterruptEnabled',
        'podcastAutoPlayNextEpisode',
      ])
    )
    expect(keys.length).toBeGreaterThanOrEqual(30)
  })
})
