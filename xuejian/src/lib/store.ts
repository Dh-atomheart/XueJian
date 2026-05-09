import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Document {
  id: string
  name: string
  type: 'pdf' | 'epub' | 'markdown' | 'txt'
  pageCount: number
  uploadDate?: Date
  uploadedAt?: string
  lastOpened?: Date
  progress?: number
  tags?: string[]
  size?: string
  cardsGenerated?: number
}

export interface Flashcard {
  id: string
  front: string
  back: string
  sourceDocId: string
  sourcePage: number
  status: 'new' | 'learning' | 'review' | 'mastered'
  nextReview?: Date
  easeFactor: number
  interval: number
  highlightColor: 'yellow' | 'green' | 'blue' | 'pink'
  groupId: string
  createdAt: Date
}

export interface CardGroup {
  id: string
  name: string
  documentId: string
  cardCount: number
  color?: 'yellow' | 'blue' | 'green'
}

export interface KnowledgeCluster {
  id: string
  name: string
  keywords: string[]
  cardIds: string[]
  documentIds: string[]
}

export interface StudyRecord {
  date: string
  cardsReviewed: number
  correctCount: number
  studyMinutes: number
  cardsStudied?: number
  duration?: number
}

interface AppState {
  documents: Document[]
  flashcards: Flashcard[]
  groups: CardGroup[]
  clusters: KnowledgeCluster[]
  studyRecords: StudyRecord[]
  isLoading: boolean
  currentStudySession: {
    cards: Flashcard[]
    currentIndex: number
    isFlipped: boolean
    results: { cardId: string; rating: number }[]
  } | null
  setDocuments: (docs: Document[]) => void
  setFlashcards: (cards: Flashcard[]) => void
  startStudySession: () => void
  flipCard: () => void
  rateCard: (cardId: string, rating: string) => void
  endStudySession: () => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      documents: [],
      flashcards: [],
      groups: [],
      clusters: [],
      studyRecords: [],
      isLoading: false,
      currentStudySession: null,
      setDocuments: (documents) => set({ documents }),
      setFlashcards: (flashcards) => set({ flashcards }),
      startStudySession: () =>
        set({
          currentStudySession: {
            cards: [],
            currentIndex: 0,
            isFlipped: false,
            results: [],
          },
        }),
      flipCard: () =>
        set((state) => ({
          currentStudySession: state.currentStudySession
            ? { ...state.currentStudySession, isFlipped: !state.currentStudySession.isFlipped }
            : null,
        })),
      rateCard: (cardId, rating) =>
        set((state) => {
          if (!state.currentStudySession) return state
          const session = state.currentStudySession
          return {
            currentStudySession: {
              ...session,
              currentIndex: session.currentIndex + 1,
              isFlipped: false,
              results: [
                ...session.results,
                {
                  cardId,
                  rating: rating === 'easy' ? 4 : rating === 'good' ? 3 : rating === 'hard' ? 2 : 1,
                },
              ],
            },
          }
        }),
      endStudySession: () => set({ currentStudySession: null }),
    }),
    { name: 'xuejian-app-store' }
  )
)

