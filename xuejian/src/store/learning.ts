import { create } from 'zustand'
import type { Card } from '@/types'

interface LearningSessionState {
  queue: Card[]
  currentIndex: number
  isFlipped: boolean
  reviewedCount: number
  sessionStartedAt: number | null

  loadQueue: (cards: Card[]) => void
  flipCard: () => void
  advanceCard: () => void
  resetSession: () => void
}

export const useLearningSessionStore = create<LearningSessionState>((set) => ({
  queue: [],
  currentIndex: 0,
  isFlipped: false,
  reviewedCount: 0,
  sessionStartedAt: null,

  loadQueue: (cards) =>
    set({
      queue: cards,
      currentIndex: 0,
      isFlipped: false,
      reviewedCount: 0,
      sessionStartedAt: Date.now(),
    }),

  flipCard: () => set({ isFlipped: true }),

  advanceCard: () =>
    set((state) => ({
      currentIndex: state.currentIndex + 1,
      isFlipped: false,
      reviewedCount: state.reviewedCount + 1,
    })),

  resetSession: () =>
    set({
      queue: [],
      currentIndex: 0,
      isFlipped: false,
      reviewedCount: 0,
      sessionStartedAt: null,
    }),
}))
