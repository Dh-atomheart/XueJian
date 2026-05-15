import { z } from 'zod'
import type {
  ApiConfig,
  ApiConnectionTestResult,
  AgentToolInvocation,
  BasicCard,
  BasicCardGroup,
  BasicCardSource,
  DiscoveredModel,
  AppSettings,
  BackgroundJob,
  Card,
  CardCandidate,
  CardGenerationCandidate,
  Citation,
  DocumentAnchor,
  DocumentChunk,
  Document,
  DocumentLibraryItem,
  DocumentIR,
  DocumentIRAsset,
  DocumentIRBlock,
  DocumentIRMetadata,
  DocumentIRPage,
  DocumentIRSpan,
  EmbeddingProfile,
  FinalizeCardGenerationResult,
  Highlight,
  HostGatewayManifest,
  IRRect,
  ModelCapabilities,
  ModelProfile,
  PointsEntry,
  PointsSummary,
  ProviderBudgetUsage,
  RagAnswer,
  RagTrace,
  ReviewLog,
  ServiceHealthStatus,
  StudyQueueItem,
  StudyReviewResult,
  WorkflowModelAssignment,
  WorkflowCheckpoint,
  WorkflowArtifact,
  WorkflowRun,
  WorkflowEvent,
} from './document'

const dateValueSchema: z.ZodType<Date, z.ZodTypeDef, unknown> = z.preprocess((value) => {
  if (value instanceof Date) {
    return value
  }

  if (typeof value === 'string') {
    return new Date(value)
  }

  return value
}, z.date())

const nullableDateValueSchema: z.ZodType<Date | null, z.ZodTypeDef, unknown> = z.preprocess(
  (value) => {
    if (value === null) {
      return null
    }

    if (value instanceof Date) {
      return value
    }

    if (typeof value === 'string') {
      return new Date(value)
    }

    return value
  },
  z.date().nullable()
)

const stringSettingSchema = (defaultValue: string) =>
  z
    .preprocess((value) => (typeof value === 'string' ? value.trim() : value), z.string().min(1))
    .catch(defaultValue)
    .default(defaultValue)

const stringArraySettingSchema = (defaultValues: string[]) =>
  z
    .preprocess(
      (value) =>
        Array.isArray(value)
          ? value
              .filter((item): item is string => typeof item === 'string')
              .map((item) => item.trim())
              .filter(Boolean)
          : value,
      z.array(z.string().min(1))
    )
    .catch(defaultValues)
    .default(defaultValues)
    .transform((values) => (values.length > 0 ? values : [...defaultValues]))

const boundedNumberSettingSchema = (defaultValue: number, minimum: number, maximum: number) =>
  z
    .number()
    .catch(defaultValue)
    .default(defaultValue)
    .transform((value) => Math.min(maximum, Math.max(minimum, value)))

const boundedIntSettingSchema = (defaultValue: number, minimum: number, maximum: number) =>
  z
    .number()
    .int()
    .catch(defaultValue)
    .default(defaultValue)
    .transform((value) => Math.min(maximum, Math.max(minimum, value)))

const optionalEndpointSchema = z
  .preprocess((value) => (typeof value === 'string' ? value.trim() : value), z.string())
  .nullable()
  .catch(null)
  .transform((value) => (value && value.length > 0 ? value : null))

const voiceOverridesSchema = z
  .preprocess(
    (value) =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
              .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
              .map(([key, itemValue]) => [key.trim(), itemValue.trim()])
              .filter(([key, itemValue]) => key.length > 0 && itemValue.length > 0)
          )
        : value,
    z.record(z.string())
  )
  .catch({})
  .default({})

const studyTimeSlotValues = ['morning', 'afternoon', 'evening', 'late_night'] as const
const studyContentPreferenceValues = [
  'psychology',
  'cognitive_science',
  'education',
  'neuroscience',
  'philosophy',
  'sociology',
  'economics',
  'history',
  'artificial_intelligence',
  'data_science',
  'self_improvement',
  'other',
] as const

const legacyLearningGoalMap = {
  exam_prep: 'exam_preparation',
  concept_mastery: 'knowledge_understanding',
  long_term_retention: 'memory_strengthening',
  skill_building: 'applied_practice',
} as const

const legacyDifficultyMap = {
  foundation: 'beginner',
  adaptive: 'intermediate',
  challenging: 'advanced',
} as const

const legacyPodcastStyleMap = {
  conversational: 'casual',
  news_brief: 'lecture',
  deep_dive: 'deep_dive',
  storytelling: 'interview',
  knowledge_popularization: 'lecture',
  deep_analysis: 'deep_dive',
  friendly_conversation: 'casual',
  exam_coaching: 'exam_prep',
} as const

const legacyReadingModeMap = {
  focused: 'focus',
  narration: 'narration',
  natural: 'natural',
} as const

