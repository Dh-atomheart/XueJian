import { z } from 'zod'
import { PodcastEpisodeSchema } from '@/types'
import type { PodcastEpisode } from '@/types'
import { invokeWithSchema } from './index'

export interface StartPodcastInput {
  documentId?: string | null
  title?: string
  scopeDescription?: string
  style?: string
}

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
