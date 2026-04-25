import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiConfigGateway, embeddingProfileGateway } from '@/services/gateway/models'
import type {
  ApiConfig,
  DiscoveredModel,
  EmbeddingProfile,
  ModelProfile,
  WorkflowModelAssignment,
  WorkflowType,
} from '@/types'

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
  modelProfiles: ['apiConfigs', 'modelProfiles'] as const,
  modelProfilesByApiConfig: (apiConfigId: string) =>
    ['apiConfigs', 'modelProfiles', apiConfigId] as const,
  embeddingProfiles: ['apiConfigs', 'embeddingProfiles'] as const,
  activeEmbeddingProfile: ['apiConfigs', 'embeddingProfiles', 'active'] as const,
}

const DELETE_KEY_REFETCH_STRATEGY: 'invalidate' | 'local-patch' = 'local-patch'
type DeleteApiConfigMutationContext = {
  previousConfigs?: ApiConfig[]
  previousModelProfiles?: ModelProfile[]
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
    onSuccess: async (created) => {
      queryClient.setQueryData<ApiConfig[]>(apiConfigQueryKeys.all, (current) => {
        if (!current) {
          return [created]
        }
        const next = current.filter((config) => config.id !== created.id)
        return [...next, created]
      })
      queryClient.setQueryData(apiConfigQueryKeys.detail(created.id), created)
      await Promise.all([
        queryClient.fetchQuery({
          queryKey: apiConfigQueryKeys.modelProfiles,
          queryFn: () => apiConfigGateway.listModelProfiles(),
        }),
        queryClient.fetchQuery({
          queryKey: apiConfigQueryKeys.workflowAssignments,
          queryFn: () => apiConfigGateway.listWorkflowAssignments(),
        }),
      ])
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
      queryClient.invalidateQueries({ queryKey: apiConfigQueryKeys.modelProfiles })
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
      await queryClient.cancelQueries({ queryKey: apiConfigQueryKeys.modelProfiles })
      await queryClient.cancelQueries({ queryKey: apiConfigQueryKeys.workflowAssignments })

      const previousConfigs = queryClient.getQueryData<ApiConfig[]>(apiConfigQueryKeys.all)
      const previousModelProfiles = queryClient.getQueryData<ModelProfile[]>(
        apiConfigQueryKeys.modelProfiles
      )
      const previousWorkflowAssignments = queryClient.getQueryData<WorkflowModelAssignment[]>(
        apiConfigQueryKeys.workflowAssignments
      )

      queryClient.setQueryData<ApiConfig[] | undefined>(apiConfigQueryKeys.all, (current) =>
        current?.filter((config) => config.id !== id) ?? current
      )

      queryClient.setQueryData<ModelProfile[] | undefined>(apiConfigQueryKeys.modelProfiles, (current) =>
        current?.filter((profile) => profile.apiConfigId !== id) ?? current
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
            if (assignment.apiConfig?.id !== id && assignment.modelProfile?.apiConfigId !== id) {
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

      return {
        previousConfigs,
        previousModelProfiles,
        previousWorkflowAssignments,
        previousAssignmentEntries,
      }
    },
    onError: (_error, _id, context) => {
      if (context?.previousConfigs) {
        queryClient.setQueryData(apiConfigQueryKeys.all, context.previousConfigs)
      }
      if (context?.previousModelProfiles) {
        queryClient.setQueryData(apiConfigQueryKeys.modelProfiles, context.previousModelProfiles)
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
      queryClient.invalidateQueries({ queryKey: apiConfigQueryKeys.modelProfiles })
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
      queryClient.invalidateQueries({ queryKey: apiConfigQueryKeys.modelProfiles })
      queryClient.invalidateQueries({ queryKey: apiConfigQueryKeys.workflowAssignments })
    },
  })
}

export function useStoreApiKeyMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ configId, apiKey }: { configId: string; apiKey: string }) =>
      apiConfigGateway.storeApiKey(configId, apiKey),
    onSuccess: (_result, { configId }) => {
      queryClient.setQueryData<ApiConfig[] | undefined>(apiConfigQueryKeys.all, (current) =>
        current?.map((config) =>
          config.id === configId
            ? {
                ...config,
                hasStoredKey: true,
                hasStoredCredential: true,
                keyStatus: 'stored',
              }
            : config
        )
      )
      queryClient.invalidateQueries({ queryKey: apiConfigQueryKeys.all })
      queryClient.invalidateQueries({ queryKey: apiConfigQueryKeys.modelProfiles })
      queryClient.invalidateQueries({ queryKey: apiConfigQueryKeys.workflowAssignments })
    },
  })
}

