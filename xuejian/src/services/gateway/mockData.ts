import type {
  ApiConfig,
  AudioSegment,
  AppSettings,
  BackgroundJob,
  BasicCard,
  BasicCardGroup,
  Card,
  CardAnimation,
  CardCandidate,
  CardMedia,
  Document,
  DocumentAnchor,
  DocumentChunk,
  DocumentLibraryItem,
  DashboardSummary,
  DiscoveredModel,
  Highlight,
  ModelProfile,
  PodcastEpisode,
  PointsEntry,
  ProviderBudgetUsage,
  ReviewLog,
  StudyQueueItem,
  StudyReviewResult,
  WorkflowEvent,
  WorkflowModelAssignment,
  WorkflowType,
  WorkflowRun,
} from '@/types'

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
const MOCK_BASIC_GROUP_IDS = [
  '10101010-1010-4010-8010-101010101010',
  '20202020-2020-4020-8020-202020202020',
] as const
const MOCK_BASIC_CARD_IDS = [
  '30303030-3030-4030-8030-303030303030',
  '40404040-4040-4040-8040-404040404040',
] as const
const MOCK_WORKFLOW_RUN_ID = '11111111-1111-4111-8111-111111111111'
const MOCK_PODCAST_EPISODE_ID = 'podcast-001'
const MOCK_PODCAST_RUN_ID = 'run-podcast-001'

type MockStudyState = {
  state: StudyQueueItem['state']
  dueAt: Date
}

type MockStudyEvent = {
  cardId: string
  groupId: string
  rating: ReviewLog['rating']
  startedAt: Date | null
  answeredAt: Date
  durationMs: number | null
}

function createMockPodcastScript(title = 'AI 学习播客') {
  return {
    title,
    description: '自动生成的学习播客',
    speakers: ['主持人', '专家'],
    outline: ['话题介绍', '核心概念', '实际应用'],
    segments: [
      { id: 'seg1', speaker: '主持人', text: '欢迎收听今天的播客！', durationMs: 5000 },
      { id: 'seg2', speaker: '专家', text: '今天我们来聊一聊学习方法。', durationMs: 6000 },
    ],
  }
}

function createMockPodcastOutline(title = 'AI 学习播客') {
  return {
    title,
    description: '自动生成的学习播客提纲',
    totalTargetDurationMs: 11000,
    segments: [
      {
        segmentIndex: 0,
        topic: '话题介绍',
        keyPoints: ['介绍主题', '说明学习价值'],
        targetDurationMs: 5000,
        speakerAssignments: [
          { speakerId: 'host', role: '主持人' },
          { speakerId: 'expert', role: '专家' },
        ],
      },
      {
        segmentIndex: 1,
        topic: '核心概念',
        keyPoints: ['拆解概念', '给出例子'],
        targetDurationMs: 6000,
        speakerAssignments: [
          { speakerId: 'expert', role: '专家' },
          { speakerId: 'host', role: '主持人' },
        ],
      },
    ],
  }
}

function createMockPodcastEvaluation() {
  return {
    coherence: 8,
    accuracy: 8,
    styleConsistency: 8,
    naturalness: 8,
    overallScore: 8,
    issues: [],
    suggestions: ['可继续补充案例'],
    revised: false,
  }
}

function createMockPodcastEpisode(overrides: Partial<PodcastEpisode> = {}): PodcastEpisode {
  const title = overrides.title ?? 'AI 学习播客'
  const scriptJson = overrides.scriptJson ?? JSON.stringify(createMockPodcastScript(title))
  const outlineJson = overrides.outlineJson ?? JSON.stringify(createMockPodcastOutline(title))
  const evaluationJson = overrides.evaluationJson ?? JSON.stringify(createMockPodcastEvaluation())
  const status = overrides.status ?? 'ready'
  const currentStage = overrides.currentStage ?? 6

  return {
    id: MOCK_PODCAST_EPISODE_ID,
    documentIds: [MOCK_DOCUMENT_ID],
    runId: MOCK_PODCAST_RUN_ID,
    title,
    scopeDescription: '测试播客',
    style: 'interview',
    language: 'zh-CN',
    durationTier: 'medium',
    ttsProvider: 'auto',
    audioFormat: 'mp3',
    scriptJson,
    outlineJson,
    evaluationJson,
    audioPath: null,
    durationMs: 11000,
    status,
    stageKey: deriveMockPodcastStageKey(status, currentStage),
    errorMessage: null,
    errorCode: null,
    errorStage: null,
    retryable: true,
    currentStage,
    completedSegments: 2,
    totalSegments: 2,
    createdAt: new Date(MOCK_NOW).toISOString(),
    updatedAt: new Date(MOCK_NOW).toISOString(),
    ...overrides,
  }
}

function deriveMockPodcastStageKey(
  status: PodcastEpisode['status'],
  currentStage: number
): PodcastEpisode['stageKey'] {
  if (status === 'ready' || status === 'failed' || status === 'cancelled') {
    return status
  }
  if (status === 'awaiting_review') {
    return 'awaiting_review'
  }
  if (status === 'generating_audio' || status === 'stitching' || currentStage >= 5) {
    return 'audio'
  }
  if (status === 'generating_outline' || currentStage === 2) {
    return 'outline'
  }
  if (status === 'generating_script' || currentStage === 3) {
    return 'script'
  }
  if (status === 'evaluating' || currentStage === 4) {
    return 'evaluation'
  }
  return 'retrieval'
}

function createMockCardAnimation(overrides: Partial<CardAnimation> = {}): CardAnimation {
  const mode = overrides.mode ?? 'quick_preview'
  const isVideo = mode === 'video_render'

  return {
    id: 'anim-mock-0001',
    cardId: MOCK_CARD_IDS[0],
    runId: 'run-anim-0001',
    animType: 'flashcard_reveal',
    mode,
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
    videoPath: isVideo ? 'mock://animations/anim-mock-0001/video.mp4' : null,
    posterPath: isVideo ? 'mock://animations/anim-mock-0001/poster.png' : null,
    renderLogPath: isVideo ? 'mock://animations/anim-mock-0001/render.log' : null,
    status: 'ready',
    errorCode: null,
    errorMessage: null,
    retryable: true,
    createdAt: new Date(MOCK_NOW).toISOString(),
    updatedAt: new Date(MOCK_NOW).toISOString(),
    ...overrides,
  }
}

function createMockPodcastAudioSegments(episodeId: string): AudioSegment[] {
  return [
    {
      id: 'pod-audio-001',
      episodeId,
      dialogueSegmentId: 'seg1',
      speaker: '主持人',
      filePath: `mock://podcasts/${episodeId}/seg1.mp3`,
      durationMs: 5000,
      ttsProvider: 'edge_tts',
      voiceId: 'zh-CN-XiaoxiaoNeural',
    },
    {
      id: 'pod-audio-002',
      episodeId,
      dialogueSegmentId: 'seg2',
      speaker: '专家',
      filePath: `mock://podcasts/${episodeId}/seg2.mp3`,
      durationMs: 6000,
      ttsProvider: 'edge_tts',
      voiceId: 'zh-CN-YunxiNeural',
    },
  ]
}

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
  pageCount: 2,
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
    hierarchyPath: [],
    quoteHash: null,
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
    hierarchyPath: [],
    quoteHash: null,
    createdAt: new Date(MOCK_NOW),
  },
]

const mockChunks: DocumentChunk[] = [
  {
    id: '99999999-9999-4999-8999-999999999991',
    documentId: MOCK_DOCUMENT_ID,
    sectionId: null,
    anchorId: MOCK_ANCHOR_IDS[0],
    pageStart: 1,
    pageEnd: 1,
    chunkIndex: 0,
    chunkKind: 'semantic',
    content:
      "Chunking keeps the page readable while stable anchors hold the user's place. Sticky notes should sit beside the paper instead of covering the text itself.",
    tokenCount: 32,
    metadata: { source: 'mock-reader' },
    createdAt: new Date(MOCK_NOW),
  },
]

function createInitialMockCards(): Card[] {
  return [
    {
      id: MOCK_CARD_IDS[0],
      groupId: null,
      documentId: MOCK_DOCUMENT_ID,
      anchorId: MOCK_ANCHOR_IDS[0],
      front: '为什么阅读区要保留稳定锚点？',
      back: '因为卡片与原文的双向跳转必须建立在稳定位置之上，否则定位会漂移。',
      title: null,
      cardType: 'qa' as const,
      clusterId: null,
      exportGuid: null,
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
      title: null,
      cardType: 'qa' as const,
      clusterId: null,
      exportGuid: null,
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
}

function createInitialMockCardCandidates(): CardCandidate[] {
  return [
    {
      id: '12121212-1212-4212-8212-121212121212',
      workflowRunId: MOCK_WORKFLOW_RUN_ID,
      documentId: MOCK_DOCUMENT_ID,
      sectionId: null,
      anchorId: MOCK_ANCHOR_IDS[0],
      title: '稳定锚点',
      cardType: 'qa',
      sourcePage: 1,
      sourceParagraph: 1,
      sourceQuote: mockAnchors[0].textQuote,
      front: '为什么文档卡片工作流强调稳定锚点？',
      back: '因为候选卡片必须能回到原文定位，否则人工审阅和后续复习都无法可靠追溯。',
      tags: ['workflow', 'anchor'],
      confidence: 0.93,
      dedupeKey: 'mock-candidate-anchor',
      status: 'pending',
      scoreOverall: 93,
      scoreDetails: { clarity: 0.91, traceability: 0.96 },
      visibilityBucket: 'default',
      generationMode: 'llm',
      fallbackReason: null,
      evaluationSummary: '问题清晰，来源锚点稳定，适合直接进入人工确认。',
      sourceChunkIds: [mockChunks[0].id],
      createdAt: new Date(MOCK_NOW),
    },
    {
      id: '34343434-3434-4434-8434-343434343434',
      workflowRunId: MOCK_WORKFLOW_RUN_ID,
      documentId: MOCK_DOCUMENT_ID,
      sectionId: null,
      anchorId: MOCK_ANCHOR_IDS[1],
      title: '贴笺布局',
      cardType: 'fact',
      sourcePage: 1,
      sourceParagraph: 2,
      sourceQuote: mockAnchors[1].textQuote,
      front: '贴笺不应覆盖正文',
      back: '贴笺栏应独立于正文，既保留上下文又不影响阅读与选区。',
      tags: ['layout'],
      confidence: 0.56,
      dedupeKey: 'mock-candidate-layout',
      status: 'pending',
      scoreOverall: 54,
      scoreDetails: { density: 0.52, clarity: 0.58 },
      visibilityBucket: 'hidden_low_quality',
      generationMode: 'fallback_rule',
      fallbackReason: 'mock_browser_preview',
      evaluationSummary: '信息准确但表达偏平，可在需要时展开查看。',
      sourceChunkIds: [mockChunks[0].id],
      createdAt: new Date(MOCK_NOW),
    },
  ]
}

function createInitialMockWorkflowRun(): WorkflowRun {
  return {
    id: MOCK_WORKFLOW_RUN_ID,
    workflowType: 'card_generation',
    presetId: 'm3-card-production-line',
    status: 'waiting_confirmation',
    threadId: 'card-generation:mock',
    checkpointRef: 'waiting_confirmation',
    approvalPayload: {
      documentId: MOCK_DOCUMENT_ID,
      documentTitle: mockDocument.title,
      phase: 'waiting_confirmation',
      generationMode: 'llm',
      fallbackReason: null,
      chunkCursor: 1,
      totalChunks: 1,
      generatedCount: 2,
      duplicateCount: 0,
      pendingCount: 2,
      acceptedCount: 0,
      rejectedCount: 0,
    },
    costUsd: null,
    errorMessage: null,
    startedAt: new Date(MOCK_NOW),
    finishedAt: null,
    createdAt: new Date(MOCK_NOW),
    updatedAt: new Date(MOCK_NOW),
  }
}

function createInitialMockWorkflowEvents(): WorkflowEvent[] {
  return [
    {
      runId: MOCK_WORKFLOW_RUN_ID,
      eventType: 'waiting_confirmation',
      message: '候选已生成，等待人工确认',
      progress: 1,
      payload: null,
      createdAt: new Date(MOCK_NOW),
    },
  ]
}

function createInitialMockReviewLogs(): ReviewLog[] {
  return [
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      cardId: MOCK_CARD_IDS[0],
      rating: 'good',
      reviewedAt: new Date(MOCK_NOW),
      state: 'review',
      difficulty: 0.28,
      stability: 4.2,
      retrievability: 0.9,
      nextReview: new Date(new Date(MOCK_NOW).getTime() + 4 * 86_400_000),
      intervalDays: 4,
    },
  ]
}

function createInitialMockPointsLedger(): PointsEntry[] {
  return []
}

function createInitialMockBasicCardGroups(): BasicCardGroup[] {
  return [
    {
      id: MOCK_BASIC_GROUP_IDS[0],
      name: '文献摘记',
      description: '从论文和书页中手工沉淀的基础卡片。',
      color: '#3B82F6',
      isEnabled: true,
      cardCount: 1,
      createdAt: new Date(MOCK_NOW),
      updatedAt: new Date(MOCK_NOW),
      deletedAt: null,
    },
    {
      id: MOCK_BASIC_GROUP_IDS[1],
      name: '方法论',
      description: '通用学习方法与工作流经验。',
      color: '#14B8A6',
      isEnabled: false,
      cardCount: 1,
      createdAt: new Date(MOCK_NOW),
      updatedAt: new Date(MOCK_NOW),
      deletedAt: null,
    },
  ]
}

function createInitialMockBasicCards(): BasicCard[] {
  return [
    {
      id: MOCK_BASIC_CARD_IDS[0],
      groupId: MOCK_BASIC_GROUP_IDS[0],
      groupName: '文献摘记',
      title: '稳定锚点',
      front: '为什么阅读器中的来源锚点需要稳定？',
      back: '因为卡片要能长期回跳到原文位置，漂移后引用链会失效。',
      tags: ['reader', 'memory'],
      origin: 'manual',
      source: {
        documentId: MOCK_DOCUMENT_ID,
        documentTitle: mockDocument.title,
        anchorId: MOCK_ANCHOR_IDS[0],
        page: 1,
        quote: mockAnchors[0].textQuote,
      },
      createdAt: new Date(MOCK_NOW),
      updatedAt: new Date(MOCK_NOW),
      deletedAt: null,
    },
    {
      id: MOCK_BASIC_CARD_IDS[1],
      groupId: MOCK_BASIC_GROUP_IDS[1],
      groupName: '方法论',
      title: '软删除策略',
      front: '为什么卡片系统要优先使用软删除？',
      back: '因为它能保留审计轨迹，并降低误删后不可恢复的风险。',
      tags: ['crud', 'mvp0'],
      origin: 'manual',
      source: {
        documentId: null,
        documentTitle: null,
        anchorId: null,
        page: null,
        quote: null,
      },
      createdAt: new Date(MOCK_NOW),
      updatedAt: new Date(MOCK_NOW),
      deletedAt: null,
    },
  ]
}

function createInitialMockStudyStates(): Record<string, MockStudyState> {
  return {
    [MOCK_BASIC_CARD_IDS[0]]: {
      state: 'new',
      dueAt: new Date('2026-04-17T08:00:00.000Z'),
    },
    [MOCK_BASIC_CARD_IDS[1]]: {
      state: 'review',
      dueAt: new Date('2026-04-17T07:00:00.000Z'),
    },
  }
}

function createInitialMockStudyEvents(): MockStudyEvent[] {
  return [
    {
      cardId: MOCK_BASIC_CARD_IDS[0],
      groupId: MOCK_BASIC_GROUP_IDS[0],
      rating: 'good',
      startedAt: new Date('2026-04-16T08:58:00.000Z'),
      answeredAt: new Date('2026-04-16T09:00:30.000Z'),
      durationMs: 150_000,
    },
  ]
}

const mockCards: Card[] = createInitialMockCards()
const mockBasicCardGroups: BasicCardGroup[] = createInitialMockBasicCardGroups()
const mockBasicCards: BasicCard[] = createInitialMockBasicCards()
const mockBackgroundJobs: BackgroundJob[] = []
let mockStudyStates: Record<string, MockStudyState> = createInitialMockStudyStates()
const mockStudyEvents: MockStudyEvent[] = createInitialMockStudyEvents()
const mockCardMedia: CardMedia[] = []
const mockCardCandidates: CardCandidate[] = createInitialMockCardCandidates()
const mockWorkflowRuns: WorkflowRun[] = [createInitialMockWorkflowRun()]
const mockWorkflowEvents: WorkflowEvent[] = createInitialMockWorkflowEvents()
const mockReviewLogs: ReviewLog[] = createInitialMockReviewLogs()
const mockPointsLedger: PointsEntry[] = createInitialMockPointsLedger()
const mockPodcastEpisodes: PodcastEpisode[] = [createMockPodcastEpisode()]
const mockPodcastAudioSegments: AudioSegment[] =
  createMockPodcastAudioSegments(MOCK_PODCAST_EPISODE_ID)

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
    note: null,
    pageCardIndex: 0,
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
    note: null,
    pageCardIndex: 1,
    createdAt: new Date(MOCK_NOW),
  },
]

