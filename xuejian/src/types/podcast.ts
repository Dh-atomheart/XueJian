import { z } from 'zod'

// ───── Domain Types ─────

export type PodcastStatus = 'queued' | 'generating' | 'ready' | 'failed' | 'cancelled'

export interface DialogueSegment {
  id: string
  speaker: string
  text: string
  durationMs: number
}

export interface PodcastScript {
  title: string
  description: string
  speakers: string[]
  outline: string[]
  segments: DialogueSegment[]
}

export interface PodcastEpisode {
  id: string
  documentId: string | null
  runId: string | null
  title: string
  scopeDescription: string
  scriptJson: string
  audioPath: string | null
  durationMs: number
  status: PodcastStatus
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}

// ───── Zod Schemas for IPC validation ─────

export const DialogueSegmentSchema = z.object({
  id: z.string(),
  speaker: z.string(),
  text: z.string(),
  durationMs: z.number(),
})

export const PodcastScriptSchema = z.object({
  title: z.string(),
  description: z.string(),
  speakers: z.array(z.string()),
  outline: z.array(z.string()),
  segments: z.array(DialogueSegmentSchema),
})

export const PodcastEpisodeSchema = z.object({
  id: z.string(),
  documentId: z.string().nullable(),
  runId: z.string().nullable(),
  title: z.string(),
  scopeDescription: z.string(),
  scriptJson: z.string(),
  audioPath: z.string().nullable(),
  durationMs: z.number(),
  status: z.enum(['queued', 'generating', 'ready', 'failed', 'cancelled']),
  errorMessage: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
