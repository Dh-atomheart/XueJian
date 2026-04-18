import type { AppSettings, Card, Document, DocumentAnchor, DocumentChunk, Highlight } from '@/types'

const MOCK_NOW = '2026-04-17T09:00:00.000Z'

const MOCK_DOCUMENT_ID = '22222222-2222-4222-8222-222222222222'
const MOCK_ANCHOR_IDS = [
  '55555555-5555-4555-8555-555555555555',
  '66666666-6666-4666-8666-666666666666',
] as const
const MOCK_CARD_IDS = [
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
] as const
const MOCK_HIGHLIGHT_IDS = [
  '77777777-7777-4777-8777-777777777777',
  '88888888-8888-4888-8888-888888888888',
] as const

const normalizedRect = (x: number, y: number, width: number, height: number) => ({
  x: x / 612,
  y: y / 792,
  width: width / 612,
  height: height / 792,
})

const mockDocument: Document = {
  id: MOCK_DOCUMENT_ID,
  title: 'M4 Reader Mock Notes.pdf',
  filePath: 'mock://documents/m4-reader.pdf',
  fileType: 'pdf',
  fileSize: 52_480,
  pageCount: 1,
  contentHash: 'm4-reader-mock-hash',
  status: 'ready',
  createdAt: new Date(MOCK_NOW),
  updatedAt: new Date(MOCK_NOW),
}

const mockAnchors: DocumentAnchor[] = [
  {
    id: MOCK_ANCHOR_IDS[0],
    documentId: MOCK_DOCUMENT_ID,
    page: 1,
    paragraph: 1,
    textQuote: "Chunking keeps the page readable while stable anchors hold the user's place.",
    rects: [normalizedRect(72, 118, 356, 18)],
    hash: 'anchor-chunk-reading-flow',
    createdAt: new Date(MOCK_NOW),
  },
  {
    id: MOCK_ANCHOR_IDS[1],
    documentId: MOCK_DOCUMENT_ID,
    page: 1,
    paragraph: 2,
    textQuote: 'Sticky notes should sit beside the paper instead of covering the text itself.',
    rects: [normalizedRect(72, 186, 372, 18)],
    hash: 'anchor-sticky-rail-layout',
    createdAt: new Date(MOCK_NOW),
  },
]

const mockChunks: DocumentChunk[] = [
  {
    id: '99999999-9999-4999-8999-999999999991',
    documentId: MOCK_DOCUMENT_ID,
    pageStart: 1,
    pageEnd: 1,
    chunkIndex: 0,
    content:
      "Chunking keeps the page readable while stable anchors hold the user's place. Sticky notes should sit beside the paper instead of covering the text itself.",
    tokenCount: 32,
    metadata: { source: 'mock-reader' },
    createdAt: new Date(MOCK_NOW),
  },
]

const mockCards: Card[] = [
  {
    id: MOCK_CARD_IDS[0],
    groupId: null,
    documentId: MOCK_DOCUMENT_ID,
    anchorId: MOCK_ANCHOR_IDS[0],
    front: '为什么阅读区要保留稳定锚点？',
    back: '因为卡片与原文的双向跳转必须建立在稳定位置之上，否则定位会漂移。',
    sourcePage: 1,
    sourceParagraph: 1,
    sourceCoordinates: normalizedRect(72, 118, 356, 18),
    tags: ['m4', 'reader'],
    difficulty: 0.28,
    stability: 2.1,
    retrievability: null,
    state: 'new',
    nextReview: null,
    createdAt: new Date(MOCK_NOW),
    updatedAt: new Date(MOCK_NOW),
  },
  {
    id: MOCK_CARD_IDS[1],
    groupId: null,
    documentId: MOCK_DOCUMENT_ID,
    anchorId: MOCK_ANCHOR_IDS[1],
    front: '贴笺栏为什么应独立于正文？',
    back: '右侧贴笺栏可以保持上下文可见，同时避免遮挡正文与文本选择。',
    sourcePage: 1,
    sourceParagraph: 2,
    sourceCoordinates: normalizedRect(72, 186, 372, 18),
    tags: ['m4', 'layout'],
    difficulty: 0.32,
    stability: 2.4,
    retrievability: null,
    state: 'learning',
    nextReview: null,
    createdAt: new Date(MOCK_NOW),
    updatedAt: new Date(MOCK_NOW),
  },
]

