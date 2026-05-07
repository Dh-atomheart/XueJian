import { useQuery } from '@tanstack/react-query'
import { dashboardGateway } from '@/services/gateway/dashboard'

export const dashboardQueryKeys = {
  all: ['dashboard'] as const,
  summary: (days = 63, limit = 6) => [...dashboardQueryKeys.all, 'summary', days, limit] as const,
}

export function useDashboardSummaryQuery(days = 63, limit = 6) {
  return useQuery({
    queryKey: dashboardQueryKeys.summary(days, limit),
    queryFn: () => dashboardGateway.getSummary(days, limit),
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  })
}
