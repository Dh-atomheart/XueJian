import {
  appSettingsSchema,
  cardCandidateSchema,
  cardGenerationCandidateSchema,
  documentIRSchema,
  documentIRBlockSchema,
  finalizeCardGenerationResultSchema,
  ragAnswerSchema,
  serviceHealthStatusSchema,
  workflowEventSchema,
  workflowRunSchema,
} from '@/types'

describe('structured schemas', () => {
  it('backfills detailed settings defaults for legacy payloads', () => {
    const settings = appSettingsSchema.parse({
      theme: 'default',
      language: 'zh-CN',
      dailyNewCardLimit: 20,
      reviewTimeLimit: 30,
      podcastTtsProvider: 'auto',
      podcastOpenaiModel: 'tts-1',
      podcastFishAudioEndpoint: null,
      podcastVoiceOverrides: {},
      podcastOutputFormat: 'mp3',
      podcastSkipReview: true,
      podcastMaxLlmTokens: 100000,
      podcastMaxTtsCharacters: 50000,
      podcastMaxEstimatedCostUsd: 1,
    })

    expect(settings.learningGoal).toBe('knowledge_understanding')
    expect(settings.dailyStudyMinutes).toBe(30)
    expect(settings.studyTimePreference).toBe('evening')
    expect(settings.studyTimePreferences).toEqual(['afternoon', 'evening'])
    expect(settings.studyContentPreferences).toEqual([
      'psychology',
      'cognitive_science',
      'self_improvement',
      'education',
    ])
    expect(settings.defaultVoice).toBe('gentle_female_xiaoxiao')
    expect(settings.podcastBackgroundMusic).toBe('soft_piano')
    expect(settings.podcastAutoPlayNextEpisode).toBe(true)
  })

  it('sanitizes detailed settings values returned from the host', () => {
    const settings = appSettingsSchema.parse({
      theme: 'unknown',
      language: 'invalid',
      dailyNewCardLimit: -5,
      reviewTimeLimit: -30,
      learningGoal: 'bad_goal',
      dailyStudyMinutes: -10,
      studyTimePreference: 'bad_time',
      studyContentPreferences: ['   ', 'invalid', 'flashcards'],
      contentDifficultyPreference: 'bad_diff',
      podcastTtsProvider: 'auto',
      podcastOpenaiModel: '   ',
      podcastFishAudioEndpoint: '   ',
      podcastVoiceOverrides: {},
      defaultVoice: '   ',
      speechRate: 9,
      speechPitch: -9,
      speechVolume: 5,
      readingMode: 'bad_mode',
      defaultPodcastStyle: 'bad_style',
      podcastEpisodeDurationMinutes: 0,
      podcastContentStructure: 'bad_structure',
      podcastBackgroundMusic: 'bad_music',
      podcastIntroOutroEnabled: true,
      voiceInputLanguage: 'bad_lang',
      voiceInterruptEnabled: false,
      podcastAutoPlayNextEpisode: false,
      podcastOutputFormat: 'bad_format',
      podcastSkipReview: true,
      podcastMaxLlmTokens: -1,
      podcastMaxTtsCharacters: -1,
      podcastMaxEstimatedCostUsd: -1,
    })

    expect(settings.theme).toBe('default')
    expect(settings.language).toBe('zh-CN')
    expect(settings.dailyNewCardLimit).toBe(0)
    expect(settings.reviewTimeLimit).toBe(0)
    expect(settings.learningGoal).toBe('knowledge_understanding')
    expect(settings.dailyStudyMinutes).toBe(0)
    expect(settings.studyTimePreference).toBe('evening')
    expect(settings.studyTimePreferences).toEqual(['afternoon', 'evening'])
    expect(settings.studyContentPreferences).toEqual([
      'psychology',
      'cognitive_science',
      'self_improvement',
      'education',
    ])
    expect(settings.contentDifficultyPreference).toBe('intermediate')
    expect(settings.podcastOpenaiModel).toBe('tts-1')
    expect(settings.podcastFishAudioEndpoint).toBeNull()
    expect(settings.defaultVoice).toBe('gentle_female_xiaoxiao')
    expect(settings.speechRate).toBe(1.5)
    expect(settings.speechPitch).toBe(-0.5)
    expect(settings.speechVolume).toBe(1)
    expect(settings.readingMode).toBe('natural')
    expect(settings.defaultPodcastStyle).toBe('lecture')
    expect(settings.podcastEpisodeDurationMinutes).toBe(1)
    expect(settings.podcastContentStructure).toBe('summary_then_details')
    expect(settings.podcastBackgroundMusic).toBe('soft_piano')
    expect(settings.voiceInputLanguage).toBe('zh-CN')
    expect(settings.voiceInterruptEnabled).toBe(false)
    expect(settings.podcastAutoPlayNextEpisode).toBe(false)
  })

  it('parses card generation candidates with strict shape', () => {
    const candidate = cardGenerationCandidateSchema.parse({
      front: '什么是 FSRS？',
      back: '一种用于间隔重复调度的算法。',
      tags: ['fsrs', 'memory'],
      confidence: 0.82,
      sourcePage: 12,
      sourceParagraph: 3,
      sourceQuote: 'FSRS 是一种基于记忆稳定性的调度算法。',
    })

    expect(candidate.tags).toEqual(['fsrs', 'memory'])
    expect(candidate.confidence).toBeCloseTo(0.82)
  })

  it('rejects invalid card generation candidates', () => {
    expect(() =>
      cardGenerationCandidateSchema.parse({
        front: 'bad candidate',
        back: 'still bad',
        tags: [],
        confidence: 1.2,
        sourcePage: null,
        sourceParagraph: null,
        sourceQuote: 'quote',
      })
    ).toThrow()
  })

  it('parses rag answers with citations', () => {
    const answer = ragAnswerSchema.parse({
      answer: 'FSRS 通过历史复习数据估计下一次最佳复习时间。',
      answerMode: 'grounded',
      retrievalMode: 'fts5',
      citations: [
        {
          documentId: '4f4ac6a1-21d0-4d62-bec0-4b7188b84d51',
          sectionId: null,
          chunkId: null,
          anchorId: null,
          page: 8,
          quote: 'FSRS estimates the optimal interval...',
          relevanceScore: 0.91,
        },
      ],
    })

    expect(answer.citations).toHaveLength(1)
    expect(answer.answerMode).toBe('grounded')
    expect(answer.retrievalMode).toBe('fts5')
  })

  it('parses fallback workflow events and normalizes timestamps into Date instances', () => {
    const event = workflowEventSchema.parse({
      runId: '4f4ac6a1-21d0-4d62-bec0-4b7188b84d51',
      eventType: 'fallback',
      message: 'Python orchestration unavailable, using local fallback',
      progress: null,
      payload: { generationMode: 'rule_based_fallback' },
      createdAt: '2026-04-16T10:00:00.000Z',
    })

    expect(event.createdAt).toBeInstanceOf(Date)
    expect(event.eventType).toBe('fallback')
  })

  it('parses workflow runs returned from the host', () => {
    const run = workflowRunSchema.parse({
      id: '11111111-1111-4111-8111-111111111111',
      workflowType: 'card_generation',
      presetId: null,
      status: 'running',
      threadId: 'thread-123',
      checkpointRef: 'extract-2',
      approvalPayload: null,
      costUsd: 0.13,
      errorMessage: null,
      startedAt: '2026-04-16T10:00:00.000Z',
      finishedAt: null,
      createdAt: '2026-04-16T10:00:00.000Z',
      updatedAt: '2026-04-16T10:01:00.000Z',
    })

    expect(run.startedAt).toBeInstanceOf(Date)
    expect(run.workflowType).toBe('card_generation')
  })

  // @acceptance:m3-a3
  it('parses persisted card candidates returned from M3 commands', () => {
    const candidate = cardCandidateSchema.parse({
      id: '11111111-1111-4111-8111-111111111111',
      workflowRunId: '22222222-2222-4222-8222-222222222222',
      documentId: '33333333-3333-4333-8333-333333333333',
      sectionId: null,
      anchorId: '44444444-4444-4444-8444-444444444444',
      title: null,
      cardType: 'qa',
      sourcePage: 3,
      sourceParagraph: 2,
      sourceQuote: 'FSRS is a scheduling algorithm for spaced repetition.',
      front: 'What is FSRS?',
      back: 'A scheduling algorithm for spaced repetition.',
      tags: ['page-3', 'paragraph-2'],
      confidence: 0.82,
      dedupeKey: 'dedupe-1',
      status: 'pending',
      scoreOverall: null,
      scoreDetails: null,
      visibilityBucket: null,
      generationMode: 'llm',
      fallbackReason: null,
      evaluationSummary: null,
      sourceChunkIds: null,
      createdAt: '2026-04-17T02:00:00.000Z',
    })

    expect(candidate.createdAt).toBeInstanceOf(Date)
    expect(candidate.status).toBe('pending')
  })

  it('parses finalize results from the card production line', () => {
    const result = finalizeCardGenerationResultSchema.parse({
      createdCount: 4,
      skippedDuplicates: 1,
      rejectedCount: 2,
      run: {
        id: '11111111-1111-4111-8111-111111111111',
        workflowType: 'card_generation',
        presetId: 'm3-card-production-line',
        status: 'completed',
        threadId: 'card-generation:doc',
        checkpointRef: 'completed',
        approvalPayload: null,
        costUsd: null,
        errorMessage: null,
        startedAt: '2026-04-17T02:00:00.000Z',
        finishedAt: '2026-04-17T02:01:00.000Z',
        createdAt: '2026-04-17T02:00:00.000Z',
        updatedAt: '2026-04-17T02:01:00.000Z',
      },
    })

    expect(result.createdCount).toBe(4)
    expect(result.run.finishedAt).toBeInstanceOf(Date)
  })

  it('parses orchestration service health payloads', () => {
    const status = serviceHealthStatusSchema.parse({
      status: 'healthy',
      endpoint: 'http://127.0.0.1:8765',
      protocolVersion: 'xuejian-orchestration/v1',
      serviceVersion: '0.1.0',
      pid: 12345,
      startedAt: '2026-04-16T10:00:00.000Z',
      checkedAt: '2026-04-16T10:01:00.000Z',
      protocolCompatible: true,
      errorMessage: null,
    })

    expect(status.checkedAt).toBeInstanceOf(Date)
    expect(status.protocolCompatible).toBe(true)
  })
})