export function useGetApiKeyMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (configId: string) => apiConfigGateway.getApiKey(configId),
    onError: () => {
      queryClient.invalidateQueries({ queryKey: apiConfigQueryKeys.all })
      queryClient.invalidateQueries({ queryKey: apiConfigQueryKeys.modelProfiles })
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
      apiKey?: string | null
      baseUrl?: string | null
      model?: string | null
    }) => apiConfigGateway.testConnection(data),
  })
}

export function useModelProfilesQuery() {
  return useQuery({
    queryKey: apiConfigQueryKeys.modelProfiles,
    queryFn: () => apiConfigGateway.listModelProfiles(),
  })
}

export function useModelProfilesByApiConfigQuery(apiConfigId: string | null) {
  return useQuery({
    queryKey: apiConfigId
      ? apiConfigQueryKeys.modelProfilesByApiConfig(apiConfigId)
      : ['apiConfigs', 'modelProfiles', 'disabled'],
    queryFn: () => apiConfigGateway.listModelProfilesByApiConfig(apiConfigId as string),
    enabled: Boolean(apiConfigId),
  })
}

export function useEmbeddingProfilesQuery() {
  return useQuery({
    queryKey: apiConfigQueryKeys.embeddingProfiles,
    queryFn: () => embeddingProfileGateway.list(),
  })
}

export function useActiveEmbeddingProfileQuery() {
  return useQuery({
    queryKey: apiConfigQueryKeys.activeEmbeddingProfile,
    queryFn: () => embeddingProfileGateway.getActive(),
  })
}

export function useCreateEmbeddingProfileMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      provider: EmbeddingProfile['provider']
      model: string
      dimensions: number
      distanceMetric?: 'cosine'
      isActive: boolean
      revision: number
    }) => embeddingProfileGateway.create(data),
    onSuccess: (profile) => {
      queryClient.setQueryData<EmbeddingProfile[] | undefined>(
        apiConfigQueryKeys.embeddingProfiles,
        (current) => {
          const next = current?.filter((item) => item.id !== profile.id) ?? []
          const normalized = profile.isActive
            ? next.map((item) => ({ ...item, isActive: false }))
            : next
          return [profile, ...normalized]
        }
      )
      queryClient.setQueryData(
        apiConfigQueryKeys.activeEmbeddingProfile,
        profile.isActive ? profile : null
      )
    },
  })
}

export function useSetActiveEmbeddingProfileMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => embeddingProfileGateway.setActive(id),
    onSuccess: (profile) => {
      queryClient.setQueryData<EmbeddingProfile[] | undefined>(
        apiConfigQueryKeys.embeddingProfiles,
        (current) =>
          current?.map((item) => ({
            ...item,
            isActive: item.id === profile.id,
          })) ?? current
      )
      queryClient.setQueryData(apiConfigQueryKeys.activeEmbeddingProfile, profile)
    },
  })
}

export function useCreateModelProfileMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Omit<ModelProfile, 'id' | 'createdAt' | 'updatedAt' | 'apiConfig'>) =>
      apiConfigGateway.createModelProfile(data),
    onSuccess: (profile) => {
      queryClient.setQueryData<ModelProfile[] | undefined>(
        apiConfigQueryKeys.modelProfiles,
        (current) => {
          const next = current?.filter((item) => item.id !== profile.id) ?? []
          return [profile, ...next]
        }
      )
      queryClient.setQueryData<ModelProfile[] | undefined>(
        apiConfigQueryKeys.modelProfilesByApiConfig(profile.apiConfigId),
        (current) => {
          const next = current?.filter((item) => item.id !== profile.id) ?? []
          return [profile, ...next]
        }
      )
      queryClient.invalidateQueries({ queryKey: apiConfigQueryKeys.workflowAssignments })
    },
  })
}

export function useUpdateModelProfileMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ModelProfile> }) =>
      apiConfigGateway.updateModelProfile(id, data),
    onSuccess: (profile) => {
      queryClient.invalidateQueries({ queryKey: apiConfigQueryKeys.modelProfiles })
      queryClient.invalidateQueries({
        queryKey: apiConfigQueryKeys.modelProfilesByApiConfig(profile.apiConfigId),
      })
      queryClient.invalidateQueries({ queryKey: apiConfigQueryKeys.workflowAssignments })
    },
  })
}

