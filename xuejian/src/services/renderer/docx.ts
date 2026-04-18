import { parseTextDocument } from './text'
import type { ParsedTextDocumentAnalysis } from './text'

/**
 * Parse a DOCX document into anchors and chunks.
 *
 * DOCX files are ZIP archives containing XML. We extract the raw text from
 * document.xml and process it through the same text pipeline used for MD/TXT.
 * This is a lightweight approach that avoids heavy dependencies like mammoth.js.
 */
export async function parseDocxDocument(
  documentId: string,
  bytes: Uint8Array
): Promise<ParsedTextDocumentAnalysis> {
  const text = await extractDocxText(bytes)
  return parseTextDocument(documentId, text)
}

async function extractDocxText(bytes: Uint8Array): Promise<string> {
  // DOCX is a ZIP archive; document.xml contains the body text.
  // We use a minimal approach: find the document.xml entry and strip XML tags.
  const zip = await decompressDocxDocument(bytes)
  const documentXml = zip.get('word/document.xml') ?? zip.get('word\\document.xml')

  if (!documentXml) {
    throw new Error('Invalid DOCX: word/document.xml not found')
  }

  return stripXmlToText(documentXml)
}

/**
 * Minimal ZIP reader for DOCX. Reads local file headers to extract entries.
 * DOCX files use Deflate (method 8) or Store (method 0).
 */
async function decompressDocxDocument(bytes: Uint8Array): Promise<Map<string, string>> {
  const entries = new Map<string, string>()
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 0
  const decoder = new TextDecoder('utf-8')

  while (offset + 30 <= bytes.length) {
    const signature = view.getUint32(offset, true)
    if (signature !== 0x04034b50) break // PK\x03\x04

    const method = view.getUint16(offset + 8, true)
    const compressedSize = view.getUint32(offset + 18, true)
    const nameLength = view.getUint16(offset + 26, true)
    const extraLength = view.getUint16(offset + 28, true)

    const nameBytes = bytes.slice(offset + 30, offset + 30 + nameLength)
    const name = decoder.decode(nameBytes)

    const dataStart = offset + 30 + nameLength + extraLength
    const compressedData = bytes.slice(dataStart, dataStart + compressedSize)

    if (name.endsWith('.xml') || name.endsWith('.rels')) {
      try {
        if (method === 0) {
          // Stored (no compression)
          entries.set(name, decoder.decode(compressedData))
        } else if (method === 8) {
          // Deflate
          const decompressed = await decompressDeflate(compressedData)
          entries.set(name, decoder.decode(decompressed))
        }
      } catch {
        // Skip entries we can't decompress
      }
    }

    offset = dataStart + compressedSize
  }

  return entries
}

async function decompressDeflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data]).stream()
  const decompressed = stream.pipeThrough(new DecompressionStream('raw'))
  const reader = decompressed.getReader()
  const chunks: Uint8Array[] = []

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }

  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0)
  const result = new Uint8Array(totalLength)
  let pos = 0
  for (const chunk of chunks) {
    result.set(chunk, pos)
    pos += chunk.length
  }
  return result
}

/**
 * Extract text from Office Open XML document.xml.
 * Paragraphs are separated by <w:p> elements; runs by <w:r><w:t>.
 */
function stripXmlToText(xml: string): string {
  // Split on paragraph boundaries
  const paragraphs = xml.split(/<\/w:p>/gi)

  const textParagraphs = paragraphs.map((p) => {
    // Extract text from <w:t> and <w:t xml:space="preserve"> elements
    const texts: string[] = []
    const tagRegex = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/gi
    let match: RegExpExecArray | null
    while ((match = tagRegex.exec(p)) !== null) {
      texts.push(match[1])
    }
    return texts.join('')
  })

  return textParagraphs.filter((p) => p.trim().length > 0).join('\n\n')
}
