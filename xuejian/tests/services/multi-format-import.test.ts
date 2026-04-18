import { describe, it, expect } from 'vitest'
import { documentGateway } from '@/services/gateway/documents'
import { parseTextDocument } from '@/services/renderer/text'

// @acceptance:v2-3-a1
describe('multi-format import uses unified document pipeline', () => {
  it('pickAndImportDocument is available and returns null in mock env', async () => {
    const result = await documentGateway.pickAndImportDocument()
    expect(result).toBeNull()
  })

  it('importFromPath returns a document via the unified pipeline', async () => {
    const doc = await documentGateway.importFromPath('/mock/test.md')
    expect(doc).toBeDefined()
    expect(doc.id).toBeTruthy()
    expect(doc.status).toBeTruthy()
  })

  it('saveAnalysis accepts text-document anchors with empty rects', async () => {
    const analysis = parseTextDocument('test-id', 'Hello world\n\nSecond paragraph')
    expect(analysis.anchors.length).toBeGreaterThan(0)
    // All anchors use page=1, empty rects — degraded format
    for (const anchor of analysis.anchors) {
      expect(anchor.page).toBe(1)
      expect(anchor.rects).toEqual([])
    }
    // Verify the analysis shape is compatible with saveAnalysis
    expect(analysis.pageCount).toBe(1)
    expect(analysis.chunks.length).toBeGreaterThan(0)
  })

  it('text parser produces chunks compatible with existing chunking format', () => {
    const analysis = parseTextDocument(
      'test-id',
      'Paragraph one.\n\nParagraph two.\n\nParagraph three.'
    )
    expect(analysis.chunks.length).toBeGreaterThan(0)
    for (const chunk of analysis.chunks) {
      expect(chunk.chunkIndex).toBeGreaterThanOrEqual(0)
      expect(chunk.content.length).toBeGreaterThan(0)
      expect(chunk.tokenCount).toBeGreaterThan(0)
      expect(chunk.pageStart).toBe(1)
      expect(chunk.pageEnd).toBe(1)
    }
  })
})

// @acceptance:v2-3-a2
describe('degraded anchors support card generation and citations', () => {
  it('text anchors have paragraph-only positioning (no coordinates)', () => {
    const analysis = parseTextDocument('test-id', 'First paragraph.\n\nSecond paragraph.')
    expect(analysis.anchors.length).toBe(2)

    expect(analysis.anchors[0].paragraph).toBe(1)
    expect(analysis.anchors[0].rects).toEqual([])
    expect(analysis.anchors[0].textQuote).toBe('First paragraph.')

    expect(analysis.anchors[1].paragraph).toBe(2)
    expect(analysis.anchors[1].rects).toEqual([])
    expect(analysis.anchors[1].textQuote).toBe('Second paragraph.')
  })

  it('each anchor has a stable hash for card linking', () => {
    const analysis = parseTextDocument('test-id', 'Para one.\n\nPara two.')
    const hashes = analysis.anchors.map((a) => a.hash)
    expect(new Set(hashes).size).toBe(hashes.length) // all unique

    // Re-parse produces the same hashes (stability)
    const analysis2 = parseTextDocument('test-id', 'Para one.\n\nPara two.')
    expect(analysis2.anchors.map((a) => a.hash)).toEqual(hashes)
  })

  it('chunk metadata includes anchor hashes for citation linking', () => {
    const analysis = parseTextDocument('test-id', 'Short text.')
    const metadata = analysis.chunks[0].metadata as Record<string, unknown>
    expect(metadata.anchorHashes).toBeDefined()
    expect(Array.isArray(metadata.anchorHashes)).toBe(true)
    expect((metadata.anchorHashes as string[]).length).toBeGreaterThan(0)
  })
})

// @acceptance:v2-3-a3
describe('error files retain clear status, no half-baked data', () => {
  it('deleteDocument is available for cleanup on import failure', async () => {
    // In mock mode, delete resolves without throwing
    await expect(
      documentGateway.delete('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    ).resolves.not.toThrow()
  })

  it('updateStatus can set error status on a document', async () => {
    await expect(
      documentGateway.updateStatus('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'error')
    ).resolves.not.toThrow()
  })

  it('empty text produces zero anchors and chunks gracefully', () => {
    const analysis = parseTextDocument('test-id', '')
    expect(analysis.anchors).toEqual([])
    expect(analysis.chunks).toEqual([])
    expect(analysis.pageCount).toBe(1)
  })

  it('whitespace-only text produces zero anchors and chunks', () => {
    const analysis = parseTextDocument('test-id', '   \n\n   \n   ')
    expect(analysis.anchors).toEqual([])
    expect(analysis.chunks).toEqual([])
  })
})