function normalizeLegacyAppSettingsPayload(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value
  }

  const payload = { ...(value as Record<string, unknown>) }

  if (typeof payload.theme === 'string') {
    const normalizedTheme = payload.theme.trim()
    payload.theme =
      normalizedTheme === 'default'
        ? 'light'
        : ['light', 'dark', 'system'].includes(normalizedTheme)
          ? normalizedTheme
          : 'light'
  }

  if (typeof payload.learningGoal === 'string') {
    payload.learningGoal =
      legacyLearningGoalMap[payload.learningGoal as keyof typeof legacyLearningGoalMap] ??
      payload.learningGoal
  }

  if (!Array.isArray(payload.studyTimePreferences)) {
    const legacyStudyTimePreference =
      typeof payload.studyTimePreference === 'string' ? payload.studyTimePreference : null
    payload.studyTimePreferences =
      legacyStudyTimePreference && studyTimeSlotValues.includes(legacyStudyTimePreference as never)
        ? [legacyStudyTimePreference]
        : ['afternoon', 'evening']
  }

  if (typeof payload.contentDifficultyPreference === 'string') {
    payload.contentDifficultyPreference =
      legacyDifficultyMap[
        payload.contentDifficultyPreference as keyof typeof legacyDifficultyMap
      ] ?? payload.contentDifficultyPreference
  }

  if (typeof payload.defaultPodcastStyle === 'string') {
    payload.defaultPodcastStyle =
      legacyPodcastStyleMap[payload.defaultPodcastStyle as keyof typeof legacyPodcastStyleMap] ??
      payload.defaultPodcastStyle
  }

  if (typeof payload.readingMode === 'string') {
    payload.readingMode =
      legacyReadingModeMap[payload.readingMode as keyof typeof legacyReadingModeMap] ??
      payload.readingMode
  }

  return payload
}

// ==================== DocumentIR v1 Schemas ====================

export const documentIRBlockTypeSchema = z.enum([
  'heading',
  'paragraph',
  'list',
  'list_item',
  'table',
  'figure',
  'code_block',
  'formula',
  'blockquote',
  'page_header',
  'page_footer',
  'unknown',
])

export const irRectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
}) as z.ZodType<IRRect>

export const documentIRSpanSchema = z.object({
  spanId: z.string().min(1),
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  rect: irRectSchema.nullable(),
}) as z.ZodType<DocumentIRSpan>

export const documentIRBlockSchema = z.object({
  blockId: z.string().min(1),
  blockType: documentIRBlockTypeSchema,
  pageNumber: z.number().int().positive(),
  content: z.string(),
  spans: z.array(documentIRSpanSchema),
  anchorId: z.string().nullable(),
  parentBlockId: z.string().nullable(),
  level: z.number().int().nullable(),
  language: z.string().nullable(),
  metadata: z.record(z.unknown()).nullable(),
}) as z.ZodType<DocumentIRBlock>

export const documentIRPageSchema = z.object({
  pageNumber: z.number().int().positive(),
  width: z.number().positive(),
  height: z.number().positive(),
  rotation: z.number(),
  label: z.string().nullable(),
}) as z.ZodType<DocumentIRPage>

export const documentIRAssetTypeSchema = z.enum(['image', 'table_image', 'figure'])

export const documentIRAssetSchema = z.object({
  assetId: z.string().min(1),
  assetType: documentIRAssetTypeSchema,
  blockId: z.string().nullable(),
  mimeType: z.string().min(1),
  dataRef: z.string().min(1),
  altText: z.string().nullable(),
}) as z.ZodType<DocumentIRAsset>

export const documentIRMetadataSchema = z.object({
  importTimestamp: z.string().min(1),
  sourceHash: z.string().nullable(),
  languageHint: z.string().nullable(),
  warnings: z.array(z.string()),
  totalBlocks: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
}) as z.ZodType<DocumentIRMetadata>

export const documentIRSchema = z.object({
  documentId: z.string().uuid(),
  parserFamily: z.string().min(1),
  parserVersion: z.string().min(1),
  irVersion: z.literal('1'),
  pages: z.array(documentIRPageSchema),
  blocks: z.array(documentIRBlockSchema),
  assets: z.array(documentIRAssetSchema),
  sourceMetadata: documentIRMetadataSchema,
}) as z.ZodType<DocumentIR>

// ==================== App Settings ====================

