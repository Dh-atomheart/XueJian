import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { settingsGateway } from '@/services/gateway/settings'
import type { AppSettings } from '@/types'

export const settingsQueryKeys = {
  all: ['settings'] as const,
}

export function useAppSettingsQuery() {
  return useQuery({
    queryKey: settingsQueryKeys.all,
    queryFn: () => settingsGateway.get(),
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
