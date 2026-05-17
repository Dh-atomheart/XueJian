import type { ComponentType } from 'react'
import { create } from 'zustand'

export type NavItemId =
  | 'home'
  | 'library'
  | 'cards'
  | 'learning'
  | 'knowledge'
  | 'settings'

export type SettingsSectionId = 'ai' | 'learning' | 'general'

export type AppFeedbackLevel = 'info' | 'warning' | 'error'

export interface AppFeedbackEntry {
  id: string
  level: AppFeedbackLevel
  scope: string
  title: string
  detail: string | null
  createdAt: Date
}

export interface PageHeaderAction {
  id: string
  label: string
  icon?: ComponentType<{ className?: string }>
  variant?: 'primary' | 'outline'
  onClick: () => void
}

interface ReaderState {
  documentId: string | null
  currentPage: number
  totalPages: number
  scale: number
  selectedHighlightId: string | null
  hoveredHighlightId: string | null
  selectedCardId: string | null
  annotationScope: 'page' | 'all'
  isLinkingMode: boolean
  linkingCardId: string | null
}

interface KnowledgeDraftState {
  question: string | null
  selectedDocumentIds: string[]
  sourceLabel: string | null
}

interface AgentContextState {
  selectedTextPreview: string | null
  selectedAnchorRefs: string[]
  activeCardGroupIds: string[]
  activeReviewSessionId: string | null
  activeArtifactRefs: string[]
}

interface AppUiState {
  activeNavItem: NavItemId
  activeSettingsSection: SettingsSectionId
  preferredCardStudioDocumentId: string | null
  preferredBasicCardsDocumentId: string | null
  isContextRailOpen: boolean
  reader: ReaderState
  knowledgeDraft: KnowledgeDraftState
  agentContext: AgentContextState
  feedbackLog: AppFeedbackEntry[]
  activeNotices: AppFeedbackEntry[]
  isFeedbackPanelOpen: boolean
  pageHeaderActions: PageHeaderAction[]
  setActiveNavItem: (item: NavItemId) => void
  setSettingsSection: (section: SettingsSectionId) => void
  setPreferredCardStudioDocumentId: (documentId: string | null) => void
  setPreferredBasicCardsDocumentId: (preferredBasicCardsDocumentId: string | null) => void
  setContextRailOpen: (open: boolean) => void
  openKnowledgeQa: (draft?: Partial<KnowledgeDraftState>) => void
  clearKnowledgeDraft: () => void
  openReader: (
    documentId: string,
    totalPages?: number,
    options?: { page?: number | null; selectedCardId?: string | null }
  ) => void
  closeReader: () => void
  setReaderTotalPages: (totalPages: number) => void
  setReaderPage: (page: number) => void
  setReaderScale: (scale: number) => void
  selectHighlight: (highlightId: string | null) => void
  selectCard: (cardId: string | null) => void
  hoverHighlight: (highlightId: string | null) => void
  setAnnotationScope: (scope: ReaderState['annotationScope']) => void
  enterLinkingMode: (cardId: string | null) => void
  exitLinkingMode: () => void
  setFeedbackPanelOpen: (open: boolean) => void
  toggleFeedbackPanel: () => void
  setPageHeaderActions: (actions: PageHeaderAction[]) => void
  setAgentContext: (partial: Partial<AgentContextState>) => void
  clearAgentContext: () => void
  reportFeedback: (entry: {
    level?: AppFeedbackLevel
    scope: string
    title: string
    detail?: string | null
    showToast?: boolean
  }) => string
  dismissNotice: (id: string) => void
  clearFeedbackLog: () => void
}

const initialReaderState: ReaderState = {
  documentId: null,
  currentPage: 1,
  totalPages: 0,
  scale: 1.25,
  selectedHighlightId: null,
  hoveredHighlightId: null,
  selectedCardId: null,
  annotationScope: 'page',
  isLinkingMode: false,
  linkingCardId: null,
}

const initialKnowledgeDraftState: KnowledgeDraftState = {
  question: null,
  selectedDocumentIds: [],
  sourceLabel: null,
}

const initialAgentContextState: AgentContextState = {
  selectedTextPreview: null,
  selectedAnchorRefs: [],
  activeCardGroupIds: [],
  activeReviewSessionId: null,
  activeArtifactRefs: [],
}

const MAX_FEEDBACK_LOG_ENTRIES = 120
const MAX_ACTIVE_NOTICES = 4

function createFeedbackEntry(input: {
  level?: AppFeedbackLevel
  scope: string
  title: string
  detail?: string | null
}) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    level: input.level ?? 'info',
    scope: input.scope,
    title: input.title,
    detail: input.detail ?? null,
    createdAt: new Date(),
  } satisfies AppFeedbackEntry
}