export const appSettingsSchema = z.preprocess(
  normalizeLegacyAppSettingsPayload,
  z.object({
    theme: z.enum(['light', 'dark', 'system']).catch('light').default('light'),
    language: z.enum(['zh-CN', 'en-US']).catch('zh-CN').default('zh-CN'),
    dailyNewCardLimit: boundedIntSettingSchema(20, 0, 1000),
    reviewTimeLimit: boundedIntSettingSchema(30, 0, 1440),
    learningGoal: z
      .enum([
        'knowledge_understanding',
        'memory_strengthening',
        'applied_practice',
        'exam_preparation',
        'interest_exploration',
      ])
      .catch('knowledge_understanding')
      .default('knowledge_understanding'),
    dailyStudyMinutes: boundedIntSettingSchema(30, 0, 1440),
    studyTimePreference: z
      .enum(['morning', 'afternoon', 'evening', 'late_night', 'flexible'])
      .catch('evening')
      .default('evening'),
    studyTimePreferences: z
      .preprocess(
        (value) =>
          Array.isArray(value)
            ? value
                .filter((item): item is string => typeof item === 'string')
                .map((item) => item.trim())
                .filter((item) => studyTimeSlotValues.includes(item as never))
            : value,
        z.array(z.enum(studyTimeSlotValues))
      )
      .catch(['afternoon', 'evening'])
      .default(['afternoon', 'evening'])
      .transform((values) => (values.length > 0 ? values : ['afternoon', 'evening'])),
    studyContentPreferences: stringArraySettingSchema([
      'psychology',
      'cognitive_science',
      'self_improvement',
      'education',
    ]).transform((values) => {
      const validValues = values.filter((value) =>
        studyContentPreferenceValues.includes(value as never)
      )
      return validValues.length > 0
        ? validValues
        : ['psychology', 'cognitive_science', 'self_improvement', 'education']
    }),
    contentDifficultyPreference: z
      .enum(['introductory', 'beginner', 'intermediate', 'advanced', 'expert'])
      .catch('intermediate')
      .default('intermediate'),
    podcastTtsProvider: z
      .enum(['auto', 'openai', 'edge_tts', 'google'])
      .catch('auto')
      .default('auto'),
    podcastOpenaiModel: stringSettingSchema('tts-1'),
    podcastGoogleTtsModel: stringSettingSchema('gemini-2.5-flash-preview-tts'),
    podcastFishAudioEndpoint: optionalEndpointSchema.default(null),
    podcastVoiceOverrides: voiceOverridesSchema,
    defaultVoice: stringSettingSchema('gentle_female_xiaoxiao'),
    speechRate: boundedNumberSettingSchema(1, 0.5, 1.5),
    speechPitch: boundedNumberSettingSchema(0, -0.5, 0.5),
    speechVolume: boundedNumberSettingSchema(0.8, 0, 1),
    readingMode: z.enum(['natural', 'focus', 'narration']).catch('natural').default('natural'),
    defaultPodcastStyle: z
      .enum(['deep_dive', 'lecture', 'interview', 'casual', 'exam_prep'])
      .catch('lecture')
      .default('lecture'),
    podcastEpisodeDurationMinutes: boundedIntSettingSchema(15, 1, 180),
    podcastContentStructure: z
      .enum(['summary_then_details', 'problem_solution', 'story_driven', 'question_driven'])
      .catch('summary_then_details')
      .default('summary_then_details'),
    podcastBackgroundMusic: z
      .enum(['off', 'soft_piano', 'light_ambient', 'study_lofi'])
      .catch('soft_piano')
      .default('soft_piano'),
    podcastIntroOutroEnabled: z.boolean().catch(true).default(true),
    voiceInputLanguage: z.enum(['zh-CN', 'en-US']).catch('zh-CN').default('zh-CN'),
    voiceInterruptEnabled: z.boolean().catch(true).default(true),
    podcastAutoPlayNextEpisode: z.boolean().catch(true).default(true),
    podcastOutputFormat: z.enum(['mp3', 'wav']).catch('mp3').default('mp3'),
    podcastSkipReview: z.boolean().catch(true).default(true),
    podcastMaxLlmTokens: boundedIntSettingSchema(100000, 0, 1_000_000),
    podcastMaxTtsCharacters: boundedIntSettingSchema(50000, 0, 1_000_000),
    podcastMaxEstimatedCostUsd: boundedNumberSettingSchema(1, 0, 10_000),
  })
) as z.ZodType<AppSettings>

export const apiProviderSchema = z.enum([
  'openai',
  'anthropic',
  'google',
  'deepseek',
  'openai_compatible',
  'custom_openai',
  'custom_anthropic',
  'custom_google',
])

export const apiAuthModeSchema = z.enum(['api_key', 'adc'])

export const keyStatusSchema = z.enum(['none', 'stored', 'verified', 'invalid', 'expired'])

export const modelCapabilitiesSchema = z.object({
  vision: z.boolean(),
  functionCalling: z.boolean(),
  maxContext: z.number().int().positive(),
  streaming: z.boolean(),
  jsonMode: z.boolean(),
}) as z.ZodType<ModelCapabilities>

export const discoveredModelSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  source: z.enum(['preset', 'fetched']),
  capabilities: modelCapabilitiesSchema,
  isRecommended: z.boolean(),
}) as z.ZodType<DiscoveredModel>

export const workflowTypeSchema = z.enum([
  'card_generation',
  'document_embedding',
  'knowledge_qa',
  'agent_task',
  'agent_card_generation',
])

export const apiConfigSchema = z.object({
  id: z.string().uuid(),
  provider: apiProviderSchema,
  protocol: z.enum(['native', 'openai-compatible']).nullable(),
  authMode: apiAuthModeSchema,
  name: z.string().min(1),
  model: z.string().nullable(),
  baseUrl: z.string().nullable(),
  budgetLimit: z.number().nullable(),
  isDefault: z.boolean(),
  isEnabled: z.boolean(),
  hasStoredCredential: z.boolean(),
  hasStoredKey: z.boolean(),
  keyVerifiedAt: nullableDateValueSchema,
  keyStatus: keyStatusSchema,
  displayName: z.string().nullable(),
  createdAt: dateValueSchema,
}) as z.ZodType<ApiConfig>