const defaultMockAppSettings: AppSettings = {
  theme: 'light',
  language: 'zh-CN',
  dailyNewCardLimit: 20,
  reviewTimeLimit: 30,
  learningGoal: 'knowledge_understanding',
  dailyStudyMinutes: 30,
  studyTimePreference: 'evening',
  studyTimePreferences: ['afternoon', 'evening'],
  studyContentPreferences: ['psychology', 'cognitive_science', 'self_improvement', 'education'],
  contentDifficultyPreference: 'intermediate',
  podcastTtsProvider: 'auto',
  podcastOpenaiModel: 'tts-1',
  podcastGoogleTtsModel: 'gemini-2.5-flash-preview-tts',
  podcastFishAudioEndpoint: null,
  podcastVoiceOverrides: {},
  defaultVoice: 'gentle_female_xiaoxiao',
  speechRate: 1,
  speechPitch: 0,
  speechVolume: 0.8,
  readingMode: 'natural',
  defaultPodcastStyle: 'lecture',
  podcastEpisodeDurationMinutes: 15,
  podcastContentStructure: 'summary_then_details',
  podcastBackgroundMusic: 'soft_piano',
  podcastIntroOutroEnabled: true,
  voiceInputLanguage: 'zh-CN',
  voiceInterruptEnabled: true,
  podcastAutoPlayNextEpisode: true,
  podcastOutputFormat: 'mp3',
  podcastSkipReview: true,
  podcastMaxLlmTokens: 100000,
  podcastMaxTtsCharacters: 50000,
  podcastMaxEstimatedCostUsd: 1,
}

let mockAppSettings: AppSettings = { ...defaultMockAppSettings }
let mockApiConfigCounter = 1
let mockModelProfileCounter = 1
let mockApiConfigs: ApiConfig[] = []
let mockModelProfiles: ModelProfile[] = []
let mockWorkflowAssignments: WorkflowModelAssignment[] = []
let mockProviderBudgetUsage: ProviderBudgetUsage[] = []

const MOCK_WORKFLOW_TYPES: WorkflowType[] = [
  'card_generation',
  'document_embedding',
  'knowledge_qa',
]

function normalizeMockApiProvider(provider: ApiConfig['provider']): ApiConfig['provider'] {
  return provider === 'openai_compatible' ? 'custom_openai' : provider
}

function createMockModelCapabilities(
  overrides: Partial<DiscoveredModel['capabilities']> = {}
): DiscoveredModel['capabilities'] {
  return {
    vision: true,
    functionCalling: true,
    maxContext: 128000,
    streaming: true,
    jsonMode: true,
    ...overrides,
  }
}

function getMockProviderModels(provider: ApiConfig['provider']): DiscoveredModel[] {
  switch (provider) {
    case 'openai':
      return [
        {
          id: 'gpt-4o',
          displayName: 'GPT-4o',
          source: 'fetched',
          capabilities: createMockModelCapabilities(),
          isRecommended: true,
        },
        {
          id: 'gpt-4o-mini',
          displayName: 'GPT-4o Mini',
          source: 'fetched',
          capabilities: createMockModelCapabilities(),
          isRecommended: false,
        },
      ]
    case 'anthropic':
    case 'custom_anthropic':
      return [
        {
          id: 'claude-sonnet-4-20250514',
          displayName: 'Claude Sonnet 4',
          source: 'fetched',
          capabilities: createMockModelCapabilities({ maxContext: 200000 }),
          isRecommended: true,
        },
      ]
    case 'google':
    case 'custom_google':
      return [
        {
          id: 'gemini-2.5-pro',
          displayName: 'Gemini 2.5 Pro',
          source: 'fetched',
          capabilities: createMockModelCapabilities({ maxContext: 1048576 }),
          isRecommended: true,
        },
        {
          id: 'gemini-embedding-001',
          displayName: 'Gemini Embedding 001',
          source: 'fetched',
          capabilities: createMockModelCapabilities({
            vision: false,
            functionCalling: false,
            maxContext: 8192,
            jsonMode: false,
          }),
          isRecommended: false,
        },
      ]
    case 'deepseek':
      return [
        {
          id: 'deepseek-chat',
          displayName: 'DeepSeek Chat',
          source: 'fetched',
          capabilities: createMockModelCapabilities(),
          isRecommended: true,
        },
        {
          id: 'deepseek-reasoner',
          displayName: 'DeepSeek Reasoner',
          source: 'fetched',
          capabilities: createMockModelCapabilities({
            vision: false,
            functionCalling: false,
            jsonMode: false,
          }),
          isRecommended: false,
        },
      ]
    case 'openai_compatible':
    case 'custom_openai':
      return [
        {
          id: 'custom-chat-model',
          displayName: 'Custom Chat Model',
          source: 'fetched',
          capabilities: createMockModelCapabilities(),
          isRecommended: true,
        },
      ]
    default:
      return []
  }
}

function currentMockBudgetPeriod() {
  return MOCK_NOW.slice(0, 7)
}

function nextMockModelProfileId() {
  const suffix = mockModelProfileCounter.toString(16).padStart(12, '0')
  mockModelProfileCounter += 1
  return `aaaaaaaa-aaaa-4aaa-8aaa-${suffix}`
}

function buildMockModelProfile(
  apiConfigId: string,
  modelId: string,
  displayName?: string | null,
  isDefaultForConnection = true,
  createdAt = new Date(MOCK_NOW)
): ModelProfile {
  return {
    id: nextMockModelProfileId(),
    apiConfigId,
    modelId,
    displayName: displayName ?? modelId,
    capabilitiesJson: '[]',
    isEnabled: true,
    isDefaultForConnection,
    createdAt,
    updatedAt: createdAt,
    apiConfig: mockApiConfigs.find((config) => config.id === apiConfigId) ?? null,
  }
}

function buildMockWorkflowAssignment(
  workflowType: WorkflowType,
  modelProfileId: string,
  assignedAt = new Date(MOCK_NOW)
): WorkflowModelAssignment {
  const modelProfile = mockModelProfiles.find((profile) => profile.id === modelProfileId) ?? null
  return {
    workflowType,
    modelProfileId,
    assignedAt,
    updatedAt: assignedAt,
    modelProfile,
    apiConfig: mockApiConfigs.find((config) => config.id === modelProfile?.apiConfigId) ?? null,
  }
}

function buildMockBudgetUsage(
  apiConfigId: string,
  period = currentMockBudgetPeriod()
): ProviderBudgetUsage {
  return {
    id: apiConfigId,
    apiConfigId,
    period,
    estimatedCostUsd: 0,
    workflowRunsCount: 0,
    updatedAt: new Date(MOCK_NOW),
  }
}

function inferMockProtocol(provider: ApiConfig['provider']): ApiConfig['protocol'] {
  const normalizedProvider = normalizeMockApiProvider(provider)

  if (
    normalizedProvider === 'openai' ||
    normalizedProvider === 'anthropic' ||
    normalizedProvider === 'google' ||
    normalizedProvider === 'custom_anthropic' ||
    normalizedProvider === 'custom_google'
  ) {
    return 'native'
  }

  return 'openai-compatible'
}