describe('DocumentIR v1 schemas', () => {
  const validBlock = {
    blockId: 'blk-001',
    blockType: 'heading',
    pageNumber: 1,
    content: 'Chapter 1: Introduction',
    spans: [
      {
        spanId: 'sp-001',
        start: 0,
        end: 23,
        page: 1,
        rect: { x: 72, y: 700, width: 400, height: 24 },
      },
    ],
    anchorId: null,
    parentBlockId: null,
    level: 1,
    language: null,
    metadata: null,
  }

  // @acceptance:v4-5-a4
  it('parses a minimal DocumentIR envelope', () => {
    const ir = documentIRSchema.parse({
      documentId: '11111111-1111-4111-8111-111111111111',
      parserFamily: 'pdfjs',
      parserVersion: '4.9.155',
      irVersion: '1',
      pages: [{ pageNumber: 1, width: 612, height: 792, rotation: 0, label: null }],
      blocks: [validBlock],
      assets: [],
      sourceMetadata: {
        importTimestamp: '2026-04-19T10:00:00.000Z',
        sourceHash: 'abc123',
        languageHint: 'zh',
        warnings: [],
        totalBlocks: 1,
        totalPages: 1,
      },
    })

    expect(ir.irVersion).toBe('1')
    expect(ir.blocks).toHaveLength(1)
    expect(ir.blocks[0].blockType).toBe('heading')
    expect(ir.sourceMetadata.totalPages).toBe(1)
  })

  it('rejects blocks with invalid blockType', () => {
    expect(() =>
      documentIRBlockSchema.parse({ ...validBlock, blockType: 'invalid_type' })
    ).toThrow()
  })

  it('rejects IR with wrong irVersion', () => {
    expect(() =>
      documentIRSchema.parse({
        documentId: '11111111-1111-4111-8111-111111111111',
        parserFamily: 'pdfjs',
        parserVersion: '4.9.155',
        irVersion: '2',
        pages: [],
        blocks: [],
        assets: [],
        sourceMetadata: {
          importTimestamp: '2026-04-19T10:00:00.000Z',
          sourceHash: null,
          languageHint: null,
          warnings: [],
          totalBlocks: 0,
          totalPages: 0,
        },
      })
    ).toThrow()
  })

  it('parses blocks with all blockType variants', () => {
    const types = [
      'heading',
      'paragraph',
      'list',
      'list_item',
      'table',
      'figure',
      'code_block',
      'formula',
      'blockquote',
      'page_header',
      'page_footer',
      'unknown',
    ] as const

    for (const bt of types) {
      const block = documentIRBlockSchema.parse({ ...validBlock, blockType: bt })
      expect(block.blockType).toBe(bt)
    }
  })
})
