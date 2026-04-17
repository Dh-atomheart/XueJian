import type {
  PersistedDocumentAnchorInput,
  PersistedDocumentChunkInput,
  SaveDocumentAnalysisInput,
} from '@/services/gateway/documents'

export interface AnchorSourceTextItem {
  text: string
  x: number
  y: number
  width: number
  height: number
  hasEol?: boolean
}

export interface ParsedPdfPageInput {
  pageNumber: number
  width: number
  height: number
  items: AnchorSourceTextItem[]
}

export interface ParsedPdfPageSummary {
  pageNumber: number
  paragraphCount: number
  text: string
}

export interface ParsedPdfDocumentAnalysis extends SaveDocumentAnalysisInput {
  pages: ParsedPdfPageSummary[]
  warnings: string[]
}

interface NormalizedLine {
  page: number
  y: number
  height: number
  text: string
  rect: PersistedDocumentAnchorInput['rects'][number]
}

interface ParagraphSeed extends PersistedDocumentAnchorInput {
  text: string
}

const MAX_CHUNK_CHARS = 900
const MAX_RECOMMENDED_FILE_SIZE = 15 * 1024 * 1024
const MAX_RECOMMENDED_PAGE_COUNT = 200
const FNV_OFFSET_BASIS = 0xcbf29ce484222325n
const FNV_PRIME = 0x100000001b3n

export function buildDocumentAnalysis(
  pages: ParsedPdfPageInput[],
  options?: {
    fileSize?: number
  }
): ParsedPdfDocumentAnalysis {
  const paragraphSeeds: ParagraphSeed[] = []
  const pageSummaries = pages.map((page) => {
    const paragraphs = buildParagraphsForPage(page)
    paragraphSeeds.push(...paragraphs)

    return {
      pageNumber: page.pageNumber,
      paragraphCount: paragraphs.length,
      text: paragraphs.map((paragraph) => paragraph.text).join('\n\n'),
    }
  })

  const chunks = buildChunks(paragraphSeeds)
  const warnings = buildWarnings({
    fileSize: options?.fileSize,
    pageCount: pages.length,
  })

  return {
    pageCount: pages.length,
    anchors: paragraphSeeds.map(({ page, paragraph, textQuote, rects, hash }) => ({
      page,
      paragraph,
      textQuote,
      rects,
      hash,
    })),
    chunks,
    pages: pageSummaries,
    warnings,
  }
}

function buildParagraphsForPage(page: ParsedPdfPageInput): ParagraphSeed[] {
  const lines = buildLines(page)
  const paragraphs: ParagraphSeed[] = []
  let currentParagraphLines: NormalizedLine[] = []

  const flushParagraph = () => {
    if (currentParagraphLines.length === 0) {
      return
    }

    const paragraphText = currentParagraphLines.map((line) => line.text).join(' ')
    const normalizedText = paragraphText.replace(/\s+/g, ' ').trim()

    if (!normalizedText) {
      currentParagraphLines = []
      return
    }

    const paragraphNumber = paragraphs.length + 1
    const rects = currentParagraphLines.map((line) => line.rect)
    const hash = createStableHash(
      JSON.stringify({
        page: page.pageNumber,
        paragraph: paragraphNumber,
        quote: normalizedText,
        rects,
      })
    )

    paragraphs.push({
      page: page.pageNumber,
      paragraph: paragraphNumber,
      text: normalizedText,
      textQuote: normalizedText,
      rects,
      hash,
    })

    currentParagraphLines = []
  }

  for (const line of lines) {
    const previousLine = currentParagraphLines.at(-1)
    const gap = previousLine ? line.y - previousLine.y : 0
    const paragraphGapThreshold = previousLine
      ? Math.max(previousLine.height, line.height) * 1.8
      : 0

    if (previousLine && gap > paragraphGapThreshold) {
      flushParagraph()
    }

    currentParagraphLines.push(line)
  }

  flushParagraph()
  return paragraphs
}

function buildLines(page: ParsedPdfPageInput): NormalizedLine[] {
  const textItems = page.items.filter((item) => item.text.trim().length > 0)
  const lines: Array<{
    y: number
    height: number
    items: AnchorSourceTextItem[]
  }> = []
  let currentLine: (typeof lines)[number] | null = null

  for (const item of textItems) {
    const lineTolerance = currentLine ? Math.max(currentLine.height, item.height) * 0.65 : 0
    const shouldStartNewLine = !currentLine || Math.abs(item.y - currentLine.y) > lineTolerance

    if (shouldStartNewLine) {
      if (currentLine) {
        lines.push(currentLine)
      }

      currentLine = {
        y: item.y,
        height: item.height,
        items: [item],
      }
    } else if (currentLine) {
      currentLine.items.push(item)
      currentLine.height = Math.max(currentLine.height, item.height)
    }

    if (item.hasEol && currentLine) {
      lines.push(currentLine)
      currentLine = null
    }
  }

  if (currentLine) {
    lines.push(currentLine)
  }

  return lines
    .map((line) => normalizeLine(line, page))
    .filter((line): line is NormalizedLine => Boolean(line))
}

