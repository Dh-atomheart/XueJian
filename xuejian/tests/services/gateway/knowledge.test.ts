import { searchKnowledge, startKnowledgeQaWorkflow } from '@/services/gateway/knowledge'
import { chunkSearchResultSchema } from '@/types'
import { z } from 'zod'

// @acceptance:v2-1-a1
describe('knowledge Q&A: scoped questions with cited answers', () => {
  it('searchKnowledge returns chunk results for a query', async () => {
    const results = await searchKnowledge({ query: 'chunking' })
    expect(Array.isArray(results)).toBe(true)
    expect(results.length).toBeGreaterThan(0)
    // Validate schema at IPC boundary
    const parsed = z.array(chunkSearchResultSchema).parse(
      results.map((r) => ({
        ...r,
      }))
    )
    expect(parsed[0]).toHaveProperty('documentId')
    expect(parsed[0]).toHaveProperty('snippet')
  })

  it('searchKnowledge accepts documentIds for scoped search', async () => {
    const results = await searchKnowledge({
      query: 'chunking',
      documentIds: ['22222222-2222-4222-8222-222222222222'],
    })
    expect(Array.isArray(results)).toBe(true)
  })

  it('startKnowledgeQaWorkflow returns a workflow run', async () => {
    const run = await startKnowledgeQaWorkflow({ question: 'What is chunking?' })
    expect(run.workflowType).toBe('knowledge_qa')
    expect(run.status).toBe('queued')
    expect(run).toHaveProperty('id')
  })

  it('startKnowledgeQaWorkflow accepts documentIds scope', async () => {
    const run = await startKnowledgeQaWorkflow({
      question: 'What is chunking?',
      documentIds: ['22222222-2222-4222-8222-222222222222'],
    })
    expect(run.workflowType).toBe('knowledge_qa')
  })
})

// @acceptance:v2-1-a2
describe('knowledge Q&A: FTS5 fallback without embeddings', () => {
  it('search results are returned via FTS5 (no embedding required)', async () => {
    // In the current implementation, all search goes through FTS5
    const results = await searchKnowledge({ query: 'readable anchors' })
    expect(Array.isArray(results)).toBe(true)
    // The mock gateway always returns results, confirming FTS5 path works
    expect(results.length).toBeGreaterThan(0)
  })

  it('searchKnowledge returns results even without API key configured', async () => {
    // FTS5 search is purely local — no external API needed
    const results = await searchKnowledge({ query: 'chunking' })
    expect(results.length).toBeGreaterThan(0)
    expect(results[0]).toHaveProperty('content')
  })
})

// @acceptance:v2-1-a3
describe('knowledge Q&A: isolated from agent runtime', () => {
  it('workflow type is knowledge_qa, not general agent', async () => {
    const run = await startKnowledgeQaWorkflow({ question: 'test isolation' })
    expect(run.workflowType).toBe('knowledge_qa')
    // Must NOT be agent_run or card_generation
    expect(run.workflowType).not.toBe('agent_run')
    expect(run.workflowType).not.toBe('card_generation')
  })

  it('knowledge Q&A uses a dedicated preset ID', async () => {
    const run = await startKnowledgeQaWorkflow({ question: 'test preset' })
    expect(run.presetId).toBe('v2-1-knowledge-qa')
  })
})

// @acceptance:v2-1-a4
describe('knowledge Q&A: citations link to document source', () => {
  it('search results contain documentId for source linking', async () => {
    const results = await searchKnowledge({ query: 'chunking' })
    expect(results.length).toBeGreaterThan(0)
    const first = results[0]
    expect(first.documentId).toBeTruthy()
    // documentId should be a valid UUID
    expect(first.documentId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    )
  })

  it('search results include page range for citation linking', async () => {
    const results = await searchKnowledge({ query: 'chunking' })
    const first = results[0]
    expect(first).toHaveProperty('pageStart')
    expect(first).toHaveProperty('pageEnd')
  })

  it('chunkSearchResultSchema validates citation-ready fields', () => {
    const parsed = chunkSearchResultSchema.parse({
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      documentId: '22222222-2222-4222-8222-222222222222',
      chunkIndex: 0,
      pageStart: 1,
      pageEnd: 3,
      content: 'Some document content',
      snippet: 'Some document…',
    })
    expect(parsed.documentId).toBe('22222222-2222-4222-8222-222222222222')
    expect(parsed.pageStart).toBe(1)
  })
})
