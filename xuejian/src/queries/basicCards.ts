import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  basicCardsGateway,
  type BasicCardFilters,
  type CreateBasicCardGroupInput,
  type CreateBasicCardInput,
  type UpdateBasicCardGroupInput,
  type UpdateBasicCardInput,
} from '@/services/gateway/basicCards'

export const basicCardsQueryKeys = {
  all: ['basic-cards'] as const,
  list: (filters: BasicCardFilters) =>
    [
      ...basicCardsQueryKeys.all,
      'list',
      filters.groupId ?? 'all-groups',
      filters.sourceDocumentId ?? 'all-documents',
      filters.searchQuery ?? '',
      (filters.tags ?? []).join(','),
      filters.includeDeleted ? 'with-deleted' : 'active-only',
    ] as const,
  groups: (includeDeleted = false) =>
    [
      ...basicCardsQueryKeys.all,
      'groups',
      includeDeleted ? 'with-deleted' : 'active-only',
    ] as const,
}

export function useBasicCardsQuery(filters: BasicCardFilters) {
  return useQuery({
    queryKey: basicCardsQueryKeys.list(filters),
    queryFn: () => basicCardsGateway.list(filters),
  })
}

export function useBasicCardGroupsQuery(includeDeleted = false) {
  return useQuery({
    queryKey: basicCardsQueryKeys.groups(includeDeleted),
    queryFn: () => basicCardsGateway.listGroups(includeDeleted),
  })
}

function invalidateBasicCardQueries(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: basicCardsQueryKeys.all })
}

export function useCreateBasicCardMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateBasicCardInput) => basicCardsGateway.create(data),
    onSuccess: () => invalidateBasicCardQueries(queryClient),
  })
}

export function useUpdateBasicCardMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateBasicCardInput }) =>
      basicCardsGateway.update(id, data),
    onSuccess: () => invalidateBasicCardQueries(queryClient),
  })
}

export function useDeleteBasicCardMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => basicCardsGateway.delete(id),
    onSuccess: () => invalidateBasicCardQueries(queryClient),
  })
}

export function useDeleteBasicCardsMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (ids: string[]) => basicCardsGateway.deleteMany(ids),
    onSuccess: () => invalidateBasicCardQueries(queryClient),
  })
}

export function useCreateBasicCardGroupMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateBasicCardGroupInput) => basicCardsGateway.createGroup(data),
    onSuccess: () => invalidateBasicCardQueries(queryClient),
  })
}

export function useUpdateBasicCardGroupMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateBasicCardGroupInput }) =>
      basicCardsGateway.updateGroup(id, data),
    onSuccess: () => invalidateBasicCardQueries(queryClient),
  })
}

export function useSetBasicCardGroupEnabledMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, isEnabled }: { id: string; isEnabled: boolean }) =>
      basicCardsGateway.setGroupEnabled(id, isEnabled),
    onSuccess: () => invalidateBasicCardQueries(queryClient),
  })
}

export function useDeleteBasicCardGroupMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => basicCardsGateway.deleteGroup(id),
    onSuccess: () => invalidateBasicCardQueries(queryClient),
  })
}
