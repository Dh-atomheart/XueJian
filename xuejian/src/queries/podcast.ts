import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  startPodcastWorkflow,
  getPodcastEpisode,
  listPodcastEpisodes,
  cancelPodcastEpisode,
  deletePodcastEpisode,
  reviewPodcastScript,
  retryPodcastEpisode,
  getPodcastAudioSegments,
  type ReviewPodcastAction,
  type StartPodcastInput,
} from '@/services/gateway/podcast'

export const podcastQueryKeys = {
  all: ['podcast'] as const,
  list: () => [...podcastQueryKeys.all, 'list'] as const,
  byId: (id: string) => [...podcastQueryKeys.all, 'episode', id] as const,
}

/** Fetch all podcast episodes. */
export function usePodcastEpisodesQuery(options?: { refetchInterval?: number | false }) {
  return useQuery({
    queryKey: podcastQueryKeys.list(),
    queryFn: () => listPodcastEpisodes(),
    refetchInterval: options?.refetchInterval,
  })
}

/** Fetch a single podcast episode by id. */
export function usePodcastEpisodeQuery(
  episodeId: string | null,
  options?: {
    enabled?: boolean
    refetchInterval?:
      | number
      | false
      | ((query: { state: { data: unknown } }) => number | false | undefined)
  }
) {
  return useQuery({
    queryKey: podcastQueryKeys.byId(episodeId ?? 'unknown'),
    queryFn: () => getPodcastEpisode(episodeId!),
    enabled: options?.enabled ?? Boolean(episodeId),
    refetchInterval: options?.refetchInterval,
  })
}

/** Fetch audio segments for a podcast episode. */
export function usePodcastAudioSegmentsQuery(
  episodeId: string | null,
  options?: {
    enabled?: boolean
    refetchInterval?: number | false
  }
) {
  return useQuery({
    queryKey: [...podcastQueryKeys.byId(episodeId ?? 'unknown'), 'audio-segments'] as const,
    queryFn: () => getPodcastAudioSegments(episodeId!),
    enabled: options?.enabled ?? Boolean(episodeId),
    refetchInterval: options?.refetchInterval,
  })
}

/** Start a new podcast generation workflow. */
export function useStartPodcastMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: StartPodcastInput) => startPodcastWorkflow(input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: podcastQueryKeys.list(),
      })
    },
  })
}

/** Cancel a running podcast episode. */
export function useCancelPodcastMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (episodeId: string) => cancelPodcastEpisode(episodeId),
    onSuccess: (_data, episodeId) => {
      queryClient.invalidateQueries({ queryKey: podcastQueryKeys.byId(episodeId) })
      queryClient.invalidateQueries({ queryKey: podcastQueryKeys.list() })
    },
  })
}

/** Delete a podcast episode. */
export function useDeletePodcastMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (episodeId: string) => deletePodcastEpisode(episodeId),
    onSuccess: (_data, episodeId) => {
      queryClient.removeQueries({ queryKey: podcastQueryKeys.byId(episodeId) })
      queryClient.invalidateQueries({ queryKey: podcastQueryKeys.list() })
    },
  })
}

/** Review and optionally edit a podcast script. */
export function useReviewPodcastMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: {
      episodeId: string
      action: ReviewPodcastAction
      editedScriptJson?: string
    }) => reviewPodcastScript(input.episodeId, input.action, input.editedScriptJson),
    onSuccess: (episode) => {
      queryClient.setQueryData(podcastQueryKeys.byId(episode.id), episode)
      queryClient.invalidateQueries({ queryKey: podcastQueryKeys.list() })
      queryClient.invalidateQueries({
        queryKey: [...podcastQueryKeys.byId(episode.id), 'audio-segments'],
      })
    },
  })
}

/** Retry a failed or cancelled podcast episode. */
export function useRetryPodcastMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (episodeId: string) => retryPodcastEpisode(episodeId),
    onSuccess: (episode) => {
      queryClient.setQueryData(podcastQueryKeys.byId(episode.id), episode)
      queryClient.invalidateQueries({ queryKey: podcastQueryKeys.list() })
    },
  })
}