export function resetMockGatewayState() {
  mockAppSettings = { ...defaultMockAppSettings }
  mockApiConfigCounter = 1
  mockModelProfileCounter = 1
  mockApiConfigs = []
  mockModelProfiles = []
  mockWorkflowAssignments = []
  mockProviderBudgetUsage = []
  mockBasicCardGroups.splice(0, mockBasicCardGroups.length, ...createInitialMockBasicCardGroups())
  mockBasicCards.splice(0, mockBasicCards.length, ...createInitialMockBasicCards())
  mockBackgroundJobs.splice(0, mockBackgroundJobs.length)
  mockStudyStates = createInitialMockStudyStates()
  mockStudyEvents.splice(0, mockStudyEvents.length, ...createInitialMockStudyEvents())
  mockCards.splice(0, mockCards.length, ...createInitialMockCards())
  mockCardMedia.splice(0, mockCardMedia.length)
  mockCardCandidates.splice(0, mockCardCandidates.length, ...createInitialMockCardCandidates())
  mockWorkflowRuns.splice(0, mockWorkflowRuns.length, createInitialMockWorkflowRun())
  mockWorkflowEvents.splice(0, mockWorkflowEvents.length, ...createInitialMockWorkflowEvents())
  mockReviewLogs.splice(0, mockReviewLogs.length, ...createInitialMockReviewLogs())
  mockPointsLedger.splice(0, mockPointsLedger.length, ...createInitialMockPointsLedger())
  mockPodcastEpisodes.splice(0, mockPodcastEpisodes.length, createMockPodcastEpisode())
  mockPodcastAudioSegments.splice(
    0,
    mockPodcastAudioSegments.length,
    ...createMockPodcastAudioSegments(MOCK_PODCAST_EPISODE_ID)
  )
  mockHighlights.splice(
    0,
    mockHighlights.length,
    {
      id: MOCK_HIGHLIGHT_IDS[0],
      cardId: MOCK_CARD_IDS[0],
      documentId: MOCK_DOCUMENT_ID,
      anchorId: MOCK_ANCHOR_IDS[0],
      pageNumber: 1,
      rectangles: [normalizedRect(72, 118, 356, 18)],
      textContent: mockAnchors[0].textQuote,
      color: '#F8E16C',
      note: null,
      pageCardIndex: 0,
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
      note: null,
      pageCardIndex: 1,
      createdAt: new Date(MOCK_NOW),
    }
  )
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
  const workflowRunId = getString(args?.runId) ?? getString(args?.workflowRunId)
  const pageNumber = getNumber(filters?.pageNumber)
  const anchorId = getString(filters?.anchorId)
  const cardId = getString(filters?.cardId)
  const jobId = getString(args?.jobId)
  const candidateStatus = getCandidateStatus(args?.status) ?? getCandidateStatus(filters?.status)
  const pointsData = getRecord(args?.data)
  const reviewLogId = getString(pointsData?.reviewLogId)

  if (cmd === 'get_dashboard_summary') {
    return buildDashboardSummary(getNumber(args?.days) ?? 63, getNumber(args?.limit) ?? 6) as T
  }

  if (cmd === 'list_library_documents') {
    return limitItems([buildMockLibraryItem(mockDocument)].map(serializeLibraryItem), limit) as T
  }

  if (cmd === 'get_daily_queue') {
    const newLimit = Math.max(0, getNumber(args?.newLimit) ?? 20)
    const reviewLimit = Math.max(0, getNumber(args?.reviewLimit) ?? 100)
    const now = new Date()

    const queue = buildMockStudyQueueItems(now)
    const selected = [
      ...queue.filter((item) => item.state === 'new').slice(0, newLimit),
      ...queue.filter((item) => item.state !== 'new').slice(0, reviewLimit),
    ].sort((left, right) => {
      const dueDiff = left.dueAt.getTime() - right.dueAt.getTime()
      if (dueDiff !== 0) {
        return dueDiff
      }
      return left.title.localeCompare(right.title, 'zh-CN')
    })

    return selected.map(serializeStudyQueueItem) as T
  }

  if (cmd === 'submit_study_review') {
    const data = getRecord(args?.data)
    const cardId = getString(data?.cardId)
    const rating = getReviewRating(data?.rating)

    if (!cardId || !rating) {
      throw new Error('无效复习反馈档位')
    }

    const card = mockBasicCards.find((item) => item.id === cardId && !item.deletedAt)
    if (!card) {
      throw new Error('卡片不存在')
    }

    const current = getMockStudyState(card)
    const result = computeMockStudyReviewResult(current.state, rating, new Date())

    mockStudyStates[card.id] = {
      state: result.newState,
      dueAt: result.nextDueAt,
    }
    mockStudyEvents.unshift({
      cardId: card.id,
      groupId: card.groupId,
      rating,
      startedAt: getDate(data?.startedAt),
      answeredAt: currentMockNow(),
      durationMs: getNumber(data?.durationMs) ?? null,
    })

    return serializeStudyReviewResult(result) as T
  }

  if (cmd === 'list_basic_card_groups') {
    const includeDeleted = Boolean(args?.includeDeleted)
    return mockBasicCardGroups
      .filter((group) => includeDeleted || !group.deletedAt)
      .map(serializeBasicCardGroup)
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime()) as T
  }

  if (cmd === 'create_basic_card_group') {
    const data = getRecord(args?.data)
    const name = getString(data?.name)?.trim()
    if (!name) {
      throw new Error('Mock create_basic_card_group requires a non-empty name')
    }

    const now = new Date()
    const group: BasicCardGroup = {
      id: crypto.randomUUID(),
      name,
      description: getString(data?.description)?.trim() ?? null,
      color: getString(data?.color)?.trim() ?? null,
      isEnabled: true,
      cardCount: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }

    mockBasicCardGroups.unshift(group)
    return serializeBasicCardGroup(group) as T
  }

  if (cmd === 'update_basic_card_group') {
    const data = getRecord(args?.data)
    const id = getString(args?.id)
    const group = id ? mockBasicCardGroups.find((item) => item.id === id && !item.deletedAt) : null
    const name = getString(data?.name)?.trim()

    if (!group || !name) {
      return null as T
    }

    group.name = name
    group.description = getString(data?.description)?.trim() ?? null
    group.color = getString(data?.color)?.trim() ?? null
    group.updatedAt = new Date()
    syncMockBasicGroupCounts()
    return serializeBasicCardGroup(group) as T
  }

  if (cmd === 'set_basic_card_group_enabled') {
    const id = getString(args?.id)
    const group = id ? mockBasicCardGroups.find((item) => item.id === id && !item.deletedAt) : null
    if (!group) {
      return null as T
    }

    group.isEnabled = Boolean(args?.isEnabled)
    group.updatedAt = new Date()
    return serializeBasicCardGroup(group) as T
  }

  if (cmd === 'delete_basic_card_group') {
    const id = getString(args?.id)
    const group = id ? mockBasicCardGroups.find((item) => item.id === id && !item.deletedAt) : null
    if (!group) {
      return undefined as T
    }

    if (mockBasicCards.some((card) => card.groupId === group.id && !card.deletedAt)) {
      throw new Error('分组下仍有未删除卡片，请先移动或删除这些卡片')
    }

    group.deletedAt = new Date()
    group.updatedAt = new Date()
    return undefined as T
  }

  if (cmd === 'list_basic_cards') {
    const groupIdFilter = getString(filters?.groupId)
    const sourceDocumentFilter = getString(filters?.sourceDocumentId)
    const searchQuery = getString(filters?.searchQuery)?.trim().toLowerCase() ?? ''
    const includeDeleted = Boolean(filters?.includeDeleted)
    const tags = Array.isArray(filters?.tags)
      ? filters.tags
          .filter((value): value is string => typeof value === 'string')
          .map((value) => value.trim().toLowerCase())
          .filter(Boolean)
      : []

    return mockBasicCards
      .filter((card) => includeDeleted || !card.deletedAt)
      .filter((card) => (groupIdFilter ? card.groupId === groupIdFilter : true))
      .filter((card) =>
        sourceDocumentFilter ? card.source.documentId === sourceDocumentFilter : true
      )
      .filter((card) =>
        searchQuery
          ? [card.title, card.front, card.back].some((value) =>
              value.toLowerCase().includes(searchQuery)
            )
          : true
      )
      .filter((card) =>
        tags.length > 0
          ? tags.every((tag) => card.tags.some((candidate) => candidate.toLowerCase() === tag))
          : true
      )
      .map(serializeBasicCard)
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime()) as T
  }

  if (cmd === 'create_basic_card') {
    const data = getRecord(args?.data)
    const groupId = getString(data?.groupId)
    const title = getString(data?.title)?.trim()
    const front = getString(data?.front)?.trim()
    const back = getString(data?.back)?.trim()
    const group = groupId
      ? mockBasicCardGroups.find((item) => item.id === groupId && !item.deletedAt)
      : null

    if (!group || !title || !front || !back) {
      throw new Error(
        'Mock create_basic_card requires a valid group and non-empty title/front/back'
      )
    }

    if (
      mockBasicCards.some(
        (card) =>
          !card.deletedAt && card.groupId === group.id && card.front === front && card.back === back
      )
    ) {
      throw new Error('同一分组内已存在相同的 front/back 卡片')
    }

    const sourceDocumentId = getString(data?.sourceDocumentId) ?? null
    const sourceDocument = sourceDocumentId
      ? (documentsForMocks().find((document) => document.id === sourceDocumentId) ?? null)
      : null
    const anchorId = getString(data?.sourceAnchorId) ?? null
    const anchor = anchorId ? (mockAnchors.find((item) => item.id === anchorId) ?? null) : null
    const now = new Date()
    const card: BasicCard = {
      id: crypto.randomUUID(),
      groupId: group.id,
      groupName: group.name,
      title,
      front,
      back,
      tags: normalizeMockTags(data?.tags),
      origin: 'manual',
      source: {
        documentId: anchor?.documentId ?? sourceDocument?.id ?? null,
        documentTitle: sourceDocument?.title ?? null,
        anchorId: anchor?.id ?? null,
        page: anchor?.page ?? null,
        quote: anchor?.textQuote ?? null,
      },
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }

    mockBasicCards.unshift(card)
    mockStudyStates[card.id] = {
      state: 'new',
      dueAt: new Date(now),
    }
    syncMockBasicGroupCounts()
    return serializeBasicCard(card) as T
  }

  if (cmd === 'update_basic_card') {
    const data = getRecord(args?.data)
    const id = getString(args?.id)
    const card = id ? mockBasicCards.find((item) => item.id === id && !item.deletedAt) : null
    const groupId = getString(data?.groupId)
    const title = getString(data?.title)?.trim()
    const front = getString(data?.front)?.trim()
    const back = getString(data?.back)?.trim()
    const group = groupId
      ? mockBasicCardGroups.find((item) => item.id === groupId && !item.deletedAt)
      : null

    if (!card || !group || !title || !front || !back) {
      return null as T
    }

    if (
      mockBasicCards.some(
        (candidate) =>
          candidate.id !== card.id &&
          !candidate.deletedAt &&
          candidate.groupId === group.id &&
          candidate.front === front &&
          candidate.back === back
      )
    ) {
      throw new Error('同一分组内已存在相同的 front/back 卡片')
    }

    const sourceDocumentId = getString(data?.sourceDocumentId) ?? null
    const sourceDocument = sourceDocumentId
      ? (documentsForMocks().find((document) => document.id === sourceDocumentId) ?? null)
      : null
    const anchorId = getString(data?.sourceAnchorId) ?? null
    const anchor = anchorId ? (mockAnchors.find((item) => item.id === anchorId) ?? null) : null

    card.groupId = group.id
    card.groupName = group.name
    card.title = title
    card.front = front
    card.back = back
    card.tags = normalizeMockTags(data?.tags)
    card.source = {
      documentId: anchor?.documentId ?? sourceDocument?.id ?? null,
      documentTitle: sourceDocument?.title ?? null,
      anchorId: anchor?.id ?? null,
      page: anchor?.page ?? null,
      quote: anchor?.textQuote ?? null,
    }
    card.updatedAt = new Date()
    syncMockBasicGroupCounts()
    return serializeBasicCard(card) as T
  }

  if (cmd === 'delete_basic_card') {
    const id = getString(args?.id)
    const card = id ? mockBasicCards.find((item) => item.id === id && !item.deletedAt) : null
    if (card) {
      card.deletedAt = new Date()
      card.updatedAt = new Date()
      syncMockBasicGroupCounts()
    }
    return undefined as T
  }

  if (cmd === 'delete_basic_cards') {
    const ids = Array.isArray(args?.ids)
      ? args.ids.filter((value): value is string => typeof value === 'string')
      : []
    for (const id of ids) {
      const card = mockBasicCards.find((item) => item.id === id)
      if (!card) {
        throw new Error('卡片不存在')
      }
      if (!card.deletedAt) {
        card.deletedAt = new Date()
        card.updatedAt = new Date()
      }
    }
    syncMockBasicGroupCounts()
    return undefined as T
  }

  if (cmd === 'start_ai_card_generation') {
    const data = getRecord(args?.data)
    const now = new Date()
    const job: BackgroundJob = {
      id: crypto.randomUUID(),
      jobType: 'ai_card_generation',
      status: 'queued',
      targetType: 'document',
      targetId: getString(data?.documentId) ?? MOCK_DOCUMENT_ID,
      payloadJson: JSON.stringify({
        documentId: getString(data?.documentId) ?? MOCK_DOCUMENT_ID,
        groupId: getString(data?.groupId) ?? MOCK_BASIC_GROUP_IDS[0],
        pageStart: getNumber(data?.pageStart) ?? null,
        pageEnd: getNumber(data?.pageEnd) ?? null,
        density: data?.density === 'low' || data?.density === 'high' ? data.density : 'medium',
        providerConfigId: getString(data?.providerConfigId) ?? '',
      }),
      resultJson: null,
      errorMessage: null,
      errorDetails: null,
      progressCurrent: 0,
      progressTotal: null,
      progressMessage: 'AI card generation queued',
      createdAt: now,
      startedAt: null,
      finishedAt: null,
      cancelRequestedAt: null,
    }
    mockBackgroundJobs.unshift(job)
    return serializeBackgroundJob(job) as T
  }

  if (cmd === 'resume_ai_card_generation') {
    const job = jobId ? mockBackgroundJobs.find((item) => item.id === jobId) : null
    if (!job) {
      throw new Error('AI card generation job not found')
    }
    if (job.jobType !== 'ai_card_generation') {
      throw new Error('Background job is not an AI card generation job')
    }
    if (job.status !== 'failed') {
      throw new Error('Only failed AI card generation jobs can be resumed')
    }
    job.status = 'queued'
    job.resultJson = null
    job.errorMessage = null
    job.errorDetails = null
    job.progressMessage = 'AI card generation queued for resume'
    job.startedAt = null
    job.finishedAt = null
    job.cancelRequestedAt = null
    return serializeBackgroundJob(job) as T
  }

  if (cmd === 'list_background_jobs') {
    const jobType = getString(args?.jobType)
    const status = getString(args?.status)
    const targetType = getString(args?.targetType)
    const targetId = getString(args?.targetId)
    return mockBackgroundJobs
      .filter((job) => (jobType ? job.jobType === jobType : true))
      .filter((job) => (status ? job.status === status : true))
      .filter((job) => (targetType ? job.targetType === targetType : true))
      .filter((job) => (targetId ? job.targetId === targetId : true))
      .map(serializeBackgroundJob) as T
  }

  if (cmd === 'get_background_job') {
    const job = jobId ? mockBackgroundJobs.find((item) => item.id === jobId) : null
    return (job ? serializeBackgroundJob(job) : null) as T
  }

  if (cmd === 'cancel_background_job') {
    const job = jobId ? mockBackgroundJobs.find((item) => item.id === jobId) : null
    if (!job) {
      throw new Error('任务不存在')
    }
    if (job.status === 'queued' || job.status === 'running') {
      job.status = 'cancelled'
      job.cancelRequestedAt = new Date()
      job.finishedAt = new Date()
      job.progressMessage = '任务已取消'
    }
    return serializeBackgroundJob(job) as T
  }

  if (cmd === 'start_card_animation_workflow') {
    const data = getRecord(args?.data)
    const mode =
      data?.mode === 'video_render' || data?.mode === 'quick_preview' ? data.mode : 'quick_preview'
    const animType =
      data?.animType === 'keyword_emphasis' || data?.animType === 'flashcard_reveal'
        ? data.animType
        : 'flashcard_reveal'
    const cardId = getString(data?.cardId) ?? MOCK_CARD_IDS[0]

    return createMockCardAnimation({
      id: `anim-${crypto.randomUUID()}`,
      runId: `run-${crypto.randomUUID()}`,
      cardId,
      animType,
      mode,
      videoPath: mode === 'video_render' ? `mock://animations/${cardId}/video.mp4` : null,
      posterPath: mode === 'video_render' ? `mock://animations/${cardId}/poster.png` : null,
      renderLogPath: mode === 'video_render' ? `mock://animations/${cardId}/render.log` : null,
    }) as T
  }

  if (cmd === 'get_card_animation') {
    const requestedCardId = getString(args?.cardId) ?? MOCK_CARD_IDS[0]
    return createMockCardAnimation({ cardId: requestedCardId }) as T
  }

  if (cmd === 'delete_card_animation') {
    return undefined as T
  }

  if (cmd === 'start_podcast_workflow') {
    const data = getRecord(args?.data)
    const documentIds = Array.isArray(data?.documentIds)
      ? data.documentIds.filter((value): value is string => typeof value === 'string')
      : [MOCK_DOCUMENT_ID]
    const prompt = getString(data?.prompt)?.trim() ?? ''
    const title = prompt || 'AI 学习播客'
    const style = getPodcastStyle(data?.style) ?? 'interview'
    const language = getPodcastLanguage(data?.language) ?? 'zh-CN'
    const durationTier = getPodcastDurationTier(data?.durationTier) ?? 'medium'
    const ttsProvider = getTtsProviderId(data?.ttsProvider) ?? 'auto'
    const audioFormat = getAudioFormat(data?.audioFormat) ?? 'mp3'
    const episodeId = `podcast-${crypto.randomUUID()}`
    const runId = `run-${crypto.randomUUID()}`
    const episode = createMockPodcastEpisode({
      id: episodeId,
      documentIds,
      runId,
      title,
      scopeDescription: prompt,
      style,
      language,
      durationTier,
      ttsProvider,
      audioFormat,
      stageKey: 'ready',
    })

    mockPodcastEpisodes.unshift(episode)
    mockPodcastAudioSegments.push(...createMockPodcastAudioSegments(episodeId))
    return episode as T
  }

  if (cmd === 'get_podcast_episode') {
    const episodeId = getString(args?.episodeId)
    const episode = episodeId
      ? (mockPodcastEpisodes.find((item) => item.id === episodeId) ?? null)
      : null
    return episode as T
  }

  if (cmd === 'list_podcast_episodes') {
    return [...mockPodcastEpisodes] as T
  }

  if (cmd === 'cancel_podcast_episode') {
    const episodeId = getString(args?.episodeId)
    const episode = episodeId ? mockPodcastEpisodes.find((item) => item.id === episodeId) : null
    if (episode) {
      episode.status = 'cancelled'
      episode.stageKey = 'cancelled'
      episode.errorMessage = 'User cancelled'
      episode.errorCode = 'USER_CANCELLED'
      episode.errorStage = episode.currentStage >= 5 ? 'audio' : 'retrieval'
      episode.retryable = true
      episode.updatedAt = new Date(MOCK_NOW).toISOString()
    }
    return undefined as T
  }

  if (cmd === 'delete_podcast_episode') {
    const episodeId = getString(args?.episodeId)
    if (episodeId) {
      const episodeIndex = mockPodcastEpisodes.findIndex((item) => item.id === episodeId)
      if (episodeIndex >= 0) {
        mockPodcastEpisodes.splice(episodeIndex, 1)
      }
      for (let index = mockPodcastAudioSegments.length - 1; index >= 0; index -= 1) {
        if (mockPodcastAudioSegments[index].episodeId === episodeId) {
          mockPodcastAudioSegments.splice(index, 1)
        }
      }
    }
    return undefined as T
  }

  if (cmd === 'retry_podcast_episode') {
    const episodeId = getString(args?.episodeId)
    const original = episodeId
      ? (mockPodcastEpisodes.find((item) => item.id === episodeId) ?? null)
      : null
    const retried = createMockPodcastEpisode({
      id: `podcast-${crypto.randomUUID()}`,
      runId: `run-${crypto.randomUUID()}`,
      documentIds: original?.documentIds ?? [MOCK_DOCUMENT_ID],
      title: original?.title ?? 'AI 学习播客',
      scopeDescription: original?.scopeDescription ?? '',
      style: original?.style ?? 'interview',
      language: original?.language ?? 'zh-CN',
      durationTier: original?.durationTier ?? 'medium',
      ttsProvider: original?.ttsProvider ?? 'auto',
      audioFormat: original?.audioFormat ?? 'mp3',
      stageKey: 'ready',
    })
    mockPodcastEpisodes.unshift(retried)
    mockPodcastAudioSegments.push(...createMockPodcastAudioSegments(retried.id))
    return retried as T
  }

  if (cmd === 'review_podcast_script') {
    const episodeId = getString(args?.episodeId)
    const action = getPodcastReviewAction(args?.action)
    const editedScriptJson = getString(args?.editedScriptJson)
    const episode = episodeId ? mockPodcastEpisodes.find((item) => item.id === episodeId) : null
    if (!episode || !action) {
      return null as T
    }

    if (action === 'reject') {
      episode.status = 'cancelled'
      episode.stageKey = 'cancelled'
      episode.errorMessage = 'Review rejected'
      episode.errorCode = 'REVIEW_REJECTED'
      episode.errorStage = 'awaiting_review'
    } else {
      episode.status = 'ready'
      episode.stageKey = 'ready'
      episode.currentStage = 6
      episode.errorCode = null
      episode.errorStage = null
      episode.retryable = true
      if (action === 'edit' && editedScriptJson) {
        episode.scriptJson = editedScriptJson
      }
    }
    episode.updatedAt = new Date(MOCK_NOW).toISOString()
    return episode as T
  }

  if (cmd === 'get_podcast_audio_segments') {
    const episodeId = getString(args?.episodeId)
    const segments = episodeId
      ? mockPodcastAudioSegments.filter((item) => item.episodeId === episodeId)
      : []
    return segments as T
  }

  if (cmd === 'list_workflow_runs') {
    const workflowType =
      getWorkflowType(args?.workflowType) ?? getWorkflowType(filters?.workflowType)
    const status = getWorkflowRunStatus(args?.status) ?? getWorkflowRunStatus(filters?.status)
    const items = mockWorkflowRuns.filter((run) => {
      if (workflowType && run.workflowType !== workflowType) {
        return false
      }
      if (status && run.status !== status) {
        return false
      }
      return true
    })

    return limitItems(items.map(serializeWorkflowRun), limit) as T
  }

  if (cmd === 'list_workflow_events') {
    const items = mockWorkflowEvents.filter(
      (event) => !workflowRunId || event.runId === workflowRunId
    )
    return limitItems(items.map(serializeWorkflowEvent), limit) as T
  }

  if (cmd === 'list_card_candidates') {
    const items = mockCardCandidates.filter((candidate) => {
      if (documentId && candidate.documentId !== documentId) {
        return false
      }
      if (workflowRunId && candidate.workflowRunId !== workflowRunId) {
        return false
      }
      if (candidateStatus && candidate.status !== candidateStatus) {
        return false
      }
      return true
    })

    return limitItems(items.map(serializeCardCandidate), limit) as T
  }

  if (cmd === 'update_card_candidate') {
    const candidateId = getString(args?.id)
    const data = getRecord(args?.data)
    const target = candidateId ? mockCardCandidates.find((item) => item.id === candidateId) : null
    if (!target || !data) {
      return null as T
    }

    const nextFront = getString(data.front)?.trim()
    const nextBack = getString(data.back)?.trim()
    if (nextFront) target.front = nextFront
    if (nextBack) target.back = nextBack

    if (isCandidateCardType(data.cardType)) {
      target.cardType = data.cardType
    }

    if (Array.isArray(data.tags)) {
      target.tags = data.tags.filter((value): value is string => typeof value === 'string')
    }

    const nextStatus = getCandidateStatus(data.status)
    if (nextStatus) {
      target.status = nextStatus
    }

    const nextConfidence = getNumber(data.confidence)
    if (typeof nextConfidence === 'number') {
      target.confidence = nextConfidence
    }

    const nextScoreOverall = getNullableNumber(data.scoreOverall)
    if (typeof nextScoreOverall === 'number' || nextScoreOverall === null) {
      target.scoreOverall = nextScoreOverall
    }

    const nextScoreDetails = getRecord(data.scoreDetails)
    if (nextScoreDetails || data.scoreDetails === null) {
      target.scoreDetails = nextScoreDetails ?? null
    }

    const nextVisibilityBucket = getVisibilityBucket(data.visibilityBucket)
    if (typeof data.visibilityBucket !== 'undefined') {
      target.visibilityBucket = nextVisibilityBucket ?? null
    }

    const nextGenerationMode = getGenerationMode(data.generationMode)
    if (nextGenerationMode) {
      target.generationMode = nextGenerationMode
    }

    const nextFallbackReason = getNullableString(data.fallbackReason)
    if (typeof nextFallbackReason === 'string' || data.fallbackReason === null) {
      target.fallbackReason = nextFallbackReason
    }

    const nextEvaluationSummary = getNullableString(data.evaluationSummary)
    if (typeof nextEvaluationSummary === 'string' || data.evaluationSummary === null) {
      target.evaluationSummary = nextEvaluationSummary
    }

    if (Array.isArray(data.sourceChunkIds)) {
      target.sourceChunkIds = data.sourceChunkIds.filter(
        (value): value is string => typeof value === 'string'
      )
    }

    if (target.workflowRunId) {
      syncMockWorkflowRunSummary(target.workflowRunId)
      appendMockWorkflowEvent(target.workflowRunId, 'progress', '候选内容已更新', {
        candidateId: target.id,
        status: target.status,
      })
    }

    return serializeCardCandidate(target) as T
  }

  if (cmd === 'bulk_update_card_candidate_statuses') {
    const data = getRecord(args?.data)
    const targetRunId = getString(data?.workflowRunId)
    const nextStatus = getCandidateStatus(data?.status)
    if (!targetRunId || !nextStatus) {
      return 0 as T
    }

    const rawCandidateIds = Array.isArray(data?.ids)
      ? data.ids
      : Array.isArray(data?.candidateIds)
        ? data.candidateIds
        : null
    const targetIds = rawCandidateIds
      ? new Set(rawCandidateIds.filter((value): value is string => typeof value === 'string'))
      : null

    let updated = 0
    for (const candidate of mockCardCandidates) {
      if (candidate.workflowRunId !== targetRunId) {
        continue
      }
      if (targetIds && !targetIds.has(candidate.id)) {
        continue
      }

      candidate.status = nextStatus
      updated += 1
    }

    if (updated > 0) {
      syncMockWorkflowRunSummary(targetRunId)
      appendMockWorkflowEvent(targetRunId, 'progress', '候选状态已批量更新', {
        status: nextStatus,
        count: updated,
      })
    }

    return updated as T
  }

  if (cmd === 'resume_card_generation_workflow') {
    const run = workflowRunId ? mockWorkflowRuns.find((item) => item.id === workflowRunId) : null
    if (!run) {
      return null as T
    }

    run.status = 'running'
    run.checkpointRef = 'resumed'
    run.finishedAt = null
    run.updatedAt = new Date()
    syncMockWorkflowRunSummary(run.id)
    appendMockWorkflowEvent(run.id, 'started', '工作流已恢复，继续处理剩余候选', { mode: 'mock' })

    return serializeWorkflowRun(run) as T
  }

  if (cmd === 'finalize_card_generation_workflow') {
    const run = workflowRunId ? mockWorkflowRuns.find((item) => item.id === workflowRunId) : null
    if (!run) {
      return null as T
    }

    const now = new Date()
    let created = 0
    let skippedDuplicates = 0
    let rejectedCount = 0

    for (const candidate of mockCardCandidates) {
      if (candidate.workflowRunId !== run.id) {
        continue
      }

      if (candidate.status === 'rejected') {
        rejectedCount += 1
        continue
      }

      if (candidate.status !== 'accepted') {
        continue
      }

      const alreadyExists = mockCards.some(
        (card) => card.front === candidate.front && card.back === candidate.back
      )
      if (alreadyExists) {
        skippedDuplicates += 1
        continue
      }

      mockCards.unshift({
        id: crypto.randomUUID(),
        groupId: null,
        title: candidate.title,
        cardType: candidate.cardType,
        clusterId: null,
        exportGuid: crypto.randomUUID(),
        documentId: candidate.documentId,
        anchorId: candidate.anchorId,
        front: candidate.front,
        back: candidate.back,
        sourcePage: candidate.sourcePage,
        sourceParagraph: candidate.sourceParagraph,
        sourceCoordinates: null,
        tags: [...candidate.tags],
        difficulty: 0.35,
        stability: 1,
        retrievability: null,
        state: 'new',
        nextReview: null,
        createdAt: now,
        updatedAt: now,
      })
      created += 1
    }

    run.status = 'completed'
    run.checkpointRef = 'completed'
    run.finishedAt = now
    run.updatedAt = now
    syncMockWorkflowRunSummary(run.id)
    appendMockWorkflowEvent(run.id, 'completed', `已完成入库，新增 ${created} 张卡片`, {
      createdCount: created,
    })

    return {
      createdCount: created,
      skippedDuplicates,
      rejectedCount,
      run: serializeWorkflowRun(run),
    } as T
  }

  if (cmd === 'create_card') {
    const data = getRecord(args?.data)
    const front = getString(data?.front)?.trim()
    const back = getString(data?.back)?.trim()
    if (!front || !back) {
      throw new Error('Mock create_card requires non-empty front and back')
    }

    const now = new Date()
    const card: Card = {
      id: crypto.randomUUID(),
      groupId: null,
      title: null,
      cardType: isCardType(data?.cardType) ? data.cardType : 'qa',
      clusterId: null,
      exportGuid: crypto.randomUUID(),
      documentId: getString(data?.documentId) ?? null,
      anchorId: getString(data?.anchorId) ?? null,
      front,
      back,
      sourcePage: getNumber(data?.sourcePage) ?? null,
      sourceParagraph: getNumber(data?.sourceParagraph) ?? null,
      sourceCoordinates: getRecord(data?.sourceCoordinates)
        ? {
            x: getNumber(getRecord(data?.sourceCoordinates)?.x) ?? 0,
            y: getNumber(getRecord(data?.sourceCoordinates)?.y) ?? 0,
            width: getNumber(getRecord(data?.sourceCoordinates)?.width) ?? 0,
            height: getNumber(getRecord(data?.sourceCoordinates)?.height) ?? 0,
          }
        : null,
      tags: Array.isArray(data?.tags)
        ? data.tags.filter((value): value is string => typeof value === 'string')
        : [],
      difficulty: 0.3,
      stability: 1,
      retrievability: null,
      state: 'new',
      nextReview: null,
      createdAt: now,
      updatedAt: now,
    }

    mockCards.unshift(card)
    return serializeCard(card) as T
  }

  if (cmd === 'create_highlight') {
    const data = getRecord(args?.data)
    const documentIdValue = getString(data?.documentId)
    const pageValue = getNumber(data?.pageNumber)
    const textValue = getString(data?.textContent)?.trim()
    const rectangles = Array.isArray(data?.rectangles)
      ? data.rectangles
          .map((value) => getRecord(value))
          .filter((value): value is Record<string, unknown> => Boolean(value))
          .map((value) => ({
            x: getNumber(value.x) ?? 0,
            y: getNumber(value.y) ?? 0,
            width: getNumber(value.width) ?? 0,
            height: getNumber(value.height) ?? 0,
          }))
      : []

    if (!documentIdValue || !pageValue || !textValue || rectangles.length === 0) {
      throw new Error(
        'Mock create_highlight requires documentId, pageNumber, rectangles and textContent'
      )
    }

    const highlight: Highlight = {
      id: crypto.randomUUID(),
      cardId: getString(data?.cardId) ?? null,
      documentId: documentIdValue,
      anchorId: getString(data?.anchorId) ?? null,
      pageNumber: pageValue,
      rectangles,
      textContent: textValue,
      color: getString(data?.color) ?? '#F8E16C',
      note: getString(data?.note) ?? null,
      pageCardIndex: getNumber(data?.pageCardIndex) ?? null,
      createdAt: new Date(),
    }

    mockHighlights.push(highlight)
    return serializeHighlight(highlight) as T
  }

  if (cmd === 'update_card') {
    const data = getRecord(args?.data)
    const id = getString(args?.id)
    const target = id ? mockCards.find((item) => item.id === id) : null
    if (!target || !data) {
      return null as T
    }

    const nextFront = getString(data.front)?.trim()
    const nextBack = getString(data.back)?.trim()
    if (!nextFront || !nextBack) {
      throw new Error('Mock update_card requires non-empty front and back')
    }

    target.front = nextFront
    target.back = nextBack
    if (isCardType(data.cardType)) {
      target.cardType = data.cardType
    }
    if (Array.isArray(data.tags)) {
      target.tags = data.tags.filter((value): value is string => typeof value === 'string')
    }
    target.updatedAt = new Date()

    return serializeCard(target) as T
  }

  if (cmd === 'delete_card') {
    const id = getString(args?.id)
    if (id) {
      const cardIndex = mockCards.findIndex((item) => item.id === id)
      if (cardIndex >= 0) {
        mockCards.splice(cardIndex, 1)
      }

      for (let index = mockHighlights.length - 1; index >= 0; index -= 1) {
        if (mockHighlights[index]?.cardId === id) {
          mockHighlights.splice(index, 1)
        }
      }
    }
    return undefined as T
  }

  if (cmd === 'update_highlight') {
    const data = getRecord(args?.data)
    const id = getString(args?.id)
    const target = id ? mockHighlights.find((item) => item.id === id) : null

    if (!target || !data) {
      return null as T
    }

    if (data.cardId !== undefined) {
      target.cardId = getString(data.cardId) ?? null
    }
    if (data.anchorId !== undefined) {
      target.anchorId = getString(data.anchorId) ?? null
    }
    if (data.textContent !== undefined) {
      target.textContent = getString(data.textContent) ?? target.textContent
    }
    if (data.color !== undefined) {
      target.color = getString(data.color) ?? target.color
    }
    if (data.note !== undefined) {
      target.note = getString(data.note) ?? null
    }
    if (data.pageCardIndex !== undefined) {
      target.pageCardIndex = getNumber(data.pageCardIndex) ?? null
    }
    if (Array.isArray(data.rectangles)) {
      target.rectangles = data.rectangles
        .map((value) => getRecord(value))
        .filter((value): value is Record<string, unknown> => Boolean(value))
        .map((value) => ({
          x: getNumber(value.x) ?? 0,
          y: getNumber(value.y) ?? 0,
          width: getNumber(value.width) ?? 0,
          height: getNumber(value.height) ?? 0,
        }))
    }

    return serializeHighlight(target) as T
  }

  if (cmd === 'delete_highlight') {
    const id = getString(args?.id)
    if (id) {
      const index = mockHighlights.findIndex((item) => item.id === id)
      if (index >= 0) {
        mockHighlights.splice(index, 1)
      }
    }
    return undefined as T
  }

  if (cmd === 'batch_create_highlights_for_cards') {
    const data = getRecord(args?.data)
    const targetDocumentId = getString(data?.documentId)
    if (!targetDocumentId) {
      throw new Error('Mock batch_create_highlights_for_cards requires documentId')
    }

    const palette = ['#F8E16C', '#BBDEFB', '#C8E6C9', '#F8BBD9']
    const pageBuckets = new Map<number, Card[]>()
    let created = 0
    let skipped = 0
    let unlinked = 0

    for (const card of mockCards.filter((item) => item.documentId === targetDocumentId)) {
      if (mockHighlights.some((highlight) => highlight.cardId === card.id)) {
        skipped += 1
        continue
      }

      const page = card.sourcePage ?? 1
      const bucket = pageBuckets.get(page) ?? []
      bucket.push(card)
      pageBuckets.set(page, bucket)
    }

    for (const [page, bucket] of pageBuckets) {
      bucket.forEach((card, index) => {
        const anchor = card.anchorId ? mockAnchors.find((item) => item.id === card.anchorId) : null
        const rectangles = anchor?.rects.length
          ? anchor.rects
          : card.sourceCoordinates
            ? [card.sourceCoordinates]
            : []

        if (rectangles.length === 0) {
          unlinked += 1
          return
        }

        const highlight: Highlight = {
          id: crypto.randomUUID(),
          cardId: card.id,
          documentId: targetDocumentId,
          anchorId: card.anchorId,
          pageNumber: page,
          rectangles,
          textContent: anchor?.textQuote ?? card.front,
          color: palette[index % palette.length],
          note: null,
          pageCardIndex: index,
          createdAt: new Date(),
        }

        mockHighlights.push(highlight)
        created += 1
      })
    }

    return { created, skipped, unlinked } as T
  }

  if (cmd === 'export_annotated_pdf') {
    return {
      outputPath: 'mock://exports/xuejian-annotated.pdf',
      highlightCount: mockHighlights.length,
    } as T
  }

  if (cmd === 'upload_card_media') {
    const data = getRecord(args?.data)
    const targetCardId = getString(data?.cardId)
    const filePath = getString(data?.filePath)
    if (!targetCardId || !filePath) {
      throw new Error('Mock upload_card_media requires cardId and filePath')
    }

    const media: CardMedia = {
      id: crypto.randomUUID(),
      cardId: targetCardId,
      fileName: filePath.split(/[/\\]/).pop() ?? filePath,
      mimeType: inferMimeType(filePath),
      fileSize: null,
      storageKey: filePath,
      createdAt: new Date().toISOString(),
    }

    mockCardMedia.push(media)
    return media as T
  }

  if (cmd === 'list_card_media') {
    const targetCardId = getString(args?.cardId)
    return mockCardMedia.filter((item) => (targetCardId ? item.cardId === targetCardId : true)) as T
  }

  if (cmd === 'delete_card_media') {
    const id = getString(args?.id)
    if (id) {
      const index = mockCardMedia.findIndex((item) => item.id === id)
      if (index >= 0) {
        mockCardMedia.splice(index, 1)
      }
    }
    return undefined as T
  }

  if (cmd === 'import_cards_apkg') {
    const now = new Date()
    const importedCard: Card = {
      id: crypto.randomUUID(),
      groupId: null,
      title: 'Imported Mock Card',
      cardType: 'qa',
      clusterId: null,
      exportGuid: crypto.randomUUID(),
      documentId: null,
      anchorId: null,
      front: '导入的 mock APKG 卡片是什么？',
      back: '这是用于验证导入流程的 mock 数据。',
      sourcePage: null,
      sourceParagraph: null,
      sourceCoordinates: null,
      tags: ['imported', 'mock'],
      difficulty: 0.3,
      stability: 1,
      retrievability: null,
      state: 'new',
      nextReview: null,
      createdAt: now,
      updatedAt: now,
    }

    mockCards.unshift(importedCard)

    return {
      importedCount: 1,
      skippedDuplicates: 0,
      deckName: 'Mock Imported Deck',
    } as T
  }

  if (cmd === 'pick_and_export_apkg') {
    return {
      deckName: 'Mock Export Deck',
      cardCount: mockCards.length,
      outputPath: 'mock://exports/xuejian-export.apkg',
      exportedAt: new Date().toISOString(),
    } as T
  }

  if (cmd === 'pick_and_export_csv') {
    return {
      cardCount: mockCards.length,
      outputPath: 'mock://exports/xuejian-export.csv',
    } as T
  }

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
      ...(data?.learningGoal
        ? { learningGoal: data.learningGoal as AppSettings['learningGoal'] }
        : {}),
      ...(typeof data?.dailyStudyMinutes === 'number'
        ? { dailyStudyMinutes: data.dailyStudyMinutes }
        : {}),
      ...(data?.studyTimePreference
        ? { studyTimePreference: data.studyTimePreference as AppSettings['studyTimePreference'] }
        : {}),
      ...(Array.isArray(data?.studyTimePreferences)
        ? {
            studyTimePreferences: data.studyTimePreferences as AppSettings['studyTimePreferences'],
          }
        : {}),
      ...(Array.isArray(data?.studyContentPreferences)
        ? {
            studyContentPreferences:
              data.studyContentPreferences as AppSettings['studyContentPreferences'],
          }
        : {}),
      ...(data?.contentDifficultyPreference
        ? {
            contentDifficultyPreference:
              data.contentDifficultyPreference as AppSettings['contentDifficultyPreference'],
          }
        : {}),
      ...(data?.podcastTtsProvider
        ? { podcastTtsProvider: data.podcastTtsProvider as AppSettings['podcastTtsProvider'] }
        : {}),
      ...(data?.podcastOpenaiModel
        ? { podcastOpenaiModel: data.podcastOpenaiModel as string }
        : {}),
      ...(data?.podcastGoogleTtsModel
        ? { podcastGoogleTtsModel: data.podcastGoogleTtsModel as string }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(data ?? {}, 'podcastFishAudioEndpoint')
        ? { podcastFishAudioEndpoint: getNullableString(data?.podcastFishAudioEndpoint) }
        : {}),
      ...(data?.podcastVoiceOverrides && typeof data.podcastVoiceOverrides === 'object'
        ? { podcastVoiceOverrides: data.podcastVoiceOverrides as Record<string, string> }
        : {}),
      ...(data?.defaultVoice ? { defaultVoice: data.defaultVoice as string } : {}),
      ...(typeof data?.speechRate === 'number' ? { speechRate: data.speechRate } : {}),
      ...(typeof data?.speechPitch === 'number' ? { speechPitch: data.speechPitch } : {}),
      ...(typeof data?.speechVolume === 'number' ? { speechVolume: data.speechVolume } : {}),
      ...(data?.readingMode ? { readingMode: data.readingMode as AppSettings['readingMode'] } : {}),
      ...(data?.defaultPodcastStyle
        ? { defaultPodcastStyle: data.defaultPodcastStyle as AppSettings['defaultPodcastStyle'] }
        : {}),
      ...(typeof data?.podcastEpisodeDurationMinutes === 'number'
        ? { podcastEpisodeDurationMinutes: data.podcastEpisodeDurationMinutes }
        : {}),
      ...(data?.podcastContentStructure
        ? {
            podcastContentStructure:
              data.podcastContentStructure as AppSettings['podcastContentStructure'],
          }
        : {}),
      ...(data?.podcastBackgroundMusic
        ? {
            podcastBackgroundMusic:
              data.podcastBackgroundMusic as AppSettings['podcastBackgroundMusic'],
          }
        : {}),
      ...(typeof data?.podcastIntroOutroEnabled === 'boolean'
        ? { podcastIntroOutroEnabled: data.podcastIntroOutroEnabled }
        : {}),
      ...(data?.voiceInputLanguage
        ? { voiceInputLanguage: data.voiceInputLanguage as AppSettings['voiceInputLanguage'] }
        : {}),
      ...(typeof data?.voiceInterruptEnabled === 'boolean'
        ? { voiceInterruptEnabled: data.voiceInterruptEnabled }
        : {}),
      ...(typeof data?.podcastAutoPlayNextEpisode === 'boolean'
        ? { podcastAutoPlayNextEpisode: data.podcastAutoPlayNextEpisode }
        : {}),
      ...(data?.podcastOutputFormat
        ? { podcastOutputFormat: data.podcastOutputFormat as AppSettings['podcastOutputFormat'] }
        : {}),
      ...(typeof data?.podcastSkipReview === 'boolean'
        ? { podcastSkipReview: data.podcastSkipReview }
        : {}),
      ...(typeof data?.podcastMaxLlmTokens === 'number'
        ? { podcastMaxLlmTokens: data.podcastMaxLlmTokens }
        : {}),
      ...(typeof data?.podcastMaxTtsCharacters === 'number'
        ? { podcastMaxTtsCharacters: data.podcastMaxTtsCharacters }
        : {}),
      ...(typeof data?.podcastMaxEstimatedCostUsd === 'number'
        ? { podcastMaxEstimatedCostUsd: data.podcastMaxEstimatedCostUsd }
        : {}),
    }

    return mockAppSettings as T
  }

  if (cmd === 'list_api_configs') {
    return mockApiConfigs.map(serializeApiConfig) as T
  }

  if (cmd === 'get_api_config') {
    const configId = getString(args?.id)
    const config = configId ? mockApiConfigs.find((item) => item.id === configId) : null
    return (config ? serializeApiConfig(config) : null) as T
  }

  if (cmd === 'create_api_config') {
    const data = getRecord(args?.data)

    if (!isApiProvider(data?.provider) || !getString(data?.name)) {
      throw new Error('Mock create_api_config requires a valid provider and name')
    }

    const authMode = isApiAuthMode(data?.authMode) ? data.authMode : 'api_key'
    const provider = normalizeMockApiProvider(data.provider)

    const nextConfig: ApiConfig = {
      id: nextMockApiConfigId(),
      provider,
      authMode,
      name: getString(data.name)!,
      model: getNullableString(data.model),
      baseUrl: getNullableString(data.baseUrl),
      budgetLimit: getNullableNumber(data.budgetLimit),
      isDefault: getBoolean(data.isDefault) ?? false,
      isEnabled: getBoolean(data.isEnabled) ?? true,
      hasStoredCredential: authMode === 'adc',
      hasStoredKey: false,
      keyVerifiedAt: null,
      keyStatus: 'none',
      displayName: getNullableString(data.displayName),
      protocol: inferMockProtocol(provider),
      createdAt: new Date(),
    }

    if (nextConfig.isDefault) {
      mockApiConfigs = mockApiConfigs.map((config) => ({
        ...config,
        isDefault: false,
      }))
    }

    mockApiConfigs = [nextConfig, ...mockApiConfigs]
    if (nextConfig.model) {
      mockModelProfiles = [
        buildMockModelProfile(
          nextConfig.id,
          nextConfig.model,
          nextConfig.displayName ?? nextConfig.name
        ),
        ...mockModelProfiles,
      ]
    }
    return serializeApiConfig(nextConfig) as T
  }

  if (cmd === 'update_api_config') {
    const configId = getString(args?.id)
    const data = getRecord(args?.data)

    if (!configId || !data) {
      return null as T
    }

    let updatedConfig: ApiConfig | null = null
    const shouldSetDefault = getBoolean(data.isDefault) === true

    mockApiConfigs = mockApiConfigs.map((config) => {
      if (shouldSetDefault) {
        config = {
          ...config,
          isDefault: false,
        }
      }

      if (config.id !== configId) {
        return config
      }

      const nextProvider = isApiProvider(data.provider)
        ? normalizeMockApiProvider(data.provider)
        : config.provider

      const nextConfig: ApiConfig = {
        ...config,
        provider: nextProvider,
        authMode: isApiAuthMode(data.authMode) ? data.authMode : config.authMode,
        name: getString(data.name) ?? config.name,
        model: data.model === undefined ? config.model : getNullableString(data.model),
        baseUrl: data.baseUrl === undefined ? config.baseUrl : getNullableString(data.baseUrl),
        budgetLimit:
          data.budgetLimit === undefined ? config.budgetLimit : getNullableNumber(data.budgetLimit),
        isDefault: getBoolean(data.isDefault) ?? config.isDefault,
        isEnabled: getBoolean(data.isEnabled) ?? config.isEnabled,
        displayName:
          data.displayName === undefined ? config.displayName : getNullableString(data.displayName),
        protocol: inferMockProtocol(nextProvider),
      }

      nextConfig.hasStoredCredential = nextConfig.authMode === 'adc' || nextConfig.hasStoredKey

      updatedConfig = nextConfig
      return nextConfig
    })

    if (updatedConfig) {
      mockModelProfiles = mockModelProfiles.map((profile) =>
        profile.apiConfigId === updatedConfig!.id
          ? {
              ...profile,
              apiConfig: updatedConfig,
            }
          : profile
      )
    }

    return (updatedConfig ? serializeApiConfig(updatedConfig) : null) as T
  }

  if (cmd === 'set_default_api_config') {
    const configId = getString(args?.id)

    if (configId) {
      mockApiConfigs = mockApiConfigs.map((config) => ({
        ...config,
        isDefault: config.id === configId,
      }))
    }

    return undefined as T
  }

  if (cmd === 'delete_api_config') {
    const configId = getString(args?.id)

    if (configId) {
      mockApiConfigs = mockApiConfigs.filter((config) => config.id !== configId)
      const deletedProfileIds = mockModelProfiles
        .filter((profile) => profile.apiConfigId === configId)
        .map((profile) => profile.id)
      mockModelProfiles = mockModelProfiles.filter((profile) => profile.apiConfigId !== configId)
      mockWorkflowAssignments = mockWorkflowAssignments.filter(
        (assignment) => !deletedProfileIds.includes(assignment.modelProfileId)
      )
      mockProviderBudgetUsage = mockProviderBudgetUsage.filter(
        (usage) => usage.apiConfigId !== configId
      )
    }

    return undefined as T
  }

  if (cmd === 'list_model_profiles') {
    return mockModelProfiles.map(serializeModelProfile) as T
  }

  if (cmd === 'list_model_profiles_by_api_config') {
    const apiConfigId = getString(args?.apiConfigId)
    return mockModelProfiles
      .filter((profile) => !apiConfigId || profile.apiConfigId === apiConfigId)
      .map(serializeModelProfile) as T
  }

  if (cmd === 'create_model_profile') {
    const data = getRecord(args?.data)
    const apiConfigId = getString(data?.apiConfigId)
    const modelId = getString(data?.modelId)
    if (!apiConfigId || !modelId) {
      throw new Error('Mock create_model_profile requires apiConfigId and modelId')
    }

    const isDefaultForConnection = getBoolean(data?.isDefaultForConnection) ?? false
    if (isDefaultForConnection) {
      mockModelProfiles = mockModelProfiles.map((profile) =>
        profile.apiConfigId === apiConfigId
          ? { ...profile, isDefaultForConnection: false }
          : profile
      )
    }

    const created = buildMockModelProfile(
      apiConfigId,
      modelId,
      getNullableString(data?.displayName) ?? modelId,
      isDefaultForConnection,
      new Date()
    )
    created.capabilitiesJson = getNullableString(data?.capabilitiesJson) ?? '[]'
    created.isEnabled = getBoolean(data?.isEnabled) ?? true
    mockModelProfiles = [created, ...mockModelProfiles]
    return serializeModelProfile(created) as T
  }

  if (cmd === 'update_model_profile') {
    const id = getString(args?.id)
    const data = getRecord(args?.data)
    if (!id || !data) {
      return null as T
    }

    mockModelProfiles = mockModelProfiles.map((profile) => {
      if (profile.id !== id) {
        return profile
      }

      const next: ModelProfile = {
        ...profile,
        modelId: getString(data.modelId) ?? profile.modelId,
        displayName:
          data.displayName === undefined
            ? profile.displayName
            : getNullableString(data.displayName),
        capabilitiesJson:
          data.capabilitiesJson === undefined
            ? profile.capabilitiesJson
            : getNullableString(data.capabilitiesJson),
        isEnabled: getBoolean(data.isEnabled) ?? profile.isEnabled,
        isDefaultForConnection:
          getBoolean(data.isDefaultForConnection) ?? profile.isDefaultForConnection,
        updatedAt: new Date(),
      }
      return next
    })

    const resolvedUpdated =
      mockModelProfiles.find((profile): profile is ModelProfile => profile.id === id) ?? null
    if (resolvedUpdated?.isDefaultForConnection) {
      mockModelProfiles = mockModelProfiles.map((profile) =>
        profile.apiConfigId === resolvedUpdated.apiConfigId && profile.id !== resolvedUpdated.id
          ? { ...profile, isDefaultForConnection: false }
          : profile
      )
    }

    return (resolvedUpdated ? serializeModelProfile(resolvedUpdated) : null) as T
  }

  if (cmd === 'delete_model_profile') {
    const id = getString(args?.id)
    if (id) {
      mockModelProfiles = mockModelProfiles.filter((profile) => profile.id !== id)
      mockWorkflowAssignments = mockWorkflowAssignments.filter(
        (assignment) => assignment.modelProfileId !== id
      )
    }
    return undefined as T
  }

  if (cmd === 'delete_api_key') {
    const configId = getString(args?.configId)

    if (configId) {
      mockApiConfigs = mockApiConfigs.map((config) =>
        config.id === configId
          ? {
              ...config,
              hasStoredCredential: config.authMode === 'adc',
              hasStoredKey: false,
              keyVerifiedAt: null,
              keyStatus: 'none',
            }
          : config
      )
    }

    return undefined as T
  }

  if (cmd === 'store_api_key') {
    const data = getRecord(args?.data)
    const configId = getString(data?.configId)

    if (configId) {
      mockApiConfigs = mockApiConfigs.map((config) =>
        config.id === configId
          ? {
              ...config,
              hasStoredCredential: true,
              hasStoredKey: true,
              keyStatus: 'stored',
            }
          : config
      )
    }

    return undefined as T
  }

  if (cmd === 'test_api_connection') {
    const data = getRecord(args?.data)
    const provider = isApiProvider(data?.provider)
      ? normalizeMockApiProvider(data.provider)
      : 'openai'
    const authMode = isApiAuthMode(data?.authMode) ? data.authMode : 'api_key'
    const apiKey = getString(data?.apiKey)?.trim() ?? ''
    const baseUrl = getNullableString(data?.baseUrl)?.trim().replace(/\/+$/, '') ?? null

    if (authMode === 'adc') {
      return {
        success: false,
        message: `provider ${provider} 暂不支持 authMode=adc`,
      } as T
    }

    if (!apiKey) {
      return { success: false, message: '缺少 API Key。' } as T
    }

    if (provider === 'custom_openai') {
      if (!baseUrl) {
        return { success: false, message: 'Custom (OpenAI-Compatible) 需要提供 Base URL。' } as T
      }

      return {
        success: true,
        message: `Custom (OpenAI-Compatible) 配置字段完整，Base URL: ${baseUrl}`,
      } as T
    }

    return { success: true, message: '连接测试通过 (mock)' } as T
  }

  if (cmd === 'fetch_provider_models') {
    const data = getRecord(args?.data)
    const provider = isApiProvider(data?.provider)
      ? normalizeMockApiProvider(data.provider)
      : 'openai'
    return getMockProviderModels(provider) as T
  }

  if (cmd === 'list_workflow_assignments') {
    return mockWorkflowAssignments.map(serializeWorkflowAssignment) as T
  }

  if (cmd === 'get_workflow_assignment') {
    const workflowType = getWorkflowType(args?.workflowType)
    const assignment = workflowType
      ? (mockWorkflowAssignments.find((item) => item.workflowType === workflowType) ?? null)
      : null
    return (assignment ? serializeWorkflowAssignment(assignment) : null) as T
  }

  if (cmd === 'set_workflow_assignment') {
    const data = getRecord(args?.data)
    const workflowType = getWorkflowType(data?.workflowType)
    const modelProfileId = getString(data?.modelProfileId)

    if (!workflowType || !modelProfileId) {
      throw new Error('Mock set_workflow_assignment requires workflowType and modelProfileId')
    }

    const now = new Date()
    const existing = mockWorkflowAssignments.find((item) => item.workflowType === workflowType)

    if (existing) {
      existing.modelProfileId = modelProfileId
      existing.updatedAt = now
      existing.modelProfile =
        mockModelProfiles.find((profile) => profile.id === modelProfileId) ?? null
      existing.apiConfig =
        mockApiConfigs.find((config) => config.id === existing.modelProfile?.apiConfigId) ?? null
      return serializeWorkflowAssignment(existing) as T
    }

    const created = buildMockWorkflowAssignment(workflowType, modelProfileId, now)
    mockWorkflowAssignments = [created, ...mockWorkflowAssignments]
    return serializeWorkflowAssignment(created) as T
  }

  if (cmd === 'set_all_workflow_assignments') {
    const modelProfileId = getString(args?.modelProfileId)

    if (!modelProfileId) {
      return [] as T
    }

    const now = new Date()
    mockWorkflowAssignments = MOCK_WORKFLOW_TYPES.map((workflowType) => {
      const existing = mockWorkflowAssignments.find((item) => item.workflowType === workflowType)
      const modelProfile =
        mockModelProfiles.find((profile) => profile.id === modelProfileId) ?? null
      const apiConfig =
        mockApiConfigs.find((config) => config.id === modelProfile?.apiConfigId) ?? null
      return existing
        ? {
            ...existing,
            modelProfileId,
            updatedAt: now,
            modelProfile,
            apiConfig,
          }
        : buildMockWorkflowAssignment(workflowType, modelProfileId, now)
    })

    return mockWorkflowAssignments.map(serializeWorkflowAssignment) as T
  }

  if (cmd === 'delete_workflow_assignment') {
    const workflowType = getWorkflowType(args?.workflowType)
    if (workflowType) {
      mockWorkflowAssignments = mockWorkflowAssignments.filter(
        (assignment) => assignment.workflowType !== workflowType
      )
    }
    return undefined as T
  }

  if (cmd === 'get_provider_budget_usage') {
    const apiConfigId = getString(args?.apiConfigId)
    const period = getNullableString(args?.period) ?? currentMockBudgetPeriod()

    if (!apiConfigId) {
      return null as T
    }

    const usage =
      mockProviderBudgetUsage.find(
        (item) => item.apiConfigId === apiConfigId && item.period === period
      ) ?? null

    return (usage ? serializeProviderBudgetUsage(usage) : null) as T
  }

  if (cmd === 'reset_provider_budget_usage') {
    const apiConfigId = getString(args?.apiConfigId)
    const period = currentMockBudgetPeriod()

    if (apiConfigId) {
      mockProviderBudgetUsage = mockProviderBudgetUsage.filter(
        (item) => !(item.apiConfigId === apiConfigId && item.period === period)
      )
    }

    return undefined as T
  }

  if (cmd === 'record_workflow_cost') {
    const data = getRecord(args?.data)
    const apiConfigId = getString(data?.apiConfigId)
    const estimatedCostUsd = getNumber(data?.estimatedCostUsd) ?? 0

    if (!apiConfigId) {
      return undefined as T
    }

    const period = currentMockBudgetPeriod()
    const existing = mockProviderBudgetUsage.find(
      (item) => item.apiConfigId === apiConfigId && item.period === period
    )

    if (existing) {
      existing.estimatedCostUsd = Number((existing.estimatedCostUsd + estimatedCostUsd).toFixed(6))
      existing.workflowRunsCount += 1
      existing.updatedAt = new Date()
    } else {
      const created = buildMockBudgetUsage(apiConfigId, period)
      created.estimatedCostUsd = Number(estimatedCostUsd.toFixed(6))
      created.workflowRunsCount = 1
      created.updatedAt = new Date()
      mockProviderBudgetUsage = [created, ...mockProviderBudgetUsage]
    }

    return undefined as T
  }

  if (cmd === 'list_due_cards') {
    return limitItems(mockCards.filter((card) => isDueCard(card)).map(serializeCard), limit) as T
  }

  if (cmd === 'update_card_review') {
    const id = getString(args?.id)
    const data = getRecord(args?.data)
    const target = id ? mockCards.find((item) => item.id === id) : null
    if (!target || !data) {
      return undefined as T
    }

    const difficulty = getNumber(data.difficulty)
    const stability = getNumber(data.stability)
    const retrievability = getNullableNumber(data.retrievability)
    const nextReview = getDate(data.nextReview)
    const nextState = getReviewState(data.state)

    if (typeof difficulty === 'number') target.difficulty = difficulty
    if (typeof stability === 'number') target.stability = stability
    if (typeof retrievability === 'number' || data.retrievability === null) {
      target.retrievability = retrievability
    }
    if (nextState) target.state = nextState
    if (nextReview || data.nextReview === null) {
      target.nextReview = nextReview
    }
    target.updatedAt = currentMockNow()

    return undefined as T
  }

  if (cmd === 'create_review_log') {
    const data = getRecord(args?.data)
    const rating = getReviewRating(data?.rating) ?? 'good'
    const reviewLog: ReviewLog = {
      id: crypto.randomUUID(),
      cardId: getString(data?.cardId) ?? MOCK_CARD_IDS[0],
      rating,
      reviewedAt: currentMockNow(),
      state: getReviewState(data?.state) ?? 'review',
      difficulty: getNumber(data?.difficulty) ?? 0.3,
      stability: getNumber(data?.stability) ?? 1,
      retrievability: getNullableNumber(data?.retrievability),
      nextReview: getDate(data?.nextReview),
      intervalDays: getNullableNumber(data?.intervalDays),
    }

    mockReviewLogs.unshift(reviewLog)
    return serializeReviewLog(reviewLog) as T
  }

  if (cmd === 'list_review_logs') {
    return limitItems(
      mockReviewLogs
        .filter((reviewLog) => (cardId ? reviewLog.cardId === cardId : true))
        .map(serializeReviewLog),
      limit
    ) as T
  }

  if (cmd === 'get_daily_stats') {
    return buildDailyStats() as T
  }

  if (cmd === 'get_review_heatmap') {
    const days = getNumber(args?.days) ?? 112
    return buildReviewHeatmap(days) as T
  }

  if (cmd === 'record_points') {
    if (!reviewLogId) {
      return null as T
    }

    const existing = mockPointsLedger.find((entry) => entry.reviewLogId === reviewLogId)
    if (existing) {
      return serializePointsEntry(existing) as T
    }

    const rating = getReviewRating(pointsData?.rating) ?? 'good'
    const firstReviewToday = buildPointsSummary().todayPoints === 0
    if (!firstReviewToday) {
      return null as T
    }

    const entry: PointsEntry = {
      id: crypto.randomUUID(),
      reviewLogId,
      cardId: getString(pointsData?.cardId) ?? MOCK_CARD_IDS[0],
      points: 10,
      transactionType: 'daily_first_review',
      rating,
      reason: 'Daily first review bonus for 2026-04-17',
      createdAt: currentMockNow(),
    }

    mockPointsLedger.unshift(entry)
    return serializePointsEntry(entry) as T
  }

  if (cmd === 'list_points_ledger') {
    return limitItems(
      mockPointsLedger
        .filter((entry) => (cardId ? entry.cardId === cardId : true))
        .map(serializePointsEntry),
      limit
    ) as T
  }

  if (cmd === 'get_points_summary') {
    return buildPointsSummary() as T
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
        'list_model_profiles',
        'list_model_profiles_by_api_config',
        'create_model_profile',
        'update_model_profile',
        'delete_model_profile',
        'delete_api_key',
        'store_api_key',
        'test_api_connection',
        'fetch_provider_models',
        'list_workflow_assignments',
        'get_workflow_assignment',
        'set_workflow_assignment',
        'set_all_workflow_assignments',
        'delete_workflow_assignment',
        'get_provider_budget_usage',
        'reset_provider_budget_usage',
        'record_workflow_cost',
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
        'delete_card',
        'delete_basic_cards',
        'update_card',
        'list_cards',
        'list_background_jobs',
        'get_background_job',
        'cancel_background_job',
        'start_ai_card_generation',
        'resume_ai_card_generation',
        'list_highlights',
        'create_highlight',
        'update_highlight',
        'delete_highlight',
        'batch_create_highlights_for_cards',
        'export_annotated_pdf',
        'update_card_review',
        'list_card_candidates',
        'update_card_candidate',
        'bulk_update_card_candidate_statuses',
        'start_card_generation_workflow',
        'resume_card_generation_workflow',
        'finalize_card_generation_workflow',
        'upload_card_media',
        'list_card_media',
        'delete_card_media',
        'import_cards_apkg',
        'pick_and_export_apkg',
        'pick_and_export_csv',
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
      hostGatewayConfigured: false,
      hostGatewayEndpoint: null,
      dependenciesReady: true,
      missingDependencies: [],
    },
    list_workflow_runs: limitItems(mockWorkflowRuns.map(serializeWorkflowRun), limit),
    list_workflow_events: limitItems(mockWorkflowEvents.map(serializeWorkflowEvent), limit),
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
    list_card_candidates: limitItems(mockCardCandidates.map(serializeCardCandidate), limit),
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
    resume_card_generation_workflow: serializeWorkflowRun(mockWorkflowRuns[0]),
    finalize_card_generation_workflow: {
      createdCount: 0,
      skippedDuplicates: 0,
      rejectedCount: 0,
      run: serializeWorkflowRun(mockWorkflowRuns[0]),
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
    test_api_connection: { success: true, message: '连接测试通过 (mock)' },
    update_settings: mockAppSettings,
    get_daily_stats: { newCards: 2, reviewCards: 0, correctRate: 1 },
    get_study_stats: {
      todayMinutes: 1,
      weekMinutes: 8,
      totalMinutes: 24,
      streakDays: 3,
      activeDaysThisWeek: 4,
    },
    get_mastery_breakdown: {
      newCards: 2,
      learningCards: 3,
      reviewCards: 5,
      masteredCards: 1,
    },
    get_review_heatmap: [
      { date: '2026-04-15', count: 1 },
      { date: '2026-04-16', count: 2 },
      { date: '2026-04-18', count: 1 },
      { date: '2026-04-20', count: 3 },
      { date: '2026-04-21', count: 1 },
    ],
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
    list_knowledge_qa_conversations: [
      {
        id: 'abababab-abab-4bab-8bab-abababababab',
        title: 'Mock Knowledge Q&A',
        documentIds: [MOCK_DOCUMENT_ID],
        createdAt: new Date(MOCK_NOW).toISOString(),
        updatedAt: new Date(MOCK_NOW).toISOString(),
      },
    ],
    get_knowledge_qa_conversation: {
      conversation: {
        id: 'abababab-abab-4bab-8bab-abababababab',
        title: 'Mock Knowledge Q&A',
        documentIds: [MOCK_DOCUMENT_ID],
        createdAt: new Date(MOCK_NOW).toISOString(),
        updatedAt: new Date(MOCK_NOW).toISOString(),
      },
      messages: [
        {
          id: 'bcbcbcbc-bcbc-4bcb-8bcb-bcbcbcbcbcbc',
          conversationId: 'abababab-abab-4bab-8bab-abababababab',
          role: 'user',
          content: 'How does chunking help?',
          status: 'answered',
          workflowRunId: null,
          documentIds: [MOCK_DOCUMENT_ID],
          answerPayload: null,
          errorMessage: null,
          createdAt: new Date(MOCK_NOW).toISOString(),
          updatedAt: new Date(MOCK_NOW).toISOString(),
        },
        {
          id: 'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd',
          conversationId: 'abababab-abab-4bab-8bab-abababababab',
          role: 'assistant',
          content:
            'Chunking keeps the page readable while stable anchors preserve the reading position.',
          status: 'answered',
          workflowRunId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          documentIds: [MOCK_DOCUMENT_ID],
          answerPayload: {
            answer: {
              answer:
                'Chunking keeps the page readable while stable anchors preserve the reading position.',
              answerMode: 'grounded',
              retrievalStatus: 'ready',
              citations: [
                {
                  documentId: MOCK_DOCUMENT_ID,
                  snippet: 'Chunking keeps the page readable...',
                  page: 1,
                },
              ],
            },
          },
          errorMessage: null,
          createdAt: new Date(MOCK_NOW).toISOString(),
          updatedAt: new Date(MOCK_NOW).toISOString(),
        },
      ],
    },
    send_knowledge_qa_message: {
      conversation: {
        id: 'abababab-abab-4bab-8bab-abababababab',
        title: 'Mock Knowledge Q&A',
        documentIds: [MOCK_DOCUMENT_ID],
        createdAt: new Date(MOCK_NOW).toISOString(),
        updatedAt: new Date(MOCK_NOW).toISOString(),
      },
      userMessage: {
        id: 'dededede-dede-4ede-8ede-dededededede',
        conversationId: 'abababab-abab-4bab-8bab-abababababab',
        role: 'user',
        content: 'Mock question',
        status: 'answered',
        workflowRunId: null,
        documentIds: [MOCK_DOCUMENT_ID],
        answerPayload: null,
        errorMessage: null,
        createdAt: new Date(MOCK_NOW).toISOString(),
        updatedAt: new Date(MOCK_NOW).toISOString(),
      },
      assistantMessage: {
        id: 'efefefef-efef-4fef-8fef-efefefefefef',
        conversationId: 'abababab-abab-4bab-8bab-abababababab',
        role: 'assistant',
        content: '',
        status: 'pending',
        workflowRunId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        documentIds: [MOCK_DOCUMENT_ID],
        answerPayload: null,
        errorMessage: null,
        createdAt: new Date(MOCK_NOW).toISOString(),
        updatedAt: new Date(MOCK_NOW).toISOString(),
      },
      run: {
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        workflowType: 'knowledge_qa',
        presetId: null,
        status: 'queued',
        threadId: 'knowledge-qa:mock',
        checkpointRef: null,
        approvalPayload: null,
        costUsd: null,
        errorMessage: null,
        startedAt: null,
        finishedAt: null,
        createdAt: new Date(MOCK_NOW).toISOString(),
        updatedAt: new Date(MOCK_NOW).toISOString(),
      },
    },
    cancel_knowledge_qa_message: {
      id: 'efefefef-efef-4fef-8fef-efefefefefef',
      conversationId: 'abababab-abab-4bab-8bab-abababababab',
      role: 'assistant',
      content: 'Answer stopped.',
      status: 'cancelled',
      workflowRunId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      documentIds: [MOCK_DOCUMENT_ID],
      answerPayload: null,
      errorMessage: 'Cancelled by user',
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
      mode: 'quick_preview',
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
      videoPath: null,
      posterPath: null,
      renderLogPath: null,
      status: 'ready',
      errorCode: null,
      errorMessage: null,
      retryable: true,
      createdAt: new Date(MOCK_NOW).toISOString(),
      updatedAt: new Date(MOCK_NOW).toISOString(),
    },
    get_card_animation: {
      id: 'anim-mock-0001',
      cardId: MOCK_CARD_IDS[0],
      runId: 'run-anim-0001',
      animType: 'flashcard_reveal',
      mode: 'quick_preview',
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
      videoPath: null,
      posterPath: null,
      renderLogPath: null,
      status: 'ready',
      errorCode: null,
      errorMessage: null,
      retryable: true,
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
      stageKey: 'ready',
      errorMessage: null,
      errorCode: null,
      errorStage: null,
      retryable: true,
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
      stageKey: 'ready',
      errorMessage: null,
      errorCode: null,
      errorStage: null,
      retryable: true,
      createdAt: new Date(MOCK_NOW).toISOString(),
      updatedAt: new Date(MOCK_NOW).toISOString(),
    },
    list_podcast_episodes: [],
    cancel_podcast_episode: undefined,
    delete_podcast_episode: undefined,
  }

  return mockResponses[cmd] as T
}

