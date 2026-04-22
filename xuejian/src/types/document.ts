/**
 * 核心类型定义
 * 基于 spec.md §4 数据模型规范
 */

// ==================== DocumentIR v1 ====================

export type DocumentIRBlockType =
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'list_item'
  | 'table'
  | 'figure'
  | 'code_block'
  | 'formula'
  | 'blockquote'
  | 'page_header'
  | 'page_footer'
  | 'unknown'

export interface IRRect {
  x: number
  y: number
  width: number
  height: number
}

export interface DocumentIRSpan {
  spanId: string
  start: number
  end: number
  page: number
  rect: IRRect | null
}

export interface DocumentIRBlock {
  blockId: string
  blockType: DocumentIRBlockType
  pageNumber: number
  content: string
  spans: DocumentIRSpan[]
  anchorId: string | null
  parentBlockId: string | null
  level: number | null
  language: string | null
  metadata: Record<string, unknown> | null
}

export interface DocumentIRPage {
  pageNumber: number
  width: number
  height: number
  rotation: number
  label: string | null
}

export type DocumentIRAssetType = 'image' | 'table_image' | 'figure'

export interface DocumentIRAsset {
  assetId: string
  assetType: DocumentIRAssetType
  blockId: string | null
  mimeType: string
  dataRef: string
  altText: string | null
}

export interface DocumentIRMetadata {
  importTimestamp: string
  sourceHash: string | null
  languageHint: string | null
  warnings: string[]
  totalBlocks: number
  totalPages: number
}

export interface DocumentIR {
  documentId: string
  parserFamily: string
  parserVersion: string
  irVersion: '1'
  pages: DocumentIRPage[]
  blocks: DocumentIRBlock[]
  assets: DocumentIRAsset[]
  sourceMetadata: DocumentIRMetadata
}

// ==================== 文档相关 ====================

export interface Document {
  id: string
  title: string
  filePath: string
  fileType: 'pdf' | 'md' | 'txt' | 'docx'
  fileSize: number | null
  pageCount: number | null
  contentHash: string | null
  status:
    | 'uploading'
    | 'parsed'
    | 'embedding'
    | 'ready'
    | 'embedding_failed'
    | 'embedding_stale'
    | 'error'
  createdAt: Date
  updatedAt: Date
}

export interface DocumentSection {
  id: string
  documentId: string
  sectionIndex: number
  heading: string | null
  hierarchyPath: string[]
  pageStart: number | null
  pageEnd: number | null
  anchorStartId: string | null
  anchorEndId: string | null
  content: string
  tokenCount: number | null
  metadata: Record<string, unknown> | null
  createdAt: Date
}

export interface DocumentAnchor {
  id: string
  documentId: string
  page: number
  paragraph: number | null
  textQuote: string
  rects: Array<{
    x: number
    y: number
    width: number
    height: number
  }>
  /** @deprecated Use quoteHash instead */
  hash: string
  hierarchyPath: string[]
  quoteHash: string | null
  createdAt: Date
}

export interface DocumentChunk {
  id: string
  documentId: string
  sectionId: string | null
  anchorId: string | null
  pageStart: number | null
  pageEnd: number | null
  chunkIndex: number
  chunkKind: 'parent' | 'child' | 'semantic' | 'fallback'
  content: string
  tokenCount: number | null
  metadata: Record<string, unknown> | null
  createdAt: Date
}

// ==================== 卡片相关 ====================

export interface CardCandidate {
  id: string
  workflowRunId: string | null
  documentId: string
  sectionId: string | null
  anchorId: string | null
  title: string | null
  cardType: 'qa' | 'cloze' | 'fact' | 'choice'
  sourcePage: number | null
  sourceParagraph: number | null
  sourceQuote: string | null
  front: string
  back: string
  tags: string[]
  confidence: number
  dedupeKey: string
  status: 'pending' | 'accepted' | 'rejected'
  scoreOverall: number | null
  scoreDetails: Record<string, unknown> | null
  visibilityBucket: 'default' | 'expanded' | 'hidden_low_quality' | null
  generationMode: 'llm' | 'fallback_rule' | 'fallback_fts5_only'
  fallbackReason: string | null
  evaluationSummary: string | null
  sourceChunkIds: string[] | null
  createdAt: Date
}

export interface FinalizeCardGenerationResult {
  createdCount: number
  skippedDuplicates: number
  rejectedCount: number
  run: WorkflowRun
}

