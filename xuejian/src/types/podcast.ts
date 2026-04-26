import { z } from 'zod'

// ───── Enums ─────

export type PodcastStyle = 'deep_dive' | 'lecture' | 'interview' | 'casual' | 'exam_prep'
export type PodcastDurationTier = 'short' | 'medium' | 'long' | 'ultra_long'
export type PodcastLanguage = 'zh-CN' | 'en-US' | 'ja-JP' | 'ko-KR'
export type TTSProviderId = 'auto' | 'openai' | 'edge_tts' | 'google'
export type PodcastStatus =
  | 'queued'
  | 'retrieving'
  | 'generating_outline'
  | 'generating_script'
  | 'evaluating'
  | 'awaiting_review'
  | 'generating_audio'
  | 'stitching'
  | 'ready'
  | 'failed'
  | 'cancelled'
export type AudioFormat = 'mp3' | 'wav'

// ───── Domain Types ─────

export interface PresetRole {
  speakerId: string
  name: string
  personality: string
  defaultVoiceHint: string
}

export interface DialogueSegment {
  id: string
  speaker: string
  text: string
  durationMs: number
}

export interface PodcastOutlineSegment {
  segmentIndex: number
  topic: string
  keyPoints: string[]
  targetDurationMs: number
  speakerAssignments: Array<{
    speakerId: string
    role: string
  }>
}

export interface PodcastOutline {
  title: string
  description: string
  totalTargetDurationMs: number
  segments: PodcastOutlineSegment[]
}

export interface PodcastScript {
  title: string
  description: string
  speakers: string[]
  outline: string[]
  segments: DialogueSegment[]
}

export interface ScriptEvaluation {
  coherence: number
  accuracy: number
  styleConsistency: number
  naturalness: number
  overallScore: number
  issues: string[]
  suggestions: string[]
  revised: boolean
}

export interface AudioSegment {
  id: string
  episodeId: string
  dialogueSegmentId: string
  speaker: string
  filePath: string
  durationMs: number
  ttsProvider: TTSProviderId
  voiceId: string
}

export interface PodcastEpisode {
  id: string
  documentIds: string[]
  runId: string | null
  title: string
  scopeDescription: string
  style: PodcastStyle
  language: PodcastLanguage
  durationTier: PodcastDurationTier
  ttsProvider: TTSProviderId
  audioFormat: AudioFormat
  scriptJson: string
  outlineJson: string | null
  evaluationJson: string | null
  audioPath: string | null
  audioExists?: boolean
  audioFileSize?: number | null
  audioMimeHint?: string | null
  durationMs: number
  status: PodcastStatus
  stageKey:
    | 'retrieval'
    | 'outline'
    | 'script'
    | 'evaluation'
    | 'awaiting_review'
    | 'audio'
    | 'ready'
    | 'failed'
    | 'cancelled'
  errorMessage: string | null
  errorCode: string | null
  errorStage: string | null
  retryable: boolean
  currentStage: number
  completedSegments: number
  totalSegments: number
  createdAt: string
  updatedAt: string
}

// ───── Zod Schemas for IPC validation ─────

export const PodcastStyleSchema = z.enum([
  'deep_dive',
  'lecture',
  'interview',
  'casual',
  'exam_prep',
])

export const PodcastDurationTierSchema = z.enum(['short', 'medium', 'long', 'ultra_long'])
export const PodcastLanguageSchema = z.enum(['zh-CN', 'en-US', 'ja-JP', 'ko-KR'])
export const TTSProviderIdSchema = z.enum(['auto', 'openai', 'edge_tts', 'google'])

export const PodcastStatusSchema = z.enum([
  'queued',
  'retrieving',
  'generating_outline',
  'generating_script',
  'evaluating',
  'awaiting_review',
  'generating_audio',
  'stitching',
  'ready',
  'failed',
  'cancelled',
])

export const AudioFormatSchema = z.enum(['mp3', 'wav'])

export const DialogueSegmentSchema = z.object({
  id: z.string(),
  speaker: z.string(),
  text: z.string(),
  durationMs: z.number(),
})

export const PodcastOutlineSegmentSchema = z.object({
  segmentIndex: z.number(),
  topic: z.string(),
  keyPoints: z.array(z.string()),
  targetDurationMs: z.number(),
  speakerAssignments: z.array(
    z.object({
      speakerId: z.string(),
      role: z.string(),
    })
  ),
})

export const PodcastOutlineSchema = z.object({
  title: z.string(),
  description: z.string(),
  totalTargetDurationMs: z.number(),
  segments: z.array(PodcastOutlineSegmentSchema),
})

export const PodcastScriptSchema = z.object({
  title: z.string(),
  description: z.string(),
  speakers: z.array(z.string()),
  outline: z.array(z.string()),
  segments: z.array(DialogueSegmentSchema),
})

export const ScriptEvaluationSchema = z.object({
  coherence: z.number().min(1).max(10),
  accuracy: z.number().min(1).max(10),
  styleConsistency: z.number().min(1).max(10),
  naturalness: z.number().min(1).max(10),
  overallScore: z.number().min(1).max(10),
  issues: z.array(z.string()),
  suggestions: z.array(z.string()),
  revised: z.boolean(),
})

export const AudioSegmentSchema = z.object({
  id: z.string(),
  episodeId: z.string(),
  dialogueSegmentId: z.string(),
  speaker: z.string(),
  filePath: z.string(),
  durationMs: z.number(),
  ttsProvider: TTSProviderIdSchema,
  voiceId: z.string(),
})

export const PodcastEpisodeSchema = z.object({
  id: z.string(),
  documentIds: z.array(z.string()),
  runId: z.string().nullable(),
  title: z.string(),
  scopeDescription: z.string(),
  style: PodcastStyleSchema,
  language: PodcastLanguageSchema,
  durationTier: PodcastDurationTierSchema,
  ttsProvider: TTSProviderIdSchema,
  audioFormat: AudioFormatSchema,
  scriptJson: z.string(),
  outlineJson: z.string().nullable(),
  evaluationJson: z.string().nullable(),
  audioPath: z.string().nullable(),
  audioExists: z.boolean().catch(false).default(false),
  audioFileSize: z.number().nullable().catch(null).default(null),
  audioMimeHint: z.string().nullable().catch(null).default(null),
  durationMs: z.number(),
  status: PodcastStatusSchema,
  stageKey: z
    .enum([
      'retrieval',
      'outline',
      'script',
      'evaluation',
      'awaiting_review',
      'audio',
      'ready',
      'failed',
      'cancelled',
    ])
    .catch('retrieval')
    .default('retrieval'),
  errorMessage: z.string().nullable(),
  errorCode: z.string().nullable().catch(null),
  errorStage: z.string().nullable().catch(null),
  retryable: z.boolean().catch(true).default(true),
  currentStage: z.number().int().min(0).max(6),
  completedSegments: z.number().int().nonnegative(),
  totalSegments: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
}) as unknown as z.ZodType<PodcastEpisode>
