import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getCardAnimation,
  startCardAnimation,
  deleteCardAnimation,
  type StartCardAnimationInput,
} from '@/services/gateway/animation'

export const animationQueryKeys = {
  all: ['animation'] as const,
  byCard: (cardId: string) => [...animationQueryKeys.all, 'card', cardId] as const,
}

/** Fetch the current animation record for a card. */
export function useCardAnimationQuery(
  cardId: string,
  options?: {
    refetchInterval?:
      | number
      | false
      | ((query: { state: { data: unknown } }) => number | false | undefined)
  }
) {
  return useQuery({
    queryKey: animationQueryKeys.byCard(cardId),
    queryFn: () => getCardAnimation(cardId),
    refetchInterval: options?.refetchInterval,
  })
}

/** Start (or restart) animation generation. */
export function useStartCardAnimationMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: StartCardAnimationInput) => startCardAnimation(input),
    onSuccess: (anim) => {
      queryClient.invalidateQueries({
        queryKey: animationQueryKeys.byCard(anim.cardId),
      })
    },
  })
}

/** Delete the animation for a card. */
export function useDeleteCardAnimationMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (cardId: string) => deleteCardAnimation(cardId),
    onSuccess: (_data, cardId) => {
      queryClient.removeQueries({ queryKey: animationQueryKeys.byCard(cardId) })
    },
  })
}
