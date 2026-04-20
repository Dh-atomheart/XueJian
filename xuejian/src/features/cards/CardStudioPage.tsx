import { useState, useMemo } from 'react'
import { SketchButton, SketchCard } from '@/components/ui/Sketch'
import { CardContentRenderer } from '@/components/cards/CardContentRenderer'
import { CardEditorModal } from '@/components/cards/CardEditorModal'
import { useCardsQuery, useCreateCardMutation } from '@/queries/cards'
import { cn } from '@/lib/utils'
import type { Card } from '@/types'

type ViewMode = 'grid' | 'list'
type FilterStatus = 'all' | 'new' | 'learning' | 'review' | 'relearning'

const STATE_LABELS: Record<Card['state'], string> = {
  new: '新卡片',
  learning: '学习中',
  review: '复习',
  relearning: '重学',
}

export function CardStudioPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [flippedCards, setFlippedCards] = useState<Set<string>>(new Set())
  const [isEditorOpen, setIsEditorOpen] = useState(false)

  const { data: cards = [], isLoading } = useCardsQuery({}, { enabled: true })
  const createCard = useCreateCardMutation()

  const filteredCards = useMemo(() => {
    return cards.filter((card) => {
      const matchesStatus = filterStatus === 'all' || card.state === filterStatus
      const matchesSearch =
        !searchQuery ||
        card.front.toLowerCase().includes(searchQuery.toLowerCase()) ||
        card.back.toLowerCase().includes(searchQuery.toLowerCase())
      return matchesStatus && matchesSearch
    })
  }, [cards, filterStatus, searchQuery])

  // Derive unique groups client-side from card groupId + tags
  const groups = useMemo(() => {
    const groupMap = new Map<string, { id: string; name: string; count: number }>()
    for (const card of cards) {
      if (card.groupId) {
        const existing = groupMap.get(card.groupId)
        if (existing) {
          existing.count++
        } else {
          groupMap.set(card.groupId, { id: card.groupId, name: card.groupId, count: 1 })
        }
      }
    }
    return Array.from(groupMap.values())
  }, [cards])

  const toggleFlip = (id: string) => {
    setFlippedCards((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const statusFilters: { key: FilterStatus; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: 'new', label: '新卡片' },
    { key: 'learning', label: '学习中' },
    { key: 'review', label: '复习' },
    { key: 'relearning', label: '重学' },
  ]

  const statusColors: Record<string, string> = {
    new: 'bg-blue-100 text-blue-700',
    learning: 'bg-amber-100 text-amber-700',
    review: 'bg-green-100 text-green-700',
    relearning: 'bg-purple-100 text-purple-700',
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-sm text-ink-muted animate-pulse">加载卡片中...</p>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 animate-fade-in">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <p className="text-xs tracking-[0.3em] text-ink-muted uppercase mb-2 font-ui">
            Flashcard Library
          </p>
          <h1 className="text-2xl font-display font-semibold mb-2">牌库</h1>
          <p className="text-sm text-ink-muted">管理和浏览你的知识卡片 · {cards.length} 张</p>
        </div>
        <SketchButton onClick={() => setIsEditorOpen(true)}>+ 新建卡片</SketchButton>
      </div>

      {/* 筛选和搜索 */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {statusFilters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilterStatus(f.key)}
              className={cn(
                'px-3 py-1.5 text-xs rounded-full border transition-all whitespace-nowrap',
                filterStatus === f.key
                  ? 'border-ink/30 bg-paper-muted/80 font-medium'
                  : 'border-line-soft/60 hover:border-line-soft text-ink-muted'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="搜索卡片..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="px-3 py-2 bg-paper-muted/50 border border-line-soft/60 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ink/10 transition-all w-48"
          />
          <button
            onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
            className="p-2 border border-line-soft/60 rounded-lg hover:bg-paper-muted/50 transition-colors"
          >
            {viewMode === 'grid' ? (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            ) : (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* 卡片组概览 */}
      {groups.length > 0 && (
        <div className="flex gap-3 mb-6 overflow-x-auto pb-2">
          {groups.map((group) => (
            <div
              key={group.id}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-line-soft/60 text-sm whitespace-nowrap"
            >
              <div className="w-3 h-3 rounded-full bg-ink/20" />
              <span>{group.name}</span>
              <span className="text-xs text-ink-muted">{group.count}</span>
            </div>
          ))}
        </div>
      )}

      {/* 卡片网格/列表 */}
      {filteredCards.length > 0 ? (
        <div
          className={cn(
            viewMode === 'grid'
              ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'
              : 'space-y-3'
          )}
        >
          {filteredCards.map((card, index) => {
            const isFlipped = flippedCards.has(card.id)

            if (viewMode === 'list') {
              return (
                <div
                  key={card.id}
                  onClick={() => toggleFlip(card.id)}
                  className="p-4 rounded-lg border border-line-soft/60 hover:bg-paper-muted/30 transition-colors cursor-pointer animate-slide-in"
                  style={{ animationDelay: `${index * 30}ms` }}
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-1">
                      <CardContentRenderer content={isFlipped ? card.back : card.front} compact />
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-xs text-ink-muted">
                          {isFlipped ? '答案' : '问题'} · 点击翻转
                        </p>
                        {card.tags.length > 0 && (
                          <span className="text-xs text-ink-muted">
                            · {card.tags.slice(0, 3).join(', ')}
                          </span>
                        )}
                      </div>
                    </div>
                    <span
                      className={cn(
                        'px-2 py-0.5 text-xs rounded-full',
                        statusColors[card.state] || 'bg-paper-muted text-ink-muted'
                      )}
                    >
                      {STATE_LABELS[card.state] ?? card.state}
                    </span>
                  </div>
                </div>
              )
            }

            return (
              <div
                key={card.id}
                onClick={() => toggleFlip(card.id)}
                className="cursor-pointer animate-slide-in"
                style={{ animationDelay: `${index * 50}ms`, perspective: '600px' }}
              >
                <div
                  className={cn(
                    'relative min-h-[180px] p-5 rounded-xl border border-line-soft/60 transition-all duration-500',
                    isFlipped ? 'bg-paper-muted/30' : 'bg-paper-card hover:shadow-sm'
                  )}
                  style={{
                    transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0)',
                    transformStyle: 'preserve-3d',
                  }}
                >
                  <div style={{ transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0)' }}>
                    <div className="flex items-center justify-between mb-3">
                      <span
                        className={cn(
                          'px-2 py-0.5 text-xs rounded-full',
                          statusColors[card.state] || 'bg-paper-muted text-ink-muted'
                        )}
                      >
                        {STATE_LABELS[card.state] ?? card.state}
                      </span>
                      {card.cardType !== 'qa' && (
                        <span className="text-xs text-ink-muted">{card.cardType}</span>
                      )}
                    </div>
                    <CardContentRenderer content={isFlipped ? card.back : card.front} compact />
                    <div className="flex items-center justify-between mt-4">
                      <p className="text-xs text-ink-muted">{isFlipped ? 'Answer' : 'Question'}</p>
                      {card.tags.length > 0 && (
                        <p className="text-xs text-ink-muted truncate max-w-[120px]">
                          {card.tags.slice(0, 2).join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-center py-16 text-ink-muted">
          <p className="text-sm mb-2">没有找到匹配的卡片</p>
          <p className="text-xs">尝试调整筛选条件或上传文档生成卡片</p>
        </div>
      )}

      {/* Editor Modal */}
      {isEditorOpen && (
        <CardEditorModal
          onClose={() => setIsEditorOpen(false)}
          onSave={(data) => {
            createCard.mutate(
              { front: data.front, back: data.back, tags: data.tags, cardType: data.cardType },
              { onSuccess: () => setIsEditorOpen(false) }
            )
          }}
        />
      )}
    </div>
  )
}
