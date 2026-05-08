const tauriWindow = window as Window & {
  __TAURI_INTERNALS__?: unknown
}

describe('knowledge gateway IPC payloads', () => {
  afterEach(() => {
    delete tauriWindow.__TAURI_INTERNALS__
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('wraps search payload under the data argument for Tauri commands', async () => {
    const ipcInvoke = vi.fn().mockResolvedValue([
      {
        id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        documentId: '22222222-2222-4222-8222-222222222222',
        chunkIndex: 0,
        pageStart: 1,
        pageEnd: 1,
        content: '测试内容',
        snippet: '测试摘要',
      },
    ])

    tauriWindow.__TAURI_INTERNALS__ = {}
    vi.doMock('@tauri-apps/api/core', () => ({ invoke: ipcInvoke }))

    const knowledgeGateway = await import('@/services/gateway/knowledge')
    await knowledgeGateway.searchKnowledge({
      query: '测试问题',
      documentIds: ['22222222-2222-4222-8222-222222222222'],
      limit: 6,
    })

    expect(ipcInvoke).toHaveBeenCalledWith('search_knowledge', {
      data: {
        query: '测试问题',
        documentIds: ['22222222-2222-4222-8222-222222222222'],
        limit: 6,
      },
    })
  })

  it('wraps knowledge workflow start payload under the data argument', async () => {
    const ipcInvoke = vi.fn().mockResolvedValue({
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
      createdAt: new Date('2026-04-19T10:02:00.000Z').toISOString(),
      updatedAt: new Date('2026-04-19T10:02:00.000Z').toISOString(),
    })

    tauriWindow.__TAURI_INTERNALS__ = {}
    vi.doMock('@tauri-apps/api/core', () => ({ invoke: ipcInvoke }))

    const knowledgeGateway = await import('@/services/gateway/knowledge')
    await knowledgeGateway.startKnowledgeQaWorkflow({
      question: '测试问答',
      documentIds: ['22222222-2222-4222-8222-222222222222'],
    })

    expect(ipcInvoke).toHaveBeenCalledWith('start_knowledge_qa_workflow', {
      data: {
        question: '测试问答',
        documentIds: ['22222222-2222-4222-8222-222222222222'],
      },
    })
  })

  it('regenerates an existing knowledge QA turn by message id', async () => {
    const now = new Date('2026-04-19T10:02:00.000Z').toISOString()
    const conversationId = '11111111-1111-4111-8111-111111111111'
    const documentId = '22222222-2222-4222-8222-222222222222'
    const userMessageId = '33333333-3333-4333-8333-333333333333'
    const assistantMessageId = '44444444-4444-4444-8444-444444444444'
    const runId = '55555555-5555-4555-8555-555555555555'
    const ipcInvoke = vi.fn().mockResolvedValue({
      conversation: {
        id: conversationId,
        title: 'Knowledge Q&A',
        documentIds: [documentId],
        createdAt: now,
        updatedAt: now,
      },
      userMessage: {
        id: userMessageId,
        conversationId,
        role: 'user',
        content: 'original question',
        status: 'answered',
        workflowRunId: null,
        documentIds: [documentId],
        answerPayload: null,
        errorMessage: null,
        createdAt: now,
        updatedAt: now,
      },
      assistantMessage: {
        id: assistantMessageId,
        conversationId,
        role: 'assistant',
        content: '',
        status: 'pending',
        workflowRunId: runId,
        documentIds: [documentId],
        answerPayload: null,
        errorMessage: null,
        createdAt: now,
        updatedAt: now,
      },
      run: {
        id: runId,
        workflowType: 'knowledge_qa',
        presetId: null,
        status: 'queued',
        threadId: `knowledge-qa:${conversationId}`,
        checkpointRef: null,
        approvalPayload: null,
        costUsd: null,
        errorMessage: null,
        startedAt: null,
        finishedAt: null,
        createdAt: now,
        updatedAt: now,
      },
    })

    tauriWindow.__TAURI_INTERNALS__ = {}
    vi.doMock('@tauri-apps/api/core', () => ({ invoke: ipcInvoke }))

    const knowledgeGateway = await import('@/services/gateway/knowledge')
    await knowledgeGateway.regenerateKnowledgeQaTurn(assistantMessageId)

    expect(ipcInvoke).toHaveBeenCalledWith('regenerate_knowledge_qa_turn', {
      messageId: assistantMessageId,
    })
  })
})