export const useAppUiStore = create<AppUiState>((set) => ({
  activeNavItem: 'home',
  activeSettingsSection: 'ai',
  preferredCardStudioDocumentId: null,
  preferredBasicCardsDocumentId: null,
  isContextRailOpen: true,
  reader: initialReaderState,
  knowledgeDraft: initialKnowledgeDraftState,
  agentContext: initialAgentContextState,
  feedbackLog: [],
  activeNotices: [],
  isFeedbackPanelOpen: false,
  pageHeaderActions: [],
  setActiveNavItem: (activeNavItem) =>
    set((state) => ({
      activeNavItem,
      reader: state.reader.documentId ? initialReaderState : state.reader,
      pageHeaderActions: state.activeNavItem === activeNavItem ? state.pageHeaderActions : [],
    })),
  setSettingsSection: (activeSettingsSection) => set({ activeSettingsSection }),
  setPreferredCardStudioDocumentId: (preferredCardStudioDocumentId) =>
    set({ preferredCardStudioDocumentId }),
  setPreferredBasicCardsDocumentId: (preferredBasicCardsDocumentId) =>
    set({ preferredBasicCardsDocumentId }),
  setContextRailOpen: (isContextRailOpen) => set({ isContextRailOpen }),
  openKnowledgeQa: (draft) =>
    set({
      activeNavItem: 'knowledge',
      knowledgeDraft: {
        question: draft?.question ?? null,
        selectedDocumentIds: draft?.selectedDocumentIds ?? [],
        sourceLabel: draft?.sourceLabel ?? null,
      },
      reader: initialReaderState,
      pageHeaderActions: [],
    }),
  clearKnowledgeDraft: () => set({ knowledgeDraft: initialKnowledgeDraftState }),
  openReader: (documentId, totalPages, options) =>
    set({
      activeNavItem: 'library',
      reader: {
        ...initialReaderState,
        documentId,
        totalPages: totalPages ?? 0,
        currentPage: Math.max(1, options?.page ?? 1),
        selectedCardId: options?.selectedCardId ?? null,
      },
      isContextRailOpen: true,
      pageHeaderActions: [],
    }),
  closeReader: () => set({ activeNavItem: 'library', reader: initialReaderState, pageHeaderActions: [] }),
  setReaderTotalPages: (totalPages) =>
    set((state) => ({
      reader: {
        ...state.reader,
        totalPages: Math.max(0, totalPages),
        currentPage: Math.max(
          1,
          Math.min(state.reader.currentPage, totalPages || state.reader.currentPage)
        ),
      },
    })),
  setReaderPage: (page) =>
    set((state) => ({
      reader: {
        ...state.reader,
        currentPage: Math.max(1, Math.min(page, state.reader.totalPages || page)),
        selectedHighlightId: null,
        hoveredHighlightId: null,
        selectedCardId: null,
      },
    })),
  setReaderScale: (scale) =>
    set((state) => ({
      reader: { ...state.reader, scale: Math.max(0.5, Math.min(3, scale)) },
    })),
  selectHighlight: (selectedHighlightId) =>
    set((state) => ({
      reader: {
        ...state.reader,
        selectedHighlightId,
        hoveredHighlightId: selectedHighlightId,
        selectedCardId: null,
      },
    })),
  selectCard: (selectedCardId) =>
    set((state) => ({
      reader: { ...state.reader, selectedCardId, selectedHighlightId: null },
    })),
  hoverHighlight: (hoveredHighlightId) =>
    set((state) => ({
      reader: { ...state.reader, hoveredHighlightId },
    })),
  setAnnotationScope: (annotationScope) =>
    set((state) => ({
      reader: { ...state.reader, annotationScope },
    })),
  enterLinkingMode: (linkingCardId) =>
    set((state) => ({
      reader: { ...state.reader, isLinkingMode: true, linkingCardId },
    })),
  exitLinkingMode: () =>
    set((state) => ({
      reader: { ...state.reader, isLinkingMode: false, linkingCardId: null },
    })),
  setFeedbackPanelOpen: (isFeedbackPanelOpen) => set({ isFeedbackPanelOpen }),
  toggleFeedbackPanel: () => set((state) => ({ isFeedbackPanelOpen: !state.isFeedbackPanelOpen })),
  setPageHeaderActions: (pageHeaderActions) => set({ pageHeaderActions }),
  setAgentContext: (partial) =>
    set((state) => ({
      agentContext: { ...state.agentContext, ...partial },
    })),
  clearAgentContext: () => set({ agentContext: initialAgentContextState }),
  reportFeedback: ({ level, scope, title, detail, showToast = true }) => {
    const entry = createFeedbackEntry({ level, scope, title, detail })
    set((state) => ({
      feedbackLog: [entry, ...state.feedbackLog].slice(0, MAX_FEEDBACK_LOG_ENTRIES),
      activeNotices: showToast
        ? [entry, ...state.activeNotices].slice(0, MAX_ACTIVE_NOTICES)
        : state.activeNotices,
    }))
    return entry.id
  },
  dismissNotice: (id) =>
    set((state) => ({
      activeNotices: state.activeNotices.filter((notice) => notice.id !== id),
    })),
  clearFeedbackLog: () => set({ feedbackLog: [] }),
}))
