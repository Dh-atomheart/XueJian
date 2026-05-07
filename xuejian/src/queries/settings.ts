import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { settingsGateway } from '@/services/gateway/settings'
import type { AppSettings } from '@/types'

export const settingsQueryKeys = {
  all: ['settings'] as const,
}

export function useAppSettingsQuery(options?: { enabled?: boolean; staleTime?: number }) {
  return useQuery({
    queryKey: settingsQueryKeys.all,
    queryFn: () => settingsGateway.get(),
    enabled: options?.enabled ?? true,
    staleTime: options?.staleTime,
  })
}

export function useUpdateAppSettingsMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: Partial<AppSettings>) => settingsGateway.update(data),
    onSuccess: (settings) => {
      queryClient.setQueryData(settingsQueryKeys.all, settings)
    },
  })
}
