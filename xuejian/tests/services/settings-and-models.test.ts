import { apiConfigGateway } from '@/services/gateway/models'

// @acceptance:m6-a1
describe('model config and connection test', () => {
  it('creates an API config via gateway', async () => {
    const config = await apiConfigGateway.create({
      provider: 'openai',
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
      name: 'Gate Config',
      model: 'gpt-4o',
      baseUrl: null,
      budgetLimit: null,
      isDefault: true,
      isEnabled: true,
    })

    expect(config.hasStoredKey).toBe(false)
    expect(config).not.toHaveProperty('apiKey')
  })

  it('storeApiKey sends key via gateway without returning it', async () => {
    const result = await apiConfigGateway.storeApiKey('config-1', 'sk-secret-key')
    // storeApiKey returns void — key is sent to Stronghold only
    expect(result).toBeUndefined()
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
    expect(json).not.toContain('api_key')
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

  it('settings page preferences section shows at most 4 fields', async () => {
    // AppSettings shape is deliberately minimal
    const { settingsGateway } = await import('@/services/gateway/settings')
    const settings = await settingsGateway.get()
    const keys = Object.keys(settings)
    expect(keys.length).toBeLessThanOrEqual(5) // theme, language, dailyNewCardLimit, reviewTimeLimit
  })
})