export const apiConnectionTestResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
}) as z.ZodType<ApiConnectionTestResult>

export const embeddingProfileSchema = z.object({
  id: z.string().uuid(),
  provider: apiProviderSchema,
  model: z.string().min(1),
  dimensions: z.number().int().nonnegative(),
  distanceMetric: z.literal('cosine'),
  isActive: z.boolean(),
  revision: z.number().int().nonnegative(),
  createdAt: dateValueSchema,
}) as z.ZodType<EmbeddingProfile>

export const modelProfileSchema = z.lazy(
  () =>
    z.object({
      id: z.string().uuid(),
      apiConfigId: z.string().uuid(),
      modelId: z.string().min(1),
      displayName: z.string().nullable(),
      capabilitiesJson: z.string().nullable(),
      isEnabled: z.boolean(),
      isDefaultForConnection: z.boolean(),
      createdAt: dateValueSchema,
      updatedAt: dateValueSchema,
      apiConfig: apiConfigSchema.nullable().optional(),
    }) as z.ZodType<ModelProfile>
)

export const workflowModelAssignmentSchema = z.object({
  workflowType: workflowTypeSchema,
  modelProfileId: z.string().uuid(),
  assignedAt: dateValueSchema,
  updatedAt: dateValueSchema,
  modelProfile: modelProfileSchema.nullable().optional(),
  apiConfig: apiConfigSchema.nullable().optional(),
}) as z.ZodType<WorkflowModelAssignment>

export const providerBudgetUsageSchema = z.object({
  id: z.string().uuid(),
  apiConfigId: z.string().uuid(),
  period: z.string().regex(/^\d{4}-\d{2}$/),
  estimatedCostUsd: z.number().nonnegative(),
  workflowRunsCount: z.number().int().nonnegative(),
  updatedAt: dateValueSchema,
}) as z.ZodType<ProviderBudgetUsage>

export const documentSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  filePath: z.string().min(1),
  fileType: z.enum(['pdf', 'md', 'txt', 'docx']),
  fileSize: z.number().int().nullable(),
  pageCount: z.number().int().nullable(),
  contentHash: z.string().nullable(),
  status: z.enum([
    'uploading',
    'parsed',
    'embedding',
    'ready',
    'embedding_failed',
    'embedding_stale',
    'error',
    'deleted',
  ]),
  createdAt: dateValueSchema,
  updatedAt: dateValueSchema,
}) as z.ZodType<Document>

export const documentLibraryItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  fileType: z.enum(['pdf', 'md', 'txt', 'docx']),
  pageCount: z.number().int().nullable(),
  status: z.enum([
    'uploading',
    'parsed',
    'embedding',
    'ready',
    'embedding_failed',
    'embedding_stale',
    'error',
    'deleted',
  ]),
  updatedAt: dateValueSchema,
  lastUsedAt: nullableDateValueSchema,
  basicCardCount: z.number().int().nonnegative(),
  lastFailureReason: z.string().nullable(),
}) as z.ZodType<DocumentLibraryItem>

export const documentSectionSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string().uuid(),
  sectionIndex: z.number().int().nonnegative(),
  heading: z.string().nullable(),
  hierarchyPath: z.array(z.string()),
  pageStart: z.number().int().positive().nullable(),
  pageEnd: z.number().int().positive().nullable(),
  anchorStartId: z.string().uuid().nullable(),
  anchorEndId: z.string().uuid().nullable(),
  content: z.string().min(1),
  tokenCount: z.number().int().positive().nullable(),
  metadata: z.record(z.unknown()).nullable(),
  createdAt: dateValueSchema,
}) as z.ZodType<import('./document').DocumentSection>

export const documentAnchorRectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
})

export const documentAnchorSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string().uuid(),
  page: z.number().int().positive(),
  paragraph: z.number().int().positive().nullable(),
  textQuote: z.string().min(1),
  rects: z.array(documentAnchorRectSchema),
  hash: z.string().min(1),
  hierarchyPath: z.array(z.string()).optional().default([]),
  quoteHash: z.string().nullable().optional().default(null),
  createdAt: dateValueSchema,
}) as z.ZodType<DocumentAnchor>

export const documentChunkSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string().uuid(),
  sectionId: z.string().uuid().nullable(),
  anchorId: z.string().uuid().nullable(),
  pageStart: z.number().int().positive().nullable(),
  pageEnd: z.number().int().positive().nullable(),
  chunkIndex: z.number().int().nonnegative(),
  chunkKind: z.enum(['parent', 'child', 'semantic', 'fallback']),
  content: z.string().min(1),
  tokenCount: z.number().int().positive().nullable(),
  metadata: z.record(z.unknown()).nullable(),
  createdAt: dateValueSchema,
}) as z.ZodType<DocumentChunk>

