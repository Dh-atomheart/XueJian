import type {
  ApiConfig,
  ApiProvider,
  DiscoveredModel,
  ModelCapabilities,
  WorkflowType,
} from '@/types'

type ProviderProtocol = 'openai' | 'anthropic' | 'google'
type ProviderKind = 'preset' | 'custom'

export interface ProviderDefinition {
  id: ApiProvider
  name: string
  kind: ProviderKind
  protocol: ProviderProtocol
  defaultBaseUrl: string | null
  requiresBaseUrl: boolean
  keyPrefixes: string[]
  keyPattern: RegExp | null
  description: string
  presetModels: DiscoveredModel[]
  modelsEndpoint: string | null
  testStrategy: 'lightweight' | 'full' | 'tiered'
}

export interface WorkflowDefinition {
  type: WorkflowType
  name: string
  icon: string
  description: string
}

export interface KeyValidationResult {
  valid: boolean
  message: string
  severity: 'info' | 'success' | 'error'
}

export interface LegacyAiConfig {
  provider: 'openai' | 'anthropic' | 'google' | 'openai_compatible'
  model: string
  apiKey?: string
  baseUrl?: string
}

const caps = (
  vision: boolean,
  functionCalling: boolean,
  maxContext: number,
  jsonMode: boolean
): ModelCapabilities => ({
  vision,
  functionCalling,
  maxContext,
  streaming: true,
  jsonMode,
})

const presetModels = (
  models: Array<{
    id: string
    displayName: string
    capabilities: ModelCapabilities
    isRecommended?: boolean
  }>
): DiscoveredModel[] =>
  models.map((model) => ({
    id: model.id,
    displayName: model.displayName,
    source: 'preset',
    capabilities: model.capabilities,
    isRecommended: Boolean(model.isRecommended),
  }))

