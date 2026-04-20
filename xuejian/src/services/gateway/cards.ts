import { z } from 'zod'
import {
  cardSchema,
  cardCandidateSchema,
  finalizeCardGenerationResultSchema,
  highlightSchema,
  reviewLogSchema,
  workflowRunSchema,
} from '@/types'
import type {
  Card,
  CardCandidate,
  FinalizeCardGenerationResult,
  Highlight,
  ReviewLog,
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

export interface HighlightFilters {
  documentId?: string | null
  cardId?: string | null
  pageNumber?: number | null
  limit?: number
}

export interface CreateHighlightInput {
  cardId?: string | null
  documentId: string
  anchorId?: string | null
  pageNumber: number
  rectangles: Highlight['rectangles']
  textContent: string
  color?: string | null
}

export interface UpdateHighlightInput {
  cardId?: string | null
  anchorId?: string | null
  rectangles?: Highlight['rectangles']
  textContent?: string
  color?: string
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
    data: Partial<Pick<CardCandidate, 'front' | 'back' | 'tags' | 'confidence' | 'status'>>
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
    return invoke<{ newCards: number; reviewCards: number; correctRate: number | null }>(
      'get_daily_stats'
    )
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
}