export const cardSourceCoordinatesSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
})

export const basicCardSourceSchema = z.object({
  documentId: z.string().uuid().nullable(),
  documentTitle: z.string().nullable(),
  anchorId: z.string().uuid().nullable(),
  page: z.number().int().positive().nullable(),
  quote: z.string().nullable(),
}) as z.ZodType<BasicCardSource>

export const basicCardSchema = z.object({
  id: z.string().uuid(),
  groupId: z.string().uuid(),
  groupName: z.string().min(1),
  title: z.string().min(1),
  front: z.string().min(1),
  back: z.string().min(1),
  tags: z.array(z.string()),
  origin: z.string().min(1),
  source: basicCardSourceSchema,
  createdAt: dateValueSchema,
  updatedAt: dateValueSchema,
  deletedAt: nullableDateValueSchema,
}) as z.ZodType<BasicCard>

export const basicCardGroupSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().nullable(),
  color: z.string().nullable(),
  isEnabled: z.boolean(),
  cardCount: z.number().int().nonnegative(),
  createdAt: dateValueSchema,
  updatedAt: dateValueSchema,
  deletedAt: nullableDateValueSchema,
}) as z.ZodType<BasicCardGroup>

export const studyQueueItemSchema = z.object({
  id: z.string().uuid(),
  groupId: z.string().uuid(),
  title: z.string().min(1),
  front: z.string().min(1),
  back: z.string().min(1),
  state: z.enum(['new', 'learning', 'review', 'relearning']),
  dueAt: dateValueSchema,
}) as z.ZodType<StudyQueueItem>

export const studyReviewResultSchema = z.object({
  nextDueAt: dateValueSchema,
  newState: z.enum(['new', 'learning', 'review', 'relearning']),
}) as z.ZodType<StudyReviewResult>

export const cardSchema = z.object({
  id: z.string().uuid(),
  groupId: z.string().uuid().nullable(),
  title: z.string().nullable(),
  cardType: z.enum(['qa', 'cloze', 'fact', 'choice', 'image_occlusion']),
  clusterId: z.string().nullable(),
  exportGuid: z.string().nullable(),
  documentId: z.string().uuid().nullable(),
  anchorId: z.string().uuid().nullable(),
  front: z.string().min(1),
  back: z.string().min(1),
  sourcePage: z.number().int().positive().nullable(),
  sourceParagraph: z.number().int().positive().nullable(),
  sourceCoordinates: cardSourceCoordinatesSchema.nullable(),
  tags: z.array(z.string()),
  difficulty: z.number(),
  stability: z.number(),
  retrievability: z.number().nullable(),
  state: z.enum(['new', 'learning', 'review', 'relearning']),
  nextReview: nullableDateValueSchema,
  createdAt: dateValueSchema,
  updatedAt: dateValueSchema,
}) as z.ZodType<Card>

export const cardCandidateSchema = z.object({
  id: z.string().uuid(),
  workflowRunId: z.string().uuid().nullable(),
  documentId: z.string().uuid(),
  sectionId: z.string().uuid().nullable(),
  anchorId: z.string().uuid().nullable(),
  title: z.string().nullable(),
  cardType: z.enum(['qa', 'cloze', 'fact', 'choice']),
  sourcePage: z.number().int().positive().nullable(),
  sourceParagraph: z.number().int().positive().nullable(),
  sourceQuote: z.string().nullable(),
  front: z.string().min(1),
  back: z.string().min(1),
  tags: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  dedupeKey: z.string().min(1),
  status: z.enum(['pending', 'accepted', 'rejected']),
  scoreOverall: z.number().nullable(),
  scoreDetails: z.record(z.unknown()).nullable(),
  visibilityBucket: z.enum(['default', 'expanded', 'hidden_low_quality']).nullable(),
  generationMode: z.enum(['llm', 'fallback_rule', 'fallback_fts5_only']),
  fallbackReason: z.string().nullable(),
  evaluationSummary: z.string().nullable(),
  sourceChunkIds: z.array(z.string().uuid()).nullable(),
  createdAt: dateValueSchema,
}) as z.ZodType<CardCandidate>

export const highlightSchema = z.object({
  id: z.string().uuid(),
  cardId: z.string().uuid().nullable(),
  documentId: z.string().uuid(),
  anchorId: z.string().uuid().nullable(),
  pageNumber: z.number().int().positive(),
  rectangles: z.array(documentAnchorRectSchema),
  textContent: z.string().min(1),
  color: z.string().min(4),
  note: z.string().max(500).nullable(),
  pageCardIndex: z.number().int().min(0).nullable(),
  createdAt: dateValueSchema,
}) as z.ZodType<Highlight>

export const reviewLogSchema = z.object({
  id: z.string(),
  cardId: z.string(),
  rating: z.enum(['again', 'hard', 'good', 'easy']),
  reviewedAt: dateValueSchema,
  state: z.enum(['new', 'learning', 'review', 'relearning']),
  difficulty: z.number(),
  stability: z.number(),
  retrievability: z.number().nullable(),
  nextReview: nullableDateValueSchema,
  intervalDays: z.number().int().nullable(),
}) as z.ZodType<ReviewLog>

