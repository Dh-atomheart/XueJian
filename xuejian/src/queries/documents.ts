import { useQuery } from '@tanstack/react-query'
import { documentGateway } from '@/services/gateway/documents'

export const documentsQueryKeys = {
  all: ['documents'] as const,
  list: (limit?: number) => [...documentsQueryKeys.all, 'list', limit ?? 'all'] as const,
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
