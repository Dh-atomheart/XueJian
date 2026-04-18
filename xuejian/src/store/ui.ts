import { create } from 'zustand'

export type NavItemId = 'home' | 'library' | 'learning' | 'knowledge' | 'settings'

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
  setActiveNavItem: (item: NavItemId) => void
  setContextRailOpen: (open: boolean) => void
  openReader: (documentId: string, totalPages?: number) => void
  closeReader: () => void
  setReaderTotalPages: (totalPages: number) => void
  setReaderPage: (page: number) => void
  setReaderScale: (scale: number) => void
  selectHighlight: (highlightId: string | null) => void
  selectCard: (cardId: string | null) => void
}

const initialReaderState: ReaderState = {
  documentId: null,
  currentPage: 1,
  totalPages: 0,
  scale: 1.25,
  selectedHighlightId: null,
  selectedCardId: null,
}

export const useAppUiStore = create<AppUiState>((set) => ({
  activeNavItem: 'home',
  isContextRailOpen: true,
  reader: initialReaderState,
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
}))