export const workflowEventSchema = z.object({
  runId: z.string().uuid(),
  eventType: z.enum([
    'queued',
    'started',
    'progress',
    'waiting_confirmation',
    'completed',
    'failed',
    'fallback',
    'cancelled',
  ]),
  message: z.string().nullable(),
  progress: z.number().min(0).max(1).nullable(),
  payload: z.record(z.unknown()).nullable(),
  createdAt: dateValueSchema,
}) as z.ZodType<WorkflowEvent>

export const workflowRunSchema = z.object({
  id: z.string().uuid(),
  workflowType: workflowTypeSchema,
  presetId: z.string().nullable(),
  status: z.enum(['queued', 'running', 'waiting_confirmation', 'completed', 'failed', 'cancelled']),
  threadId: z.string().min(1),
  checkpointRef: z.string().nullable(),
  approvalPayload: z.record(z.unknown()).nullable(),
  costUsd: z.number().nullable(),
  errorMessage: z.string().nullable(),
  startedAt: nullableDateValueSchema,
  finishedAt: nullableDateValueSchema,
  createdAt: dateValueSchema,
  updatedAt: dateValueSchema,
}) as z.ZodType<WorkflowRun>

export const backgroundJobSchema = z.object({
  id: z.string().uuid(),
  jobType: z.string().min(1),
  status: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']),
  targetType: z.string().min(1),
  targetId: z.string().min(1),
  payloadJson: z.string(),
  resultJson: z.string().nullable(),
  errorMessage: z.string().nullable(),
  errorDetails: z.string().nullable(),
  progressCurrent: z.number().int().nullable(),
  progressTotal: z.number().int().nullable(),
  progressMessage: z.string().nullable(),
  createdAt: dateValueSchema,
  startedAt: nullableDateValueSchema,
  finishedAt: nullableDateValueSchema,
  cancelRequestedAt: nullableDateValueSchema,
}) as z.ZodType<BackgroundJob>

export const workflowCheckpointSchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid(),
  checkpointRef: z.string().min(1),
  stepKey: z.string().nullable(),
  payload: z.record(z.unknown()),
  createdAt: dateValueSchema,
  updatedAt: dateValueSchema,
}) as z.ZodType<WorkflowCheckpoint>

export const workflowArtifactSchema = z.object({
  artifactId: z.string().min(1),
  runId: z.string().uuid(),
  artifactType: z.enum([
    'evidence',
    'answer',
    'card_candidate',
    'formal_card_write',
    'learning_advice',
    'study_schedule_write',
    'trace',
  ]),
  schemaVersion: z.number().int().min(1),
  summary: z.string(),
  sourceRefs: z.array(z.string()),
  qualityEnvelope: z.record(z.unknown()),
  errorCategory: z.string().nullable(),
  createdBy: z.string().min(1),
  lifecycleStatus: z.enum(['created', 'consumed', 'superseded', 'rolled_back', 'expired']),
  payload: z.record(z.unknown()),
  createdAt: dateValueSchema,
  updatedAt: dateValueSchema,
}) as z.ZodType<WorkflowArtifact>

export const knowledgeQaConversationSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  documentIds: z.array(z.string().uuid()),
  createdAt: dateValueSchema,
  updatedAt: dateValueSchema,
}) as z.ZodType<import('./document').KnowledgeQaConversation>

export const knowledgeQaMessageSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  status: z.enum(['pending', 'answered', 'error', 'cancelled']),
  workflowRunId: z.string().uuid().nullable(),
  documentIds: z.array(z.string().uuid()),
  answerPayload: z.record(z.unknown()).nullable(),
  errorMessage: z.string().nullable(),
  createdAt: dateValueSchema,
  updatedAt: dateValueSchema,
}) as z.ZodType<import('./document').KnowledgeQaMessage>

export const knowledgeQaConversationDetailSchema = z.object({
  conversation: knowledgeQaConversationSchema,
  messages: z.array(knowledgeQaMessageSchema),
}) as z.ZodType<import('./document').KnowledgeQaConversationDetail>

export const sendKnowledgeQaMessageResultSchema = z.object({
  conversation: knowledgeQaConversationSchema,
  userMessage: knowledgeQaMessageSchema,
  assistantMessage: knowledgeQaMessageSchema,
  run: workflowRunSchema,
}) as z.ZodType<import('./document').SendKnowledgeQaMessageResult>

export const finalizeCardGenerationResultSchema = z.object({
  createdCount: z.number().int().nonnegative(),
  skippedDuplicates: z.number().int().nonnegative(),
  rejectedCount: z.number().int().nonnegative(),
  run: workflowRunSchema,
}) as z.ZodType<FinalizeCardGenerationResult>