function documentsForMocks(): Document[] {
  return [mockDocument]
}

function normalizeMockTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  const tags: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') {
      continue
    }
    const trimmed = item.trim()
    if (!trimmed || tags.includes(trimmed)) {
      continue
    }
    tags.push(trimmed)
  }

  return tags
}

function syncMockBasicGroupCounts() {
  for (const group of mockBasicCardGroups) {
    group.cardCount = mockBasicCards.filter(
      (card) => card.groupId === group.id && !card.deletedAt
    ).length
  }

  for (const card of mockBasicCards) {
    const group = mockBasicCardGroups.find((item) => item.id === card.groupId)
    if (group) {
      card.groupName = group.name
    }
  }
}

function getMockStudyState(card: BasicCard): MockStudyState {
  const state = mockStudyStates[card.id]
  if (state) {
    return {
      state: state.state,
      dueAt: new Date(state.dueAt),
    }
  }

  return {
    state: 'new',
    dueAt: new Date(card.createdAt),
  }
}

function buildMockStudyQueueItems(asOf: Date): StudyQueueItem[] {
  const enabledGroupIds = new Set(
    mockBasicCardGroups
      .filter((group) => group.isEnabled && !group.deletedAt)
      .map((group) => group.id)
  )

  return mockBasicCards
    .filter((card) => !card.deletedAt && enabledGroupIds.has(card.groupId))
    .map((card) => {
      const state = getMockStudyState(card)
      return {
        id: card.id,
        groupId: card.groupId,
        title: card.title,
        front: card.front,
        back: card.back,
        state: state.state,
        dueAt: state.dueAt,
        createdAt: new Date(card.createdAt),
      }
    })
    .filter((item) => item.dueAt.getTime() <= asOf.getTime())
    .sort((left, right) => {
      const dueDiff = left.dueAt.getTime() - right.dueAt.getTime()
      if (dueDiff !== 0) {
        return dueDiff
      }
      return left.createdAt.getTime() - right.createdAt.getTime()
    })
    .map(({ createdAt: _createdAt, ...item }) => item)
}

