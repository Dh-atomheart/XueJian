import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiConfigQueryKeys, useDeleteApiConfigMutation } from '@/queries/apiConfigs'
import { apiConfigGateway } from '@/services/gateway/models'
import type { ApiConfig, WorkflowModelAssignment } from '@/types'

function makeConfig(overrides: Partial<ApiConfig> = {}): ApiConfig {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    provider: 'openai',
    protocol: 'native',
    authMode: 'api_key',
    name: 'Primary',
    baseUrl: null,
    model: 'gpt-4o-mini',
    budgetLimit: null,
    isDefault: true,
    isEnabled: true,
    hasStoredCredential: true,
    hasStoredKey: true,
    keyVerifiedAt: null,
    keyStatus: 'stored',
    displayName: 'Primary',
    createdAt: new Date('2026-04-21T00:00:00.000Z'),
    ...overrides,
  }
}

function makeAssignment(
  overrides: Partial<WorkflowModelAssignment> = {}
): WorkflowModelAssignment {
  return {
    workflowType: 'knowledge_qa',
    apiConfigId: '11111111-1111-4111-8111-111111111111',
    assignedAt: new Date('2026-04-21T00:00:00.000Z'),
    updatedAt: new Date('2026-04-21T00:00:00.000Z'),
    apiConfig: null,
    ...overrides,
  }
}

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('api config query mutations', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('optimistically removes deleted configs and clears assignment caches', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const config = makeConfig()
    const assignment = makeAssignment()
    let resolveDelete: (() => void) | null = null

    vi.spyOn(apiConfigGateway, 'delete').mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve
        })
    )

    queryClient.setQueryData(apiConfigQueryKeys.all, [config])
    queryClient.setQueryData(apiConfigQueryKeys.workflowAssignments, [assignment])
    queryClient.setQueryData(apiConfigQueryKeys.workflowAssignment('knowledge_qa'), assignment)

    const { result } = renderHook(() => useDeleteApiConfigMutation(), {
      wrapper: createWrapper(queryClient),
    })

    result.current.mutate(config.id)

    await waitFor(() => {
      expect(queryClient.getQueryData(apiConfigQueryKeys.all)).toEqual([])
      expect(queryClient.getQueryData(apiConfigQueryKeys.workflowAssignments)).toEqual([])
      expect(queryClient.getQueryData(apiConfigQueryKeys.workflowAssignment('knowledge_qa'))).toBeNull()
    })

    resolveDelete?.()

    await waitFor(() => {
      expect(apiConfigGateway.delete).toHaveBeenCalledWith(config.id)
    })
  })

  it('rolls back optimistic delete when the backend request fails', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const config = makeConfig()
    const assignment = makeAssignment()

    vi.spyOn(apiConfigGateway, 'delete').mockRejectedValue(new Error('delete failed'))

    queryClient.setQueryData(apiConfigQueryKeys.all, [config])
    queryClient.setQueryData(apiConfigQueryKeys.workflowAssignments, [assignment])
    queryClient.setQueryData(apiConfigQueryKeys.workflowAssignment('knowledge_qa'), assignment)

    const { result } = renderHook(() => useDeleteApiConfigMutation(), {
      wrapper: createWrapper(queryClient),
    })

    result.current.mutate(config.id)

    await waitFor(() => {
      expect(queryClient.getQueryData(apiConfigQueryKeys.all)).toEqual([config])
      expect(queryClient.getQueryData(apiConfigQueryKeys.workflowAssignments)).toEqual([
        assignment,
      ])
      expect(queryClient.getQueryData(apiConfigQueryKeys.workflowAssignment('knowledge_qa'))).toEqual(
        assignment
      )
    })
  })
})
