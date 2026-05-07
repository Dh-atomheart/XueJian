import { z } from 'zod'
import {
  cardSchema,
  backgroundJobSchema,
  cardCandidateSchema,
  finalizeCardGenerationResultSchema,
  heatmapEntrySchema,
  highlightSchema,
  masteryBreakdownSchema,
  reviewLogSchema,
  studyStatsSchema,
  workflowRunSchema,
} from '@/types'
import type {
  Card,
  BackgroundJob,
  CardCandidate,
  CardMedia,
  FinalizeCardGenerationResult,
  HeatmapEntry,
  Highlight,
  ImportApkgResult,
  MasteryBreakdown,
  ReviewLog,
  StudyStats,
  WorkflowRun,
} from '@/types'
import { invoke, invokeWithSchema } from './index'

export interface CardFilters {
  documentId?: string | null
  anchorId?: string | null
  pageNumber?: number | null
  limit?: number
}

export interface CardCandidateFilters {
  workflowRunId?: string | null
  documentId?: string | null
  status?: CardCandidate['status'] | null
  limit?: number
}

export interface CreateCardInput {
  front: string
  back: string
  cardType?: Card['cardType']
  documentId?: string | null
  anchorId?: string | null
  sourcePage?: number | null
  sourceParagraph?: number | null
  sourceCoordinates?: Card['sourceCoordinates']
  tags?: string[]
}

export interface UpdateCardInput {
  front: string
  back: string
  cardType?: Card['cardType']
  tags?: string[]
}

export interface HighlightFilters {
  documentId?: string | null
  cardId?: string | null
  pageNumber?: number | null
  limit?: number
}

export interface CreateHighlightInput {
  documentId: string
  cardId?: string | null
  anchorId?: string | null
  pageNumber: number
  rectangles: Highlight['rectangles']
  textContent: string
  color?: string | null
  note?: string | null
  pageCardIndex?: number | null
}

export interface UpdateHighlightInput {
  cardId?: string | null
  anchorId?: string | null
  rectangles?: Highlight['rectangles']
  textContent?: string
  color?: string
  note?: string | null
  pageCardIndex?: number | null
}

export interface BatchCreateHighlightsForRunResult {
  created: number
  skipped: number
  unlinked: number
}

export interface StartAiCardGenerationInput {
  documentId: string
  groupId: string
  pageStart?: number | null
  pageEnd?: number | null
  density: 'low' | 'medium' | 'high'
  providerConfigId: string
}

export interface BackgroundJobFilters {
  jobType?: string | null
  status?: BackgroundJob['status'] | null
  targetType?: string | null
  targetId?: string | null
}

export interface ExportAnnotatedPdfResult {
  outputPath: string
  highlightCount: number
}