function computeMockStudyReviewResult(
  currentState: StudyQueueItem['state'],
  rating: ReviewLog['rating'],
  answeredAt: Date
): StudyReviewResult {
  const nextDueAt = new Date(answeredAt)

  if (rating === 'again') {
    nextDueAt.setMinutes(nextDueAt.getMinutes() + 10)
    return {
      nextDueAt,
      newState:
        currentState === 'review' || currentState === 'relearning' ? 'relearning' : 'learning',
    }
  }

  if (rating === 'hard') {
    nextDueAt.setDate(nextDueAt.getDate() + 1)
    return {
      nextDueAt,
      newState: 'learning',
    }
  }

  if (rating === 'good') {
    nextDueAt.setDate(nextDueAt.getDate() + 3)
    return {
      nextDueAt,
      newState: 'review',
    }
  }

  nextDueAt.setDate(nextDueAt.getDate() + 7)
  return {
    nextDueAt,
    newState: 'review',
  }
}

function serializeBasicCard(card: BasicCard): BasicCard {
  return {
    ...card,
    tags: [...card.tags],
    source: { ...card.source },
    createdAt: new Date(card.createdAt),
    updatedAt: new Date(card.updatedAt),
    deletedAt: card.deletedAt ? new Date(card.deletedAt) : null,
  }
}

