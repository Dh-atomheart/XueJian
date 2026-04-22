import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiConfigGateway } from '@/services/gateway/models'
import type { ApiConfig, DiscoveredModel, WorkflowModelAssignment, WorkflowType } from '@/types'

export const apiConfigQueryKeys = {
  all: ['apiConfigs'] as const,
  detail: (id: string) => ['apiConfigs', id] as const,
  workflowAssignments: ['apiConfigs', 'workflowAssignments'] as const,
  workflowAssignment: (workflowType: WorkflowType) =>
    ['apiConfigs', 'workflowAssignments', workflowType] as const,
  providerBudgetUsage: (apiConfigId: string, period?: string | null) =>
    ['apiConfigs', 'budgetUsage', apiConfigId, period ?? 'current'] as const,
  providerModels: (provider: ApiConfig['provider'], baseUrl?: string | null) =>
    ['apiConfigs', 'providerModels', provider, baseUrl ?? null] as const,
}

const DELETE_KEY_REFETCH_STRATEGY: 'invalidate' | 'local-patch' = 'local-patch'
type DeleteApiConfigMutationContext = {
  previousConfigs?: ApiConfig[]
  previousWorkflowAssignments?: WorkflowModelAssignment[]
  previousAssignmentEntries: Array<
    readonly [WorkflowType, WorkflowModelAssignment | null | undefined]
  >
}

export function useApiConfigsQuery() {
  return useQuery({
    queryKey: apiConfigQueryKeys.all,
    staleTime: Infinity,
    queryFn: async () => {
      const started = performance.now()
      console.info('[Perf][BYOK] apiConfigs query start', {
        startedAt: new Date().toISOString(),
      })

      try {
        const result = await apiConfigGateway.list()
        console.info('[Perf][BYOK] apiConfigs query resolved', {
          count: result.length,
          durationMs: Number((performance.now() - started).toFixed(2)),
        })
        return result
      } catch (error) {
        console.info('[Perf][BYOK] apiConfigs query failed', {
          durationMs: Number((performance.now() - started).toFixed(2)),
        })
        throw error
      }
    },
  })
}

export function hasUsableApiConfig(configs: ApiConfig[]): boolean {
  return configs.some((config) => config.isEnabled && config.hasStoredCredential)
}

export function useCreateApiConfigMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (
      data: Omit<
        ApiConfig,
        'id' | 'createdAt' | 'hasStoredCredential' | 'hasStoredKey' | 'keyVerifiedAt' | 'keyStatus'
      >
    ) => apiConfigGateway.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: apiConfigQueryKeys.all })
      queryClient.invalidateQueries({ queryKey: apiConfigQueryKeys.workflowAssignments })
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
      data: Partial<
        Omit<
          ApiConfig,
          | 'id'
          | 'createdAt'
          | 'hasStoredCredential'
          | 'hasStoredKey'
          | 'keyVerifiedAt'
          | 'keyStatus'
        >
      >
    }) => apiConfigGateway.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: apiConfigQueryKeys.all })
      queryClient.invalidateQueries({ queryKey: apiConfigQueryKeys.workflowAssignments })
    },
  })
}

export function useDeleteApiConfigMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiConfigGateway.delete(id),
    onMutate: async (id): Promise<DeleteApiConfigMutationContext> => {
      await queryClient.cancelQueries({ queryKey: apiConfigQueryKeys.all })
      await queryClient.cancelQueries({ queryKey: apiConfigQueryKeys.workflowAssignments })

      const previousConfigs = queryClient.getQueryData<ApiConfig[]>(apiConfigQueryKeys.all)
      const previousWorkflowAssignments = queryClient.getQueryData<WorkflowModelAssignment[]>(
        apiConfigQueryKeys.workflowAssignments
      )

      queryClient.setQueryData<ApiConfig[] | undefined>(apiConfigQueryKeys.all, (current) =>
        current?.filter((config) => config.id !== id) ?? current
      )

      const previousAssignmentEntries: DeleteApiConfigMutationContext['previousAssignmentEntries'] =
        []

      queryClient.setQueryData<WorkflowModelAssignment[] | undefined>(
        apiConfigQueryKeys.workflowAssignments,
        (current) => {
          if (!current) {
            return current
          }

          return current.filter((assignment) => {
            if (assignment.apiConfigId !== id) {
              return true
            }

            previousAssignmentEntries.push([
              assignment.workflowType,
              queryClient.getQueryData<WorkflowModelAssignment | null>(
                apiConfigQueryKeys.workflowAssignment(assignment.workflowType)
              ),
            ])
            queryClient.setQueryData(apiConfigQueryKeys.workflowAssignment(assignment.workflowType), null)
            return false
          })
        }
      )

      return { previousConfigs, previousWorkflowAssignments, previousAssignmentEntries }
    },
    onError: (_error, _id, context) => {
      if (context?.previousConfigs) {
        queryClient.setQueryData(apiConfigQueryKeys.all, context.previousConfigs)
      }
      if (context?.previousWorkflowAssignments) {
        queryClient.setQueryData(
          apiConfigQueryKeys.workflowAssignments,
          context.previousWorkflowAssignments
        )
      }
      for (const [workflowType, assignment] of context?.previousAssignmentEntries ?? []) {
        queryClient.setQueryData(apiConfigQueryKeys.workflowAssignment(workflowType), assignment ?? null)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: apiConfigQueryKeys.all })
      queryClient.invalidateQueries({ queryKey: apiConfigQueryKeys.workflowAssignments })
    },
  })
}

export function useSetDefaultApiConfigMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiConfigGateway.setDefault(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: apiConfigQueryKeys.all })
      queryClient.invalidateQueries({ queryKey: apiConfigQueryKeys.workflowAssignments })
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
      queryClient.invalidateQueries({ queryKey: apiConfigQueryKeys.workflowAssignments })
    },
  })
}

export function useDeleteApiKeyMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (configId: string) => apiConfigGateway.deleteApiKey(configId),
    onSuccess: (_, configId) => {
      if (DELETE_KEY_REFETCH_STRATEGY === 'local-patch') {
        queryClient.setQueryData<ApiConfig[] | undefined>(apiConfigQueryKeys.all, (current) => {
          if (!current) {
            return current
          }

          return current.map((config) =>
            config.id === configId
              ? {
                  ...config,
                  hasStoredKey: false,
                  hasStoredCredential: config.authMode === 'adc',
                  keyStatus: 'none',
                  keyVerifiedAt: null,
                }
              : config
          )
        })
        console.info('[Perf][BYOK] deleteApiKey cache strategy', {
          strategy: DELETE_KEY_REFETCH_STRATEGY,
          configId,
        })
        return
      }

      queryClient.invalidateQueries({ queryKey: apiConfigQueryKeys.all })
      queryClient.invalidateQueries({ queryKey: apiConfigQueryKeys.workflowAssignments })
    },
  })
}

export function useTestApiConnectionMutation() {
  return useMutation({
    mutationFn: (data: {
      configId?: string | null
      provider: ApiConfig['provider']
      authMode: ApiConfig['authMode']
      apiKey: string
      baseUrl?: string | null
      model?: string | null
    }) => apiConfigGateway.testConnection(data),
  })
}

export function useWorkflowAssignmentsQuery() {
  return useQuery({
    queryKey: apiConfigQueryKeys.workflowAssignments,
    queryFn: () => apiConfigGateway.listWorkflowAssignments(),
  })
}

export function useWorkflowAssignmentQuery(workflowType: WorkflowType) {
  return useQuery({
    queryKey: apiConfigQueryKeys.workflowAssignment(workflowType),
    queryFn: () => apiConfigGateway.getWorkflowAssignment(workflowType),
  })
}

export function useSetWorkflowAssignmentMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      workflowType,
      apiConfigId,
    }: {
      workflowType: WorkflowType
      apiConfigId: string
    }) => apiConfigGateway.setWorkflowAssignment(workflowType, apiConfigId),
    onSuccess: (assignment) => {
      queryClient.invalidateQueries({ queryKey: apiConfigQueryKeys.workflowAssignments })
      queryClient.setQueryData(
        apiConfigQueryKeys.workflowAssignment(assignment.workflowType),
        assignment
      )
    },
  })
}

export function useSetAllWorkflowAssignmentsMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (apiConfigId: string) => apiConfigGateway.setAllWorkflowAssignments(apiConfigId),
    onSuccess: (assignments) => {
      queryClient.invalidateQueries({ queryKey: apiConfigQueryKeys.workflowAssignments })
      for (const assignment of assignments) {
        queryClient.setQueryData(
          apiConfigQueryKeys.workflowAssignment(assignment.workflowType),
          assignment
        )
      }
    },
  })
}

export function useDeleteWorkflowAssignmentMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (workflowType: WorkflowType) =>
      apiConfigGateway.deleteWorkflowAssignment(workflowType),
    onSuccess: (_, workflowType) => {
      queryClient.invalidateQueries({ queryKey: apiConfigQueryKeys.workflowAssignments })
      queryClient.setQueryData(apiConfigQueryKeys.workflowAssignment(workflowType), null)
    },
  })
}

export function useFetchProviderModelsMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      provider: ApiConfig['provider']
      apiKey: string
      baseUrl?: string | null
    }) => apiConfigGateway.fetchProviderModels(data),
    onSuccess: (models, variables) => {
      queryClient.setQueryData<DiscoveredModel[]>(
        apiConfigQueryKeys.providerModels(variables.provider, variables.baseUrl),
        models
      )
    },
  })
}

export function useProviderBudgetUsageQuery(apiConfigId: string | null, period?: string | null) {
  return useQuery({
    queryKey: apiConfigId
      ? apiConfigQueryKeys.providerBudgetUsage(apiConfigId, period)
      : ['apiConfigs', 'budgetUsage', 'disabled'],
    queryFn: () => apiConfigGateway.getProviderBudgetUsage(apiConfigId as string, period),
    enabled: Boolean(apiConfigId),
  })
}

export function useRecordWorkflowCostMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      apiConfigId,
      estimatedCostUsd,
    }: {
      apiConfigId: string
      estimatedCostUsd: number
    }) => apiConfigGateway.recordWorkflowCost(apiConfigId, estimatedCostUsd),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: apiConfigQueryKeys.providerBudgetUsage(variables.apiConfigId),
      })
    },
  })
}

export function useResetProviderBudgetUsageMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (apiConfigId: string) => apiConfigGateway.resetProviderBudgetUsage(apiConfigId),
    onSuccess: (_, apiConfigId) => {
      queryClient.invalidateQueries({
        queryKey: apiConfigQueryKeys.providerBudgetUsage(apiConfigId),
      })
    },
  })
}
