import { useLearningSessionStore } from '@/store/learning'
import type { Card } from '@/types'

function makeCard(id: string): Card {
  return {
    id,
    documentId: 'doc-1',
    front: `Front ${id}`,
    back: `Back ${id}`,
    tags: [],
    state: 'new',
    difficulty: 0,
    stability: 0,
    retrievability: 0,
    nextReview: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

describe('useLearningSessionStore', () => {
  beforeEach(() => {
    useLearningSessionStore.getState().resetSession()
  })

  it('starts with empty queue and zero index', () => {
    const state = useLearningSessionStore.getState()
    expect(state.queue).toHaveLength(0)
    expect(state.currentIndex).toBe(0)
    expect(state.isFlipped).toBe(false)
    expect(state.reviewedCount).toBe(0)
    expect(state.sessionStartedAt).toBeNull()
  })

  it('loadQueue populates the queue and sets sessionStartedAt', () => {
    const cards = [makeCard('c1'), makeCard('c2'), makeCard('c3')]
    useLearningSessionStore.getState().loadQueue(cards)

    const state = useLearningSessionStore.getState()
    expect(state.queue).toHaveLength(3)
    expect(state.currentIndex).toBe(0)
    expect(state.isFlipped).toBe(false)
    expect(state.reviewedCount).toBe(0)
    expect(state.sessionStartedAt).toBeGreaterThan(0)
  })

  it('flipCard sets isFlipped to true', () => {
    useLearningSessionStore.getState().loadQueue([makeCard('c1')])
    useLearningSessionStore.getState().flipCard()

    expect(useLearningSessionStore.getState().isFlipped).toBe(true)
  })

  it('advanceCard increments index and reviewedCount, resets flip', () => {
    useLearningSessionStore.getState().loadQueue([makeCard('c1'), makeCard('c2')])
    useLearningSessionStore.getState().flipCard()
    useLearningSessionStore.getState().advanceCard()

    const state = useLearningSessionStore.getState()
    expect(state.currentIndex).toBe(1)
    expect(state.reviewedCount).toBe(1)
    expect(state.isFlipped).toBe(false)
  })

  it('session is complete when currentIndex >= queue length', () => {
    useLearningSessionStore.getState().loadQueue([makeCard('c1')])
    useLearningSessionStore.getState().advanceCard()

    const state = useLearningSessionStore.getState()
    expect(state.currentIndex).toBeGreaterThanOrEqual(state.queue.length)
  })

  it('resetSession clears all state', () => {
    useLearningSessionStore.getState().loadQueue([makeCard('c1'), makeCard('c2')])
    useLearningSessionStore.getState().advanceCard()
    useLearningSessionStore.getState().resetSession()

    const state = useLearningSessionStore.getState()
    expect(state.queue).toHaveLength(0)
    expect(state.currentIndex).toBe(0)
    expect(state.isFlipped).toBe(false)
    expect(state.reviewedCount).toBe(0)
    expect(state.sessionStartedAt).toBeNull()
  })
})
