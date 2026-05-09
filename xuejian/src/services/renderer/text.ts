import type {
  PersistedDocumentAnchorInput,
  PersistedDocumentChunkInput,
  SaveDocumentAnalysisInput,
} from '@/services/gateway/documents'
import { createStableHash } from './document-analysis'

export interface ParsedTextDocumentAnalysis extends SaveDocumentAnalysisInput {
  warnings: string[]
}

const MAX_CHUNK_CHARS = 900

/**
 * Parse a plain-text document (MD or TXT) into anchors and chunks.
 *
 * Since there is no page/coordinate information, all anchors use page=1,
 * empty rects, and paragraph-only positioning. This is the "degraded anchor"
 * strategy described in V2-3.
 */
export function parseTextDocument(_documentId: string, text: string): ParsedTextDocumentAnalysis {
  const paragraphs = splitParagraphs(text)

  const anchors: PersistedDocumentAnchorInput[] = paragraphs.map((paragraph, index) => {
    const hash = createStableHash(
      JSON.stringify({
        page: 1,
        paragraph: index + 1,
        quote: paragraph,
        rects: [],
      })
    )
    return {
      page: 1,
      paragraph: index + 1,
      textQuote: paragraph,
      rects: [],
      hash,
    }
  })

  const chunks = buildTextChunks(anchors, paragraphs)

  const warnings: string[] = []
  if (text.length > 500_000) {
    warnings.push('文档内容较长，解析可能需要更多时间。')
  }

  return {
    pageCount: 1,
    anchors,
    chunks,
    warnings,
  }
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 0)
}

function buildTextChunks(
  anchors: PersistedDocumentAnchorInput[],
  paragraphs: string[]
): PersistedDocumentChunkInput[] {
  const chunks: PersistedDocumentChunkInput[] = []
  let bucket: { text: string; hash: string; paragraph: number }[] = []
  let charCount = 0

  const flush = () => {
    if (bucket.length === 0) return
    const content = bucket.map((b) => b.text).join('\n\n')
    chunks.push({
      pageStart: 1,
      pageEnd: 1,
      chunkIndex: chunks.length,
      content,
      tokenCount: Math.max(1, Math.ceil(content.length / 4)),
      metadata: {
        characterCount: content.length,
        anchorHashes: bucket.map((b) => b.hash),
        paragraphs: bucket.map((b) => ({
          page: 1,
          paragraph: b.paragraph,
        })),
      },
    })
    bucket = []
    charCount = 0
  }

  for (let i = 0; i < paragraphs.length; i++) {
    const text = paragraphs[i]
    const separator = bucket.length > 0 ? 2 : 0
    const nextSize = charCount + separator + text.length

    if (bucket.length > 0 && nextSize > MAX_CHUNK_CHARS) {
      flush()
    }

    bucket.push({
      text,
      hash: anchors[i].hash,
      paragraph: i + 1,
    })
    charCount += (bucket.length > 1 ? 2 : 0) + text.length
  }

  flush()
  return chunks
}
