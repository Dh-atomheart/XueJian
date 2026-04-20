import { useState, useMemo } from 'react'
import { SketchButton, SketchCard } from '@/components/ui/Sketch'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'

type ViewMode = 'grid' | 'list'
type FilterStatus = 'all' | 'new' | 'learning' | 'review' | 'mastered'

export function CardStudioPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [flippedCards, setFlippedCards] = useState<Set<string>>(new Set())
  const { flashcards, groups } = useAppStore()

  const filteredCards = useMemo(() => {
    return flashcards.filter((card) => {
      const matchesStatus = filterStatus === 'all' || card.status === filterStatus
      const matchesSearch = !searchQuery ||
        card.front.toLowerCase().includes(searchQuery.toLowerCase()) ||
        card.back.toLowerCase().includes(searchQuery.toLowerCase())
      return matchesStatus && matchesSearch
    })
  }, [flashcards, filterStatus, searchQuery])

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
    { key: 'mastered', label: '已掌握' },
  ]

  const statusColors: Record<string, string> = {
    new: 'bg-blue-100 text-blue-700',
    learning: 'bg-amber-100 text-amber-700',
    review: 'bg-green-100 text-green-700',
    mastered: 'bg-purple-100 text-purple-700',
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 animate-fade-in">
      <div className="mb-8">
        <p className="text-xs tracking-[0.3em] text-ink-muted uppercase mb-2 font-ui">Flashcard Library</p>
        <h1 className="text-2xl font-display font-semibold mb-2">牌库</h1>
        <p className="text-sm text-ink-muted">管理和浏览你的知识卡片 · {flashcards.length} 张</p>
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
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>
            )}
          </button>
        </div>
      </div>

      {/* 卡片组概览 */}
      {groups.length > 0 && (
        <div className="flex gap-3 mb-6 overflow-x-auto pb-2">
          {groups.map((group) => (
            <div key={group.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-line-soft/60 text-sm whitespace-nowrap">
              <div className={cn('w-3 h-3 rounded-full', group.color === 'yellow' ? 'bg-yellow-400' : group.color === 'blue' ? 'bg-blue-400' : group.color === 'green' ? 'bg-green-400' : 'bg-red-400')} />
              <span>{group.name}</span>
              <span className="text-xs text-ink-muted">{group.cardCount}</span>
            </div>
          ))}
        </div>
      )}

      {/* 卡片网格/列表 */}
      {filteredCards.length > 0 ? (
        <div className={cn(
          viewMode === 'grid'
            ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'
            : 'space-y-3'
        )}>
          {filteredCards.map((card, index) => {
            const isFlipped = flippedCards.has(card.id)
            const group = groups.find((g) => g.id === card.groupId)

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
                      <p className="text-sm">{isFlipped ? card.back : card.front}</p>
                      <p className="text-xs text-ink-muted mt-1">{isFlipped ? '答案' : '问题'} · 点击翻转</p>
                    </div>
                    <span className={cn('px-2 py-0.5 text-xs rounded-full', statusColors[card.status] || 'bg-paper-muted text-ink-muted')}>
                      {card.status === 'new' ? '新' : card.status === 'learning' ? '学' : card.status === 'review' ? '复' : '✓'}
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
                <div className={cn(
                  'relative min-h-[180px] p-5 rounded-xl border border-line-soft/60 transition-all duration-500',
                  isFlipped ? 'bg-paper-muted/30' : 'bg-paper-card hover:shadow-sm'
                )} style={{
                  transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0)',
                  transformStyle: 'preserve-3d',
                }}>
                  <div style={{ transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0)' }}>
                    <div className="flex items-center justify-between mb-3">
                      <span className={cn('px-2 py-0.5 text-xs rounded-full', statusColors[card.status] || 'bg-paper-muted text-ink-muted')}>
                        {card.status}
                      </span>
                      {group && (
                        <div className={cn('w-2 h-2 rounded-full', group.color === 'yellow' ? 'bg-yellow-400' : group.color === 'blue' ? 'bg-blue-400' : 'bg-green-400')} />
                      )}
                    </div>
                    <p className="text-sm leading-relaxed">{isFlipped ? card.back : card.front}</p>
                    <p className="text-xs text-ink-muted mt-4">{isFlipped ? 'Answer' : 'Question'}</p>
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
    </div>
  )
}
