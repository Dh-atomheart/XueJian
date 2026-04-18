import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiConfigGateway } from '@/services/gateway/models'
import type { ApiConfig } from '@/types'

export const apiConfigQueryKeys = {
  all: ['apiConfigs'] as const,
  detail: (id: string) => ['apiConfigs', id] as const,
}

export function useApiConfigsQuery() {
  return useQuery({
    queryKey: apiConfigQueryKeys.all,
    queryFn: () => apiConfigGateway.list(),
  })
}

export function hasUsableApiConfig(configs: ApiConfig[]): boolean {
  return configs.some((config) => config.isEnabled && config.hasStoredKey)
}

export function useCreateApiConfigMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Omit<ApiConfig, 'id' | 'createdAt' | 'hasStoredKey'>) =>
      apiConfigGateway.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: apiConfigQueryKeys.all })
    },
  })
}

export function useUpdateApiConfigMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string
      data: Partial<Omit<ApiConfig, 'id' | 'createdAt' | 'hasStoredKey'>>
    }) => apiConfigGateway.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: apiConfigQueryKeys.all })
    },
  })
}

export function useDeleteApiConfigMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiConfigGateway.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: apiConfigQueryKeys.all })
    },
  })
}

export function useSetDefaultApiConfigMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiConfigGateway.setDefault(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: apiConfigQueryKeys.all })
    },
  })
}

export function useStoreApiKeyMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ configId, apiKey }: { configId: string; apiKey: string }) =>
      apiConfigGateway.storeApiKey(configId, apiKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: apiConfigQueryKeys.all })
    },
  })
}

export function useTestApiConnectionMutation() {
  return useMutation({
    mutationFn: (data: {
      provider: ApiConfig['provider']
      apiKey: string
      baseUrl?: string | null
    }) => apiConfigGateway.testConnection(data),
  })
}