export const serviceHealthStatusSchema = z.object({
  status: z.enum(['starting', 'healthy', 'degraded', 'stopped']),
  endpoint: z.string().nullable(),
  protocolVersion: z.string().nullable(),
  serviceVersion: z.string().nullable(),
  pid: z.number().int().nullable(),
  startedAt: nullableDateValueSchema,
  checkedAt: dateValueSchema,
  protocolCompatible: z.boolean(),
  errorMessage: z.string().nullable(),
  hostGatewayConfigured: z.boolean().catch(false).default(false),
  hostGatewayEndpoint: z.string().nullable().catch(null).default(null),
  dependenciesReady: z.boolean().catch(true).default(true),
  missingDependencies: z.array(z.string()).catch([]).default([]),
}) as z.ZodType<ServiceHealthStatus>

export const hostGatewayManifestSchema = z.object({
  protocolVersion: z.string().min(1),
  modelGatewayCommands: z.array(z.string().min(1)),
  toolGatewayCommands: z.array(z.string().min(1)),
}) as z.ZodType<HostGatewayManifest>

export const cardGenerationCandidateSchema = z.object({
  front: z.string().min(1),
  back: z.string().min(1),
  tags: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  sourcePage: z.number().int().nullable(),
  sourceParagraph: z.number().int().nullable(),
  sourceQuote: z.string().min(1),
}) as z.ZodType<CardGenerationCandidate>

export const citationSchema = z.object({
  documentId: z.string().uuid(),
  sectionId: z.string().uuid().nullable(),
  chunkId: z.string().uuid().nullable(),
  anchorId: z.string().uuid().nullable(),
  page: z.number().int().nullable(),
  quote: z.string().min(1),
  relevanceScore: z.number().min(0).max(1).nullable(),
}) as z.ZodType<Citation>

const ragRetrievalSummarySchema = z
  .object({
    chunkCount: z.number().int().nonnegative(),
    retrievedDocumentCount: z.number().int().nonnegative(),
    lexicalStatus: z.string(),
    retrievalMode: z.string(),
  })
  .passthrough() as z.ZodType<import('./document').RagRetrievalSummary>

const ragRewriteSummarySchema = z
  .object({
    status: z.string(),
    triggerReason: z.string().nullable(),
    recentMessageCount: z.number().int().nonnegative(),
    originalQueryPreview: z.string(),
    rewrittenQueryPreview: z.string(),
  })
  .passthrough() as z.ZodType<import('./document').RagRewriteSummary>

const ragMergeSummarySchema = z
  .object({
    status: z.string(),
    childChunksExpanded: z.number().int().nonnegative(),
    parentContextsAdded: z.number().int().nonnegative(),
    sectionContextsAdded: z.number().int().nonnegative(),
    charsAdded: z.number().int().nonnegative(),
  })
  .passthrough() as z.ZodType<import('./document').RagMergeSummary>

const ragPackingSummarySchema = z
  .object({
    passageCount: z.number().int().nonnegative(),
    totalChars: z.number().int().nonnegative(),
    budgetChars: z.number().int().nonnegative(),
  })
  .passthrough() as z.ZodType<import('./document').RagPackingSummary>

const ragRerankSummarySchema = z
  .object({
    status: z.string(),
    provider: z.string(),
    topScore: z.number().nullable(),
    averageScore: z.number().nullable(),
    chunkCount: z.number().int().nonnegative(),
  })
  .passthrough() as z.ZodType<import('./document').RagRerankSummary>

const ragRelevanceGateSummarySchema = z
  .object({
    decision: z.string(),
    topScore: z.number().nullable(),
    threshold: z.number(),
    chunkCount: z.number().int().nonnegative(),
    reason: z.string(),
  })
  .passthrough() as z.ZodType<import('./document').RagRelevanceGateSummary>

const ragSecondRetrievalSummarySchema = z
  .object({
    status: z.string(),
    used: z.boolean(),
    queryPreview: z.string(),
    additionalChunkCount: z.number().int().nonnegative(),
    reason: z.string().nullable(),
  })
  .passthrough() as z.ZodType<import('./document').RagSecondRetrievalSummary>

const ragAuditSummarySchema = z
  .object({
    totalCitations: z.number().int().nonnegative(),
    validCitations: z.number().int().nonnegative(),
    rejectedCitations: z.number().int().nonnegative(),
    auditStatus: z.string(),
  })
  .passthrough() as z.ZodType<import('./document').RagAuditSummary>

export const ragTraceSchema = z
  .object({
    embeddingReadiness: z.string(),
    retrievalMode: z.string(),
    queryRewriteUsed: z.boolean(),
    secondRetrievalUsed: z.boolean(),
    retrievedDocumentCount: z.number().int().nonnegative(),
    parentMergeStatus: z.string().nullable(),
    rerankStatus: z.string().nullable(),
    relevanceGateDecision: z.string().nullable(),
    citationAuditStatus: z.string().nullable(),
    failureReason: z.string().nullable(),
    retrievalSummary: ragRetrievalSummarySchema,
    rewriteSummary: ragRewriteSummarySchema.optional(),
    mergeSummary: ragMergeSummarySchema,
    packingSummary: ragPackingSummarySchema,
    rerankSummary: ragRerankSummarySchema.optional(),
    relevanceGateSummary: ragRelevanceGateSummarySchema.optional(),
    secondRetrievalSummary: ragSecondRetrievalSummarySchema.optional(),
    auditSummary: ragAuditSummarySchema,
  })
  .passthrough() as z.ZodType<RagTrace>

