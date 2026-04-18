import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  startPodcastWorkflow,
  getPodcastEpisode,
  listPodcastEpisodes,
  cancelPodcastEpisode,
  deletePodcastEpisode,
  type StartPodcastInput,
} from '@/services/gateway/podcast'

export const podcastQueryKeys = {
  all: ['podcast'] as const,
  list: () => [...podcastQueryKeys.all, 'list'] as const,
  byId: (id: string) => [...podcastQueryKeys.all, 'episode', id] as const,
}

/** Fetch all podcast episodes. */
export function usePodcastEpisodesQuery() {
  return useQuery({
    queryKey: podcastQueryKeys.list(),
    queryFn: () => listPodcastEpisodes(),
  })
}

/** Fetch a single podcast episode by id. */
export function usePodcastEpisodeQuery(
  episodeId: string,
  options?: { refetchInterval?: number | false }
) {
  return useQuery({
    queryKey: podcastQueryKeys.byId(episodeId),
    queryFn: () => getPodcastEpisode(episodeId),
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