const mockHighlights: Highlight[] = [
  {
    id: MOCK_HIGHLIGHT_IDS[0],
    cardId: MOCK_CARD_IDS[0],
    documentId: MOCK_DOCUMENT_ID,
    anchorId: MOCK_ANCHOR_IDS[0],
    pageNumber: 1,
    rectangles: [normalizedRect(72, 118, 356, 18)],
    textContent: mockAnchors[0].textQuote,
    color: '#F8E16C',
    createdAt: new Date(MOCK_NOW),
  },
  {
    id: MOCK_HIGHLIGHT_IDS[1],
    cardId: MOCK_CARD_IDS[1],
    documentId: MOCK_DOCUMENT_ID,
    anchorId: MOCK_ANCHOR_IDS[1],
    pageNumber: 1,
    rectangles: [normalizedRect(72, 186, 372, 18)],
    textContent: mockAnchors[1].textQuote,
    color: '#C8E6C9',
    createdAt: new Date(MOCK_NOW),
  },
]

let mockAppSettings: AppSettings = {
  theme: 'default',
  language: 'zh-CN',
  dailyNewCardLimit: 20,
  reviewTimeLimit: 30,
}

const mockPdfBinary = Array.from(
  buildPdfBytes([
    'XueJian M4 Reader Mock',
    "Chunking keeps the page readable while stable anchors hold the user's place.",
    'Sticky notes should sit beside the paper instead of covering the text itself.',
  ])
)

