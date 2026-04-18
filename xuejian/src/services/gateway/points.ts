import { z } from 'zod'
import { pointsEntrySchema, pointsSummarySchema } from '@/types'
import type { PointsEntry, PointsSummary } from '@/types'
import { invokeWithSchema } from './index'

export interface RecordPointsInput {
  reviewLogId: string
  cardId: string
  rating: string
  cardState: string
}

export async function recordPoints(
  input: RecordPointsInput
): Promise<PointsEntry | null> {
  return invokeWithSchema(
    'record_points',
    pointsEntrySchema.nullable(),
    { data: input }
  )
}

export async function listPointsLedger(
  cardId?: string,
  limit?: number
): Promise<PointsEntry[]> {
  return invokeWithSchema('list_points_ledger', z.array(pointsEntrySchema), {
    cardId: cardId ?? null,
    limit: limit ?? null,
  })
}

export async function getPointsSummary(): Promise<PointsSummary> {
  return invokeWithSchema('get_points_summary', pointsSummarySchema)
}