function normalizeLine(
  line: {
    y: number
    height: number
    items: AnchorSourceTextItem[]
  },
  page: ParsedPdfPageInput
): NormalizedLine | null {
  const sortedItems = [...line.items].sort((left, right) => left.x - right.x)
  let text = ''
  let leftEdge = Number.POSITIVE_INFINITY
  let rightEdge = 0
  let topEdge = Number.POSITIVE_INFINITY
  let bottomEdge = 0
  let previousItem: AnchorSourceTextItem | null = null

  for (const item of sortedItems) {
    if (previousItem) {
      const gap = item.x - (previousItem.x + previousItem.width)
      const gapThreshold = Math.max(previousItem.height, item.height) * 0.35

      if (gap > gapThreshold) {
        text += ' '
      }
    }

    text += item.text
    leftEdge = Math.min(leftEdge, item.x)
    rightEdge = Math.max(rightEdge, item.x + item.width)
    topEdge = Math.min(topEdge, item.y)
    bottomEdge = Math.max(bottomEdge, item.y + item.height)
    previousItem = item
  }

  const normalizedText = text.replace(/\s+/g, ' ').trim()

  if (!normalizedText) {
    return null
  }

  return {
    page: page.pageNumber,
    y: topEdge,
    height: Math.max(bottomEdge - topEdge, line.height),
    text: normalizedText,
    rect: {
      x: normalizeRatio(leftEdge / page.width),
      y: normalizeRatio(topEdge / page.height),
      width: normalizeRatio((rightEdge - leftEdge) / page.width),
      height: normalizeRatio((bottomEdge - topEdge) / page.height),
    },
  }
}

function buildChunks(paragraphs: ParagraphSeed[]): PersistedDocumentChunkInput[] {
  const chunks: PersistedDocumentChunkInput[] = []
  let chunkBucket: ParagraphSeed[] = []
  let chunkCharacterCount = 0

  const flushChunk = () => {
    if (chunkBucket.length === 0) {
      return
    }

    const content = chunkBucket.map((paragraph) => paragraph.text).join('\n\n')
    chunks.push({
      pageStart: chunkBucket[0].page,
      pageEnd: chunkBucket.at(-1)?.page ?? chunkBucket[0].page,
      chunkIndex: chunks.length,
      content,
      tokenCount: estimateTokenCount(content),
      metadata: {
        characterCount: content.length,
        anchorHashes: chunkBucket.map((paragraph) => paragraph.hash),
        paragraphs: chunkBucket.map((paragraph) => ({
          page: paragraph.page,
          paragraph: paragraph.paragraph,
        })),
      },
    })

    chunkBucket = []
    chunkCharacterCount = 0
  }

  for (const paragraph of paragraphs) {
    const separatorSize = chunkBucket.length > 0 ? 2 : 0
    const nextSize = chunkCharacterCount + separatorSize + paragraph.text.length

    if (chunkBucket.length > 0 && nextSize > MAX_CHUNK_CHARS) {
      flushChunk()
    }

    chunkBucket.push(paragraph)
    chunkCharacterCount += (chunkBucket.length > 1 ? 2 : 0) + paragraph.text.length
  }

  flushChunk()
  return chunks
}

function estimateTokenCount(content: string) {
  return Math.max(1, Math.ceil(content.length / 4))
}

function buildWarnings(input: { fileSize?: number; pageCount: number }) {
  const warnings: string[] = []

  if (input.fileSize && input.fileSize > MAX_RECOMMENDED_FILE_SIZE) {
    warnings.push('文档体积较大，首次解析和预览会更慢。')
  }

  if (input.pageCount > MAX_RECOMMENDED_PAGE_COUNT) {
    warnings.push('页数较多，MVP 只提供基础缓存和分页预览。')
  }

  return warnings
}

function normalizeRatio(value: number) {
  return Math.round(Math.max(0, value) * 10_000) / 10_000
}

export function createStableHash(input: string) {
  let hash = FNV_OFFSET_BASIS

  for (const character of input) {
    hash ^= BigInt(character.codePointAt(0) ?? 0)
    hash = BigInt.asUintN(64, hash * FNV_PRIME)
  }

  return hash.toString(16).padStart(16, '0')
}