export function getMockGatewayResponse<T>(cmd: string, args?: Record<string, unknown>): T {
  const filters = getRecord(args?.filters)
  const limit = getNumber(args?.limit) ?? getNumber(filters?.limit)
  const documentId =
    getString(args?.documentId) ?? getString(filters?.documentId) ?? getString(args?.id)
  const pageNumber = getNumber(filters?.pageNumber)
  const anchorId = getString(filters?.anchorId)
  const cardId = getString(filters?.cardId)
  const pointsData = getRecord(args?.data)
  const reviewLogId = getString(pointsData?.reviewLogId)

  if (cmd === 'update_settings') {
    const data = getRecord(args?.data)

    mockAppSettings = {
      ...mockAppSettings,
      ...(data?.theme ? { theme: data.theme as AppSettings['theme'] } : {}),
      ...(data?.language ? { language: data.language as AppSettings['language'] } : {}),
      ...(typeof data?.dailyNewCardLimit === 'number'
        ? { dailyNewCardLimit: data.dailyNewCardLimit }
        : {}),
      ...(typeof data?.reviewTimeLimit === 'number'
        ? { reviewTimeLimit: data.reviewTimeLimit }
        : {}),
    }

    return mockAppSettings as T
  }

  if (cmd === 'record_points') {
    if (reviewLogId === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') {
      return {
        id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        reviewLogId,
        cardId: MOCK_CARD_IDS[0],
        points: 10,
        transactionType: 'daily_first_review',
        rating: 'good',
        reason: 'Daily first review bonus for 2026-04-17',
        createdAt: new Date(MOCK_NOW).toISOString(),
      } as T
    }

    return null as T
  }

  const mockResponses: Record<string, unknown> = {
    get_host_gateway_manifest: {
      protocolVersion: 'xuejian-orchestration/v1',
      modelGatewayCommands: [
        'list_api_configs',
        'get_api_config',
        'create_api_config',
        'update_api_config',
        'set_default_api_config',
        'delete_api_config',
        'store_api_key',
        'test_api_connection',
      ],
      toolGatewayCommands: [
        'list_documents',
        'get_document',
        'create_document',
        'update_document_status',
        'delete_document',
        'list_document_anchors',
        'list_document_chunks',
        'list_due_cards',
        'create_card',
        'list_cards',
        'list_highlights',
        'create_highlight',
        'update_highlight',
        'delete_highlight',
        'update_card_review',
        'list_card_candidates',
        'update_card_candidate',
        'bulk_update_card_candidate_statuses',
        'start_card_generation_workflow',
        'resume_card_generation_workflow',
        'finalize_card_generation_workflow',
      ],
    },
    get_orchestration_service_health: {
      status: 'stopped',
      endpoint: null,
      protocolVersion: null,
      serviceVersion: null,
      pid: null,
      startedAt: null,
      checkedAt: new Date(MOCK_NOW).toISOString(),
      protocolCompatible: false,
      errorMessage: null,
    },
    list_workflow_runs: [],
    list_workflow_events: [],
    get_workflow_checkpoint: null,
    get_settings: mockAppSettings,
    list_documents: limitItems([serializeDocument(mockDocument)], limit),
    get_document:
      documentId === MOCK_DOCUMENT_ID || documentId == null
        ? serializeDocument(mockDocument)
        : null,
    list_document_anchors:
      documentId === MOCK_DOCUMENT_ID || documentId == null
        ? limitItems(mockAnchors.map(serializeAnchor), limit)
        : [],
    list_document_chunks:
      documentId === MOCK_DOCUMENT_ID || documentId == null
        ? limitItems(mockChunks.map(serializeChunk), limit)
        : [],
    list_card_candidates: [],
    start_card_generation_workflow: {
      id: '11111111-1111-4111-8111-111111111111',
      workflowType: 'card_generation',
      presetId: 'm3-card-production-line',
      status: 'queued',
      threadId: 'card-generation:mock',
      checkpointRef: 'queued',
      approvalPayload: null,
      costUsd: null,
      errorMessage: null,
      startedAt: null,
      finishedAt: null,
      createdAt: new Date(MOCK_NOW).toISOString(),
      updatedAt: new Date(MOCK_NOW).toISOString(),
    },
    resume_card_generation_workflow: {
      id: '11111111-1111-4111-8111-111111111111',
      workflowType: 'card_generation',
      presetId: 'm3-card-production-line',
      status: 'queued',
      threadId: 'card-generation:mock',
      checkpointRef: 'queued',
      approvalPayload: null,
      costUsd: null,
      errorMessage: null,
      startedAt: null,
      finishedAt: null,
      createdAt: new Date(MOCK_NOW).toISOString(),
      updatedAt: new Date(MOCK_NOW).toISOString(),
    },
    finalize_card_generation_workflow: {
      createdCount: 0,
      skippedDuplicates: 0,
      rejectedCount: 0,
      run: {
        id: '11111111-1111-4111-8111-111111111111',
        workflowType: 'card_generation',
        presetId: 'm3-card-production-line',
        status: 'completed',
        threadId: 'card-generation:mock',
        checkpointRef: 'completed',
        approvalPayload: null,
        costUsd: null,
        errorMessage: null,
        startedAt: null,
        finishedAt: new Date(MOCK_NOW).toISOString(),
        createdAt: new Date(MOCK_NOW).toISOString(),
        updatedAt: new Date(MOCK_NOW).toISOString(),
      },
    },
    pick_and_import_pdf_document: null,
    pick_and_import_document: null,
    import_document_from_path: serializeDocument(mockDocument),
    save_document_analysis: serializeDocument(mockDocument),
    update_document_status: undefined,
    delete_document: undefined,
    read_document_binary:
      documentId === MOCK_DOCUMENT_ID || documentId == null ? mockPdfBinary : [],
    list_cards: limitItems(
      mockCards
        .filter((card) => (documentId ? card.documentId === documentId : true))
        .filter((card) => (anchorId ? card.anchorId === anchorId : true))
        .filter((card) => (pageNumber ? card.sourcePage === pageNumber : true))
        .map(serializeCard),
      limit
    ),
    list_highlights: limitItems(
      mockHighlights
        .filter((highlight) => (documentId ? highlight.documentId === documentId : true))
        .filter((highlight) => (cardId ? highlight.cardId === cardId : true))
        .filter((highlight) => (pageNumber ? highlight.pageNumber === pageNumber : true))
        .map(serializeHighlight),
      limit
    ),
    list_api_configs: [],
    get_api_config: null,
    create_api_config: {
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      provider: 'openai',
      name: 'Mock Config',
      model: 'gpt-4o',
      baseUrl: null,
      budgetLimit: null,
      isDefault: true,
      isEnabled: true,
      hasStoredKey: false,
      createdAt: MOCK_NOW,
    },
    update_api_config: {
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      provider: 'openai',
      name: 'Mock Config',
      model: 'gpt-4o',
      baseUrl: null,
      budgetLimit: null,
      isDefault: true,
      isEnabled: true,
      hasStoredKey: false,
      createdAt: MOCK_NOW,
    },
    set_default_api_config: undefined,
    delete_api_config: undefined,
    store_api_key: undefined,
    test_api_connection: { success: true, message: '连接测试通过 (mock)' },
    update_settings: mockAppSettings,
    get_daily_stats: { newCards: 2, reviewCards: 0 },
    list_due_cards: limitItems(mockCards.map(serializeCard), limit),
    create_review_log: {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      cardId: MOCK_CARD_IDS[0],
      rating: 'good',
      reviewedAt: new Date(MOCK_NOW).toISOString(),
      state: 'review',
      difficulty: 0.28,
      stability: 4.2,
      retrievability: 0.9,
      nextReview: new Date(Date.now() + 4 * 86400000).toISOString(),
      intervalDays: 4,
    },
    list_review_logs: [],
    update_card_review: undefined,
    search_knowledge: [
      {
        id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        documentId: MOCK_DOCUMENT_ID,
        chunkIndex: 0,
        pageStart: 1,
        pageEnd: 1,
        content: "Chunking keeps the page readable while stable anchors hold the user's place.",
        snippet: 'Chunking keeps the page readable…',
      },
    ],
    start_knowledge_qa_workflow: {
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      workflowType: 'knowledge_qa',
      presetId: 'v2-1-knowledge-qa',
      status: 'queued',
      threadId: 'knowledge-qa:mock',
      checkpointRef: 'queued',
      approvalPayload: null,
      costUsd: null,
      errorMessage: null,
      startedAt: null,
      finishedAt: null,
      createdAt: new Date(MOCK_NOW).toISOString(),
      updatedAt: new Date(MOCK_NOW).toISOString(),
    },
    list_points_ledger: [
      {
        id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        reviewLogId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        cardId: MOCK_CARD_IDS[0],
        points: 10,
        transactionType: 'daily_first_review',
        rating: 'good',
        reason: 'Daily first review bonus for 2026-04-17',
        createdAt: new Date(MOCK_NOW).toISOString(),
      },
    ],
    get_points_summary: {
      todayPoints: 10,
    },
    start_card_animation_workflow: {
      id: 'anim-mock-0001',
      cardId: MOCK_CARD_IDS[0],
      runId: 'run-anim-0001',
      animType: 'flashcard_reveal',
      scriptJson: JSON.stringify({
        type: 'flashcard_reveal',
        title: '什么是光合作用?',
        palette: 'default',
        steps: [
          { id: 's1', type: 'text', content: '什么是光合作用?', emphasis: [], delay_ms: 0 },
          {
            id: 's2',
            type: 'reveal',
            content: '植物利用光能将二氧化碳和水转化为葡萄糖和氧气的过程',
            emphasis: [],
            delay_ms: 600,
          },
        ],
      }),
      status: 'ready',
      errorMessage: null,
      createdAt: new Date(MOCK_NOW).toISOString(),
      updatedAt: new Date(MOCK_NOW).toISOString(),
    },
    get_card_animation: {
      id: 'anim-mock-0001',
      cardId: MOCK_CARD_IDS[0],
      runId: 'run-anim-0001',
      animType: 'flashcard_reveal',
      scriptJson: JSON.stringify({
        type: 'flashcard_reveal',
        title: '什么是光合作用?',
        palette: 'default',
        steps: [
          { id: 's1', type: 'text', content: '什么是光合作用?', emphasis: [], delay_ms: 0 },
          {
            id: 's2',
            type: 'reveal',
            content: '植物利用光能将二氧化碳和水转化为葡萄糖和氧气的过程',
            emphasis: [],
            delay_ms: 600,
          },
        ],
      }),
      status: 'ready',
      errorMessage: null,
      createdAt: new Date(MOCK_NOW).toISOString(),
      updatedAt: new Date(MOCK_NOW).toISOString(),
    },
    delete_card_animation: undefined,

    // ─── Podcast ───
    start_podcast_workflow: {
      id: 'podcast-001',
      documentId: null,
      runId: 'run-podcast-001',
      title: 'AI 学习播客',
      scopeDescription: '测试播客',
      scriptJson: JSON.stringify({
        title: 'AI 学习播客',
        description: '自动生成的学习播客',
        speakers: ['主持人', '专家'],
        outline: ['话题介绍', '核心概念', '实际应用'],
        segments: [
          { id: 'seg1', speaker: '主持人', text: '欢迎收听今天的播客！', durationMs: 5000 },
          { id: 'seg2', speaker: '专家', text: '今天我们来聊一聊学习方法。', durationMs: 6000 },
        ],
      }),
      audioPath: null,
      durationMs: 11000,
      status: 'ready',
      errorMessage: null,
      createdAt: new Date(MOCK_NOW).toISOString(),
      updatedAt: new Date(MOCK_NOW).toISOString(),
    },
    get_podcast_episode: {
      id: 'podcast-001',
      documentId: null,
      runId: 'run-podcast-001',
      title: 'AI 学习播客',
      scopeDescription: '测试播客',
      scriptJson: JSON.stringify({
        title: 'AI 学习播客',
        description: '自动生成的学习播客',
        speakers: ['主持人', '专家'],
        outline: ['话题介绍', '核心概念', '实际应用'],
        segments: [
          { id: 'seg1', speaker: '主持人', text: '欢迎收听今天的播客！', durationMs: 5000 },
          { id: 'seg2', speaker: '专家', text: '今天我们来聊一聊学习方法。', durationMs: 6000 },
        ],
      }),
      audioPath: null,
      durationMs: 11000,
      status: 'ready',
      errorMessage: null,
      createdAt: new Date(MOCK_NOW).toISOString(),
      updatedAt: new Date(MOCK_NOW).toISOString(),
    },
    list_podcast_episodes: [],
    cancel_podcast_episode: undefined,
    delete_podcast_episode: undefined,

    // ─── Knowledge Graph ───
    start_graph_build_workflow: {
      id: 'graph-build-001',
      runId: 'run-graph-001',
      scopeDescription: '1 document(s)',
      documentIds: [MOCK_DOCUMENT_ID],
      nodesCreated: 0,
      edgesCreated: 0,
      nodesMerged: 0,
      status: 'queued',
      errorMessage: null,
      createdAt: new Date(MOCK_NOW).toISOString(),
      updatedAt: new Date(MOCK_NOW).toISOString(),
    },
    list_graph_nodes: [
      {
        id: 'node-001',
        nodeType: 'concept',
        label: '光合作用',
        aliases: ['Photosynthesis'],
        sourceIds: [MOCK_DOCUMENT_ID],
        metadata: {},
        createdAt: new Date(MOCK_NOW).toISOString(),
        updatedAt: new Date(MOCK_NOW).toISOString(),
      },
      {
        id: 'node-002',
        nodeType: 'term',
        label: '叶绿素',
        aliases: ['Chlorophyll'],
        sourceIds: [MOCK_DOCUMENT_ID],
        metadata: {},
        createdAt: new Date(MOCK_NOW).toISOString(),
        updatedAt: new Date(MOCK_NOW).toISOString(),
      },
    ],
    list_graph_edges: [
      {
        id: 'edge-001',
        fromNodeId: 'node-001',
        toNodeId: 'node-002',
        relation: 'requires',
        confidence: 0.85,
        sourceIds: [MOCK_DOCUMENT_ID],
        createdAt: new Date(MOCK_NOW).toISOString(),
        updatedAt: new Date(MOCK_NOW).toISOString(),
      },
    ],
    get_node_sources: [MOCK_DOCUMENT_ID],
    merge_graph_nodes: {
      id: 'node-001',
      nodeType: 'concept',
      label: '光合作用',
      aliases: ['Photosynthesis'],
      sourceIds: [MOCK_DOCUMENT_ID],
      metadata: {},
      createdAt: new Date(MOCK_NOW).toISOString(),
      updatedAt: new Date(MOCK_NOW).toISOString(),
    },
    delete_graph_node: undefined,
    list_graph_build_runs: [],
  }

  return mockResponses[cmd] as T
}

