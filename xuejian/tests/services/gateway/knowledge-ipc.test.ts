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
})