import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { documentGateway } from '@/services/gateway/documents'
import { basicCardsQueryKeys } from './basicCards'
import { cardsQueryKeys } from './cards'

export const documentsQueryKeys = {
  all: ['documents'] as const,
  list: (limit?: number) => [...documentsQueryKeys.all, 'list', limit ?? 'all'] as const,
  library: (limit?: number) => [...documentsQueryKeys.all, 'library', limit ?? 'all'] as const,
  detail: (id: string) => [...documentsQueryKeys.all, 'detail', id] as const,
  anchors: (id: string) => [...documentsQueryKeys.all, 'anchors', id] as const,
  chunks: (id: string) => [...documentsQueryKeys.all, 'chunks', id] as const,
  recent: (limit: number) => [...documentsQueryKeys.all, 'recent', limit] as const,
}

export function useDocumentsQuery(limit?: number) {
  return useQuery({
    queryKey: documentsQueryKeys.list(limit),
    queryFn: () => documentGateway.list(limit),
  })
}

export function useLibraryDocumentsQuery(limit?: number) {
  return useQuery({
    queryKey: documentsQueryKeys.library(limit),
    queryFn: () => documentGateway.listLibraryItems(limit),
  })
}

export function useRecentDocumentsQuery(limit = 10) {
  return useQuery({
    queryKey: documentsQueryKeys.recent(limit),
    queryFn: () => documentGateway.list(limit),
  })
}

export function useDocumentQuery(id: string | null) {
  return useQuery({
    queryKey: documentsQueryKeys.detail(id ?? 'unknown'),
    queryFn: () => documentGateway.get(id!),
    enabled: Boolean(id),
  })
}

export function useDocumentAnchorsQuery(documentId: string | null) {
  return useQuery({
    queryKey: documentsQueryKeys.anchors(documentId ?? 'unknown'),
    queryFn: () => documentGateway.getAnchors(documentId!),
    enabled: Boolean(documentId),
  })
}

export function useDocumentChunksQuery(documentId: string | null) {
  return useQuery({
    queryKey: documentsQueryKeys.chunks(documentId ?? 'unknown'),
    queryFn: () => documentGateway.getChunks(documentId!),
    enabled: Boolean(documentId),
  })
}

export function useStartDocumentEmbeddingJobMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (documentId: string) => documentGateway.startEmbeddingJob(documentId),
    onSuccess: (job) => {
      void queryClient.invalidateQueries({ queryKey: documentsQueryKeys.all })
      void queryClient.invalidateQueries({ queryKey: cardsQueryKeys.backgroundJobs({
        jobType: 'document_embedding',
        targetType: 'document',
      }) })
      if (job.id) {
        void queryClient.invalidateQueries({ queryKey: cardsQueryKeys.backgroundJob(job.id) })
      }
    },
  })
}

export function useDeleteDocumentMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => documentGateway.delete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: documentsQueryKeys.all })
      void queryClient.invalidateQueries({ queryKey: basicCardsQueryKeys.all })
      void queryClient.invalidateQueries({ queryKey: cardsQueryKeys.all })
    },
  })
}