export const cardsGateway = {
  async list(filters: CardFilters = {}): Promise<Card[]> {
    return invokeWithSchema('list_cards', z.array(cardSchema), {
      filters: {
        documentId: filters.documentId ?? null,
        anchorId: filters.anchorId ?? null,
        pageNumber: filters.pageNumber ?? null,
        limit: filters.limit,
      },
    })
  },

  async create(data: CreateCardInput): Promise<Card> {
    return invokeWithSchema('create_card', cardSchema, { data })
  },

  async update(id: string, data: UpdateCardInput): Promise<Card> {
    return invokeWithSchema('update_card', cardSchema, { id, data })
  },

  async delete(id: string): Promise<void> {
    return invoke<void>('delete_card', { id })
  },

  async listCandidates(filters: CardCandidateFilters = {}): Promise<CardCandidate[]> {
    return invokeWithSchema('list_card_candidates', z.array(cardCandidateSchema), {
      workflowRunId: filters.workflowRunId ?? null,
      documentId: filters.documentId ?? null,
      status: filters.status ?? null,
      limit: filters.limit,
    })
  },

  async updateCandidate(
    id: string,
    data: Partial<
      Pick<
        CardCandidate,
        | 'cardType'
        | 'front'
        | 'back'
        | 'tags'
        | 'confidence'
        | 'status'
        | 'scoreOverall'
        | 'scoreDetails'
        | 'visibilityBucket'
        | 'generationMode'
        | 'fallbackReason'
        | 'evaluationSummary'
        | 'sourceChunkIds'
      >
    >
  ): Promise<CardCandidate> {
    return invokeWithSchema('update_card_candidate', cardCandidateSchema, { id, data })
  },

  async bulkUpdateCandidateStatuses(
    workflowRunId: string,
    ids: string[],
    status: CardCandidate['status']
  ): Promise<number> {
    return invoke<number>('bulk_update_card_candidate_statuses', {
      data: { workflowRunId, ids, status },
    })
  },

  async startGeneration(documentId: string, maxCandidates?: number): Promise<WorkflowRun> {
    return invokeWithSchema('start_card_generation_workflow', workflowRunSchema, {
      data: { documentId, maxCandidates },
    })
  },

  async resumeGeneration(runId: string): Promise<WorkflowRun> {
    return invokeWithSchema('resume_card_generation_workflow', workflowRunSchema, { runId })
  },

  async finalizeGeneration(runId: string): Promise<FinalizeCardGenerationResult> {
    return invokeWithSchema(
      'finalize_card_generation_workflow',
      finalizeCardGenerationResultSchema,
      {
        runId,
      }
    )
  },

  async startAiCardGeneration(data: StartAiCardGenerationInput): Promise<BackgroundJob> {
    return invokeWithSchema('start_ai_card_generation', backgroundJobSchema, { data })
  },

  async resumeAiCardGeneration(jobId: string): Promise<BackgroundJob> {
    return invokeWithSchema('resume_ai_card_generation', backgroundJobSchema, { jobId })
  },

  async getBackgroundJob(jobId: string): Promise<BackgroundJob | null> {
    return invokeWithSchema('get_background_job', backgroundJobSchema.nullable(), { jobId })
  },

  async listBackgroundJobs(filters: BackgroundJobFilters = {}): Promise<BackgroundJob[]> {
    return invokeWithSchema('list_background_jobs', z.array(backgroundJobSchema), {
      jobType: filters.jobType ?? null,
      status: filters.status ?? null,
      targetType: filters.targetType ?? null,
      targetId: filters.targetId ?? null,
    })
  },

  async cancelBackgroundJob(jobId: string): Promise<BackgroundJob> {
    return invokeWithSchema('cancel_background_job', backgroundJobSchema, { jobId })
  },

  async listHighlights(filters: HighlightFilters = {}): Promise<Highlight[]> {
    return invokeWithSchema('list_highlights', z.array(highlightSchema), {
      filters: {
        documentId: filters.documentId ?? null,
        cardId: filters.cardId ?? null,
        pageNumber: filters.pageNumber ?? null,
        limit: filters.limit,
      },
    })
  },

  async createHighlight(data: CreateHighlightInput): Promise<Highlight> {
    return invokeWithSchema('create_highlight', highlightSchema, { data })
  },

  async updateHighlight(id: string, data: UpdateHighlightInput): Promise<Highlight> {
    return invokeWithSchema('update_highlight', highlightSchema, { id, data })
  },

  async deleteHighlight(id: string): Promise<void> {
    return invoke<void>('delete_highlight', { id })
  },

  async batchCreateHighlightsForRun(
    runId: string,
    documentId: string
  ): Promise<BatchCreateHighlightsForRunResult> {
    return invoke<BatchCreateHighlightsForRunResult>('batch_create_highlights_for_cards', {
      data: { runId, documentId },
    })
  },

  async exportAnnotatedPdf(documentId: string): Promise<ExportAnnotatedPdfResult | null> {
    return invoke<ExportAnnotatedPdfResult | null>('export_annotated_pdf', {
      data: { documentId },
    })
  },

  async listDueCards(limit?: number): Promise<Card[]> {
    return invokeWithSchema('list_due_cards', z.array(cardSchema), {
      limit: limit ?? null,
    })
  },

  async updateCardReview(
    id: string,
    data: {
      difficulty: number
      stability: number
      retrievability: number
      state: string
      nextReview: string
    }
  ): Promise<void> {
    return invoke<void>('update_card_review', { id, data })
  },

  async createReviewLog(data: {
    cardId: string
    rating: string
    state: string
    difficulty: number
    stability: number
    retrievability: number | null
    nextReview: string | null
    intervalDays: number | null
  }): Promise<ReviewLog> {
    return invokeWithSchema('create_review_log', reviewLogSchema, { data })
  },

  async listReviewLogs(cardId?: string, limit?: number): Promise<ReviewLog[]> {
    return invokeWithSchema('list_review_logs', z.array(reviewLogSchema), {
      cardId: cardId ?? null,
      limit: limit ?? null,
    })
  },

  async getDailyStats(): Promise<{
    newCards: number
    reviewCards: number
    correctRate: number | null
  }> {
    return invokeWithSchema(
      'get_daily_stats',
      z.object({
        newCards: z.number().int(),
        reviewCards: z.number().int(),
        correctRate: z.number().nullable(),
      })
    )
  },

  async getStudyStats(): Promise<StudyStats> {
    return invokeWithSchema('get_study_stats', studyStatsSchema)
  },

  async getMasteryBreakdown(): Promise<MasteryBreakdown> {
    return invokeWithSchema('get_mastery_breakdown', masteryBreakdownSchema)
  },

  async getReviewHeatmap(days = 112): Promise<HeatmapEntry[]> {
    return invokeWithSchema('get_review_heatmap', z.array(heatmapEntrySchema), { days })
  },

  async exportCardsCsv(
    outputPath: string,
    documentId?: string | null
  ): Promise<{ cardCount: number; outputPath: string }> {
    return invoke<{ cardCount: number; outputPath: string }>('export_cards_csv', {
      data: { outputPath, documentId: documentId ?? null },
    })
  },

  async exportCardsApkg(
    outputPath: string,
    deckName?: string,
    documentId?: string | null
  ): Promise<{ deckName: string; cardCount: number; outputPath: string; exportedAt: string }> {
    return invoke<{ deckName: string; cardCount: number; outputPath: string; exportedAt: string }>(
      'export_cards_apkg',
      {
        data: {
          outputPath,
          deckName: deckName ?? 'XueJian Export',
          documentId: documentId ?? null,
        },
      }
    )
  },

  async pickAndExportCsv(
    documentId?: string | null
  ): Promise<{ cardCount: number; outputPath: string } | null> {
    return invoke<{ cardCount: number; outputPath: string } | null>('pick_and_export_csv', {
      data: { documentId: documentId ?? null },
    })
  },

  // ── Card Media ──────────────────────────────────────

  async uploadCardMedia(cardId: string, filePath: string): Promise<CardMedia> {
    return invoke<CardMedia>('upload_card_media', {
      data: { cardId, filePath },
    })
  },

  async listCardMedia(cardId: string): Promise<CardMedia[]> {
    return invoke<CardMedia[]>('list_card_media', { cardId })
  },

  async deleteCardMedia(id: string): Promise<void> {
    return invoke<void>('delete_card_media', { id })
  },

  // ── APKG Import / Export ────────────────────────────

  async importApkg(): Promise<ImportApkgResult> {
    return invoke<ImportApkgResult>('import_cards_apkg')
  },

  async pickAndExportApkg(): Promise<{
    deckName: string
    cardCount: number
    outputPath: string
    exportedAt: string
  } | null> {
    return invoke<{
      deckName: string
      cardCount: number
      outputPath: string
      exportedAt: string
    } | null>('pick_and_export_apkg')
  },
}
