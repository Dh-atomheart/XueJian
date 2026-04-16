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
  fileSize: number
  pageCount: number
  contentHash: string
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
  documentId: string
  anchorId: string | null
  front: string
  back: string
  tags: string[]
  confidence: number
  dedupeKey: string
  status: 'pending' | 'accepted' | 'rejected'
  createdAt: Date
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

export interface ModelProfile {
  id: string
  provider: 'openai' | 'anthropic' | 'custom'
  name: string
  model: string
  baseUrl: string | null
  budgetLimit: number | null
  isDefault: boolean
  isEnabled: boolean
  createdAt: Date
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
  type: 'card_generation' | 'knowledge_qa' | 'podcast_generation'
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
  type: 'card_generation'
  status: 'queued' | 'running' | 'waiting_confirmation' | 'completed' | 'failed' | 'cancelled'
  checkpointRef?: string
  startedAt?: Date
  finishedAt?: Date
}
