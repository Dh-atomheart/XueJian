import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  apiConfigQueryKeys,
  useCreateEmbeddingProfileMutation,
  useCreateApiConfigMutation,
  useCreateModelProfileMutation,
  useDeleteApiConfigMutation,
  useSetActiveEmbeddingProfileMutation,
  useSetWorkflowAssignmentMutation,
} from '@/queries/apiConfigs'
import { apiConfigGateway, embeddingProfileGateway } from '@/services/gateway/models'
import type { ApiConfig, EmbeddingProfile, ModelProfile, WorkflowModelAssignment } from '@/types'

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
    modelProfileId: 'model-11111111-1111-4111-8111-111111111111',
    assignedAt: new Date('2026-04-21T00:00:00.000Z'),
    updatedAt: new Date('2026-04-21T00:00:00.000Z'),
    modelProfile: null,
    apiConfig: null,
    ...overrides,
  }
}

function makeModelProfile(overrides: Partial<ModelProfile> = {}): ModelProfile {
  return {
    id: 'model-11111111-1111-4111-8111-111111111111',
    apiConfigId: '11111111-1111-4111-8111-111111111111',
    modelId: 'gpt-4o-mini',
    displayName: 'Primary Model',
    capabilitiesJson: '[]',
    isEnabled: true,
    isDefaultForConnection: true,
    createdAt: new Date('2026-04-21T00:00:00.000Z'),
    updatedAt: new Date('2026-04-21T00:00:00.000Z'),
    apiConfig: null,
    ...overrides,
  }
}

