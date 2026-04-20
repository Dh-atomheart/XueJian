import { z } from 'zod'
import type {
  ApiConfig,
  ApiConnectionTestResult,
  AppSettings,
  Card,
  CardCandidate,
  CardGenerationCandidate,
  Citation,
  DocumentAnchor,
  DocumentChunk,
  Document,
  DocumentIR,
  DocumentIRAsset,
  DocumentIRBlock,
  DocumentIRMetadata,
  DocumentIRPage,
  DocumentIRSpan,
  FinalizeCardGenerationResult,
  Highlight,
  HostGatewayManifest,
  IRRect,
  PointsEntry,
  PointsSummary,
  RagAnswer,
  ReviewLog,
  ServiceHealthStatus,
  WorkflowCheckpoint,
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

export const appSettingsSchema = z.object({
  theme: z.enum(['default', 'comic-sketch', 'contrast-paper']),
  language: z.enum(['zh-CN', 'en-US']),
  dailyNewCardLimit: z.number().int().nonnegative(),
  reviewTimeLimit: z.number().int().nonnegative(),
}) as z.ZodType<AppSettings>

export const apiProviderSchema = z.enum(['openai', 'anthropic', 'custom'])

export const apiAuthModeSchema = z.enum(['api_key', 'adc'])

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
  createdAt: dateValueSchema,
}) as z.ZodType<ApiConfig>

export const apiConnectionTestResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
}) as z.ZodType<ApiConnectionTestResult>

export const documentSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  filePath: z.string().min(1),
  fileType: z.enum(['pdf', 'md', 'txt', 'docx']),
  fileSize: z.number().int().nullable(),
  pageCount: z.number().int().nullable(),
  contentHash: z.string().nullable(),
  status: z.enum(['uploading', 'parsed', 'indexing', 'generating', 'ready', 'error']),
  createdAt: dateValueSchema,
  updatedAt: dateValueSchema,
}) as z.ZodType<Document>

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
  hierarchyPath: z.array(z.string()),
  quoteHash: z.string().nullable(),
  createdAt: dateValueSchema,
}) as z.ZodType<DocumentAnchor>

export const documentChunkSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string().uuid(),
  pageStart: z.number().int().positive().nullable(),
  pageEnd: z.number().int().positive().nullable(),
  chunkIndex: z.number().int().nonnegative(),
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

export const cardSchema = z.object({
  id: z.string().uuid(),
  groupId: z.string().uuid().nullable(),
  title: z.string().nullable(),
  cardType: z.enum(['qa', 'cloze', 'fact', 'choice']),
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
  ]),
  message: z.string().nullable(),
  progress: z.number().min(0).max(1).nullable(),
  payload: z.record(z.unknown()).nullable(),
  createdAt: dateValueSchema,
}) as z.ZodType<WorkflowEvent>

export const workflowRunSchema = z.object({
  id: z.string().uuid(),
  workflowType: z.enum([
    'card_generation',
    'knowledge_qa',
    'podcast_generation',
    'knowledge_graph',
  ]),
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

export const workflowCheckpointSchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid(),
  checkpointRef: z.string().min(1),
  stepKey: z.string().nullable(),
  payload: z.record(z.unknown()),
  createdAt: dateValueSchema,
  updatedAt: dateValueSchema,
}) as z.ZodType<WorkflowCheckpoint>

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
  anchorId: z.string().uuid().nullable(),
  page: z.number().int().nullable(),
  quote: z.string().min(1),
  relevanceScore: z.number().min(0).max(1).nullable(),
}) as z.ZodType<Citation>

export const ragAnswerSchema = z.object({
  answer: z.string().min(1),
  answerMode: z.enum(['grounded', 'no_relevant_content', 'excerpt_fallback']),
  retrievalMode: z.enum(['fts5', 'hybrid']),
  citations: z.array(citationSchema),
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