// 生成演示数据
export function generateMockData() {
  const documents: Document[] = [
    {
      id: 'doc-1',
      name: '认知心理学导论.pdf',
      type: 'pdf',
      pageCount: 320,
      uploadDate: new Date('2025-01-15'),
      lastOpened: new Date('2025-06-28'),
      progress: 45,
      tags: ['心理学', '认知科学'],
    },
    {
      id: 'doc-2',
      name: '统计学习方法.pdf',
      type: 'pdf',
      pageCount: 480,
      uploadDate: new Date('2025-02-20'),
      lastOpened: new Date('2025-06-27'),
      progress: 30,
      tags: ['机器学习', '统计学'],
    },
    {
      id: 'doc-3',
      name: '数据结构与算法.pdf',
      type: 'pdf',
      pageCount: 560,
      uploadDate: new Date('2025-03-10'),
      progress: 68,
      tags: ['计算机科学', '算法'],
    },
    {
      id: 'doc-4',
      name: '中国古典文学选读.epub',
      type: 'epub',
      pageCount: 200,
      uploadDate: new Date('2025-04-05'),
      progress: 15,
      tags: ['文学', '古典'],
    },
  ]

  const groups: CardGroup[] = [
    { id: 'grp-1', name: '认知模型', documentId: 'doc-1', cardCount: 12 },
    { id: 'grp-2', name: '贝叶斯方法', documentId: 'doc-2', cardCount: 8 },
    { id: 'grp-3', name: '树与图', documentId: 'doc-3', cardCount: 15 },
    { id: 'grp-4', name: '唐诗鉴赏', documentId: 'doc-4', cardCount: 6 },
  ]

  const flashcards: Flashcard[] = [
    {
      id: 'card-1',
      front: '什么是工作记忆？它与短期记忆有什么区别？',
      back: '工作记忆是一个容量有限的认知系统，负责暂时存储和操纵信息。与短期记忆不同，工作记忆不仅存储信息，还能对信息进行加工处理。',
      sourceDocId: 'doc-1',
      sourcePage: 42,
      status: 'review',
      easeFactor: 2.5,
      interval: 3,
      highlightColor: 'yellow',
      groupId: 'grp-1',
      createdAt: new Date('2025-06-01'),
    },
    {
      id: 'card-2',
      front: '解释双重编码理论的核心思想',
      back: 'Paivio的双重编码理论认为，认知活动涉及两个独立但相互关联的系统：言语系统和非言语（意象）系统。当信息同时以言语和视觉方式编码时，记忆效果最佳。',
      sourceDocId: 'doc-1',
      sourcePage: 78,
      status: 'learning',
      easeFactor: 2.3,
      interval: 1,
      highlightColor: 'green',
      groupId: 'grp-1',
      createdAt: new Date('2025-06-05'),
    },
    {
      id: 'card-3',
      front: '贝叶斯定理的数学表达式是什么？',
      back: 'P(A|B) = P(B|A) × P(A) / P(B)，其中P(A|B)是后验概率，P(B|A)是似然度，P(A)是先验概率，P(B)是边际似然度。',
      sourceDocId: 'doc-2',
      sourcePage: 23,
      status: 'new',
      easeFactor: 2.5,
      interval: 0,
      highlightColor: 'blue',
      groupId: 'grp-2',
      createdAt: new Date('2025-06-10'),
    },
    {
      id: 'card-4',
      front: '什么是朴素贝叶斯分类器？',
      back: '朴素贝叶斯分类器基于贝叶斯定理，假设特征之间条件独立。尽管这个"朴素"假设很强，但在文本分类等很多实际应用中表现优异。',
      sourceDocId: 'doc-2',
      sourcePage: 56,
      status: 'mastered',
      easeFactor: 2.8,
      interval: 14,
      highlightColor: 'blue',
      groupId: 'grp-2',
      createdAt: new Date('2025-06-03'),
    },
    {
      id: 'card-5',
      front: 'B树和B+树的主要区别是什么？',
      back: 'B+树的所有数据都存储在叶子节点中，非叶子节点只存储键值作为索引；B树的数据可以存储在任何节点。B+树的叶子节点通过指针相连，便于范围查询。',
      sourceDocId: 'doc-3',
      sourcePage: 234,
      status: 'review',
      easeFactor: 2.5,
      interval: 5,
      highlightColor: 'pink',
      groupId: 'grp-3',
      createdAt: new Date('2025-06-08'),
    },
    {
      id: 'card-6',
      front: '请解释Dijkstra算法的基本思想',
      back: 'Dijkstra算法是一种贪心算法，用于计算图中某一顶点到其他所有顶点的最短路径。它维护一个已确定最短路径的顶点集合，每次选择距离最小的未访问顶点进行扩展。',
      sourceDocId: 'doc-3',
      sourcePage: 312,
      status: 'new',
      easeFactor: 2.5,
      interval: 0,
      highlightColor: 'pink',
      groupId: 'grp-3',
      createdAt: new Date('2025-06-12'),
    },
  ]

  const clusters: KnowledgeCluster[] = [
    {
      id: 'cluster-1',
      name: '记忆与认知',
      keywords: ['工作记忆', '编码', '长期记忆', '遗忘'],
      cardIds: ['card-1', 'card-2'],
      documentIds: ['doc-1'],
    },
    {
      id: 'cluster-2',
      name: '概率推理',
      keywords: ['贝叶斯', '概率', '推断', '分类'],
      cardIds: ['card-3', 'card-4'],
      documentIds: ['doc-2'],
    },
  ]

  const studyRecords: StudyRecord[] = Array.from({ length: 90 }, (_, i) => {
    const date = new Date()
    date.setDate(date.getDate() - (89 - i))
    const hasStudy = Math.random() > 0.3
    return {
      date: date.toISOString().split('T')[0],
      cardsReviewed: hasStudy ? Math.floor(Math.random() * 30) + 5 : 0,
      correctCount: hasStudy ? Math.floor(Math.random() * 25) + 3 : 0,
      studyMinutes: hasStudy ? Math.floor(Math.random() * 45) + 10 : 0,
    }
  })

  return { documents, flashcards, groups, clusters, studyRecords }
}