function serializeBasicCardGroup(group: BasicCardGroup): BasicCardGroup {
  return {
    ...group,
    createdAt: new Date(group.createdAt),
    updatedAt: new Date(group.updatedAt),
    deletedAt: group.deletedAt ? new Date(group.deletedAt) : null,
  }
}

function serializeBackgroundJob(job: BackgroundJob): BackgroundJob {
  return {
    ...job,
    createdAt: new Date(job.createdAt),
    startedAt: job.startedAt ? new Date(job.startedAt) : null,
    finishedAt: job.finishedAt ? new Date(job.finishedAt) : null,
    cancelRequestedAt: job.cancelRequestedAt ? new Date(job.cancelRequestedAt) : null,
  }
}

function serializeStudyQueueItem(item: StudyQueueItem): StudyQueueItem {
  return {
    ...item,
    dueAt: new Date(item.dueAt),
  }
}

function serializeStudyReviewResult(result: StudyReviewResult): StudyReviewResult {
  return {
    ...result,
    nextDueAt: new Date(result.nextDueAt),
  }
}

function getPodcastStyle(value: unknown): PodcastEpisode['style'] | undefined {
  return value === 'deep_dive' ||
    value === 'lecture' ||
    value === 'interview' ||
    value === 'casual' ||
    value === 'exam_prep'
    ? value
    : undefined
}

