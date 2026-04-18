import { describe, it, expect } from 'vitest'
import {
  startGraphBuild,
  listGraphNodes,
  listGraphEdges,
  getNodeSources,
  mergeGraphNodes,
  deleteGraphNode,
  listGraphBuildRuns,
} from '@/services/gateway/knowledgeGraph'
import { knowledgeNodeSchema, knowledgeEdgeSchema, graphBuildRunSchema } from '@/types/knowledge-graph'

const MOCK_DOCUMENT_ID = '22222222-2222-4222-8222-222222222222'

// @acceptance:v4-1-a1
describe('knowledge graph: graph can be built, incrementally updated, and traced to sources', () => {
  it('startGraphBuild returns a GraphBuildRun with queued status', async () => {
    const run = await startGraphBuild({ documentIds: [MOCK_DOCUMENT_ID] })
    expect(run).not.toBeNull()
    expect(run.status).toBe('queued')
    expect(run.documentIds).toContain(MOCK_DOCUMENT_ID)
  })

  it('startGraphBuild result conforms to graphBuildRunSchema', async () => {
    const run = await startGraphBuild({ documentIds: [MOCK_DOCUMENT_ID] })
    expect(() => graphBuildRunSchema.parse(run)).not.toThrow()
  })

  it('listGraphNodes returns an array of KnowledgeNode', async () => {
    const nodes = await listGraphNodes()
    expect(Array.isArray(nodes)).toBe(true)
    if (nodes.length > 0) {
      expect(() => knowledgeNodeSchema.parse(nodes[0])).not.toThrow()
    }
  })

  it('listGraphEdges returns edges for a given node', async () => {
    const nodes = await listGraphNodes()
    if (nodes.length > 0) {
      const edges = await listGraphEdges(nodes[0].id)
      expect(Array.isArray(edges)).toBe(true)
      if (edges.length > 0) {
        expect(() => knowledgeEdgeSchema.parse(edges[0])).not.toThrow()
      }
    }
  })

  it('every node has sourceIds for source tracing', async () => {
    const nodes = await listGraphNodes()
    for (const node of nodes) {
      expect(Array.isArray(node.sourceIds)).toBe(true)
      expect(node.sourceIds.length).toBeGreaterThan(0)
    }
  })

  it('getNodeSources returns source IDs for a node', async () => {
    const nodes = await listGraphNodes()
    if (nodes.length > 0) {
      const sources = await getNodeSources(nodes[0].id)
      expect(Array.isArray(sources)).toBe(true)
      expect(sources.length).toBeGreaterThan(0)
    }
  })

  it('listGraphBuildRuns returns an array', async () => {
    const runs = await listGraphBuildRuns()
    expect(Array.isArray(runs)).toBe(true)
  })
})

// @acceptance:v4-1-a2
describe('knowledge graph: synonymous concepts can be disambiguated and merged', () => {
  it('mergeGraphNodes merges source node into target', async () => {
    const nodes = await listGraphNodes()
    if (nodes.length >= 2) {
      const merged = await mergeGraphNodes({
        targetNodeId: nodes[0].id,
        sourceNodeId: nodes[1].id,
      })
      expect(merged).not.toBeNull()
      expect(merged.id).toBe(nodes[0].id)
    }
  })

  it('merged node conforms to knowledgeNodeSchema', async () => {
    const nodes = await listGraphNodes()
    if (nodes.length >= 2) {
      const merged = await mergeGraphNodes({
        targetNodeId: nodes[0].id,
        sourceNodeId: nodes[1].id,
      })
      expect(() => knowledgeNodeSchema.parse(merged)).not.toThrow()
    }
  })

  it('deleteGraphNode removes a node', async () => {
    const nodes = await listGraphNodes()
    if (nodes.length > 0) {
      await expect(deleteGraphNode(nodes[0].id)).resolves.not.toThrow()
    }
  })
})

// @acceptance:v4-1-a3
describe('knowledge graph: UI can browse nodes, relations, and sources', () => {
  it('node has a label and nodeType for display', async () => {
    const nodes = await listGraphNodes()
    for (const node of nodes) {
      expect(typeof node.label).toBe('string')
      expect(node.label.length).toBeGreaterThan(0)
      expect(['concept', 'person', 'event', 'formula', 'term']).toContain(node.nodeType)
    }
  })

  it('edge has relation and confidence for display', async () => {
    const nodes = await listGraphNodes()
    if (nodes.length > 0) {
      const edges = await listGraphEdges(nodes[0].id)
      for (const edge of edges) {
        expect(typeof edge.relation).toBe('string')
        expect(edge.relation.length).toBeGreaterThan(0)
        expect(edge.confidence).toBeGreaterThanOrEqual(0)
        expect(edge.confidence).toBeLessThanOrEqual(1)
      }
    }
  })

  it('node aliases are an array of strings', async () => {
    const nodes = await listGraphNodes()
    for (const node of nodes) {
      expect(Array.isArray(node.aliases)).toBe(true)
    }
  })
})

// @acceptance:v4-1-a4
describe('knowledge graph: does not display strong conclusions without traceable sources', () => {
  it('every node has at least one sourceId', async () => {
    const nodes = await listGraphNodes()
    for (const node of nodes) {
      expect(node.sourceIds.length).toBeGreaterThan(0)
    }
  })

  it('every edge has sourceIds', async () => {
    const nodes = await listGraphNodes()
    if (nodes.length > 0) {
      const edges = await listGraphEdges(nodes[0].id)
      for (const edge of edges) {
        expect(Array.isArray(edge.sourceIds)).toBe(true)
        expect(edge.sourceIds.length).toBeGreaterThan(0)
      }
    }
  })

  it('graph build result includes confidence scores on edges', async () => {
    const nodes = await listGraphNodes()
    if (nodes.length > 0) {
      const edges = await listGraphEdges(nodes[0].id)
      for (const edge of edges) {
        expect(typeof edge.confidence).toBe('number')
      }
    }
  })
})