export function useDeleteModelProfileMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiConfigGateway.deleteModelProfile(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: apiConfigQueryKeys.modelProfiles })
      queryClient.invalidateQueries({ queryKey: apiConfigQueryKeys.workflowAssignments })
    },
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
      modelProfileId,
    }: {
      workflowType: WorkflowType
      modelProfileId: string
    }) => apiConfigGateway.setWorkflowAssignment(workflowType, modelProfileId),
    onMutate: async ({ workflowType, modelProfileId }) => {
      await queryClient.cancelQueries({ queryKey: apiConfigQueryKeys.workflowAssignments })
      await queryClient.cancelQueries({ queryKey: apiConfigQueryKeys.workflowAssignment(workflowType) })

      const previousAssignments = queryClient.getQueryData<WorkflowModelAssignment[]>(
        apiConfigQueryKeys.workflowAssignments
      )
      const previousAssignment = queryClient.getQueryData<WorkflowModelAssignment | null>(
        apiConfigQueryKeys.workflowAssignment(workflowType)
      )
      const modelProfile =
        queryClient
          .getQueryData<ModelProfile[]>(apiConfigQueryKeys.modelProfiles)
          ?.find((profile) => profile.id === modelProfileId) ?? null
      const apiConfig =
        modelProfile?.apiConfig ??
        queryClient
          .getQueryData<ApiConfig[]>(apiConfigQueryKeys.all)
          ?.find((config) => config.id === modelProfile?.apiConfigId) ??
        null
      const now = new Date()
      const optimisticAssignment: WorkflowModelAssignment = {
        workflowType,
        modelProfileId,
        assignedAt: previousAssignment?.assignedAt ?? now,
        updatedAt: now,
        modelProfile,
        apiConfig,
      }

      queryClient.setQueryData<WorkflowModelAssignment[] | undefined>(
        apiConfigQueryKeys.workflowAssignments,
        (current) => {
          const assignments = current ?? []
          const found = assignments.some((assignment) => assignment.workflowType === workflowType)
          if (!found) {
            return [...assignments, optimisticAssignment]
          }
          return assignments.map((assignment) =>
            assignment.workflowType === workflowType ? optimisticAssignment : assignment
          )
        }
      )
      queryClient.setQueryData(apiConfigQueryKeys.workflowAssignment(workflowType), optimisticAssignment)

      return { previousAssignments, previousAssignment, workflowType }
    },
    onError: (_error, _variables, context) => {
      if (!context) return
      queryClient.setQueryData(apiConfigQueryKeys.workflowAssignments, context.previousAssignments)
      queryClient.setQueryData(
        apiConfigQueryKeys.workflowAssignment(context.workflowType),
        context.previousAssignment ?? null
      )
      queryClient.invalidateQueries({ queryKey: apiConfigQueryKeys.all })
      queryClient.invalidateQueries({ queryKey: apiConfigQueryKeys.workflowAssignments })
    },
    onSuccess: (assignment) => {
      queryClient.setQueryData<WorkflowModelAssignment[] | undefined>(
        apiConfigQueryKeys.workflowAssignments,
        (current) => {
          const assignments = current ?? []
          const found = assignments.some((item) => item.workflowType === assignment.workflowType)
          if (!found) {
            return [...assignments, assignment]
          }
          return assignments.map((item) =>
            item.workflowType === assignment.workflowType ? assignment : item
          )
        }
      )
      queryClient.setQueryData(
        apiConfigQueryKeys.workflowAssignment(assignment.workflowType),
        assignment
      )
      if (assignment.workflowType === 'document_embedding') {
        queryClient.invalidateQueries({ queryKey: apiConfigQueryKeys.activeEmbeddingProfile })
        queryClient.invalidateQueries({ queryKey: apiConfigQueryKeys.embeddingProfiles })
      }
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: apiConfigQueryKeys.workflowAssignments })
      if (variables.workflowType === 'document_embedding') {
        queryClient.invalidateQueries({ queryKey: apiConfigQueryKeys.activeEmbeddingProfile })
        queryClient.invalidateQueries({ queryKey: apiConfigQueryKeys.embeddingProfiles })
      }
    },
  })
}

export function useSetAllWorkflowAssignmentsMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (modelProfileId: string) =>
      apiConfigGateway.setAllWorkflowAssignments(modelProfileId),
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
