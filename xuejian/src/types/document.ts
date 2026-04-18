/**
 * 核心类型定义
 * 基于 spec.md §4 数据模型规范
 */

// ==================== 文档相关 ====================

export interface Document {
  id: string
  title: string
  filePath: string
  fileType: 'pdf' | 'md' | 'txt' | 'docx'
  fileSize: number | null
  pageCount: number | null
  contentHash: string | null
  status: 'uploading' | 'parsed' | 'indexing' | 'generating' | 'ready' | 'error'
  createdAt: Date
  updatedAt: Date
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
  hash: string
  createdAt: Date
}

export interface DocumentChunk {
  id: string
  documentId: string
  pageStart: number | null
  pageEnd: number | null
  chunkIndex: number
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
  anchorId: string | null
  sourcePage: number | null
  sourceParagraph: number | null
  sourceQuote: string | null
  front: string
  back: string
  tags: string[]
  confidence: number
  dedupeKey: string
  status: 'pending' | 'accepted' | 'rejected'
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
  createdAt: Date
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
  id: string
  date: string
  newCards: number
  reviewCards: number
  learningTime: number
  correctRate: number | null
}

// ==================== API配置相关 ====================

export type AppThemeId = 'default' | 'comic-sketch' | 'contrast-paper'

export interface AppSettings {
  theme: AppThemeId
  language: 'zh-CN' | 'en-US'
  dailyNewCardLimit: number
  reviewTimeLimit: number
}

export interface ApiConfig {
  id: string
  provider: 'openai' | 'anthropic' | 'custom'
  name: string
  model: string | null
  baseUrl: string | null
  budgetLimit: number | null
  isDefault: boolean
  isEnabled: boolean
  hasStoredKey: boolean
  createdAt: Date
}

// `ModelProfile` is kept as a compatibility alias for existing code and docs.
export type ModelProfile = ApiConfig

export interface ApiConnectionTestResult {
  success: boolean
  message: string
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
  workflowType: 'card_generation' | 'knowledge_qa' | 'podcast_generation' | 'knowledge_graph'
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
  eventType: 'queued' | 'started' | 'progress' | 'waiting_confirmation' | 'completed' | 'failed'
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
  anchorId: string | null
  page: number | null
  quote: string
  relevanceScore: number | null
}

export interface RagAnswer {
  answer: string
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