function makeEmbeddingProfile(overrides: Partial<EmbeddingProfile> = {}): EmbeddingProfile {
  return {
    id: 'embedding-11111111-1111-4111-8111-111111111111',
    provider: 'openai',
    model: 'text-embedding-3-large',
    dimensions: 3072,
    distanceMetric: 'cosine',
    isActive: true,
    revision: 1,
    createdAt: new Date('2026-04-21T00:00:00.000Z'),
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
    const profile = makeModelProfile({ apiConfig: config })
    const assignment = makeAssignment({ modelProfile: profile, apiConfig: config })
    let resolveDelete: (() => void) | null = null

    vi.spyOn(apiConfigGateway, 'delete').mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve
        })
    )

    queryClient.setQueryData(apiConfigQueryKeys.all, [config])
    queryClient.setQueryData(apiConfigQueryKeys.modelProfiles, [profile])
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
    const profile = makeModelProfile({ apiConfig: config })
    const assignment = makeAssignment({ modelProfile: profile, apiConfig: config })

    vi.spyOn(apiConfigGateway, 'delete').mockRejectedValue(new Error('delete failed'))

    queryClient.setQueryData(apiConfigQueryKeys.all, [config])
    queryClient.setQueryData(apiConfigQueryKeys.modelProfiles, [profile])
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

  it('optimistically updates workflow assignments while saving', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const originalConfig = makeConfig()
    const nextConfig = makeConfig({
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Google Primary',
      displayName: 'Google Primary',
      provider: 'google',
    })
    const originalProfile = makeModelProfile({ apiConfig: originalConfig })
    const nextProfile = makeModelProfile({
      id: 'model-22222222-2222-4222-8222-222222222222',
      apiConfigId: nextConfig.id,
      modelId: 'gemini-2.5-pro',
      displayName: 'Google Primary Model',
      apiConfig: nextConfig,
    })
    const originalAssignment = makeAssignment({
      modelProfile: originalProfile,
      apiConfig: originalConfig,
    })
    let resolveAssignment: ((assignment: WorkflowModelAssignment) => void) | null = null

    vi.spyOn(apiConfigGateway, 'setWorkflowAssignment').mockImplementation(
      (workflowType, modelProfileId) =>
        new Promise<WorkflowModelAssignment>((resolve) => {
          resolveAssignment = resolve
          expect(workflowType).toBe('knowledge_qa')
          expect(modelProfileId).toBe(nextProfile.id)
        })
    )

    queryClient.setQueryData(apiConfigQueryKeys.all, [originalConfig, nextConfig])
    queryClient.setQueryData(apiConfigQueryKeys.modelProfiles, [originalProfile, nextProfile])
    queryClient.setQueryData(apiConfigQueryKeys.workflowAssignments, [originalAssignment])
    queryClient.setQueryData(apiConfigQueryKeys.workflowAssignment('knowledge_qa'), originalAssignment)

    const { result } = renderHook(() => useSetWorkflowAssignmentMutation(), {
      wrapper: createWrapper(queryClient),
    })

    result.current.mutate({ workflowType: 'knowledge_qa', modelProfileId: nextProfile.id })

    await waitFor(() => {
      expect(queryClient.getQueryData<WorkflowModelAssignment[]>(
        apiConfigQueryKeys.workflowAssignments
      )?.[0]?.modelProfileId).toBe(nextProfile.id)
      expect(queryClient.getQueryData<WorkflowModelAssignment>(
        apiConfigQueryKeys.workflowAssignment('knowledge_qa')
      )?.modelProfileId).toBe(nextProfile.id)
    })

    resolveAssignment?.(
      makeAssignment({
        modelProfileId: nextProfile.id,
        modelProfile: nextProfile,
        apiConfig: nextConfig,
        updatedAt: new Date('2026-04-22T00:00:00.000Z'),
      })
    )

    await waitFor(() => {
      expect(apiConfigGateway.setWorkflowAssignment).toHaveBeenCalledWith(
        'knowledge_qa',
        nextProfile.id
      )
    })
  })

  it('hydrates auto-created model profiles after creating a connection', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const createdConfig = makeConfig({
      id: '33333333-3333-4333-8333-333333333333',
      name: 'New Primary',
      displayName: 'New Primary',
      model: 'gpt-4.1',
    })
    const defaultProfile = makeModelProfile({
      id: 'model-33333333-3333-4333-8333-333333333333',
      apiConfigId: createdConfig.id,
      modelId: 'gpt-4.1',
      displayName: 'gpt-4.1',
      apiConfig: createdConfig,
    })

    vi.spyOn(apiConfigGateway, 'create').mockResolvedValue(createdConfig)
    vi.spyOn(apiConfigGateway, 'listModelProfiles').mockResolvedValue([defaultProfile])
    vi.spyOn(apiConfigGateway, 'listWorkflowAssignments').mockResolvedValue([])

    queryClient.setQueryData(apiConfigQueryKeys.all, [makeConfig()])

    const { result } = renderHook(() => useCreateApiConfigMutation(), {
      wrapper: createWrapper(queryClient),
    })

    await result.current.mutateAsync({
      provider: createdConfig.provider,
      protocol: createdConfig.protocol,
      authMode: createdConfig.authMode,
      name: createdConfig.name,
      displayName: createdConfig.displayName,
      baseUrl: createdConfig.baseUrl,
      model: createdConfig.model,
      budgetLimit: createdConfig.budgetLimit,
      isEnabled: createdConfig.isEnabled,
      isDefault: createdConfig.isDefault,
    })

    await waitFor(() => {
      expect(queryClient.getQueryData<ApiConfig[]>(apiConfigQueryKeys.all)).toEqual(
        expect.arrayContaining([createdConfig])
      )
      expect(
        queryClient.getQueryData<ModelProfile[]>(apiConfigQueryKeys.modelProfiles)
      ).toEqual([defaultProfile])
    })
  })

  it('adds a created model profile into the visible caches immediately', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const config = makeConfig()
    const existingProfile = makeModelProfile({ apiConfig: config })
    const createdProfile = makeModelProfile({
      id: 'model-44444444-4444-4444-8444-444444444444',
      modelId: 'gpt-4.1-mini',
      displayName: 'Fast Model',
      isDefaultForConnection: false,
      apiConfig: config,
    })

    vi.spyOn(apiConfigGateway, 'createModelProfile').mockResolvedValue(createdProfile)

    queryClient.setQueryData(apiConfigQueryKeys.modelProfiles, [existingProfile])
    queryClient.setQueryData(apiConfigQueryKeys.modelProfilesByApiConfig(config.id), [existingProfile])

    const { result } = renderHook(() => useCreateModelProfileMutation(), {
      wrapper: createWrapper(queryClient),
    })

    await result.current.mutateAsync({
      apiConfigId: config.id,
      modelId: createdProfile.modelId,
      displayName: createdProfile.displayName,
      capabilitiesJson: createdProfile.capabilitiesJson,
      isEnabled: createdProfile.isEnabled,
      isDefaultForConnection: createdProfile.isDefaultForConnection,
    })

    await waitFor(() => {
      expect(queryClient.getQueryData<ModelProfile[]>(apiConfigQueryKeys.modelProfiles)).toEqual([
        createdProfile,
        existingProfile,
      ])
      expect(
        queryClient.getQueryData<ModelProfile[]>(
          apiConfigQueryKeys.modelProfilesByApiConfig(config.id)
        )
      ).toEqual([createdProfile, existingProfile])
    })
  })

  it('adds a created embedding profile into the visible caches immediately', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const existingProfile = makeEmbeddingProfile({
      id: 'embedding-22222222-2222-4222-8222-222222222222',
      model: 'text-embedding-3-small',
      dimensions: 1536,
      isActive: false,
    })
    const createdProfile = makeEmbeddingProfile()

    vi.spyOn(embeddingProfileGateway, 'create').mockResolvedValue(createdProfile)

    queryClient.setQueryData(apiConfigQueryKeys.embeddingProfiles, [existingProfile])
    queryClient.setQueryData(apiConfigQueryKeys.activeEmbeddingProfile, null)

    const { result } = renderHook(() => useCreateEmbeddingProfileMutation(), {
      wrapper: createWrapper(queryClient),
    })

    await result.current.mutateAsync({
      provider: createdProfile.provider,
      model: createdProfile.model,
      dimensions: createdProfile.dimensions,
      distanceMetric: createdProfile.distanceMetric,
      isActive: createdProfile.isActive,
      revision: createdProfile.revision,
    })

    await waitFor(() => {
      expect(
        queryClient.getQueryData<EmbeddingProfile[]>(apiConfigQueryKeys.embeddingProfiles)
      ).toEqual([
        createdProfile,
        {
          ...existingProfile,
          isActive: false,
        },
      ])
      expect(
        queryClient.getQueryData<EmbeddingProfile | null>(apiConfigQueryKeys.activeEmbeddingProfile)
      ).toEqual(createdProfile)
    })
  })

  it('switches the active embedding profile in cache immediately', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const activeProfile = makeEmbeddingProfile()
    const nextProfile = makeEmbeddingProfile({
      id: 'embedding-33333333-3333-4333-8333-333333333333',
      model: 'text-embedding-3-small',
      dimensions: 1536,
      isActive: false,
    })

    vi.spyOn(embeddingProfileGateway, 'setActive').mockResolvedValue({
      ...nextProfile,
      isActive: true,
    })

    queryClient.setQueryData(apiConfigQueryKeys.embeddingProfiles, [activeProfile, nextProfile])
    queryClient.setQueryData(apiConfigQueryKeys.activeEmbeddingProfile, activeProfile)

    const { result } = renderHook(() => useSetActiveEmbeddingProfileMutation(), {
      wrapper: createWrapper(queryClient),
    })

    await result.current.mutateAsync(nextProfile.id)

    await waitFor(() => {
      expect(
        queryClient.getQueryData<EmbeddingProfile[]>(apiConfigQueryKeys.embeddingProfiles)
      ).toEqual([
        { ...activeProfile, isActive: false },
        { ...nextProfile, isActive: true },
      ])
      expect(
        queryClient.getQueryData<EmbeddingProfile | null>(apiConfigQueryKeys.activeEmbeddingProfile)
      ).toEqual({ ...nextProfile, isActive: true })
    })
  })
})
