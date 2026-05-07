import { z } from 'zod'
import {
  backgroundJobSchema,
  documentAnchorSchema,
  documentChunkSchema,
  documentLibraryItemSchema,
  documentSchema,
  documentSectionSchema,
} from '@/types'
import type {
  BackgroundJob,
  Document,
  DocumentAnchor,
  DocumentChunk,
  DocumentLibraryItem,
  DocumentSection,
} from '@/types'
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
  id?: string | null
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
  hierarchyPath?: string[] | null
  quoteHash?: string | null
}

export interface PersistedDocumentSectionInput {
  id?: string | null
  sectionIndex: number
  heading?: string | null
  hierarchyPath?: string[] | null
  pageStart?: number | null
  pageEnd?: number | null
  anchorStartId?: string | null
  anchorEndId?: string | null
  content: string
  tokenCount?: number | null
  metadata?: Record<string, unknown> | null
}

export interface PersistedDocumentChunkInput {
  id?: string | null
  sectionId?: string | null
  anchorId?: string | null
  pageStart: number | null
  pageEnd: number | null
  chunkIndex: number
  chunkKind?: 'parent' | 'child' | 'semantic' | null
  content: string
  tokenCount: number | null
  metadata: Record<string, unknown> | null
}

export interface SaveDocumentAnalysisInput {
  pageCount: number
  anchors: PersistedDocumentAnchorInput[]
  sections?: PersistedDocumentSectionInput[]
  chunks: PersistedDocumentChunkInput[]
}

/**
 * 文档相关命令
 */
export const documentGateway = {
  async list(limit?: number): Promise<Document[]> {
    return invokeWithSchema('list_documents', z.array(documentSchema), { limit })
  },

  async listLibraryItems(limit?: number): Promise<DocumentLibraryItem[]> {
    return invokeWithSchema('list_library_documents', z.array(documentLibraryItemSchema), {
      limit,
    })
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

  async runParseWorkflow(documentId: string): Promise<Document> {
    return invokeWithSchema('run_document_parse_workflow', documentSchema, { documentId })
  },

  async runEmbeddingWorkflow(documentId: string): Promise<Document> {
    return invokeWithSchema('run_document_embedding_workflow', documentSchema, { documentId })
  },

  async startEmbeddingJob(documentId: string): Promise<BackgroundJob> {
    return invokeWithSchema('start_document_embedding_job', backgroundJobSchema, { documentId })
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

  async getSections(documentId: string): Promise<DocumentSection[]> {
    return invokeWithSchema('list_document_sections', z.array(documentSectionSchema), {
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