export const agentToolInvocationSchema = z.object({
  toolKey: z.string(),
  durationMs: z.number(),
  inputSummary: z.record(z.unknown()),
  outputSummary: z.record(z.unknown()),
  errorCategory: z.string().nullable(),
}) as z.ZodType<AgentToolInvocation>

export const ragAnswerSchema = z.object({
  answer: z.string().min(1),
  answerMode: z.enum(['grounded', 'no_relevant_content', 'excerpt_fallback']),
  retrievalMode: z.enum(['fts5', 'hybrid']),
  retrievalStatus: z.enum([
    'ready',
    'embedding_missing',
    'embedding_stale',
    'embedding_failed',
    'embedding_config_error',
    'embedding_auth_error',
    'embedding_timeout',
    'embedding_rate_limited',
    'embedding_dimension_mismatch',
    'embedding_network_error',
    'query_embedding_failed',
    'no_hits',
  ]),
  citations: z.array(citationSchema),
  ragTrace: ragTraceSchema.nullable().optional(),
  agentTrace: z.array(agentToolInvocationSchema).nullable().optional(),
  sessionMemoryUsed: z.boolean().optional(),
  sessionMemorySummary: z.string().nullable().optional(),
}) as z.ZodType<RagAnswer>

export const chunkSearchResultSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  chunkIndex: z.number().int(),
  pageStart: z.number().int().nullable(),
  pageEnd: z.number().int().nullable(),
  content: z.string(),
  snippet: z.string(),
}) as z.ZodType<import('./document').ChunkSearchResult>

export const agentRunSchema = z.object({
  id: z.string().uuid(),
  presetId: z.string().uuid(),
  status: z.enum(['queued', 'running', 'waiting_approval', 'completed', 'failed', 'cancelled']),
  threadId: z.string(),
  checkpointRef: z.string().nullable(),
  approvalPayload: z.record(z.unknown()).nullable(),
  costUsd: z.number().nullable(),
  errorMessage: z.string().nullable(),
  startedAt: nullableDateValueSchema,
  finishedAt: nullableDateValueSchema,
})

export const pointsEntrySchema = z.object({
  id: z.string(),
  reviewLogId: z.string(),
  cardId: z.string(),
  points: z.number().int(),
  transactionType: z.string(),
  rating: z.enum(['again', 'hard', 'good', 'easy']),
  reason: z.string().nullable(),
  createdAt: dateValueSchema,
}) as z.ZodType<PointsEntry>

export const pointsSummarySchema = z.object({
  todayPoints: z.number().int(),
}) as z.ZodType<PointsSummary>

export const studyStatsSchema = z.object({
  todayMinutes: z.number().int().nonnegative().nullable(),
  weekMinutes: z.number().int().nonnegative().nullable(),
  totalMinutes: z.number().int().nonnegative().nullable(),
  streakDays: z.number().int().nonnegative(),
  activeDaysThisWeek: z.number().int().nonnegative(),
}) as z.ZodType<import('./document').StudyStats>

export const masteryBreakdownSchema = z.object({
  newCards: z.number().int().nonnegative(),
  learningCards: z.number().int().nonnegative(),
  reviewCards: z.number().int().nonnegative(),
  masteredCards: z.number().int().nonnegative(),
}) as z.ZodType<import('./document').MasteryBreakdown>

export const heatmapEntrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  count: z.number().int().nonnegative(),
}) as z.ZodType<import('./document').HeatmapEntry>

const dashboardProgressBaseSchema = z.object({
  id: z.string().uuid(),
  learnedCards: z.number().int().nonnegative(),
  totalCards: z.number().int().nonnegative(),
  progressPercent: z.number().int().min(0).max(100),
})

export const dashboardDocumentProgressSchema = dashboardProgressBaseSchema.extend({
  title: z.string().min(1),
})

export const dashboardGroupProgressSchema = dashboardProgressBaseSchema.extend({
  name: z.string().min(1),
  color: z.string().nullable(),
})

export const dashboardSummarySchema = z.object({
  todayCompletedCount: z.number().int().nonnegative(),
  todayNewDueCount: z.number().int().nonnegative(),
  todayReviewDueCount: z.number().int().nonnegative(),
  todayStudyMinutes: z.number().int().nonnegative(),
  totalStudyMinutes: z.number().int().nonnegative(),
  streakDays: z.number().int().nonnegative(),
  heatmap: z.array(heatmapEntrySchema),
  documentProgress: z.array(dashboardDocumentProgressSchema),
  groupProgress: z.array(dashboardGroupProgressSchema),
}) as z.ZodType<import('./document').DashboardSummary>
