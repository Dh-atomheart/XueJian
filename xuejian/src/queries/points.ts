import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getPointsSummary,
  listPointsLedger,
  recordPoints,
  type RecordPointsInput,
} from '@/services/gateway/points'

export const pointsQueryKeys = {
  all: ['points'] as const,
  summary: () => [...pointsQueryKeys.all, 'summary'] as const,
  ledger: (cardId?: string) => [...pointsQueryKeys.all, 'ledger', cardId ?? 'all'] as const,
}

export function usePointsSummaryQuery() {
  return useQuery({
    queryKey: pointsQueryKeys.summary(),
    queryFn: () => getPointsSummary(),
  })
}

export function usePointsLedgerQuery(cardId?: string, limit?: number) {
  return useQuery({
    queryKey: pointsQueryKeys.ledger(cardId),
    queryFn: () => listPointsLedger(cardId, limit),
  })
}

export function useRecordPointsMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: RecordPointsInput) => recordPoints(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pointsQueryKeys.all })
    },
  })
}
