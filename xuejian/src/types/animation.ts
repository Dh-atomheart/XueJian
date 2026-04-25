import { z } from 'zod'

// ───── Domain Types ─────

export type AnimType = 'flashcard_reveal' | 'keyword_emphasis'
export type AnimStatus = 'queued' | 'generating' | 'ready' | 'failed'
export type AnimPalette = 'default' | 'warm' | 'cool'
export type AnimMode = 'quick_preview' | 'video_render'

export interface AnimationStep {
  id: string
  type: 'text' | 'reveal' | 'emphasis'
  content: string
  emphasis?: string[]
  delay_ms?: number
}

export interface AnimationScript {
  type: AnimType
  title: string
  palette: AnimPalette
  steps: AnimationStep[]
}

export interface CardAnimation {
  id: string
  cardId: string
  runId: string | null
  animType: AnimType
  mode: AnimMode
  scriptJson: string
  videoPath: string | null
  posterPath: string | null
  renderLogPath: string | null
  status: AnimStatus
  errorCode: string | null
  errorMessage: string | null
  retryable: boolean
  createdAt: string
  updatedAt: string
}

// ───── Zod Schemas for IPC validation ─────

export const AnimationStepSchema = z.object({
  id: z.string(),
  type: z.enum(['text', 'reveal', 'emphasis']),
  content: z.string(),
  emphasis: z.array(z.string()).optional(),
  delay_ms: z.number().optional(),
})

export const AnimationScriptSchema = z.object({
  type: z.enum(['flashcard_reveal', 'keyword_emphasis']),
  title: z.string(),
  palette: z.enum(['default', 'warm', 'cool']),
  steps: z.array(AnimationStepSchema),
})

export const CardAnimationSchema = z.object({
  id: z.string(),
  cardId: z.string(),
  runId: z.string().nullable(),
  animType: z.enum(['flashcard_reveal', 'keyword_emphasis']),
  mode: z.enum(['quick_preview', 'video_render']).catch('quick_preview').default('quick_preview'),
  scriptJson: z.string(),
  videoPath: z.string().nullable().catch(null),
  posterPath: z.string().nullable().catch(null),
  renderLogPath: z.string().nullable().catch(null),
  status: z.enum(['queued', 'generating', 'ready', 'failed']),
  errorCode: z.string().nullable().catch(null),
  errorMessage: z.string().nullable(),
  retryable: z.boolean().catch(true).default(true),
  createdAt: z.string(),
  updatedAt: z.string(),
}) as unknown as z.ZodType<CardAnimation>
