import { invoke } from './index'
import type { Document, DocumentAnchor, DocumentChunk } from '@/types'

/**
 * 文档相关命令
 */
export const documentGateway = {
  async list(): Promise<Document[]> {
    return invoke<Document[]>('list_documents')
  },

  async get(id: string): Promise<Document | null> {
    return invoke<Document | null>('get_document', { id })
  },

  async upload(filePath: string): Promise<Document> {
    return invoke<Document>('upload_document', { filePath })
  },

  async delete(id: string): Promise<void> {
    return invoke<void>('delete_document', { id })
  },

  async getAnchors(documentId: string): Promise<DocumentAnchor[]> {
    return invoke<DocumentAnchor[]>('get_document_anchors', { documentId })
  },

  async getChunks(documentId: string): Promise<DocumentChunk[]> {
    return invoke<DocumentChunk[]>('get_document_chunks', { documentId })
  },
}
