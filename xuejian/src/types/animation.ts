import { z } from 'zod'

// ───── Domain Types ─────

export type AnimType = 'flashcard_reveal' | 'keyword_emphasis'
export type AnimStatus = 'queued' | 'generating' | 'ready' | 'failed'
export type AnimPalette = 'default' | 'warm' | 'cool'

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
  scriptJson: string
  status: AnimStatus
  errorMessage: string | null
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
  scriptJson: z.string(),
  status: z.enum(['queued', 'generating', 'ready', 'failed']),
  errorMessage: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
