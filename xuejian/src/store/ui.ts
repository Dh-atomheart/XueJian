import { create } from 'zustand'

export type NavItemId =
  | 'home'
  | 'library'
  | 'cards'
  | 'learning'
  | 'knowledge'
  | 'settings'
  | 'profile'
  | 'podcast'
  | 'graph'

export type AppFeedbackLevel = 'info' | 'warning' | 'error'

export interface AppFeedbackEntry {
  id: string
  level: AppFeedbackLevel
  scope: string
  title: string
  detail: string | null
  createdAt: Date
}

interface ReaderState {
  documentId: string | null
  currentPage: number
  totalPages: number
  scale: number
  selectedHighlightId: string | null
  selectedCardId: string | null
  hoveredHighlightId: string | null
  isSearchOpen: boolean
  searchQuery: string
  searchMatchIndex: number
  searchResults: Array<{
    page: number
    rects: Array<{ x: number; y: number; width: number; height: number }>
    excerpt: string
  }>
  annotationFilterTags: string[]
  annotationScope: 'page' | 'all'
  isLinkingMode: boolean
  linkingTargetCardId: string | null
}

interface AppUiState {
  activeNavItem: NavItemId
  isContextRailOpen: boolean
  reader: ReaderState
  feedbackLog: AppFeedbackEntry[]
  activeNotices: AppFeedbackEntry[]
  isFeedbackPanelOpen: boolean
  setActiveNavItem: (item: NavItemId) => void
  setContextRailOpen: (open: boolean) => void
  openReader: (documentId: string, totalPages?: number) => void
  closeReader: () => void
  setReaderTotalPages: (totalPages: number) => void
  setReaderPage: (page: number) => void
  setReaderScale: (scale: number) => void
  selectHighlight: (highlightId: string | null) => void
  selectCard: (cardId: string | null) => void
  hoverHighlight: (highlightId: string | null) => void
  openReaderSearch: () => void
  closeReaderSearch: () => void
  setReaderSearchQuery: (query: string) => void
  setReaderSearchResults: (
    results: Array<{
      page: number
      rects: Array<{ x: number; y: number; width: number; height: number }>
      excerpt: string
    }>
  ) => void
  setReaderSearchMatchIndex: (index: number) => void
  setAnnotationFilterTags: (tags: string[]) => void
  setAnnotationScope: (scope: 'page' | 'all') => void
  enterLinkingMode: (cardId: string) => void
  exitLinkingMode: () => void
  setFeedbackPanelOpen: (open: boolean) => void
  toggleFeedbackPanel: () => void
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
  selectedCardId: null,
  hoveredHighlightId: null,
  isSearchOpen: false,
  searchQuery: '',
  searchMatchIndex: 0,
  searchResults: [],
  annotationFilterTags: [],
  annotationScope: 'page',
  isLinkingMode: false,
  linkingTargetCardId: null,
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
  isContextRailOpen: true,
  reader: initialReaderState,
  feedbackLog: [],
  activeNotices: [],
  isFeedbackPanelOpen: false,
  setActiveNavItem: (activeNavItem) =>
    set((state) => ({
      activeNavItem,
      reader: state.reader.documentId ? initialReaderState : state.reader,
    })),
  setContextRailOpen: (isContextRailOpen) => set({ isContextRailOpen }),
  openReader: (documentId, totalPages) =>
    set({
      activeNavItem: 'library',
      reader: { ...initialReaderState, documentId, totalPages: totalPages ?? 0 },
      isContextRailOpen: true,
    }),
  closeReader: () => set({ activeNavItem: 'library', reader: initialReaderState }),
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
        selectedCardId: null,
        hoveredHighlightId: null,
      },
    })),
  setReaderScale: (scale) =>
    set((state) => ({
      reader: { ...state.reader, scale: Math.max(0.5, Math.min(3, scale)) },
    })),
  selectHighlight: (selectedHighlightId) =>
    set((state) => ({
      reader: { ...state.reader, selectedHighlightId },
    })),
  selectCard: (selectedCardId) =>
    set((state) => ({
      reader: { ...state.reader, selectedCardId },
    })),
  hoverHighlight: (hoveredHighlightId) =>
    set((state) => ({
      reader: { ...state.reader, hoveredHighlightId },
    })),
  openReaderSearch: () =>
    set((state) => ({
      reader: { ...state.reader, isSearchOpen: true },
    })),
  closeReaderSearch: () =>
    set((state) => ({
      reader: {
        ...state.reader,
        isSearchOpen: false,
        searchQuery: '',
        searchMatchIndex: 0,
        searchResults: [],
      },
    })),
  setReaderSearchQuery: (searchQuery) =>
    set((state) => ({
      reader: { ...state.reader, searchQuery },
    })),
  setReaderSearchResults: (searchResults) =>
    set((state) => ({
      reader: {
        ...state.reader,
        searchResults,
        searchMatchIndex: searchResults.length > 0 ? 0 : 0,
      },
    })),
  setReaderSearchMatchIndex: (searchMatchIndex) =>
    set((state) => ({
      reader: {
        ...state.reader,
        searchMatchIndex: Math.max(0, Math.min(searchMatchIndex, state.reader.searchResults.length - 1)),
      },
    })),
  setAnnotationFilterTags: (annotationFilterTags) =>
    set((state) => ({
      reader: { ...state.reader, annotationFilterTags },
    })),
  setAnnotationScope: (annotationScope) =>
    set((state) => ({
      reader: { ...state.reader, annotationScope },
    })),
  enterLinkingMode: (linkingTargetCardId) =>
    set((state) => ({
      reader: {
        ...state.reader,
        isLinkingMode: true,
        linkingTargetCardId,
      },
    })),
  exitLinkingMode: () =>
    set((state) => ({
      reader: {
        ...state.reader,
        isLinkingMode: false,
        linkingTargetCardId: null,
      },
    })),
  setFeedbackPanelOpen: (isFeedbackPanelOpen) => set({ isFeedbackPanelOpen }),
  toggleFeedbackPanel: () => set((state) => ({ isFeedbackPanelOpen: !state.isFeedbackPanelOpen })),
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