export interface Card {
  id: string
  groupId: string | null
  title: string | null
  cardType: 'qa' | 'cloze' | 'fact' | 'choice' | 'image_occlusion'
  clusterId: string | null
  exportGuid: string | null
  documentId: string | null
  anchorId: string | null
  front: string
  back: string
  sourcePage: number | null
  sourceParagraph: number | null
  sourceCoordinates: {
    x: number
    y: number
    width: number
    height: number
  } | null
  tags: string[]
  difficulty: number
  stability: number
  retrievability: number | null
  state: 'new' | 'learning' | 'review' | 'relearning'
  nextReview: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface CardGroup {
  id: string
  documentId: string | null
  name: string
  description: string | null
  createdAt: Date
}

export interface Highlight {
  id: string
  cardId: string | null
  documentId: string
  anchorId: string | null
  pageNumber: number
  rectangles: Array<{
    x: number
    y: number
    width: number
    height: number
  }>
  textContent: string
  color: string
  note: string | null
  pageCardIndex: number | null
  createdAt: Date
}

// ==================== 卡片媒体 ====================

export interface CardMedia {
  id: string
  cardId: string
  fileName: string
  mimeType: string
  fileSize: number | null
  storageKey: string
  createdAt: string
}

// ==================== APKG 导入导出 ====================

export interface ImportApkgResult {
  importedCount: number
  skippedDuplicates: number
  deckName: string
}

export interface ExportApkgResult {
  deckName: string
  cardCount: number
  outputPath: string
  exportedAt: string
}

// ==================== 学习相关 ====================

export interface ReviewLog {
  id: string
  cardId: string
  rating: 'again' | 'hard' | 'good' | 'easy'
  reviewedAt: Date
  state: 'new' | 'learning' | 'review' | 'relearning'
  difficulty: number
  stability: number
  retrievability: number | null
  nextReview: Date | null
  intervalDays: number | null
}

export interface DailyStats {
  newCards: number
  reviewCards: number
  correctRate: number | null
}

export interface StudyStats {
  todayMinutes: number | null
  weekMinutes: number | null
  totalMinutes: number | null
  streakDays: number
  activeDaysThisWeek: number
}

export interface MasteryBreakdown {
  newCards: number
  learningCards: number
  reviewCards: number
  masteredCards: number
}

export interface HeatmapEntry {
  date: string
  count: number
}

// ==================== API配置相关 ====================

export type AppThemeId = 'default' | 'comic-sketch' | 'contrast-paper'

export type ApiProvider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'deepseek'
  | 'openai_compatible'
  | 'custom_openai'
  | 'custom_anthropic'
  | 'custom_google'

export type ApiAuthMode = 'api_key' | 'adc'

export type KeyStatus = 'none' | 'stored' | 'verified' | 'invalid' | 'expired'

export type WorkflowType =
  | 'card_generation'
  | 'document_embedding'
  | 'knowledge_qa'
  | 'podcast_generation'
  | 'knowledge_graph'

export interface ModelCapabilities {
  vision: boolean
  functionCalling: boolean
  maxContext: number
  streaming: boolean
  jsonMode: boolean
}

export interface DiscoveredModel {
  id: string
  displayName: string
  source: 'preset' | 'fetched'
  capabilities: ModelCapabilities
  isRecommended: boolean
}

export interface AppSettings {
  theme: AppThemeId
  language: 'zh-CN' | 'en-US'
  dailyNewCardLimit: number
  reviewTimeLimit: number
  // New detailed-settings fields are optional in static TS only for legacy mocks/fixtures.
  learningGoal?: string
  dailyStudyMinutes?: number
  studyTimePreference?: string
  studyContentPreferences?: string[]
  contentDifficultyPreference?: string
  podcastTtsProvider: 'auto' | 'openai' | 'edge_tts' | 'elevenlabs' | 'fish_audio'
  podcastOpenaiModel: string
  podcastFishAudioEndpoint: string | null
  podcastVoiceOverrides: Record<string, string>
  defaultVoice?: string
  speechRate?: number
  speechPitch?: number
  speechVolume?: number
  readingMode?: string
  defaultPodcastStyle?: string
  podcastEpisodeDurationMinutes?: number
  podcastContentStructure?: string
  podcastBackgroundMusic?: string
  podcastIntroOutroEnabled?: boolean
  voiceInputLanguage?: string
  voiceInterruptEnabled?: boolean
  podcastAutoPlayNextEpisode?: boolean
  podcastOutputFormat: 'mp3' | 'wav'
  podcastSkipReview: boolean
  podcastMaxLlmTokens: number
  podcastMaxTtsCharacters: number
  podcastMaxEstimatedCostUsd: number
}

export interface ApiConfig {
  id: string
  provider: ApiProvider
  protocol: 'native' | 'openai-compatible' | null
  authMode: ApiAuthMode
  name: string
  model: string | null
  baseUrl: string | null
  budgetLimit: number | null
  isDefault: boolean
  isEnabled: boolean
  hasStoredCredential: boolean
  hasStoredKey: boolean
  keyVerifiedAt: Date | null
  keyStatus: KeyStatus
  displayName: string | null
  createdAt: Date
}

export interface EmbeddingProfile {
  id: string
  provider: ApiProvider
  model: string
  dimensions: number
  distanceMetric: 'cosine'
  isActive: boolean
  revision: number
  createdAt: Date
}

// `ModelProfile` is kept as a compatibility alias for existing code and docs.
export type ModelProfile = ApiConfig

export interface ApiConnectionTestResult {
  success: boolean
  message: string
}

export interface WorkflowModelAssignment {
  workflowType: WorkflowType
  apiConfigId: string
  assignedAt: Date
  updatedAt: Date
  apiConfig?: ApiConfig | null
}

export interface ProviderBudgetUsage {
  id: string
  apiConfigId: string
  period: string
  estimatedCostUsd: number
  workflowRunsCount: number
  updatedAt: Date
}

export interface KnowledgeScope {
  id: string
  name: string
  documentIds: string[]
  cardGroupIds: string[]
  tags: string[]
  pageRanges: Array<{ start: number; end: number }> | null
  includeHighlights: boolean
  createdAt: Date
}

// ==================== Agent相关 ====================

export interface AgentPreset {
  id: string
  type: 'card_generation' | 'knowledge_qa' | 'podcast_generation' | 'knowledge_graph'
  name: string
  modelProfileId: string
  knowledgeScopeId: string | null
  promptTemplate: string
  enabledTools: string[]
  budgetLimit: number | null
  createdAt: Date
}

export interface AgentRun {
  id: string
  presetId: string
  status: 'queued' | 'running' | 'waiting_approval' | 'completed' | 'failed' | 'cancelled'
  threadId: string
  checkpointRef: string | null
  approvalPayload: Record<string, unknown> | null
  costUsd: number | null
  errorMessage: string | null
  startedAt: Date | null
  finishedAt: Date | null
}

export interface WorkflowRun {
  id: string
  workflowType: WorkflowType
  presetId: string | null
  status: 'queued' | 'running' | 'waiting_confirmation' | 'completed' | 'failed' | 'cancelled'
  threadId: string
  checkpointRef: string | null
  approvalPayload: Record<string, unknown> | null
  costUsd: number | null
  errorMessage: string | null
  startedAt: Date | null
  finishedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface WorkflowCheckpoint {
  id: string
  runId: string
  checkpointRef: string
  stepKey: string | null
  payload: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

export interface WorkflowEvent {
  runId: string
  eventType:
    | 'queued'
    | 'started'
    | 'progress'
    | 'waiting_confirmation'
    | 'completed'
    | 'failed'
    | 'fallback'
  message: string | null
  progress: number | null
  payload: Record<string, unknown> | null
  createdAt: Date
}

export interface ServiceHealthStatus {
  status: 'starting' | 'healthy' | 'degraded' | 'stopped'
  endpoint: string | null
  protocolVersion: string | null
  serviceVersion: string | null
  pid: number | null
  startedAt: Date | null
  checkedAt: Date
  protocolCompatible: boolean
  errorMessage: string | null
}

export interface HostGatewayManifest {
  protocolVersion: string
  modelGatewayCommands: string[]
  toolGatewayCommands: string[]
}

// ==================== 结构化 AI 输出相关 ====================

export interface CardGenerationCandidate {
  front: string
  back: string
  tags: string[]
  confidence: number
  sourcePage: number | null
  sourceParagraph: number | null
  sourceQuote: string
}

export interface Citation {
  documentId: string
  sectionId: string | null
  chunkId: string | null
  anchorId: string | null
  page: number | null
  quote: string
  relevanceScore: number | null
}

export interface RagAnswer {
  answer: string
  answerMode: 'grounded' | 'no_relevant_content' | 'excerpt_fallback'
  retrievalMode: 'fts5' | 'hybrid'
  citations: Citation[]
}

export interface ChunkSearchResult {
  id: string
  documentId: string
  chunkIndex: number
  pageStart: number | null
  pageEnd: number | null
  content: string
  snippet: string
}

// ==================== 积分相关 ====================

export interface PointsEntry {
  id: string
  reviewLogId: string
  cardId: string
  points: number
  transactionType: string
  rating: 'again' | 'hard' | 'good' | 'easy'
  reason: string | null
  createdAt: Date
}

export interface PointsSummary {
  todayPoints: number
}
