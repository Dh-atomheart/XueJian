import { create } from 'zustand'

export type NavItemId =
  | 'home'
  | 'library'
  | 'cards'
  | 'learning'
  | 'knowledge'
  | 'podcast'
  | 'graph'
  | 'settings'

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
      },
    })),
  setReaderScale: (scale) =>
    set((state) => ({
      reader: { ...state.reader, scale: Math.max(0.5, Math.min(3, scale)) },
    })),
  selectHighlight: (selectedHighlightId) =>
    set((state) => ({
      reader: { ...state.reader, selectedHighlightId, selectedCardId: null },
    })),
  selectCard: (selectedCardId) =>
    set((state) => ({
      reader: { ...state.reader, selectedCardId, selectedHighlightId: null },
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
