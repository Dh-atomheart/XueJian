import { useMemo } from 'react'
import { SketchCircle, SketchProgress, SketchCard } from '@/components/ui/Sketch'
import { useAppStore } from '@/lib/store'
import { useAppUiStore } from '@/store'
import { cn } from '@/lib/utils'

export function ProfilePage() {
  const setActiveNavItem = useAppUiStore((state) => state.setActiveNavItem)
  const { flashcards, studyRecords, documents } = useAppStore()

  const contributionData = useMemo(() => {
    const days: { date: string; count: number; level: number }[] = []
    const today = new Date()
    for (let i = 59; i >= 0; i--) {
      const date = new Date(today)
      date.setDate(date.getDate() - i)
      const dateStr = date.toISOString().split('T')[0]
      const record = studyRecords.find((r) => r.date === dateStr)
      const count = record?.cardsStudied ?? record?.cardsReviewed ?? 0
      let level = 0
      if (count > 0) level = 1
      if (count > 10) level = 2
      if (count > 20) level = 3
      if (count > 30) level = 4
      days.push({ date: dateStr, count, level })
    }
    return days
  }, [studyRecords])

  const stats = useMemo(() => {
    const totalCards = flashcards.length
    const masteredCards = flashcards.filter((c) => c.status === 'mastered').length
    const totalStudyDays = studyRecords.length
    const totalMinutes = studyRecords.reduce((sum, r) => sum + (r.duration ?? r.studyMinutes), 0)
    const totalCardsStudied = studyRecords.reduce(
      (sum, r) => sum + (r.cardsStudied ?? r.cardsReviewed),
      0
    )

    let streak = 0
    const sortedRecords = [...studyRecords].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    )
    for (const record of sortedRecords) {
      const expectedDate = new Date()
      expectedDate.setDate(expectedDate.getDate() - streak)
      const expectedStr = expectedDate.toISOString().split('T')[0]
      if (record.date === expectedStr) {
        streak++
      } else {
        break
      }
    }

    return {
      totalCards,
      masteredCards,
      masteryRate: totalCards > 0 ? Math.round((masteredCards / totalCards) * 100) : 0,
      totalStudyDays,
      totalHours: Math.round(totalMinutes / 60),
      totalCardsStudied,
      streak,
      documentsCount: documents.length,
    }
  }, [flashcards, studyRecords, documents])

  const levelColors = [
    'bg-paper-muted',
    'bg-green-200',
    'bg-green-300',
    'bg-green-400',
    'bg-green-500',
  ]

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 animate-fade-in">
      <div className="mb-8">
        <p className="text-xs tracking-[0.3em] text-ink-muted uppercase mb-2 font-ui">
          Profile & Stats
        </p>
        <h1 className="text-2xl font-display font-semibold mb-2">我的</h1>
        <p className="text-sm text-ink-muted">查看学习统计和个人设置</p>
      </div>

      {/* User info */}
      <SketchCard className="mb-8">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-ink/5 flex items-center justify-center">
            <span className="text-2xl">笺</span>
          </div>
          <div>
            <h2 className="text-lg font-semibold">学习者</h2>
            <p className="text-sm text-ink-muted">
              已学习 {stats.totalStudyDays} 天 · 连续 {stats.streak} 天
            </p>
          </div>
          <button
            onClick={() => setActiveNavItem('settings')}
            className="ml-auto p-2 hover:bg-paper-muted rounded-lg transition-colors"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </SketchCard>

      {/* Stats overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { value: stats.totalCards, label: '总卡片' },
          { value: stats.documentsCount, label: '文档数' },
          { value: stats.totalHours, label: '学习小时' },
          { value: stats.streak, label: '连续天数' },
        ].map((item) => (
          <div key={item.label} className="p-4 rounded-lg border border-line-soft/60 text-center">
            <SketchCircle size={60} className="text-ink/70 mx-auto mb-2">
              <span className="text-lg font-semibold">{item.value}</span>
            </SketchCircle>
            <p className="text-xs text-ink-muted">{item.label}</p>
          </div>
        ))}
      </div>

      {/* Mastery progress */}
      <SketchCard className="mb-8">
        <h3 className="font-medium mb-4">掌握进度</h3>
        <SketchProgress value={stats.masteryRate} label="知识掌握率" />
        <div className="mt-4 grid grid-cols-4 gap-2 text-center">
          {[
            { count: flashcards.filter((c) => c.status === 'new').length, label: '新卡片' },
            { count: flashcards.filter((c) => c.status === 'learning').length, label: '学习中' },
            { count: flashcards.filter((c) => c.status === 'review').length, label: '复习' },
            { count: stats.masteredCards, label: '已掌握' },
          ].map((item) => (
            <div key={item.label}>
              <p className="text-lg font-semibold">{item.count}</p>
              <p className="text-xs text-ink-muted">{item.label}</p>
            </div>
          ))}
        </div>
      </SketchCard>

      {/* Contribution heatmap */}
      <SketchCard className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium">学习热图</h3>
          <span className="text-xs text-ink-muted">
            过去 60 天共学习 {stats.totalCardsStudied} 张卡片
          </span>
        </div>
        <div className="overflow-x-auto">
          <div className="grid grid-cols-[repeat(12,1fr)] gap-1 min-w-[600px]">
            {contributionData.map((day) => (
              <div
                key={day.date}
                className={cn('w-4 h-4 rounded-sm contribution-cell', levelColors[day.level])}
                title={`${day.date}: ${day.count} 张卡片`}
              />
            ))}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 mt-4">
          <span className="text-xs text-ink-muted">少</span>
          {levelColors.map((color, i) => (
            <div key={i} className={cn('w-3 h-3 rounded-sm', color)} />
          ))}
          <span className="text-xs text-ink-muted">多</span>
        </div>
      </SketchCard>

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          onClick={() => setActiveNavItem('settings')}
          className="flex items-center gap-4 p-4 rounded-lg border border-line-soft/60 hover:bg-paper-muted/30 transition-colors text-left"
        >
          <div className="w-10 h-10 rounded-lg bg-paper-muted flex items-center justify-center">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </div>
          <div>
            <p className="font-medium text-sm">设置</p>
            <p className="text-xs text-ink-muted">配置 AI API 和偏好</p>
          </div>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="ml-auto text-ink-muted"
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>

        <button
          onClick={() => setActiveNavItem('cards')}
          className="flex items-center gap-4 p-4 rounded-lg border border-line-soft/60 hover:bg-paper-muted/30 transition-colors text-left"
        >
          <div className="w-10 h-10 rounded-lg bg-paper-muted flex items-center justify-center">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 3H8l-2 4h12l-2-4z" />
            </svg>
          </div>
          <div>
            <p className="font-medium text-sm">导出卡片</p>
            <p className="text-xs text-ink-muted">导出为 Anki 格式</p>
          </div>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="ml-auto text-ink-muted"
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </div>
    </div>
  )
}