export const PROVIDER_DEFINITIONS: ProviderDefinition[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    kind: 'preset',
    protocol: 'openai',
    defaultBaseUrl: 'https://api.openai.com/v1',
    requiresBaseUrl: false,
    keyPrefixes: ['sk-'],
    keyPattern: /^sk-[A-Za-z0-9_-]{20,}$/,
    description: 'GPT-4o、GPT-4.1 与推理系列模型。',
    presetModels: presetModels([
      {
        id: 'gpt-4o',
        displayName: 'GPT-4o',
        capabilities: caps(true, true, 128000, true),
        isRecommended: true,
      },
      {
        id: 'gpt-4o-mini',
        displayName: 'GPT-4o Mini',
        capabilities: caps(true, true, 128000, true),
      },
      { id: 'o1', displayName: 'o1', capabilities: caps(true, false, 200000, false) },
      { id: 'gpt-4.1', displayName: 'GPT-4.1', capabilities: caps(true, true, 1047576, true) },
    ]),
    modelsEndpoint: '/models',
    testStrategy: 'tiered',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    kind: 'preset',
    protocol: 'anthropic',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    requiresBaseUrl: false,
    keyPrefixes: ['sk-ant-'],
    keyPattern: /^sk-ant-[A-Za-z0-9_-]{20,}$/,
    description: 'Claude Sonnet 与 Haiku，适合长上下文和推理。',
    presetModels: presetModels([
      {
        id: 'claude-sonnet-4-20250514',
        displayName: 'Claude Sonnet 4',
        capabilities: caps(true, true, 200000, true),
        isRecommended: true,
      },
      {
        id: 'claude-3-5-haiku-20241022',
        displayName: 'Claude 3.5 Haiku',
        capabilities: caps(true, true, 200000, true),
      },
    ]),
    modelsEndpoint: '/models',
    testStrategy: 'tiered',
  },
  {
    id: 'google',
    name: 'Google',
    kind: 'preset',
    protocol: 'google',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    requiresBaseUrl: false,
    keyPrefixes: ['AIza'],
    keyPattern: /^AIza[0-9A-Za-z_-]{20,}$/,
    description: 'Gemini 系列，长上下文与视觉能力均衡。',
    presetModels: presetModels([
      {
        id: 'gemini-2.5-pro',
        displayName: 'Gemini 2.5 Pro',
        capabilities: caps(true, true, 1048576, true),
        isRecommended: true,
      },
      {
        id: 'gemini-2.0-flash',
        displayName: 'Gemini 2.0 Flash',
        capabilities: caps(true, true, 1048576, true),
      },
      {
        id: 'gemini-2.5-flash',
        displayName: 'Gemini 2.5 Flash',
        capabilities: caps(true, true, 1048576, true),
      },
      {
        id: 'gemini-embedding-001',
        displayName: 'Gemini Embedding 001',
        capabilities: caps(false, false, 8192, false),
      },
    ]),
    modelsEndpoint: '/models',
    testStrategy: 'tiered',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    kind: 'preset',
    protocol: 'openai',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    requiresBaseUrl: false,
    keyPrefixes: ['sk-'],
    keyPattern: /^sk-[A-Za-z0-9_-]{20,}$/,
    description: '更低成本的通用与推理模型。',
    presetModels: presetModels([
      {
        id: 'deepseek-chat',
        displayName: 'DeepSeek-V3',
        capabilities: caps(true, true, 128000, true),
        isRecommended: true,
      },
      {
        id: 'deepseek-reasoner',
        displayName: 'DeepSeek-R1',
        capabilities: caps(false, false, 128000, false),
      },
    ]),
    modelsEndpoint: '/models',
    testStrategy: 'tiered',
  },
  {
    id: 'custom_openai',
    name: 'OpenAI-Compatible',
    kind: 'custom',
    protocol: 'openai',
    defaultBaseUrl: null,
    requiresBaseUrl: true,
    keyPrefixes: [],
    keyPattern: null,
    description: '兼容 OpenAI Chat Completions 协议的任意服务。',
    presetModels: [],
    modelsEndpoint: '/models',
    testStrategy: 'tiered',
  },
  {
    id: 'custom_anthropic',
    name: 'Anthropic-Compatible',
    kind: 'custom',
    protocol: 'anthropic',
    defaultBaseUrl: null,
    requiresBaseUrl: true,
    keyPrefixes: [],
    keyPattern: null,
    description: '兼容 Anthropic Messages 协议的私有或代理端点。',
    presetModels: [],
    modelsEndpoint: '/models',
    testStrategy: 'tiered',
  },
  {
    id: 'custom_google',
    name: 'Google-Compatible',
    kind: 'custom',
    protocol: 'google',
    defaultBaseUrl: null,
    requiresBaseUrl: true,
    keyPrefixes: [],
    keyPattern: null,
    description: '兼容 Google Generative Language 协议的服务。',
    presetModels: [],
    modelsEndpoint: '/models',
    testStrategy: 'tiered',
  },
]

export const PROVIDER_DEFINITION_MAP = new Map(
  PROVIDER_DEFINITIONS.map((definition) => [definition.id, definition])
)

export const WORKFLOW_DEFINITIONS: WorkflowDefinition[] = [
  {
    type: 'card_generation',
    name: '卡片生成',
    icon: '🃏',
    description: '抽取候选卡片并生成问答内容。',
  },
  {
    type: 'document_embedding',
    name: '文档嵌入',
    icon: '📄',
    description: '构建向量索引用于检索。',
  },
  { type: 'knowledge_qa', name: '知识问答', icon: '❓', description: '基于检索上下文生成答案。' },
  {
    type: 'podcast_generation',
    name: '播客生成',
    icon: '🎙️',
    description: '大纲、脚本和音频生成。',
  },
  {
    type: 'card_animation',
    name: 'Card Animation',
    icon: 'motion',
    description: 'Generates animation scripts for review cards.',
  },
]

export function getProviderDefinition(provider: ApiProvider) {
  return PROVIDER_DEFINITION_MAP.get(provider)
}

export function getRecommendedModel(provider: ApiProvider): string | null {
  return (
    getProviderDefinition(provider)?.presetModels.find((model) => model.isRecommended)?.id ?? null
  )
}

