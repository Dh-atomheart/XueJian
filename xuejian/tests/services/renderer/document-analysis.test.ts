import { describe, expect, it } from 'vitest'
import { buildDocumentAnalysis, createStableHash } from '@/services/renderer/document-analysis'

describe('document-analysis', () => {
  it('builds stable paragraph anchors and chunks from page text items', () => {
    const analysis = buildDocumentAnalysis([
      {
        pageNumber: 1,
        width: 600,
        height: 800,
        items: [
          { text: 'Learning', x: 60, y: 90, width: 58, height: 18 },
          { text: 'systems', x: 130, y: 90, width: 62, height: 18, hasEol: true },
          { text: 'need', x: 60, y: 118, width: 42, height: 18 },
          { text: 'stable', x: 114, y: 118, width: 50, height: 18 },
          { text: 'anchors', x: 176, y: 118, width: 60, height: 18, hasEol: true },
          { text: 'Chunking', x: 60, y: 188, width: 70, height: 18 },
          { text: 'follows', x: 142, y: 188, width: 56, height: 18 },
          { text: 'next.', x: 210, y: 188, width: 44, height: 18, hasEol: true },
        ],
      },
    ])

    expect(analysis.pageCount).toBe(1)
    expect(analysis.anchors).toHaveLength(2)
    expect(analysis.anchors[0].paragraph).toBe(1)
    expect(analysis.anchors[0].textQuote).toBe('Learning systems need stable anchors')
    expect(analysis.anchors[1].paragraph).toBe(2)
    expect(analysis.chunks).toHaveLength(1)
    expect(analysis.chunks[0].chunkIndex).toBe(0)
    expect(analysis.chunks[0].metadata?.paragraphs).toEqual([
      { page: 1, paragraph: 1 },
      { page: 1, paragraph: 2 },
    ])
  })

  it('generates deterministic hashes for anchor payloads', () => {
    const payload = '{"page":1,"paragraph":1,"quote":"stable"}'

    expect(createStableHash(payload)).toBe(createStableHash(payload))
    expect(createStableHash(payload)).not.toBe(
      createStableHash('{"page":1,"paragraph":2,"quote":"stable"}')
    )
  })
})