function getPodcastLanguage(value: unknown): PodcastEpisode['language'] | undefined {
  return value === 'zh-CN' || value === 'en-US' || value === 'ja-JP' || value === 'ko-KR'
    ? value
    : undefined
}

function getPodcastDurationTier(value: unknown): PodcastEpisode['durationTier'] | undefined {
  return value === 'short' || value === 'medium' || value === 'long' || value === 'ultra_long'
    ? value
    : undefined
}

function getTtsProviderId(value: unknown): PodcastEpisode['ttsProvider'] | undefined {
  return value === 'auto' || value === 'openai' || value === 'edge_tts' || value === 'google'
    ? value
    : undefined
}

function getAudioFormat(value: unknown): PodcastEpisode['audioFormat'] | undefined {
  return value === 'mp3' || value === 'wav' ? value : undefined
}

function getPodcastReviewAction(value: unknown): 'accept' | 'edit' | 'reject' | undefined {
  return value === 'accept' || value === 'edit' || value === 'reject' ? value : undefined
}

function serializeDocument(document: Document) {
  return {
    ...document,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  }
}

function buildMockLibraryItem(document: Document): DocumentLibraryItem {
  const cards = mockBasicCards.filter(
    (card) => card.source.documentId === document.id && !card.deletedAt
  )
  const lastCardUpdate = cards.reduce<Date | null>(
    (latest, card) => (!latest || card.updatedAt > latest ? card.updatedAt : latest),
    null
  )

  return {
    id: document.id,
    title: document.title,
    fileType: document.fileType,
    pageCount: document.pageCount,
    status: document.status,
    updatedAt: document.updatedAt,
    lastUsedAt: lastCardUpdate ?? document.updatedAt,
    basicCardCount: cards.length,
    lastFailureReason:
      document.status === 'error'
        ? '该 PDF 解析失败，请确认文件包含可复制文本后重试。'
        : document.status === 'embedding_failed'
          ? '检索索引生成失败，但不影响 MVP 阅读和制卡。'
          : null,
  }
}