function serializeDocument(document: Document) {
  return {
    ...document,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  }
}

function serializeAnchor(anchor: DocumentAnchor) {
  return {
    ...anchor,
    createdAt: anchor.createdAt.toISOString(),
  }
}

function serializeChunk(chunk: DocumentChunk) {
  return {
    ...chunk,
    createdAt: chunk.createdAt.toISOString(),
  }
}

function serializeCard(card: Card) {
  return {
    ...card,
    createdAt: card.createdAt.toISOString(),
    updatedAt: card.updatedAt.toISOString(),
    nextReview: card.nextReview?.toISOString() ?? null,
  }
}

function serializeHighlight(highlight: Highlight) {
  return {
    ...highlight,
    createdAt: highlight.createdAt.toISOString(),
  }
}

function limitItems<T>(items: T[], limit?: number | null) {
  if (!limit || limit <= 0) {
    return items
  }

  return items.slice(0, limit)
}

function getRecord(value: unknown) {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined
}

function getString(value: unknown) {
  return typeof value === 'string' ? value : undefined
}

function getNumber(value: unknown) {
  return typeof value === 'number' ? value : undefined
}

function buildPdfBytes(lines: string[]) {
  const encoder = new TextEncoder()
  const contentLines = ['BT', '/F1 20 Tf']

  lines.forEach((line, index) => {
    if (index === 0) {
      contentLines.push('72 760 Td')
    } else {
      contentLines.push('0 -28 Td')
    }

    contentLines.push(`(${escapePdfText(line)}) Tj`)
  })

  contentLines.push('ET')

  const stream = contentLines.join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]

  let pdf = '%PDF-1.4\n'
  const offsets = [0]

  objects.forEach((object, index) => {
    offsets.push(encoder.encode(pdf).length)
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  })

  const xrefOffset = encoder.encode(pdf).length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`

  for (let index = 1; index <= objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  return encoder.encode(pdf)
}

function escapePdfText(text: string) {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}
