import { z } from 'zod'
import { documentAnchorSchema, documentChunkSchema, documentSchema } from '@/types'
import type { Document, DocumentAnchor, DocumentChunk } from '@/types'
import { invoke, invokeWithSchema } from './index'

export interface CreateDocumentInput {
  title: string
  filePath: string
  fileType: Document['fileType']
  fileSize?: number | null
  pageCount?: number | null
  contentHash?: string | null
}

export interface PersistedDocumentAnchorInput {
  page: number
  paragraph: number | null
  textQuote: string
  rects: Array<{
    x: number
    y: number
    width: number
    height: number
  }>
  hash: string
}

export interface PersistedDocumentChunkInput {
  pageStart: number | null
  pageEnd: number | null
  chunkIndex: number
  content: string
  tokenCount: number | null
  metadata: Record<string, unknown> | null
}

export interface SaveDocumentAnalysisInput {
  pageCount: number
  anchors: PersistedDocumentAnchorInput[]
  chunks: PersistedDocumentChunkInput[]
}

/**
 * 文档相关命令
 */
export const documentGateway = {
  async list(limit?: number): Promise<Document[]> {
    return invokeWithSchema('list_documents', z.array(documentSchema), { limit })
  },

  async get(id: string): Promise<Document | null> {
    return invokeWithSchema('get_document', documentSchema.nullable(), { id })
  },

  async create(data: CreateDocumentInput): Promise<Document> {
    return invokeWithSchema('create_document', documentSchema, { data })
  },

  async pickAndImportPdf(): Promise<Document | null> {
    return invokeWithSchema('pick_and_import_pdf_document', documentSchema.nullable())
  },

  async pickAndImportDocument(): Promise<Document | null> {
    return invokeWithSchema('pick_and_import_document', documentSchema.nullable())
  },

  async importFromPath(filePath: string): Promise<Document> {
    return invokeWithSchema('import_document_from_path', documentSchema, { filePath })
  },

  async updateStatus(id: string, status: Document['status']): Promise<void> {
    return invoke<void>('update_document_status', { id, status })
  },

  async saveAnalysis(id: string, data: SaveDocumentAnalysisInput): Promise<Document> {
    return invokeWithSchema('save_document_analysis', documentSchema, { id, data })
  },

  async getAnchors(documentId: string): Promise<DocumentAnchor[]> {
    return invokeWithSchema('list_document_anchors', z.array(documentAnchorSchema), {
      documentId,
    })
  },

  async getChunks(documentId: string): Promise<DocumentChunk[]> {
    return invokeWithSchema('list_document_chunks', z.array(documentChunkSchema), {
      documentId,
    })
  },

  async readBinary(documentId: string): Promise<Uint8Array> {
    const data = await invoke<number[]>('read_document_binary', { id: documentId })
    return Uint8Array.from(data)
  },

  async delete(id: string): Promise<void> {
    return invoke<void>('delete_document', { id })
  },
}
