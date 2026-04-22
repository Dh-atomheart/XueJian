import { z } from 'zod'
import { AudioSegmentSchema, PodcastEpisodeSchema } from '@/types'
import type {
  AudioFormat,
  AudioSegment,
  PodcastDurationTier,
  PodcastEpisode,
  PodcastLanguage,
  PodcastStyle,
  TTSProviderId,
} from '@/types'
import { invokeWithSchema } from './index'

export interface StartPodcastInput {
  documentIds: string[]
  prompt?: string
  style: PodcastStyle
  language: PodcastLanguage
  durationTier: PodcastDurationTier
  ttsProvider: TTSProviderId
  audioFormat?: AudioFormat
}

export type ReviewPodcastAction = 'accept' | 'edit' | 'reject'

export async function startPodcastWorkflow(input: StartPodcastInput): Promise<PodcastEpisode> {
  return invokeWithSchema('start_podcast_workflow', PodcastEpisodeSchema, { data: input })
}

export async function getPodcastEpisode(episodeId: string): Promise<PodcastEpisode | null> {
  return invokeWithSchema('get_podcast_episode', PodcastEpisodeSchema.nullable(), { episodeId })
}

export async function listPodcastEpisodes(): Promise<PodcastEpisode[]> {
  return invokeWithSchema('list_podcast_episodes', z.array(PodcastEpisodeSchema), {})
}

export async function cancelPodcastEpisode(episodeId: string): Promise<void> {
  return invokeWithSchema('cancel_podcast_episode', z.void(), { episodeId })
}

export async function deletePodcastEpisode(episodeId: string): Promise<void> {
  return invokeWithSchema('delete_podcast_episode', z.void(), { episodeId })
}

export async function reviewPodcastScript(
  episodeId: string,
  action: ReviewPodcastAction,
  editedScriptJson?: string
): Promise<PodcastEpisode> {
  return invokeWithSchema('review_podcast_script', PodcastEpisodeSchema, {
    episodeId,
    action,
    editedScriptJson,
  })
}

export async function retryPodcastEpisode(episodeId: string): Promise<PodcastEpisode> {
  return invokeWithSchema('retry_podcast_episode', PodcastEpisodeSchema, { episodeId })
}

export async function getPodcastAudioSegments(episodeId: string): Promise<AudioSegment[]> {
  return invokeWithSchema('get_podcast_audio_segments', z.array(AudioSegmentSchema), { episodeId })
}