function serializeLibraryItem(item: DocumentLibraryItem) {
  return {
    ...item,
    updatedAt: item.updatedAt.toISOString(),
    lastUsedAt: item.lastUsedAt?.toISOString() ?? null,
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

function serializeReviewLog(reviewLog: ReviewLog) {
  return {
    ...reviewLog,
    reviewedAt: reviewLog.reviewedAt.toISOString(),
    nextReview: reviewLog.nextReview?.toISOString() ?? null,
  }
}

function serializePointsEntry(entry: PointsEntry) {
  return {
    ...entry,
    createdAt: entry.createdAt.toISOString(),
  }
}

function serializeWorkflowRun(run: WorkflowRun) {
  return {
    ...run,
    startedAt: run.startedAt?.toISOString() ?? null,
    finishedAt: run.finishedAt?.toISOString() ?? null,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  }
}

function serializeWorkflowEvent(event: WorkflowEvent) {
  return {
    ...event,
    createdAt: event.createdAt.toISOString(),
  }
}

function serializeCardCandidate(candidate: CardCandidate) {
  return {
    ...candidate,
    createdAt: candidate.createdAt.toISOString(),
  }
}

function serializeApiConfig(config: ApiConfig) {
  return {
    ...config,
    provider: normalizeMockApiProvider(config.provider),
    keyVerifiedAt: config.keyVerifiedAt ? config.keyVerifiedAt.toISOString() : null,
    createdAt: config.createdAt.toISOString(),
  }
}

function serializeModelProfile(profile: ModelProfile) {
  const apiConfig = mockApiConfigs.find((config) => config.id === profile.apiConfigId) ?? null

  return {
    ...profile,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
    apiConfig: apiConfig ? serializeApiConfig(apiConfig) : null,
  }
}

function serializeWorkflowAssignment(assignment: WorkflowModelAssignment) {
  const modelProfile =
    mockModelProfiles.find((profile) => profile.id === assignment.modelProfileId) ?? null
  const apiConfig = mockApiConfigs.find((config) => config.id === modelProfile?.apiConfigId) ?? null

  return {
    ...assignment,
    assignedAt: assignment.assignedAt.toISOString(),
    updatedAt: assignment.updatedAt.toISOString(),
    modelProfile: modelProfile ? serializeModelProfile(modelProfile) : null,
    apiConfig: apiConfig ? serializeApiConfig(apiConfig) : null,
  }
}

function serializeProviderBudgetUsage(usage: ProviderBudgetUsage) {
  return {
    ...usage,
    updatedAt: usage.updatedAt.toISOString(),
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

function getNullableString(value: unknown) {
  return typeof value === 'string' ? value : null
}

function getNumber(value: unknown) {
  return typeof value === 'number' ? value : undefined
}

function getNullableNumber(value: unknown) {
  return typeof value === 'number' ? value : null
}

function getDate(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function getWorkflowType(value: unknown): WorkflowRun['workflowType'] | undefined {
  return value === 'card_generation' || value === 'document_embedding' || value === 'knowledge_qa'
    ? value
    : undefined
}

function getWorkflowRunStatus(value: unknown): WorkflowRun['status'] | undefined {
  return value === 'queued' ||
    value === 'running' ||
    value === 'waiting_confirmation' ||
    value === 'completed' ||
    value === 'failed' ||
    value === 'cancelled'
    ? value
    : undefined
}

function getCandidateStatus(value: unknown): CardCandidate['status'] | undefined {
  return value === 'pending' || value === 'accepted' || value === 'rejected' ? value : undefined
}

function getVisibilityBucket(value: unknown): CardCandidate['visibilityBucket'] | undefined {
  return value === 'default' || value === 'expanded' || value === 'hidden_low_quality'
    ? value
    : undefined
}

function getGenerationMode(value: unknown): CardCandidate['generationMode'] | undefined {
  return value === 'llm' || value === 'fallback_rule' || value === 'fallback_fts5_only'
    ? value
    : undefined
}

function getBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : undefined
}

function isCardType(value: unknown): value is Card['cardType'] {
  return (
    value === 'qa' ||
    value === 'cloze' ||
    value === 'fact' ||
    value === 'choice' ||
    value === 'image_occlusion'
  )
}

function isCandidateCardType(value: unknown): value is CardCandidate['cardType'] {
  return value === 'qa' || value === 'cloze' || value === 'fact' || value === 'choice'
}

function getReviewRating(value: unknown): ReviewLog['rating'] | undefined {
  return value === 'again' || value === 'hard' || value === 'good' || value === 'easy'
    ? value
    : undefined
}

function getReviewState(value: unknown): ReviewLog['state'] | undefined {
  return value === 'new' || value === 'learning' || value === 'review' || value === 'relearning'
    ? value
    : undefined
}

function currentMockNow() {
  return new Date(MOCK_NOW)
}

function sameMockDay(left: Date, right: Date) {
  return left.toISOString().slice(0, 10) === right.toISOString().slice(0, 10)
}

function isDueCard(card: Card, referenceDate = currentMockNow()) {
  return !card.nextReview || card.nextReview.getTime() <= referenceDate.getTime()
}

function buildDashboardSummary(days = 63, limit = 6): DashboardSummary {
  const now = currentMockNow()
  const today = toMockIsoDate(now)
  const queue = buildMockStudyQueueItems(new Date())
  const todayEvents = mockStudyEvents.filter((event) => toMockIsoDate(event.answeredAt) === today)

  return {
    todayCompletedCount: todayEvents.length,
    todayNewDueCount: queue.filter((item) => item.state === 'new').length,
    todayReviewDueCount: queue.filter((item) => item.state !== 'new').length,
    todayStudyMinutes: floorDurationMinutes(todayEvents),
    totalStudyMinutes: floorDurationMinutes(mockStudyEvents),
    streakDays: computeMockStreakDays(today),
    heatmap: buildStudyHeatmap(days),
    documentProgress: buildDocumentProgress(limit),
    groupProgress: buildGroupProgress(limit),
  }
}

function floorDurationMinutes(events: MockStudyEvent[]) {
  return Math.floor(events.reduce((sum, event) => sum + (event.durationMs ?? 0), 0) / 60_000)
}

function computeMockStreakDays(today: string) {
  const activeDates = new Set(mockStudyEvents.map((event) => toMockIsoDate(event.answeredAt)))
  const cursor = new Date(`${today}T00:00:00.000Z`)
  let streak = 0

  while (activeDates.has(toMockIsoDate(cursor))) {
    streak += 1
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }

  return streak
}

function buildStudyHeatmap(days = 63) {
  const now = currentMockNow()
  const threshold = new Date(now.getTime() - Math.max(0, days - 1) * 86_400_000)
  const counts = new Map<string, number>()

  for (const event of mockStudyEvents) {
    if (event.answeredAt < threshold) {
      continue
    }

    const key = toMockIsoDate(event.answeredAt)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return Array.from(counts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, count]) => ({ date, count }))
}

function buildDocumentProgress(limit = 6): DashboardSummary['documentProgress'] {
  const learnedCardIds = new Set(mockStudyEvents.map((event) => event.cardId))

  return documentsForMocks()
    .map((document) => {
      const cards = mockBasicCards.filter(
        (card) => !card.deletedAt && card.source.documentId === document.id
      )
      const learnedCards = cards.filter((card) => learnedCardIds.has(card.id)).length
      return {
        id: document.id,
        title: document.title,
        learnedCards,
        totalCards: cards.length,
        progressPercent: computeProgressPercent(learnedCards, cards.length),
        sortTime: Math.max(...cards.map((card) => card.updatedAt.getTime()), document.updatedAt.getTime()),
      }
    })
    .filter((item) => item.totalCards > 0)
    .sort((left, right) => {
      const progressDiff = left.progressPercent - right.progressPercent
      if (progressDiff !== 0) return progressDiff
      return right.sortTime - left.sortTime
    })
    .slice(0, limit)
    .map(({ sortTime: _sortTime, ...item }) => item)
}

function buildGroupProgress(limit = 6): DashboardSummary['groupProgress'] {
  const learnedCardIds = new Set(mockStudyEvents.map((event) => event.cardId))

  return mockBasicCardGroups
    .filter((group) => group.isEnabled && !group.deletedAt)
    .map((group) => {
      const cards = mockBasicCards.filter((card) => !card.deletedAt && card.groupId === group.id)
      const learnedCards = cards.filter((card) => learnedCardIds.has(card.id)).length
      return {
        id: group.id,
        name: group.name,
        color: group.color,
        learnedCards,
        totalCards: cards.length,
        progressPercent: computeProgressPercent(learnedCards, cards.length),
        sortTime: Math.max(...cards.map((card) => card.updatedAt.getTime()), group.updatedAt.getTime()),
      }
    })
    .filter((item) => item.totalCards > 0)
    .sort((left, right) => {
      const progressDiff = left.progressPercent - right.progressPercent
      if (progressDiff !== 0) return progressDiff
      return right.sortTime - left.sortTime
    })
    .slice(0, limit)
    .map(({ sortTime: _sortTime, ...item }) => item)
}

function computeProgressPercent(learnedCards: number, totalCards: number) {
  return totalCards > 0 ? Math.round((learnedCards / totalCards) * 100) : 0
}

function toMockIsoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function buildDailyStats() {
  const now = currentMockNow()
  const reviewedToday = mockReviewLogs.filter((log) => sameMockDay(log.reviewedAt, now))
  return {
    newCards: mockCards.filter((card) => card.state === 'new').length,
    reviewCards: reviewedToday.length,
    correctRate: reviewedToday.length
      ? reviewedToday.filter((log) => log.rating !== 'again').length / reviewedToday.length
      : null,
  }
}

function buildReviewHeatmap(days = 112) {
  const now = currentMockNow()
  const threshold = new Date(now.getTime() - Math.max(0, days - 1) * 86_400_000)
  const counts = new Map<string, number>()

  for (const log of mockReviewLogs) {
    if (log.reviewedAt < threshold) {
      continue
    }

    const key = log.reviewedAt.toISOString().slice(0, 10)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return Array.from(counts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, count]) => ({ date, count }))
}

function buildPointsSummary() {
  const now = currentMockNow()
  return {
    todayPoints: mockPointsLedger
      .filter((entry) => sameMockDay(entry.createdAt, now))
      .reduce((sum, entry) => sum + entry.points, 0),
  }
}

function appendMockWorkflowEvent(
  runId: string,
  eventType: WorkflowEvent['eventType'],
  message: string,
  payload: Record<string, unknown> | null
) {
  mockWorkflowEvents.unshift({
    runId,
    eventType,
    message,
    progress: 1,
    payload,
    createdAt: new Date(),
  })
}

function syncMockWorkflowRunSummary(runId: string) {
  const run = mockWorkflowRuns.find((item) => item.id === runId)
  if (!run) {
    return
  }

  const candidates = mockCardCandidates.filter((candidate) => candidate.workflowRunId === runId)
  const pendingCount = candidates.filter((candidate) => candidate.status === 'pending').length
  const acceptedCount = candidates.filter((candidate) => candidate.status === 'accepted').length
  const rejectedCount = candidates.filter((candidate) => candidate.status === 'rejected').length
  const preferredCandidate = candidates.find(
    (candidate) => candidate.visibilityBucket === 'default'
  )
  const fallbackCandidate = candidates.find((candidate) => candidate.fallbackReason)

  run.approvalPayload = {
    documentId: MOCK_DOCUMENT_ID,
    documentTitle: mockDocument.title,
    phase: run.status,
    generationMode: preferredCandidate?.generationMode ?? candidates[0]?.generationMode ?? 'llm',
    fallbackReason: fallbackCandidate?.fallbackReason ?? null,
    chunkCursor: 1,
    totalChunks: 1,
    generatedCount: candidates.length,
    duplicateCount: 0,
    pendingCount,
    acceptedCount,
    rejectedCount,
  }
  run.updatedAt = new Date()
}

function inferMimeType(filePath: string) {
  const lower = filePath.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.svg')) return 'image/svg+xml'
  return 'application/octet-stream'
}

function isApiProvider(value: unknown): value is ApiConfig['provider'] {
  return (
    value === 'openai' ||
    value === 'anthropic' ||
    value === 'google' ||
    value === 'deepseek' ||
    value === 'openai_compatible' ||
    value === 'custom_openai' ||
    value === 'custom_anthropic' ||
    value === 'custom_google'
  )
}

function isApiAuthMode(value: unknown): value is ApiConfig['authMode'] {
  return value === 'api_key' || value === 'adc'
}

function nextMockApiConfigId() {
  const suffix = mockApiConfigCounter.toString(16).padStart(12, '0')
  mockApiConfigCounter += 1
  return `cccccccc-cccc-4ccc-8ccc-${suffix}`
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