export function maskApiKey(key: string, provider: ApiProvider): string {
  const definition = getProviderDefinition(provider)
  const prefixLen = definition?.keyPrefixes[0]?.length ?? 3

  if (key.length <= prefixLen + 4) {
    return `${key.slice(0, prefixLen)}...`
  }

  return `${key.slice(0, prefixLen)}...${key.slice(-4)}`
}

export function getStoredKeyPlaceholder(provider: ApiProvider): string {
  const prefix = getProviderDefinition(provider)?.keyPrefixes[0] ?? 'key-'
  return `${prefix}••••`
}

export function getKeyStatusBadge(config: Pick<ApiConfig, 'hasStoredKey' | 'keyStatus'>): string {
  if (!config.hasStoredKey) {
    return '⚠️ 未存储'
  }

  switch (config.keyStatus) {
    case 'verified':
      return '✅ 已验证'
    case 'stored':
      return '📦 已存储 · 未验证'
    case 'invalid':
      return '❌ 无效'
    case 'expired':
      return '⚠️ 可能已过期'
    default:
      return '📦 已存储'
  }
}

export function detectProviderFromKey(key: string): {
  provider: ApiProvider | null
  message: string | null
} {
  const trimmed = key.trim()
  if (!trimmed) {
    return { provider: null, message: null }
  }

  for (const definition of PROVIDER_DEFINITIONS) {
    if (definition.kind !== 'preset') {
      continue
    }

    if (definition.keyPrefixes.some((prefix) => trimmed.startsWith(prefix))) {
      return {
        provider: definition.id,
        message: `已根据 Key 前缀识别为 ${definition.name}`,
      }
    }
  }

  return {
    provider: null,
    message: '无法识别 Key 类型，请手动选择供应商',
  }
}

export function validateApiKeyFormat(key: string, provider: ApiProvider): KeyValidationResult {
  const trimmed = key.trim()
  if (!trimmed) {
    return { valid: false, message: '请输入 API Key', severity: 'error' }
  }

  const definition = getProviderDefinition(provider)
  if (!definition || !definition.keyPattern) {
    return { valid: true, message: '自定义供应商无法校验 Key 格式', severity: 'info' }
  }

  if (definition.keyPattern.test(trimmed)) {
    return { valid: true, message: `${definition.name} Key 格式看起来正常`, severity: 'success' }
  }

  return { valid: false, message: `${definition.name} Key 格式不符合预期`, severity: 'error' }
}

export function readLegacyAiConfig(): LegacyAiConfig | null {
  if (typeof window === 'undefined') {
    return null
  }

  const raw = window.localStorage.getItem('xuejian-app-store')
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as { state?: { aiConfig?: unknown } }
    const aiConfig = parsed?.state?.aiConfig as Partial<LegacyAiConfig> | undefined
    if (!aiConfig || typeof aiConfig !== 'object') {
      return null
    }

    if (
      typeof aiConfig.provider !== 'string' ||
      typeof aiConfig.model !== 'string' ||
      aiConfig.model.trim().length === 0
    ) {
      return null
    }

    return {
      provider: aiConfig.provider as LegacyAiConfig['provider'],
      model: aiConfig.model,
      apiKey: typeof aiConfig.apiKey === 'string' ? aiConfig.apiKey : undefined,
      baseUrl: typeof aiConfig.baseUrl === 'string' ? aiConfig.baseUrl : undefined,
    }
  } catch {
    return null
  }
}

export function clearLegacyAiConfig() {
  if (typeof window === 'undefined') {
    return
  }

  const raw = window.localStorage.getItem('xuejian-app-store')
  if (!raw) {
    return
  }

  try {
    const parsed = JSON.parse(raw) as { state?: Record<string, unknown> }
    if (!parsed.state || typeof parsed.state !== 'object' || !('aiConfig' in parsed.state)) {
      return
    }

    parsed.state.aiConfig = null
    window.localStorage.setItem('xuejian-app-store', JSON.stringify(parsed))
  } catch {
    // Ignore malformed legacy payloads; they should not block startup.
  }
}

export function normalizeLegacyProvider(provider: LegacyAiConfig['provider']): ApiProvider {
  switch (provider) {
    case 'openai':
    case 'anthropic':
    case 'google':
      return provider
    default:
      return 'custom_openai'
  }
}
