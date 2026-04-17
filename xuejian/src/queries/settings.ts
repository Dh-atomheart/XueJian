import { useQuery } from '@tanstack/react-query'
import { settingsGateway } from '@/services/gateway/settings'

export const settingsQueryKeys = {
  all: ['settings'] as const,
}

export function useAppSettingsQuery() {
  return useQuery({
    queryKey: settingsQueryKeys.all,
    queryFn: () => settingsGateway.get(),
  })
}
